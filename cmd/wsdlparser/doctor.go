package main

import (
	"flag"
	"fmt"

	"wsdlparser/internal/appdir"
)

// runDoctor builds the application directory structure
// (~/Documents/go-data-discovery and its data/wsdl children), creating
// whatever is missing and leaving the rest alone. Unlike cmd/initapp, which
// build.sh uses to guard first-time setup, doctor is safe to run anytime to
// check or repair an existing installation.
func runDoctor(args []string) error {
	fs := flag.NewFlagSet("wsdlparser doctor", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintln(fs.Output(), "Usage: wsdlparser doctor")
		fmt.Fprintln(fs.Output(), "Builds (or repairs) the application directory structure, creating")
		fmt.Fprintln(fs.Output(), "~/Documents/go-data-discovery and its data/wsdl children if missing.")
		fs.PrintDefaults()
	}
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() > 0 {
		return fmt.Errorf("doctor takes no arguments, got %q", fs.Arg(0))
	}

	root, err := appdir.Root()
	if err != nil {
		return err
	}
	res, err := appdir.Ensure(root)
	if err != nil {
		return fmt.Errorf("building application directory: %w", err)
	}

	for _, p := range res.Existing {
		fmt.Printf("ok      %s\n", p)
	}
	for _, p := range res.Created {
		fmt.Printf("created %s\n", p)
	}
	if len(res.Created) == 0 {
		fmt.Println("\neverything is already in place.")
	} else {
		fmt.Println("\napplication directory is ready.")
	}
	return nil
}
