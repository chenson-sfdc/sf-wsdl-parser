package appdir

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
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

func TestEnsureCreatesRootAndChildren(t *testing.T) {
	root := filepath.Join(t.TempDir(), Name)
	res, err := Ensure(root)
	if err != nil {
		t.Fatal(err)
	}
	wantCreated := append([]string{root}, childPaths(root)...)
	if !reflect.DeepEqual(res.Created, wantCreated) {
		t.Errorf("Created = %v, want %v", res.Created, wantCreated)
	}
	if len(res.Existing) != 0 {
		t.Errorf("Existing = %v, want none", res.Existing)
	}
	for _, c := range append([]string{"."}, Children...) {
		fi, err := os.Stat(filepath.Join(root, c))
		if err != nil || !fi.IsDir() {
			t.Errorf("expected directory %q: %v", c, err)
		}
	}
}

func TestEnsureIsIdempotent(t *testing.T) {
	root := newApp(t)
	res, err := Ensure(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Created) != 0 {
		t.Errorf("Created = %v, want none", res.Created)
	}
	wantExisting := append([]string{root}, childPaths(root)...)
	if !reflect.DeepEqual(res.Existing, wantExisting) {
		t.Errorf("Existing = %v, want %v", res.Existing, wantExisting)
	}
}

func TestEnsureFillsInMissingChild(t *testing.T) {
	root := filepath.Join(t.TempDir(), Name)
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "wsdl"), 0o755); err != nil {
		t.Fatal(err)
	}

	res, err := Ensure(root)
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{filepath.Join(root, "data")}; !reflect.DeepEqual(res.Created, want) {
		t.Errorf("Created = %v, want %v", res.Created, want)
	}
	if _, err := os.Stat(filepath.Join(root, "data")); err != nil {
		t.Errorf("expected data/ to be created: %v", err)
	}
}

func TestEnsureFailsWhenPathIsAFile(t *testing.T) {
	root := filepath.Join(t.TempDir(), Name)
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "data"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Ensure(root); err == nil {
		t.Fatal("want an error when a child path is a file, got nil")
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
