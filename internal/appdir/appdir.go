// Package appdir creates the go-data-discovery application directory
// (~/Documents/go-data-discovery with "data" and "wsdl" children).
package appdir

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

const Name = "go-data-discovery"

var Children = []string{"data", "wsdl"}

// ExistsError reports that the application root is already present.
type ExistsError struct{ Path string }

func (e *ExistsError) Error() string {
	return fmt.Sprintf("application directory already exists: %s", e.Path)
}

// Root returns ~/Documents/go-data-discovery for the current user.
func Root() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine home directory: %w", err)
	}
	return filepath.Join(home, "Documents", Name), nil
}

// Create makes root and its children. It fails with *ExistsError, creating
// nothing, if root already exists (as a directory, file, or symlink). The
// root is made with os.Mkdir rather than MkdirAll so the existence check and
// creation are a single atomic step.
func Create(root string) error {
	if err := os.Mkdir(root, 0o755); err != nil {
		if errors.Is(err, os.ErrExist) {
			return &ExistsError{Path: root}
		}
		return err
	}
	for _, c := range Children {
		if err := os.Mkdir(filepath.Join(root, c), 0o755); err != nil {
			os.RemoveAll(root) // root was created by this call and holds nothing else
			return err
		}
	}
	return nil
}

// EnsureResult reports what Ensure found: which of root and its children it
// had to create, and which were already present.
type EnsureResult struct {
	Root     string
	Created  []string
	Existing []string
}

// Ensure makes root and its children, creating whichever are missing and
// leaving the rest untouched. Unlike Create, it does not fail if root
// already exists; it's meant for repairing or verifying an installation
// (e.g. a "doctor" command) rather than guarding first-time setup.
func Ensure(root string) (*EnsureResult, error) {
	res := &EnsureResult{Root: root}
	paths := append([]string{root}, childPaths(root)...)
	for _, p := range paths {
		fi, err := os.Stat(p)
		switch {
		case err == nil && fi.IsDir():
			res.Existing = append(res.Existing, p)
		case err == nil:
			return res, fmt.Errorf("%s exists and is not a directory", p)
		case errors.Is(err, os.ErrNotExist):
			if err := os.Mkdir(p, 0o755); err != nil {
				return res, err
			}
			res.Created = append(res.Created, p)
		default:
			return res, err
		}
	}
	return res, nil
}

func childPaths(root string) []string {
	paths := make([]string, len(Children))
	for i, c := range Children {
		paths[i] = filepath.Join(root, c)
	}
	return paths
}

func isBare(p string) bool { return p != "" && p != "-" && filepath.Base(p) == p }

// ResolveInput maps a bare filename that is not in the current directory to
// root/wsdl/<name> when that file exists. Anything else is returned as given.
func ResolveInput(root, path string) string {
	if !isBare(path) {
		return path
	}
	if _, err := os.Stat(path); err == nil {
		return path
	}
	candidate := filepath.Join(root, "wsdl", path)
	if fi, err := os.Stat(candidate); err == nil && !fi.IsDir() {
		return candidate
	}
	return path
}

// ResolveOutput maps a bare filename to root/data/<name> when that directory
// exists. Paths with a directory component, "-", and an absent data
// directory leave the path unchanged.
func ResolveOutput(root, path string) string {
	if !isBare(path) {
		return path
	}
	if fi, err := os.Stat(filepath.Join(root, "data")); err == nil && fi.IsDir() {
		return filepath.Join(root, "data", path)
	}
	return path
}
