package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

const miniWSDL = `<?xml version="1.0"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  targetNamespace="urn:enterprise.soap.sforce.com">
  <types>
    <schema xmlns="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:enterprise.soap.sforce.com">
      <complexType name="Account">
        <complexContent><extension base="ens:sObject"><sequence>
          <element name="Name" type="xsd:string" minOccurs="0" nillable="true"/>
        </sequence></extension></complexContent>
      </complexType>
    </schema>
  </types>
</definitions>`

func setup(t *testing.T) (http.Handler, string) {
	t.Helper()
	root := t.TempDir()
	dir := filepath.Join(root, "wsdl")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	write := func(name, body string) {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("org.wsdl", miniWSDL)
	write("broken.wsdl", "<definitions")
	write("notes.txt", "ignore me")
	if err := os.WriteFile(filepath.Join(root, "secret.wsdl"), []byte(miniWSDL), 0o644); err != nil {
		t.Fatal(err)
	}
	assets := fstest.MapFS{"index.html": {Data: []byte("<h1>spa</h1>")}}
	return Handler(root, assets), root
}

func get(h http.Handler, target, host string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("GET", target, nil)
	req.Host = host
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestServesAssets(t *testing.T) {
	h, _ := setup(t)
	rec := get(h, "/", "127.0.0.1:8765")
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "spa") {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Content-Security-Policy") == "" || rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Error("security headers missing")
	}
}

func TestListFiles(t *testing.T) {
	h, _ := setup(t)
	rec := get(h, "/api/files", "localhost:8765")
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	var list []fileInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, f := range list {
		names[f.Name] = true
	}
	if len(list) != 2 || !names["org.wsdl"] || !names["broken.wsdl"] {
		t.Errorf("unexpected list %+v", list)
	}
}

func TestListFilesWithoutWSDLDir(t *testing.T) {
	h := Handler(t.TempDir(), fstest.MapFS{})
	rec := get(h, "/api/files", "127.0.0.1:1")
	if rec.Code != 200 || strings.TrimSpace(rec.Body.String()) != "[]" {
		t.Fatalf("got %d %q, want 200 []", rec.Code, rec.Body.String())
	}
}

func TestModel(t *testing.T) {
	h, _ := setup(t)
	rec := get(h, "/api/model?file=org.wsdl", "127.0.0.1:8765")
	if rec.Code != 200 {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	var m struct {
		SObjects []struct{ Name string }
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatal(err)
	}
	if len(m.SObjects) != 1 || m.SObjects[0].Name != "Account" {
		t.Errorf("unexpected model %s", rec.Body)
	}
}

func TestModelErrors(t *testing.T) {
	h, root := setup(t)
	cases := []struct {
		name, query string
		want        int
	}{
		{"missing param", "", 400},
		{"parent traversal", "../secret.wsdl", 400},
		{"encoded traversal", "..%2Fsecret.wsdl", 400},
		{"nested path", "sub/org.wsdl", 400},
		{"backslash", `..\secret.wsdl`, 400},
		{"absolute", filepath.Join(root, "secret.wsdl"), 400},
		{"wrong extension", "notes.txt", 400},
		{"not found", "nope.wsdl", 404},
		{"unparseable", "broken.wsdl", 422},
	}
	for _, c := range cases {
		rec := get(h, "/api/model?file="+strings.ReplaceAll(c.query, `\`, "%5C"), "127.0.0.1:8765")
		if rec.Code != c.want {
			t.Errorf("%s: status %d, want %d (%s)", c.name, rec.Code, c.want, strings.TrimSpace(rec.Body.String()))
		}
	}
}

func TestRejectsNonLoopbackHost(t *testing.T) {
	h, _ := setup(t)
	for _, host := range []string{"evil.example.com", "evil.example.com:8765", "10.0.0.5:8765"} {
		if rec := get(h, "/api/files", host); rec.Code != http.StatusForbidden {
			t.Errorf("host %q: status %d, want 403", host, rec.Code)
		}
	}
	for _, host := range []string{"localhost", "localhost:1", "127.0.0.1:1", "[::1]:1"} {
		if rec := get(h, "/api/files", host); rec.Code != 200 {
			t.Errorf("host %q: status %d, want 200", host, rec.Code)
		}
	}
}

func TestOnlyGET(t *testing.T) {
	h, _ := setup(t)
	req := httptest.NewRequest("POST", "/api/files", nil)
	req.Host = "127.0.0.1:1"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status %d, want 405", rec.Code)
	}
}
