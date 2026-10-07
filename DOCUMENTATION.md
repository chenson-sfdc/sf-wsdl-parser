# WSDL Parser Tool: Documentation

`wsdlparser` is a Go command-line tool with two independent functions, plus a
companion browser app for exploring its output:

1. **WSDL parsing** (default): reads a Salesforce Enterprise WSDL and reports
   the sObjects, enumerated types, and SOAP operations it declares, as a
   terminal summary and, optionally, a full JSON dump.
2. **`describe` subcommand**: fetches SObject describe metadata from a live org
   through the `sf` CLI, one JSON file per object.
3. **Enterprise WSDL Explorer** (`visualizations/D3/`): a static single-page app
   that visualizes a WSDL or the JSON from function 1. It is separate from the
   Go binary; see [Enterprise WSDL Explorer (SPA)](#enterprise-wsdl-explorer-spa).

The [README](README.md) is a quick-start. This document is the full reference.

## Contents

- [Requirements](#requirements)
- [Building](#building)
- [Command reference](#command-reference)
- [WSDL parsing](#wsdl-parsing)
- [JSON output schema](#json-output-schema)
- [The describe subcommand](#the-describe-subcommand)
- [Enterprise WSDL Explorer (SPA)](#enterprise-wsdl-explorer-spa)
- [Project layout and design](#project-layout-and-design)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## Requirements

| Need | For | Notes |
|------|-----|-------|
| Go toolchain | building | `go.mod` declares `go 1.27.1`. |
| An Enterprise WSDL | WSDL parsing | Download from Setup > API > Generate Enterprise WSDL. |
| [`sf` CLI](https://developer.salesforce.com/tools/salesforcecli) on `PATH` | `describe` | Must already be authenticated to the target org (`sf org login web`, then `sf org list`). |
| A desktop session | file-picker dialog | Only used when no WSDL path is given. |

## Building

```bash
./build.sh
```

`build.sh` runs `go run ./cmd/initapp`, which creates the application
directory, then `go build -o wsdlparser ./cmd/wsdlparser`:

```
~/Documents/go-data-discovery/
  data/
  wsdl/
```

If `~/Documents/go-data-discovery` already exists (as a directory, file, or
symlink), `initapp` creates nothing, prints that the directory already exists,
and exits `1`, so the script stops before compiling. Move or remove the
directory to build again. `~/Documents` itself must already exist. The logic
lives in `internal/appdir`.

To build only the binary, without the application directory:
`go build -o wsdlparser ./cmd/wsdlparser`.

The binary `wsdlparser` is git-ignored. Run it from this directory as
`./wsdlparser`, or move it onto your `PATH`.

## Command reference

```
wsdlparser [-json <path>] [path/to/enterprise.wsdl]
wsdlparser describe [flags] <target-org> <SObjectName>
wsdlparser describe [flags] -batch <names-file> <target-org>
wsdlparser serve [-addr host:port] [-no-open]
```

If the first argument is `describe` or `serve`, that subcommand runs. Anything
else is treated as WSDL parsing.

### WSDL parsing flags

| Flag | Description |
|------|-------------|
| `-json <path>` | Also write the full parsed model as JSON to `<path>`. Use `-json -` for stdout. A bare filename (no directory part) is written to `~/Documents/go-data-discovery/data/`. |

Flags may come before or after the WSDL path; both of these work:

```bash
./wsdlparser -json out.json enterprise.wsdl
./wsdlparser enterprise.wsdl -json out.json
```

### `describe` flags

| Flag | Default | Description |
|------|---------|-------------|
| `-batch <file>` | none | Describe every object listed in the file. |
| `-out <dir>` | stdout (single), `describes` (batch) | Directory for `<SObject>.json` files. |
| `-api-version <vNN.0>` | `$API_VERSION`, else `v62.0` | REST API version used for the calls. |

### `serve` flags

| Flag | Default | Description |
|------|---------|-------------|
| `-addr <host:port>` | `127.0.0.1:8765` | Address to listen on. Only loopback hosts (`127.0.0.0/8`, `::1`, `localhost`) are accepted. If the default port is busy a free port is chosen; an explicit `-addr` that is busy is an error. |
| `-no-open` | off | Do not open the browser. |

### Exit status

`0` on success. `1` on any error, with a message of the form
`wsdlparser: <reason>` on stderr. For `describe -batch`, exit status is `1` if
any object failed.

## WSDL parsing

### Running

```bash
./wsdlparser /path/to/enterprise.wsdl          # summary only
./wsdlparser -json out.json enterprise.wsdl    # summary + JSON file
./wsdlparser -json - enterprise.wsdl           # summary + JSON on stdout
./wsdlparser                                   # opens a file-browser dialog
```

### The application directory

If `~/Documents/go-data-discovery/` exists (created by `./build.sh`), it is used
as a default location:

- **Input.** A bare WSDL filename (no directory part) that is not in the current
  directory is looked up in `wsdl/`. `wsdlparser execcosmos.wsdl` finds
  `~/Documents/go-data-discovery/wsdl/execcosmos.wsdl`. A file in the current
  directory wins over one in `wsdl/`.
- **Output.** A bare `-json` filename is written to `data/`:
  `-json out.json` produces `~/Documents/go-data-discovery/data/out.json`. The
  path actually written is printed.
- **File dialog.** It opens in `wsdl/`.

Anything with a directory part (`./out.json`, `/tmp/out.json`, `sub/x.wsdl`) and
`-json -` are used exactly as typed. If the application directory is missing,
every path is used as typed too.

The dialog (provided by [zenity](https://github.com/ncruces/zenity)) is
filtered to `*.wsdl` and `*.xml`, with an "All files" fallback. Cancelling it
exits with `no file selected`.

When writing JSON to stdout with `-json -`, the terminal summary is also
printed to stdout, so redirecting stdout mixes the two. Prefer `-json <file>`
unless you intend to post-process the combined stream.

### What is extracted

| Item | Source in the WSDL |
|------|--------------------|
| **sObjects** | Every `<complexType>` whose `<complexContent><extension base="...sObject">` extends the abstract `sObject` type. Types that don't extend `sObject` (for example `LoginResult` or fault types) are skipped. |
| **Fields** | The `<element>` entries in that extension's `<sequence>`: name, XSD type reduced to its local name (`ens:Contact` becomes `Contact`), plus nillable, optional, and repeated flags. |
| **Enumerated types** | Every `<simpleType>` whose restriction has `<enumeration>` facets. A restriction with no enumerations is skipped. |
| **Operations** | Every `<operation>` in the `<portType>`. Request and response types are resolved through `<message>` then `<part element="...">`; faults are listed by name. |
| **Service** | The service name and the `<soap:address location>` of its first port. |

Notes on semantics:

- Fields inherited from the base `sObject` type (`Id`, `fieldsToNull`) are not
  repeated on each object, since every sObject has them implicitly.
- A field's `Type` is only the local name. Relationship fields therefore show
  the referenced type (for example `Contact`), and some reference fields show
  `sObject`.
- `Optional` means `minOccurs="0"`. `Nillable` means `nillable="true"`.
  `Repeated` means `maxOccurs` is `unbounded` or greater than 1.
- A message with no parts, or an operation that references a message that
  doesn't exist, resolves to an empty request/response type rather than failing.
- Output is deterministic: sObjects, enums, and operations are sorted by name,
  and fields within each sObject are sorted by name.

### Terminal summary

The summary prints the service name, endpoint, target namespace, counts of
sObjects, enums, and operations, the 15 sObjects with the most fields, and one
line per operation (request type, response type, fault count). It deliberately
omits per-field detail; use `-json` for that.

## JSON output schema

`-json` writes a single indented object. Keys use the Go field names
(capitalized):

```jsonc
{
  "TargetNamespace": "urn:enterprise.soap.sforce.com",
  "ServiceName": "SforceService",
  "EndpointURL": "https://login.salesforce.com/services/Soap/c/62.0/...",
  "SObjects": [
    {
      "Name": "Account",
      "Fields": [
        {
          "Name": "Name",
          "Type": "string",
          "Nillable": true,   // nillable="true"
          "Repeated": false,  // maxOccurs > 1 or "unbounded"
          "Optional": true    // minOccurs="0"
        }
      ]
    }
  ],
  "Enums": [
    { "Name": "AppMenuType", "Values": ["AppSwitcher", "Salesforce1", "NetworkTabs"] }
  ],
  "Operations": [
    {
      "Name": "changeOwnPassword",
      "Documentation": "Change the current user's password",
      "RequestType": "changeOwnPassword",
      "ResponseType": "changeOwnPasswordResponse",
      "Faults": ["InvalidNewPasswordFault", "InvalidOldPasswordFault", "UnexpectedErrorFault"]
    }
  ]
}
```

Handy `jq` queries:

```bash
jq '.SObjects | length' out.json                                   # object count
jq -r '.SObjects[].Name' out.json                                  # all object names
jq -r '.SObjects[] | select(.Name=="Account") | .Fields[].Name' out.json
jq -r '.Operations[].Name' out.json
jq '[.SObjects[] | select(.Name | endswith("__c"))] | length' out.json   # custom objects
```

The JSON for a full Enterprise WSDL (about 3,000 sObjects) is roughly 13 MB.
Generated JSON is not covered by `.gitignore`; avoid committing it.

## The describe subcommand

`describe` is a Go port of a `describe-sobjects.sh` shell script from an
earlier data-dictionary tool (not part of this repo). It shells out to:

```
sf api request rest /services/data/<version>/sobjects/<Name>/describe --target-org <org> --json
```

so it uses whatever authentication `sf` already has. It does not talk to
Salesforce directly and needs no credentials of its own.

### Single object

```bash
./wsdlparser describe my-org Account                  # pretty-printed JSON to stdout
./wsdlparser describe -out describes my-org Account   # writes describes/Account.json
```

### Batch

```bash
./wsdlparser describe -batch object-list.json my-org
./wsdlparser describe -batch object-list.txt -out describes my-org
```

The names file may be any of:

- a JSON array of strings: `["Account", "Contact"]`
- an object with a `result` array, as `sf ... --json` emits: `{"result": ["Account"]}`
- plain text, one name per line (blank lines and `\r` are ignored)

Duplicate names are dropped. Every name must match `[A-Za-z0-9_]+`; if any
name does not, the whole file is rejected before any request is made. This
keeps a stray path or query fragment out of the REST URL and the output
filename.

Progress lines start with `==> `. Successful objects are written as
`<out>/<Name>.json` (the directory is created if needed). At the end, a batch
prints either `All N objects described into <dir>/` or a `Failed objects:`
list and exits `1`.

### API limits and safety

Each object costs **one request** against the org's shared Daily API Request
allowance. The tool protects that budget:

- **Pre-flight check.** Before the first describe, it reads
  `DailyApiRequests.Remaining` from the `/limits` endpoint. If fewer requests
  remain than there are objects, it refuses to start. If the figure can't be
  read, it prints a warning and proceeds.
- **Abort on exhaustion.** An HTTP 403 with `REQUEST_LIMIT_EXCEEDED` stops the
  run immediately instead of continuing to fail for every remaining object.
- **Sequential calls.** Requests run one at a time, so concurrency limits are
  never a factor.
- **Cancellation.** Ctrl-C cancels the in-flight `sf` call and the batch loop.

The pre-flight check itself costs one extra request. Other individual failures
(for example a 404 for a name that doesn't exist) are recorded and the batch
continues.

## Enterprise WSDL Explorer (SPA)

`visualizations/D3/` is a static, client-side single-page app built with
[D3](https://d3js.org) v7.9.0 (vendored in `vendor/`). It needs no Go binary, no
server, no network access, and no build step.

### Running

Open `visualizations/D3/index.html` in a browser (double-click it, or
`open visualizations/D3/index.html` on macOS). Then either:

- click **Load file…**, or
- drag a file onto the page.

Accepted inputs (detected by content, not extension; the file picker filters
to `.wsdl`, `.xml`, `.json`):

| Input | Notes |
|-------|-------|
| An Enterprise WSDL | Parsed in the browser with `DOMParser`. The API version and generation date are read from the header comment when present. |
| JSON from `wsdlparser -json` | Any file starting with `{`. Must contain an `SObjects` array; see [JSON output schema](#json-output-schema). |

The file is read locally and never uploaded. Files with no sObjects are
rejected with "No sObjects found. Is this an Enterprise WSDL?". Only the
Enterprise WSDL has been tested; other WSDLs (for example Partner) haven't been
verified.

### Embedded local web server

`wsdlparser serve` serves the same app from inside the binary
(`visualizations/D3/embed.go` embeds `index.html`, `css/`, `js/`, `vendor/`).
The SPA files stay the single source; rebuilding the binary picks up any change.

| Endpoint | Returns |
|----------|---------|
| `GET /` and static assets | The embedded SPA. |
| `GET /api/files` | JSON list `[{name, size}]` of `.wsdl`/`.xml` files in `~/Documents/go-data-discovery/wsdl/` (empty if the directory is absent). |
| `GET /api/model?file=<name>` | The parsed model, identical to `wsdlparser -json`. `<name>` must be a plain filename in that directory. `400` for an invalid name, `404` if missing, `422` if it does not parse. |

When the page is served this way it fetches `/api/files`, shows a button per
file, and auto-loads when there is exactly one. Opened from disk (`file://`) the
fetch fails silently and manual loading works as before.

Safeguards: the listener refuses non-loopback addresses; requests whose `Host`
header is not `localhost`/`127.0.0.1`/`[::1]` get `403` (blocks DNS rebinding);
only `GET` is routed; the API reads nothing outside `wsdl/` (names containing
separators, `..`, or other extensions are rejected); responses carry a
restrictive `Content-Security-Policy` (`default-src 'self'`), `nosniff`, and
`no-referrer`. The server has no authentication, which is why it never binds
beyond the local machine.

### Views

| Tab | Shows |
|-----|-------|
| **Overview** | KPI tiles (sObjects, fields, relationships, operations, enumerations); objects by kind; fields-per-object histogram; field types; largest objects; most-referenced objects. Clicking a bar in the last two opens that object. |
| **Objects & relationships** | Filterable, sortable list of sObjects (by name, field count, or referenced-by count; the list shows the first 400 matches). The selected object shows a relationship graph (click a neighbour to re-center), a filterable field table with nillable/optional/repeated flags, and a table of what it references and what references it. |
| **Operations** | Operations grouped by purpose (Describe, Query & search, Data change, Session & password, Email & templates, Other), plus a filterable table of request/response types, faults, and documentation. |
| **Enumerations** | The 15 largest enums and a table of every enum with its values. |

Every chart has a **View as table** twin. The **Theme** button cycles auto,
light, and dark; the choice is stored in `localStorage` under `wsdl-theme`.

### How relationships and kinds are derived

The WSDL has no explicit foreign keys, so `model.js` infers them:

- **Relationship edge:** a field whose type is the name of another sObject in
  the file. Edges are de-duplicated per (source, target) pair and keep the
  names of the fields that create them. Self-references are excluded.
- **Child relationships:** fields of type `QueryResult`; counted separately and
  not drawn as edges.
- **Polymorphic references:** fields of type `sObject`; counted but not drawn,
  since the target isn't known from the WSDL.
- **Kind:** from the name suffix (`__mdt` custom metadata, `__e` platform
  event, `__c` custom object) or a companion suffix (`ChangeEvent`, `History`,
  `Share`, `Feed`) whose base object exists in the file. Other names containing
  `__` are "Other"; the rest are "Standard".
- **Operation group:** matched by name patterns in `OP_GROUPS`.

### Layout

```
visualizations/D3/
  index.html     page shell; loads the scripts in dependency order
  css/styles.css layout and light/dark themes
  vendor/        d3.min.js (v7.9.0) and its ISC license
  js/
    util.js      App namespace, el() DOM helper, cards, tooltip, theme, debounce
    parser.js    parseWsdl / parseJson / parseFile; output matches the Go JSON schema
    model.js     build(): kinds, edges, type counts, operation groups
    charts.js    hbar, columns, egoGraph (D3 SVG charts)
    views.js     overview, objects, operations, enums
    app.js       tabs, file loading, drag and drop, startup
```

Modules attach to a shared `window.App` object rather than using ES modules,
so the page works from `file://` (browsers block module imports there). Script
order in `index.html` matters.

### Keeping it in sync with the Go tool

`js/parser.js` reimplements the extraction rules from `internal/wsdl` in
JavaScript and must produce the same shape as the Go JSON output. If you add a
field to the Go model (see [Extending](#extending)), mirror it in
`parseWsdl` and `parseJson`, or the SPA will not see it when loading a WSDL
directly. The SPA has no automated tests.

## Project layout and design

```
cmd/initapp/
  main.go           creates ~/Documents/go-data-discovery/{data,wsdl}; run by build.sh
cmd/wsdlparser/
  main.go           entry point, flag handling, WSDL flow, JSON file output
  describe.go       `describe` subcommand CLI wiring
  serve.go          `serve` subcommand: listener, browser launch, graceful shutdown
internal/appdir/
  appdir.go         Root() and Create(): the application directory
internal/wsdl/
  types.go          encoding/xml structs mirroring the WSDL document
  parse.go          Parse(path): read and unmarshal the WSDL
  model.go          BuildModel: reduce raw WSDL to SObjects/Enums/Operations
internal/report/
  report.go         terminal summary and JSON writer
internal/server/
  server.go         HTTP handler: embedded SPA + /api/files, /api/model
internal/describe/
  describe.go       sf-backed describe client, batch logic, names-file parsing
visualizations/D3/  browser SPA (see Enterprise WSDL Explorer above)
  embed.go          go:embed of the SPA files, used by `serve`
```

Pipeline for WSDL parsing: `Parse` (XML to `Definitions`) then `BuildModel`
(`Definitions` to `Model`) then `report.WriteSummary` / `report.WriteJSON`.

Design notes:

- **Plain `encoding/xml`.** No third-party XML or SOAP library; a multi-megabyte
  WSDL parses in well under a second.
- **Flag reordering.** Go's `flag` package stops at the first non-flag
  argument. `reorderFlagsFirst` moves flags (and their values) ahead of
  positionals so `wsdlparser file.wsdl -json out.json` works. Its
  `flagsTakingValue` map must list every flag that takes a value; **add new
  value-taking flags there** or `-flag value` will be mis-ordered.
- **Injectable `sf` runner.** `describe.Client.Run` is a function field
  (`Runner`) defaulting to a real `sf` exec. Tests substitute a fake, so the
  suite never touches an org or needs `sf` installed.
- **Typed errors.** `describe` distinguishes `CommandError` (the `sf` process
  failed), `APIError` (Salesforce returned non-200), and name-validation errors,
  so the batch loop can decide whether to continue or abort.

### Extending

- *New field attribute in the JSON:* add it to `types.go` (parse), `Field` and
  `fieldFromElement` in `model.go`, and a case in `TestFieldFromElement`.
- *New subcommand:* dispatch on `args[0]` in `run()` in `main.go`, as
  `describe` does, and add any value-taking flags to `flagsTakingValue`.

## Testing

```bash
go build ./... && go vet ./... && go test ./...
```

| Package | Covers |
|---------|--------|
| `cmd/wsdlparser` | `reorderFlagsFirst` argument ordering. |
| `internal/wsdl` | `BuildModel` (sObject/enum/operation extraction and skipping rules, empty input), `fieldFromElement`, `isGreaterThanOne`, `localName`. |
| `internal/appdir` | Directory creation, halt when the root exists (as directory or file), missing parent, root path, and the bare-filename input/output resolution rules. |
| `internal/server` | Asset serving, security headers, file listing (including a missing `wsdl/`), model endpoint, path-traversal and bad-name rejection, non-loopback `Host` rejection, GET-only. |
| `cmd/wsdlparser` (serve) | Loopback-only `-addr` check, serving the embedded SPA, graceful stop on cancel, argument rejection. |
| `internal/describe` | Request arguments, API-version override, error types, name validation, batch success/failure, insufficient-budget refusal, unknown-limits warning, abort on `REQUEST_LIMIT_EXCEEDED`, cancellation, names-file parsing. |

`internal/report` has no tests yet, and neither does the SPA in
`visualizations/D3/`. Check SPA changes by loading a WSDL in a browser and
walking each tab.

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| `no such file or directory: ./wsdlparser` | The binary isn't built yet. Run the build command in [Building](#building) from this directory. |
| `no file selected` | You cancelled the file dialog. Pass the path as an argument instead. |
| `cannot read "<path>"` | The WSDL path doesn't exist or isn't readable. |
| An XML parse error | The file isn't a well-formed WSDL. The tool is built and tested against the Enterprise WSDL; other WSDLs (for example Partner) haven't been verified. |
| `the sf CLI was not found on PATH` | Install the Salesforce CLI and open a new shell. |
| `describe` fails with an auth or org error | Run `sf org list` and use the alias or username shown there as `<target-org>`; re-authenticate with `sf org login web` if it has expired. |
| `org has only N daily API requests remaining` | The batch is larger than the org's remaining daily allowance. Split the names file or wait for the 24-hour window to reset. |
| `invalid sObject name` | A name contains characters other than letters, digits, and underscores. Fix the names file. |
| SPA shows "Parsing…" forever or a blank page | Open the browser console. Usually a script failed to load (check that `vendor/d3.min.js` exists) or a file was added to `index.html` out of order. |
| SPA: `Could not read <file>: Not well-formed XML` | The file isn't a valid WSDL. Load the JSON from `wsdlparser -json` instead. |
| SPA: `JSON is not wsdlparser output` | The JSON has no `SObjects` array. It may be `describe` output rather than `-json` output. |
| `-json out.json` ignored | Should not happen (flags are reordered). If you added a new flag, make sure it's in `flagsTakingValue`. |
