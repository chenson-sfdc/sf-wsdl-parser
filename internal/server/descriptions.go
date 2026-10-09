package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// customNameRe matches a custom object API name, including namespaced ones
// (ns__Thing__c). Names come from sf, but they are pasted into a SOQL string
// below, so anything else is dropped rather than trusted.
var customNameRe = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]*__c$`)

const (
	// A chunk keeps the SOQL text far below the query length limit.
	descChunk       = 200
	descTimeout     = 3 * time.Minute
	noDefaultOrgMsg = "No default org is set. Choose one on the Authenticated orgs tab first."
)

// objectDescription is one custom object and its Description, "" when blank.
type objectDescription struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type descriptionsResult struct {
	// Org is the alias (or username, when there is no alias) that was queried.
	Org string `json:"org"`
	// Command is the listing command that was run, for display.
	Command string              `json:"command"`
	Objects []objectDescription `json:"objects"`
}

// targetOrg is the name passed to --target-org: the alias when the org has
// one, otherwise its username.
func targetOrg(o org) string {
	if o.Alias != "" {
		return o.Alias
	}
	return o.Username
}

// customObjects runs `sf sobject list --sobject custom` for the org.
func (s *server) customObjects(ctx context.Context, target string) ([]string, error) {
	res, err := s.sfJSON(ctx, "sobject", "list", "--sobject", "custom", "--target-org="+target)
	if err != nil {
		return nil, err
	}
	var names []string
	if err := json.Unmarshal(res, &names); err != nil {
		return nil, errors.New("unexpected output from sf sobject list")
	}
	valid := names[:0]
	for _, n := range names {
		if customNameRe.MatchString(n) {
			valid = append(valid, n)
		}
	}
	return valid, nil
}

// describe looks up Description for the objects. The SOAP describeSObjects
// result has no description member, so the Tooling API's EntityDefinition is
// the source. Objects it doesn't return get "".
func (s *server) describe(ctx context.Context, target string, names []string) ([]objectDescription, error) {
	text := make(map[string]string, len(names))
	for start := 0; start < len(names); start += descChunk {
		end := min(start+descChunk, len(names))
		quoted := make([]string, 0, end-start)
		for _, n := range names[start:end] {
			quoted = append(quoted, "'"+n+"'")
		}
		soql := "SELECT QualifiedApiName, Description FROM EntityDefinition WHERE QualifiedApiName IN (" + strings.Join(quoted, ",") + ")"
		res, err := s.sfJSON(ctx, "data", "query", "--use-tooling-api", "--target-org="+target, "--query", soql)
		if err != nil {
			return nil, err
		}
		var out struct {
			Records []struct {
				QualifiedApiName string  `json:"QualifiedApiName"`
				Description      *string `json:"Description"`
			} `json:"records"`
		}
		if err := json.Unmarshal(res, &out); err != nil {
			return nil, errors.New("unexpected output from sf data query")
		}
		for _, r := range out.Records {
			if r.Description != nil {
				text[r.QualifiedApiName] = strings.TrimSpace(*r.Description)
			}
		}
	}
	objs := make([]objectDescription, 0, len(names))
	for _, n := range names {
		objs = append(objs, objectDescription{Name: n, Description: text[n]})
	}
	return objs, nil
}

// descriptions lists the default org's custom objects and their descriptions.
func (s *server) descriptions(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), descTimeout)
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
	names, err := s.customObjects(ctx, target)
	if err != nil {
		writeError(w, err)
		return
	}
	objs, err := s.describe(ctx, target, names)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, descriptionsResult{
		Org:     target,
		Command: "sf sobject list --sobject custom --target-org " + target,
		Objects: objs,
	})
}
