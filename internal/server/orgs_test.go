package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
)

// fakeSF imitates the parts of the sf CLI the orgs endpoints use, so tests
// never touch the developer's real orgs.
type fakeSF struct {
	mu       sync.Mutex
	orgs     []map[string]any
	target   string
	calls    [][]string
	missing  bool
	failNext string // substring of the command that should fail, once
}

func (f *fakeSF) run(ctx context.Context, args ...string) ([]byte, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.missing {
		return nil, exec.ErrNotFound
	}
	f.calls = append(f.calls, args)
	cmd := strings.Join(args, " ")
	if f.failNext != "" && strings.Contains(cmd, f.failNext) {
		f.failNext = ""
		return []byte(`{"status":1,"message":"boom from sf","result":{}}`), &exec.ExitError{}
	}
	enc := func(v any) []byte { b, _ := json.Marshal(v); return b }
	switch {
	case strings.HasPrefix(cmd, "auth list"):
		return enc(map[string]any{"status": 0, "result": f.orgs}), nil
	case strings.HasPrefix(cmd, "config get target-org"):
		entry := map[string]any{"name": "target-org", "success": true}
		if f.target != "" {
			entry["value"] = f.target
		}
		return enc(map[string]any{"status": 0, "result": []any{entry}}), nil
	case strings.HasPrefix(cmd, "config set target-org"):
		f.target = args[3]
		return enc(map[string]any{"status": 0, "result": map[string]any{}}), nil
	case strings.HasPrefix(cmd, "org logout"):
		user := strings.TrimPrefix(args[2], "--target-org=")
		var kept []map[string]any
		for _, o := range f.orgs {
			if o["username"] != user {
				kept = append(kept, o)
			}
		}
		f.orgs = kept
		return enc(map[string]any{"status": 0, "result": map[string]any{}}), nil
	case strings.HasPrefix(cmd, "org login web"):
		f.orgs = append(f.orgs, testOrg("new@example.com", "new"))
		return enc(map[string]any{"status": 0, "result": map[string]any{}}), nil
	}
	return nil, nil
}

func (f *fakeSF) ran(prefix string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, c := range f.calls {
		if strings.HasPrefix(strings.Join(c, " "), prefix) {
			return true
		}
	}
	return false
}

func testOrg(user, alias string) map[string]any {
	return map[string]any{"username": user, "alias": alias, "isExpired": "unknown", "accessToken": "SECRET", "isSandbox": true}
}

func orgsHandler(f *fakeSF) http.Handler {
	return newHandler(t0, fstest.MapFS{}, f.run)
}

const t0 = "" // root is unused by the orgs endpoints

