# wsdl-parser-tool

A Go CLI that parses a Salesforce Enterprise WSDL and reports the sObjects,
enumerated types, and SOAP operations it declares.

## Build

```bash
go build -o wsdlparser ./cmd/wsdlparser
```

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

### Flags

- `-json <path>` — also write the full parsed model (every sObject's fields,
  every enum's values, every operation) as JSON to `<path>`. Use `-json -`
  to write JSON to stdout instead of a file.

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
uploaded. See [DOCUMENTATION.md](DOCUMENTATION.md#enterprise-wsdl-explorer-spa)
for details.

## Notes

- The file picker is provided by [zenity](https://github.com/ncruces/zenity),
  which wraps the native file dialog on macOS, Windows, and Linux (GTK/KDE on
  Linux) — no extra system packages required on macOS/Windows.
- Parsing is a plain `encoding/xml` unmarshal, so it handles multi-megabyte
  WSDLs (e.g. a full Enterprise WSDL with 2,500+ sObjects) in well under a
  second.
