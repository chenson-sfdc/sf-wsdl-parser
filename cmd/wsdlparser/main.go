// Command wsdlparser parses a Salesforce Enterprise WSDL and reports the
// sObjects, enumerated types, and SOAP operations it declares.
//
// The WSDL file can be supplied as a command-line argument:
//
//	wsdlparser /path/to/enterprise.wsdl
//
// or, if omitted, the tool opens a native OS file-browser dialog (via
// zenity) so the user can pick the file interactively.
package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/ncruces/zenity"

	"wsdlparser/internal/appdir"
	"wsdlparser/internal/report"
	"wsdlparser/internal/wsdl"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "wsdlparser:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) > 0 && args[0] == "serve" {
		return runServe(args[1:])
	}
	if len(args) > 0 && args[0] == "doctor" {
		return runDoctor(args[1:])
	}
	fs := flag.NewFlagSet("wsdlparser", flag.ContinueOnError)
	jsonOut := fs.String("json", "", "write the full parsed model as JSON to this path (use '-' for stdout)")
	fs.Usage = func() {
		fmt.Fprintln(fs.Output(), "Usage: wsdlparser [flags] [path/to/enterprise.wsdl]")
		fmt.Fprintln(fs.Output(), "If no path is given, a file-browser dialog opens to pick one.")
		fmt.Fprintln(fs.Output(), "Run 'wsdlparser serve' to explore the WSDL files visually in a browser.")
		fmt.Fprintln(fs.Output(), "Run 'wsdlparser doctor' to build or repair the application directory structure.")
		fs.PrintDefaults()
	}
	// flag.Parse stops at the first non-flag token, so "wsdlparser file.wsdl
	// -json out.json" would silently ignore -json. Reorder so flags (and
	// their values) always precede the positional filename, regardless of
	// how the user typed them.
	if err := fs.Parse(reorderFlagsFirst(args)); err != nil {
		return err
	}

	// Without a resolvable application directory the paths are used as typed.
	root, _ := appdir.Root()

	path := fs.Arg(0)
	if path == "" {
		picked, err := promptForFile(filepath.Join(root, "wsdl"))
		if err != nil {
			return err
		}
		path = picked
	} else {
		path = appdir.ResolveInput(root, path)
	}

	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("cannot read %q: %w", path, err)
	}

	def, err := wsdl.Parse(path)
	if err != nil {
		return err
	}
	model := wsdl.BuildModel(def)

	report.WriteSummary(os.Stdout, model)

	if *jsonOut != "" {
		return writeJSONReport(appdir.ResolveOutput(root, *jsonOut), model)
	}
	return nil
}

// flagsTakingValue lists flag names (as registered with the FlagSet) that
// consume a following argument when passed as "-name value" rather than
// "-name=value". Keep in sync with the flags defined in run().
var flagsTakingValue = map[string]bool{
	"json": true,
}

// reorderFlagsFirst rewrites args so every "-flag"/"-flag=value"/"-flag
// value" pair sorts before the remaining positional arguments, without
// changing their relative order otherwise. This lets users type the WSDL
// path before or after flags.
func reorderFlagsFirst(args []string) []string {
	var flags, positional []string
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--" {
			positional = append(positional, args[i+1:]...)
			break
		}
		if !strings.HasPrefix(arg, "-") {
			positional = append(positional, arg)
			continue
		}
		flags = append(flags, arg)
		name := strings.TrimLeft(arg, "-")
		if idx := strings.IndexByte(name, '='); idx == -1 && flagsTakingValue[name] && i+1 < len(args) {
			i++
			flags = append(flags, args[i])
		}
	}
	return append(flags, positional...)
}

// promptForFile opens a native OS file-browser dialog restricted to WSDL/XML
// files and returns the chosen path.
func promptForFile(startDir string) (string, error) {
	opts := []zenity.Option{
		zenity.Title("Select a Salesforce Enterprise WSDL file"),
		zenity.FileFilters{
			{Name: "WSDL files", Patterns: []string{"*.wsdl", "*.xml"}, CaseFold: true},
			{Name: "All files", Patterns: []string{"*"}},
		},
	}
	if fi, err := os.Stat(startDir); err == nil && fi.IsDir() {
		opts = append(opts, zenity.Filename(startDir+string(filepath.Separator)))
	}
	path, err := zenity.SelectFile(opts...)
	if errors.Is(err, zenity.ErrCanceled) {
		return "", errors.New("no file selected")
	}
	if err != nil {
		return "", fmt.Errorf("opening file browser: %w", err)
	}
	return path, nil
}

func writeJSONReport(path string, model *wsdl.Model) error {
	if path == "-" {
		return report.WriteJSON(os.Stdout, model)
	}
	f, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("creating JSON output file: %w", err)
	}
	defer f.Close()
	if err := report.WriteJSON(f, model); err != nil {
		return fmt.Errorf("writing JSON output: %w", err)
	}
	if err := f.Close(); err != nil {
		return fmt.Errorf("closing JSON output file: %w", err)
	}
	fmt.Fprintf(os.Stdout, "\nJSON report written to %s\n", path)
	return nil
}