func post(h http.Handler, target, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("POST", target, strings.NewReader(body))
	req.Host = "127.0.0.1:8765"
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) orgList {
	t.Helper()
	if rec.Code != 200 {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	var l orgList
	if err := json.Unmarshal(rec.Body.Bytes(), &l); err != nil {
		t.Fatal(err)
	}
	return l
}

func TestOrgsListsSortedWithDefaultAndNoSecrets(t *testing.T) {
	f := &fakeSF{orgs: []map[string]any{testOrg("b@x.com", "zeta"), testOrg("a@x.com", "Alpha")}, target: "zeta"}
	rec := get(orgsHandler(f), "/api/orgs", "127.0.0.1:8765")
	l := decode(t, rec)
	if len(l.Orgs) != 2 || l.Orgs[0].Alias != "Alpha" || l.Default != "b@x.com" {
		t.Errorf("unexpected list %+v", l)
	}
	if strings.Contains(rec.Body.String(), "SECRET") || strings.Contains(rec.Body.String(), "accessToken") {
		t.Error("access token leaked to the browser")
	}
}

func TestOrgsDefaultMatchesByUsernameToo(t *testing.T) {
	f := &fakeSF{orgs: []map[string]any{testOrg("a@x.com", "a"), testOrg("b@x.com", "b")}, target: "b@x.com"}
	if l := decode(t, get(orgsHandler(f), "/api/orgs", "127.0.0.1:1")); l.Default != "b@x.com" {
		t.Errorf("default %q", l.Default)
	}
}

func TestOrgsEmpty(t *testing.T) {
	f := &fakeSF{}
	rec := get(orgsHandler(f), "/api/orgs", "127.0.0.1:1")
	if l := decode(t, rec); len(l.Orgs) != 0 || l.Default != "" {
		t.Errorf("unexpected %+v", l)
	}
	if !strings.Contains(rec.Body.String(), `"orgs":[]`) {
		t.Errorf("orgs must be [] not null: %s", rec.Body)
	}
	if f.ran("config set") {
		t.Error("set a default with no orgs")
	}
}

func TestSingleOrgBecomesDefault(t *testing.T) {
	f := &fakeSF{orgs: []map[string]any{testOrg("only@x.com", "")}}
	l := decode(t, get(orgsHandler(f), "/api/orgs", "127.0.0.1:1"))
	if l.Default != "only@x.com" || f.target != "only@x.com" {
		t.Errorf("default %q, stored %q", l.Default, f.target)
	}
}

func TestSingleOrgAlreadyDefaultIsNotRewritten(t *testing.T) {
	f := &fakeSF{orgs: []map[string]any{testOrg("only@x.com", "o")}, target: "o"}
	decode(t, get(orgsHandler(f), "/api/orgs", "127.0.0.1:1"))
	if f.ran("config set") {
		t.Error("rewrote an existing default")
	}
}

func TestStaleDefaultIsNotReported(t *testing.T) {
	f := &fakeSF{orgs: []map[string]any{testOrg("a@x.com", "a"), testOrg("b@x.com", "b")}, target: "gone@x.com"}
	if l := decode(t, get(orgsHandler(f), "/api/orgs", "127.0.0.1:1")); l.Default != "" {
		t.Errorf("default %q, want none", l.Default)
	}
}

func TestSetDefault(t *testing.T) {
	f := &fakeSF{orgs: []map[string]any{testOrg("a@x.com", "a"), testOrg("b@x.com", "b")}}
	l := decode(t, post(orgsHandler(f), "/api/orgs/default", `{"username":"b@x.com"}`))
	if l.Default != "b@x.com" || !f.ran("config set target-org b@x.com --global") {
		t.Errorf("default %q, calls %v", l.Default, f.calls)
	}
}

func TestSetDefaultRejectsUnknownOrg(t *testing.T) {
	f := &fakeSF{orgs: []map[string]any{testOrg("a@x.com", "a"), testOrg("b@x.com", "b")}}
	for _, body := range []string{`{"username":"nobody@x.com"}`, `{"username":"--global"}`, `{}`, `nope`} {
		if rec := post(orgsHandler(f), "/api/orgs/default", body); rec.Code != 400 {
			t.Errorf("%s: status %d, want 400", body, rec.Code)
		}
	}
	if f.ran("config set") {
		t.Error("passed an unlisted value to sf")
	}
}

func TestLogout(t *testing.T) {
	f := &fakeSF{orgs: []map[string]any{testOrg("a@x.com", "a"), testOrg("b@x.com", "b")}, target: "a"}
	l := decode(t, post(orgsHandler(f), "/api/orgs/logout", `{"username":"b@x.com"}`))
	if len(l.Orgs) != 1 || l.Orgs[0].Username != "a@x.com" {
		t.Errorf("unexpected %+v", l)
	}
	if !f.ran("org logout --target-org=b@x.com --no-prompt") {
		t.Errorf("calls %v", f.calls)
	}
}

func TestLogoutRejectsUnknownOrg(t *testing.T) {
	f := &fakeSF{orgs: []map[string]any{testOrg("a@x.com", "a")}}
	if rec := post(orgsHandler(f), "/api/orgs/logout", `{"username":"--all"}`); rec.Code != 400 {
		t.Errorf("status %d, want 400", rec.Code)
	}
	if f.ran("org logout") {
		t.Error("ran logout for an unlisted value")
	}
}

func TestLoginBuildsArgsAndReturnsList(t *testing.T) {
	f := &fakeSF{orgs: []map[string]any{testOrg("a@x.com", "a")}, target: "a"}
	l := decode(t, post(orgsHandler(f), "/api/orgs/login", `{"alias":"new","instanceUrl":"https://test.salesforce.com/"}`))
	if len(l.Orgs) != 2 {
		t.Errorf("unexpected %+v", l)
	}
	if !f.ran("org login web --alias=new --instance-url=https://test.salesforce.com --json") {
		t.Errorf("calls %v", f.calls)
	}
}

func TestLoginValidatesInput(t *testing.T) {
	f := &fakeSF{}
	for _, body := range []string{
		`{"alias":"--set-default"}`,
		`{"alias":"has space"}`,
		`{"instanceUrl":"http://insecure.example.com"}`,
		`{"instanceUrl":"https://u:p@evil.example.com"}`,
		`{"instanceUrl":"https://x.example.com/path"}`,
		`{"instanceUrl":"javascript:alert(1)"}`,
		`{"instanceUrl":"--browser"}`,
	} {
		if rec := post(orgsHandler(f), "/api/orgs/login", body); rec.Code != 400 {
			t.Errorf("%s: status %d, want 400", body, rec.Code)
		}
	}
	if f.ran("org login") {
		t.Error("ran login with invalid input")
	}
}

func TestLoginOneAtATime(t *testing.T) {
	f := &fakeSF{}
	srv := &server{orgState: orgState{sf: f.run}}
	srv.loggingIn.Store(true) // a login is already in flight
	rec := httptest.NewRecorder()
	srv.login(rec, httptest.NewRequest("POST", "/api/orgs/login", strings.NewReader(`{}`)))
	if rec.Code != http.StatusConflict {
		t.Errorf("status %d, want 409", rec.Code)
	}
	if f.ran("org login") {
		t.Error("started a second login")
	}
}

func TestMutationsRequireSameOriginJSON(t *testing.T) {
	f := &fakeSF{orgs: []map[string]any{testOrg("a@x.com", "a"), testOrg("b@x.com", "b")}}
	h := orgsHandler(f)
	cases := []struct {
		name string
		set  func(*http.Request)
		want int
	}{
		{"form content type", func(r *http.Request) { r.Header.Set("Content-Type", "text/plain") }, 415},
		{"foreign origin", func(r *http.Request) { r.Header.Set("Origin", "https://evil.example.com") }, 403},
		{"cross-site fetch", func(r *http.Request) { r.Header.Set("Sec-Fetch-Site", "cross-site") }, 403},
		{"same origin", func(r *http.Request) {
			r.Header.Set("Origin", "http://127.0.0.1:8765")
			r.Header.Set("Sec-Fetch-Site", "same-origin")
		}, 200},
	}
	for _, c := range cases {
		req := httptest.NewRequest("POST", "/api/orgs/default", strings.NewReader(`{"username":"a@x.com"}`))
		req.Host = "127.0.0.1:8765"
		req.Header.Set("Content-Type", "application/json")
		c.set(req)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != c.want {
			t.Errorf("%s: status %d, want %d", c.name, rec.Code, c.want)
		}
	}
}

func TestSFMissing(t *testing.T) {
	f := &fakeSF{missing: true}
	rec := get(orgsHandler(f), "/api/orgs", "127.0.0.1:1")
	if rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), "not found") {
		t.Errorf("got %d %s", rec.Code, rec.Body)
	}
}

func TestSFErrorIsSurfaced(t *testing.T) {
	f := &fakeSF{orgs: []map[string]any{testOrg("a@x.com", "a"), testOrg("b@x.com", "b")}, failNext: "config set"}
	rec := post(orgsHandler(f), "/api/orgs/default", `{"username":"b@x.com"}`)
	if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "boom from sf") {
		t.Errorf("got %d %s", rec.Code, rec.Body)
	}
}

func TestExpiredFlag(t *testing.T) {
	o := testOrg("a@x.com", "a")
	o["isExpired"] = true
	f := &fakeSF{orgs: []map[string]any{o, testOrg("b@x.com", "b")}}
	l := decode(t, get(orgsHandler(f), "/api/orgs", "127.0.0.1:1"))
	if !l.Orgs[0].Expired || l.Orgs[1].Expired {
		t.Errorf("unexpected %+v", l.Orgs)
	}
}

func TestJSONBodySkipsLeadingNotice(t *testing.T) {
	got := string(jsonBody([]byte("You acknowledge...\n\n{\"status\":0}")))
	if got != `{"status":0}` {
		t.Errorf("got %q", got)
	}
}
