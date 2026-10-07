package appdir

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestCreateMakesRootAndChildren(t *testing.T) {
	root := filepath.Join(t.TempDir(), Name)
	if err := Create(root); err != nil {
		t.Fatal(err)
	}
	for _, c := range append([]string{"."}, Children...) {
		fi, err := os.Stat(filepath.Join(root, c))
		if err != nil || !fi.IsDir() {
			t.Errorf("expected directory %q: %v", c, err)
		}
	}
}

func TestCreateHaltsWhenRootExists(t *testing.T) {
	root := filepath.Join(t.TempDir(), Name)
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(root, "keep.txt")
	if err := os.WriteFile(marker, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	err := Create(root)
	var ee *ExistsError
	if !errors.As(err, &ee) || ee.Path != root {
		t.Fatalf("want *ExistsError for %s, got %v", root, err)
	}
	if _, err := os.Stat(marker); err != nil {
		t.Error("existing contents were disturbed")
	}
	for _, c := range Children {
		if _, err := os.Stat(filepath.Join(root, c)); err == nil {
			t.Errorf("child %q was created inside the pre-existing root", c)
		}
	}
}

func TestCreateHaltsWhenRootIsAFile(t *testing.T) {
	root := filepath.Join(t.TempDir(), Name)
	if err := os.WriteFile(root, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	var ee *ExistsError
	if err := Create(root); !errors.As(err, &ee) {
		t.Fatalf("want *ExistsError, got %v", err)
	}
}

func TestCreateFailsWhenParentMissing(t *testing.T) {
	root := filepath.Join(t.TempDir(), "missing", Name)
	err := Create(root)
	var ee *ExistsError
	if err == nil || errors.As(err, &ee) {
		t.Fatalf("want a non-ExistsError failure, got %v", err)
	}
}

func TestRootIsUnderDocuments(t *testing.T) {
	t.Setenv("HOME", "/home/someone")
	got, err := Root()
	if err != nil {
		t.Fatal(err)
	}
	if want := "/home/someone/Documents/go-data-discovery"; got != want {
		t.Errorf("Root() = %q, want %q", got, want)
	}
}

func newApp(t *testing.T) string {
	t.Helper()
	root := filepath.Join(t.TempDir(), Name)
	if err := Create(root); err != nil {
		t.Fatal(err)
	}
	return root
}

func TestResolveInput(t *testing.T) {
	root := newApp(t)
	inWsdl := filepath.Join(root, "wsdl", "org.wsdl")
	if err := os.WriteFile(inWsdl, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Chdir(t.TempDir())
	if err := os.WriteFile("local.wsdl", nil, 0o644); err != nil {
		t.Fatal(err)
	}

	cases := []struct{ name, in, want string }{
		{"bare name found in wsdl/", "org.wsdl", inWsdl},
		{"bare name present in cwd wins", "local.wsdl", "local.wsdl"},
		{"bare name found nowhere", "nope.wsdl", "nope.wsdl"},
		{"explicit relative path", "sub/org.wsdl", "sub/org.wsdl"},
		{"absolute path", "/x/org.wsdl", "/x/org.wsdl"},
		{"empty", "", ""},
	}
	for _, c := range cases {
		if got := ResolveInput(root, c.in); got != c.want {
			t.Errorf("%s: ResolveInput(%q) = %q, want %q", c.name, c.in, got, c.want)
		}
	}
}

func TestResolveOutput(t *testing.T) {
	root := newApp(t)
	cases := []struct{ name, in, want string }{
		{"bare name goes to data/", "out.json", filepath.Join(root, "data", "out.json")},
		{"stdout untouched", "-", "-"},
		{"explicit relative path", "./out.json", "./out.json"},
		{"absolute path", "/tmp/out.json", "/tmp/out.json"},
	}
	for _, c := range cases {
		if got := ResolveOutput(root, c.in); got != c.want {
			t.Errorf("%s: ResolveOutput(%q) = %q, want %q", c.name, c.in, got, c.want)
		}
	}
	missing := filepath.Join(t.TempDir(), Name)
	if got := ResolveOutput(missing, "out.json"); got != "out.json" {
		t.Errorf("without a data dir, got %q, want unchanged", got)
	}
}
