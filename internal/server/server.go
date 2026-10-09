// Package server is the HTTP handler behind `wsdlparser serve`: it serves the
// embedded SPA and a small JSON API over the application directory and the
// Salesforce CLI's authenticated orgs.
package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"wsdlparser/internal/wsdl"
)

const csp = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"

type fileInfo struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
}

// maxWSDLBytes bounds what /api/model will read and parse. A full Enterprise
// WSDL is a few MB; encoding/xml needs several times the file size in memory.
var maxWSDLBytes int64 = 64 << 20

type server struct {
	wsdlDir string
	orgState

	modelMu sync.Mutex // also serialises parses, so a burst can't parse in parallel
	models  map[string]*cachedModel
}

// cachedModel is the encoded /api/model response for one file, valid while the
// file's size and modification time are unchanged.
type cachedModel struct {
	size int64
	mod  time.Time
	body []byte
}

// Handler serves assets at / plus GET /api/files and GET /api/model?file=NAME,
// where NAME is a bare filename inside root/wsdl, and the /api/orgs endpoints
// that drive the Salesforce CLI (see orgs.go). Requests whose Host header
// is not a loopback name are refused, which blocks DNS-rebinding attacks from
// web pages the user has open.
func Handler(root string, assets fs.FS) http.Handler {
	return newHandler(root, assets, execSF)
}

func newHandler(root string, assets fs.FS, sf sfRunner) http.Handler {
	s := &server{wsdlDir: filepath.Join(root, "wsdl"), orgState: newOrgState(sf), models: map[string]*cachedModel{}}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/files", readGuarded(s.files))
	mux.HandleFunc("GET /api/model", readGuarded(s.model))
	mux.HandleFunc("GET /api/orgs", readGuarded(s.orgs))
	mux.HandleFunc("POST /api/orgs/login", guarded(s.login))
	mux.HandleFunc("POST /api/orgs/logout", guarded(s.logout))
	mux.HandleFunc("POST /api/orgs/default", guarded(s.setDefault))
	mux.HandleFunc("POST /api/orgs/descriptions", guarded(s.descriptions))
	mux.HandleFunc("POST /api/orgs/labels", guarded(s.labels))
	mux.Handle("GET /", http.FileServerFS(assets))
	return loopbackOnly(mux)
}

func loopbackOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		if !loopbackHost(host) {
			http.Error(w, "forbidden host", http.StatusForbidden)
			return
		}
		h := w.Header()
		h.Set("Content-Security-Policy", csp)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

// loopbackHost accepts "localhost" and loopback IP literals. A literal can't be
// re-pointed by DNS, so any of 127.0.0.0/8 or ::1 is as safe as 127.0.0.1.
func loopbackHost(host string) bool {
	host = strings.Trim(host, "[]")
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func isWSDLName(name string) bool {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".wsdl", ".xml":
		return true
	}
	return false
}

// validName accepts only a plain filename: no separators, no dot-segments.
func validName(name string) bool {
	return name != "" && name != "." && name != ".." &&
		filepath.Base(name) == name && !strings.ContainsAny(name, `/\`) && isWSDLName(name)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(v)
}

func (s *server) files(w http.ResponseWriter, r *http.Request) {
	list := []fileInfo{}
	entries, err := os.ReadDir(s.wsdlDir)
	if err != nil && !os.IsNotExist(err) {
		http.Error(w, "cannot read the wsdl directory", http.StatusInternalServerError)
		return
	}
	for _, e := range entries {
		if !isWSDLName(e.Name()) {
			continue
		}
		fi, err := os.Stat(filepath.Join(s.wsdlDir, e.Name()))
		if err != nil || !fi.Mode().IsRegular() {
			continue
		}
		list = append(list, fileInfo{Name: e.Name(), Size: fi.Size()})
	}
	writeJSON(w, list)
}

func (s *server) model(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("file")
	if !validName(name) {
		http.Error(w, "file must be a plain .wsdl or .xml filename", http.StatusBadRequest)
		return
	}
	path := filepath.Join(s.wsdlDir, name)
	fi, err := os.Stat(path)
	if err != nil || !fi.Mode().IsRegular() {
		http.Error(w, "no such file: "+name, http.StatusNotFound)
		return
	}
	if fi.Size() > maxWSDLBytes {
		http.Error(w, fmt.Sprintf("%s is larger than the %d MB limit", name, maxWSDLBytes>>20), http.StatusRequestEntityTooLarge)
		return
	}

	s.modelMu.Lock()
	defer s.modelMu.Unlock()
	c := s.models[name]
	if c == nil || c.size != fi.Size() || !c.mod.Equal(fi.ModTime()) {
		def, err := wsdl.Parse(path)
		if err != nil {
			http.Error(w, fmt.Sprintf("could not parse %s: %v", name, err), http.StatusUnprocessableEntity)
			return
		}
		var buf bytes.Buffer
		if err := json.NewEncoder(&buf).Encode(wsdl.BuildModel(def)); err != nil {
			http.Error(w, "could not encode model", http.StatusInternalServerError)
			return
		}
		c = &cachedModel{size: fi.Size(), mod: fi.ModTime(), body: buf.Bytes()}
		s.models[name] = c
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Write(c.body)
}
