# wsdl-parser-tool

A Go CLI that parses a Salesforce Enterprise WSDL and reports the sObjects,
enumerated types, and SOAP operations it declares.

## Build

```bash
./build.sh
```

`build.sh` first creates the application directory
`~/Documents/go-data-discovery/` with `data/` and `wsdl/` inside it, then
builds `./wsdlparser`. If `~/Documents/go-data-discovery` already exists, the
build halts with a message and changes nothing; move or remove the directory
to build again. To build the binary only, without touching the application
directory, run `go build -o wsdlparser ./cmd/wsdlparser`.

If the application directory is later moved, partially deleted, or just
missing (for example after building only the binary), run
`./wsdlparser doctor` to create whatever's missing without disturbing
anything already there.

## Usage

Pass the WSDL path directly:

```bash
./wsdlparser /path/to/enterprise.wsdl
```

Or omit the path to open a native OS file-browser dialog and pick the file
interactively:

```bash
./wsdlparser
```

With the application directory in place, a bare filename is looked up in
`~/Documents/go-data-discovery/wsdl/`, and the file dialog opens there:

```bash
./wsdlparser execcosmos.wsdl
```

### Flags

- `-json <path>` — also write the full parsed model (every sObject's fields,
  every enum's values, every operation) as JSON to `<path>`. Use `-json -`
  to write JSON to stdout instead of a file. A bare filename is written to
  `~/Documents/go-data-discovery/data/`; a path with a directory is used as typed.

Flags may appear before or after the WSDL path:

```bash
./wsdlparser -json out.json /path/to/enterprise.wsdl
./wsdlparser /path/to/enterprise.wsdl -json out.json
```

## What gets parsed

- **sObjects** — every `<complexType>` that extends the abstract `sObject`
  base type, with its declared fields (name, XSD type, nillable/optional/
  repeated flags). Fields inherited from the base type itself
  (`fieldsToNull`, `Id`) are implicit on every object and are not repeated
  per sObject.
- **Enumerated types** — every `<simpleType>` restricted to a fixed set of
  `<enumeration>` values (e.g. error codes, picklist-like API enums).
- **Operations** — every SOAP operation in the `<portType>`, with its
  request/response element names resolved through the `<message>`/`<part>`
  indirection, and its named faults.
- **Service** — the service name and SOAP endpoint address.

The terminal summary shows counts plus the 15 largest sObjects by field
count and the full operation list; use `-json` for the complete, structured
dump (all sObjects and all their fields).

## Enterprise WSDL Explorer (browser app)

`visualizations/D3/` contains a single-page app for exploring a WSDL
visually: object counts by kind, largest objects, a per-object relationship
graph, searchable operations, and enumerations. There is no build step and no
server. Open the page in a browser:

```bash
open visualizations/D3/index.html      # macOS; or just double-click the file
```

Then drop in either the Enterprise `.wsdl` itself or the JSON written by
`wsdlparser -json`. Everything is parsed locally in the browser; nothing is
uploaded.

### Embedded local web server

The same app is embedded in the `wsdlparser` binary:

```bash
./wsdlparser serve
```

This serves the app at `http://127.0.0.1:8765/` (a free port is used if 8765
is taken), opens your browser, and lists the `.wsdl`/`.xml` files in
`~/Documents/go-data-discovery/wsdl/`. If there is exactly one, it loads
automatically. The Go parser does the work, so the browser receives the same
model as `-json`. Flags: `-addr host:port` (loopback addresses only) and
`-no-open`. Press Ctrl+C to stop. See [DOCUMENTATION.md](DOCUMENTATION.md#enterprise-wsdl-explorer-spa)
for details.

### Authenticated orgs

Click the **Authenticated orgs** tab to list orgs authorized with the Salesforce CLI. The tab reads from `sf auth list`, with no upload to any server. Actions:

- **Set default:** The radio button picks the org that the CLI uses as `target-org`.
- **Remove:** Logout of an org (same as `sf org logout --target-org=<username>`). A confirmation dialog is shown.
- **Add:** Opens a browser window to log in to a new org (same as `sf org login web`). Optionally set an alias and/or a specific instance URL (e.g. for a sandbox). If only one org is listed, it becomes the default automatically.

**Requirements:** The Salesforce CLI (`sf`) must be installed and on `$PATH`. The tab only works under `wsdlparser serve`; file-based access (`file://`) has no CLI access.

### Finding custom objects without a description

The WSDL carries no sObject descriptions, so the **Missing descriptions** tab
checks the custom objects against a separate export that you load from the tab
(a `.csv` or `.json` with a `QualifiedApiName` and a `Description` column, for
example from `sf data query --use-tooling-api` on `EntityDefinition`). It
charts coverage and size of the undocumented objects and lists them with a CSV
download. See [DOCUMENTATION.md](DOCUMENTATION.md#missing-descriptions).

### Repairing the application directory

```bash
./wsdlparser doctor
```

Creates `~/Documents/go-data-discovery/` and its `data/`/`wsdl/` children,
whichever of them are missing, and reports `ok` or `created` for each. Unlike
`build.sh`'s setup step, it's safe to run anytime and never fails just
because the directory already exists.

## Notes

- The file picker is provided by [zenity](https://github.com/ncruces/zenity),
  which wraps the native file dialog on macOS, Windows, and Linux (GTK/KDE on
  Linux) — no extra system packages required on macOS/Windows.
- Parsing is a plain `encoding/xml` unmarshal, so it handles multi-megabyte
  WSDLs (e.g. a full Enterprise WSDL with 2,500+ sObjects) in well under a
  second.
