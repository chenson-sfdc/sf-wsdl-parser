package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"
)

const labelsTimeout = 30 * time.Second

// label is one object's display name, keyed by API name in labelsResult.
type label struct {
	Label       string `json:"label"`
	LabelPlural string `json:"labelPlural"`
}

type labelsResult struct {
	// Org is the alias (or username, when there is no alias) that was queried.
	Org string `json:"org"`
	// Labels maps API name (e.g. "Account", "Foo__c") to its label.
	Labels map[string]label `json:"labels"`
}

// restJSON runs `sf api request rest <path> --json` and returns the response
// body, which `sf` wraps as result.body. A non-2xx HTTP response is not an sf
// failure, so it is reported like one here for a uniform error path.
func (s *server) restJSON(ctx context.Context, path string, target string) (json.RawMessage, error) {
	res, err := s.sfJSON(ctx, "api", "request", "rest", path, "--target-org="+target)
	if err != nil {
		return nil, err
	}
	var env struct {
		StatusCode int             `json:"statusCode"`
		Body       json.RawMessage `json:"body"`
	}
	if err := json.Unmarshal(res, &env); err != nil {
		return nil, errors.New("unexpected output from sf api request rest")
	}
	if env.StatusCode < 200 || env.StatusCode >= 300 {
		return nil, &sfError{msg: "the org's REST API returned HTTP " + strconv.Itoa(env.StatusCode) + " for " + path}
	}
	return env.Body, nil
}

// labels fetches every object's label with one global-describe call, for the
// default org chosen on the Authenticated orgs tab. The WSDL carries no
// per-object label (only field values literally named Label/MasterLabel on
// Custom Metadata Types), so this is the only source.
func (s *server) labels(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), labelsTimeout)
	defer cancel()
	list, err := s.snapshot(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	var def *org
	for i := range list.Orgs {
		if list.Orgs[i].Username == list.Default {
			def = &list.Orgs[i]
		}
	}
	if def == nil {
		badRequest(w, noDefaultOrgMsg)
		return
	}
	target := targetOrg(*def)
	body, err := s.restJSON(ctx, "/services/data/latest/sobjects", target)
	if err != nil {
		writeError(w, err)
		return
	}
	var describe struct {
		SObjects []struct {
			Name        string `json:"name"`
			Label       string `json:"label"`
			LabelPlural string `json:"labelPlural"`
		} `json:"sobjects"`
	}
	if err := json.Unmarshal(body, &describe); err != nil {
		writeError(w, errors.New("unexpected response from the org's REST API"))
		return
	}
	labels := make(map[string]label, len(describe.SObjects))
	for _, o := range describe.SObjects {
		labels[o.Name] = label{Label: o.Label, LabelPlural: o.LabelPlural}
	}
	writeJSON(w, labelsResult{Org: target, Labels: labels})
}
