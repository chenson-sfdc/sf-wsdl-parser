// Command initapp creates the go-data-discovery application directory.
// build.sh runs it before compiling; it exits non-zero, creating nothing,
// if the directory already exists.
package main

import (
	"errors"
	"fmt"
	"os"

	"wsdlparser/internal/appdir"
)

func main() {
	root, err := appdir.Root()
	if err != nil {
		fmt.Fprintln(os.Stderr, "initapp:", err)
		os.Exit(1)
	}
	if err := appdir.Create(root); err != nil {
		var ee *appdir.ExistsError
		if errors.As(err, &ee) {
			fmt.Fprintf(os.Stderr, "initapp: the application directory already exists: %s\n", ee.Path)
			fmt.Fprintln(os.Stderr, "initapp: build halted; nothing was changed. Move or remove that directory to build.")
		} else {
			fmt.Fprintln(os.Stderr, "initapp:", err)
		}
		os.Exit(1)
	}
	fmt.Println("created", root, "(with data/ and wsdl/)")
}
