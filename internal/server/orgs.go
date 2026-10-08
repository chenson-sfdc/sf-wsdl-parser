package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// sfRunner runs the Salesforce CLI with args and returns its stdout. A non-nil
// error with usable stdout is normal: `sf --json` prints a JSON error object
// and exits non-zero.
type sfRunner func(ctx context.Context, args ...string) ([]byte, error)

var (
	errSFMissing = errors.New("the Salesforce CLI (sf) was not found on PATH")

	// aliasRe keeps an alias from being read as a flag by sf.
	aliasRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$`)
)

const (
	cliTimeout   = 30 * time.Second
	loginTimeout = 5 * time.Minute // the user finishes logging in at their own pace
)

// sfError is a failure reported by sf itself, as opposed to a failure to run it.
type sfError struct{ msg string }

func (e *sfError) Error() string { return e.msg }

func execSF(ctx context.Context, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, "sf", args...)
	// Run outside any project so a local .sf/config.json can't shadow the
	// global target-org that this tab reads and writes.
	cmd.Dir = os.TempDir()
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	err := cmd.Run()
	return stdout.Bytes(), err
}

// jsonBody trims anything sf printed ahead of the JSON document, such as the
// telemetry notice shown on first run.
func jsonBody(out []byte) []byte {
	if bytes.HasPrefix(out, []byte("{")) {
		return out
	}
	if i := bytes.Index(out, []byte("\n{")); i >= 0 {
		return out[i+1:]
	}
	return out
}

// sfJSON runs `sf <args> --json` and returns the "result" member. Failures
// reported by sf come back as *sfError carrying its own message.
func (s *server) sfJSON(ctx context.Context, args ...string) (json.RawMessage, error) {
	out, runErr := s.sf(ctx, append(args, "--json")...)
	if errors.Is(runErr, exec.ErrNotFound) {
		return nil, errSFMissing
	}
	var env struct {
		Status  int             `json:"status"`
		Message string          `json:"message"`
		Result  json.RawMessage `json:"result"`
	}
	if err := json.NewDecoder(bytes.NewReader(jsonBody(out))).Decode(&env); err != nil {
		if runErr != nil {
			return nil, runErr
		}
		return nil, errors.New("unexpected output from sf")
	}
	if env.Status != 0 {
		return nil, &sfError{msg: failureMessage(env.Message, env.Result)}
	}
	return env.Result, nil
}

// failureMessage handles both error shapes sf uses: a top-level message, or
// result.failures[].message (as `config set` does).
func failureMessage(message string, result json.RawMessage) string {
	if message != "" {
		return message
	}
	var r struct {
		Failures []struct {
			Message string `json:"message"`
		} `json:"failures"`
	}
	if json.Unmarshal(result, &r) == nil {
		for _, f := range r.Failures {
			if f.Message != "" {
				return f.Message
			}
		}
	}
	return "sf reported an error"
}

// org is what the browser sees. Tokens that sf reports are deliberately not
// part of it.
type org struct {
	Username     string `json:"username"`
	Alias        string `json:"alias"`
	OrgID        string `json:"orgId"`
	InstanceURL  string `json:"instanceUrl"`
	IsDevHub     bool   `json:"isDevHub"`
	IsSandbox    bool   `json:"isSandbox"`
	IsScratchOrg bool   `json:"isScratchOrg"`
	OAuthMethod  string `json:"oauthMethod"`
	Expired      bool   `json:"expired"`
}

type orgList struct {
	Orgs []org `json:"orgs"`
	// Default is the username of the org that target-org points at, or "".
	Default string `json:"default"`
}

func (s *server) snapshot(ctx context.Context) (*orgList, error) {
	res, err := s.sfJSON(ctx, "auth", "list")
	if err != nil {
		return nil, err
	}
	var raw []struct {
		org
		IsExpired any `json:"isExpired"` // true, false, or the string "unknown"
	}
	if err := json.Unmarshal(res, &raw); err != nil {
		return nil, errors.New("unexpected output from sf auth list")
	}
	list := &orgList{Orgs: make([]org, 0, len(raw))}
	for _, r := range raw {
		r.org.Expired = r.IsExpired == true
		list.Orgs = append(list.Orgs, r.org)
	}
	sort.Slice(list.Orgs, func(i, j int) bool {
		a, b := list.Orgs[i], list.Orgs[j]
		if x, y := strings.ToLower(a.Alias), strings.ToLower(b.Alias); x != y {
			return x < y
		}
		return a.Username < b.Username
	})

	// An unreadable default shouldn't hide the list; the tab then shows none.
	if cfg, err := s.sfJSON(ctx, "config", "get", "target-org"); err == nil {
		var entries []struct {
			Value string `json:"value"`
		}
		if json.Unmarshal(cfg, &entries) == nil && len(entries) > 0 && entries[0].Value != "" {
			for _, o := range list.Orgs {
				if o.Username == entries[0].Value || (o.Alias != "" && o.Alias == entries[0].Value) {
					list.Default = o.Username
				}
			}
		}
	}
	// With a single org there is nothing to choose between, so make it the
	// default if it isn't already. Best effort: the list is still correct if
	// this fails, it just won't show a default.
	if len(list.Orgs) == 1 && list.Default == "" {
		only := list.Orgs[0].Username
		if _, err := s.sfJSON(ctx, "config", "set", "target-org", only, "--global"); err == nil {
			list.Default = only
		}
	}
	return list, nil
}

func writeError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	var se *sfError
	switch {
	case errors.Is(err, errSFMissing):
		status = http.StatusServiceUnavailable
	case errors.As(err, &se):
		status = http.StatusUnprocessableEntity
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}

func badRequest(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func (s *server) orgs(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), cliTimeout)
	defer cancel()
	list, err := s.snapshot(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, list)
}

// guarded protects endpoints that change state. Any web page can make the
// browser send a request to 127.0.0.1, so a state change must prove it came
// from this app: a JSON content type (which cross-origin pages can't send
// without a CORS preflight, which this server never grants) and a same-origin
// Origin / Sec-Fetch-Site when the browser supplies them.
func guarded(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
			http.Error(w, "content type must be application/json", http.StatusUnsupportedMediaType)
			return
		}
		if o := r.Header.Get("Origin"); o != "" && o != "http://"+r.Host {
			http.Error(w, "cross-origin request refused", http.StatusForbidden)
			return
		}
		if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" && site != "none" {
			http.Error(w, "cross-origin request refused", http.StatusForbidden)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4<<10)
		next(w, r)
	}
}

type usernameReq struct {
	Username string `json:"username"`
}

// known returns the listed org with this username. Only usernames that sf
// itself reports are ever passed back to it.
func known(list *orgList, username string) (org, bool) {
	for _, o := range list.Orgs {
		if o.Username == username {
			return o, true
		}
	}
	return org{}, false
}

func (s *server) setDefault(w http.ResponseWriter, r *http.Request) {
	var req usernameReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badRequest(w, "expected {\"username\": ...}")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	ctx, cancel := context.WithTimeout(r.Context(), cliTimeout)
	defer cancel()
	list, err := s.snapshot(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	if _, ok := known(list, req.Username); !ok {
		badRequest(w, "no authenticated org with that username")
		return
	}
	// --global so the default doesn't depend on where the server was started.
	if _, err := s.sfJSON(ctx, "config", "set", "target-org", req.Username, "--global"); err != nil {
		writeError(w, err)
		return
	}
	s.reply(ctx, w)
}

func (s *server) logout(w http.ResponseWriter, r *http.Request) {
	var req usernameReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badRequest(w, "expected {\"username\": ...}")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	ctx, cancel := context.WithTimeout(r.Context(), cliTimeout)
	defer cancel()
	list, err := s.snapshot(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	if _, ok := known(list, req.Username); !ok {
		badRequest(w, "no authenticated org with that username")
		return
	}
	if _, err := s.sfJSON(ctx, "org", "logout", "--target-org="+req.Username, "--no-prompt"); err != nil {
		writeError(w, err)
		return
	}
	s.reply(ctx, w)
}

type loginReq struct {
	Alias       string `json:"alias"`
	InstanceURL string `json:"instanceUrl"`
}

func (s *server) login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badRequest(w, "expected {\"alias\": ..., \"instanceUrl\": ...}")
		return
	}
	req.Alias = strings.TrimSpace(req.Alias)
	req.InstanceURL = strings.TrimSpace(req.InstanceURL)
	if req.Alias != "" && !aliasRe.MatchString(req.Alias) {
		badRequest(w, "alias may contain letters, digits, '_', '.' and '-', and must start with a letter or digit")
		return
	}
	args := []string{"org", "login", "web"}
	if req.Alias != "" {
		args = append(args, "--alias="+req.Alias)
	}
	if req.InstanceURL != "" {
		u, err := url.Parse(req.InstanceURL)
		if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || strings.HasPrefix(u.Host, "-") ||
			(u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" {
			badRequest(w, "instance URL must look like https://example.my.salesforce.com")
			return
		}
		args = append(args, "--instance-url="+u.Scheme+"://"+u.Host)
	}

	if !s.loggingIn.CompareAndSwap(false, true) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "a login is already in progress; finish it in the browser window first"})
		return
	}
	defer s.loggingIn.Store(false)

	// sf opens the browser on this machine and returns once the user has
	// finished (or the timeout passes).
	ctx, cancel := context.WithTimeout(r.Context(), loginTimeout)
	defer cancel()
	if _, err := s.sfJSON(ctx, args...); err != nil {
		writeError(w, err)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.reply(ctx, w)
}

// reply sends the current list after a change.
func (s *server) reply(ctx context.Context, w http.ResponseWriter) {
	list, err := s.snapshot(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, list)
}

// orgState is embedded in server.
type orgState struct {
	sf        sfRunner
	mu        sync.Mutex  // serialises changes to the CLI's stored auth and config
	loggingIn atomic.Bool // at most one browser login at a time
}
