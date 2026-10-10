# WSDL Parser Tool: Documentation

`wsdlparser` is a Go command-line tool with two independent functions, plus a
companion browser app for exploring its output and a maintenance subcommand:

1. **WSDL parsing** (default): reads a Salesforce Enterprise WSDL and reports
   the sObjects, enumerated types, and SOAP operations it declares, as a
   terminal summary and, optionally, a full JSON dump.
2. **`doctor` subcommand**: builds or repairs the application directory
   (`~/Documents/go-data-discovery/{data,wsdl}`), creating whatever's missing.
3. **Enterprise WSDL Explorer** (`web/`): a SvelteKit single-page app that
   visualizes a WSDL or the JSON from function 1. It is built to static files
   and embedded in the Go binary, which serves it with `wsdlparser serve`; see
   [Enterprise WSDL Explorer (SPA)](#enterprise-wsdl-explorer-spa).

The [README](README.md) is a quick-start. This document is the full reference.

## Contents

- [Requirements](#requirements)
- [Building](#building)
- [Command reference](#command-reference)
- [WSDL parsing](#wsdl-parsing)
- [JSON output schema](#json-output-schema)
- [The doctor subcommand](#the-doctor-subcommand)
- [Enterprise WSDL Explorer (SPA)](#enterprise-wsdl-explorer-spa)
- [Project layout and design](#project-layout-and-design)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## Requirements

| Need | For | Notes |
|------|-----|-------|
| Go toolchain | building | `go.mod` declares `go 1.27.1`. |
| An Enterprise WSDL | WSDL parsing | Download from Setup > API > Generate Enterprise WSDL. |
| A desktop session | file-picker dialog | Only used when no WSDL path is given. |

## Building

```bash
./build.sh
```

`build.sh` builds the web app (`npm ci && npm run build` in `web/`; needs
Node 20+), runs `go run ./cmd/initapp`, which creates the application
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
`go build -o wsdlparser ./cmd/wsdlparser`. Run `wsdlparser doctor` afterward
to create the application directory without rebuilding; see
[The doctor subcommand](#the-doctor-subcommand).

The binary `wsdlparser` is git-ignored. Run it from this directory as
`./wsdlparser`, or move it onto your `PATH`.

## Command reference

```
wsdlparser [-json <path>] [path/to/enterprise.wsdl]
wsdlparser serve [-addr host:port] [-no-open]
wsdlparser doctor
```

If the first argument is `serve` or `doctor`, that subcommand runs. Anything
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

### `serve` flags

| Flag | Default | Description |
|------|---------|-------------|
| `-addr <host:port>` | `127.0.0.1:8765` | Address to listen on. Only loopback hosts (`127.0.0.0/8`, `::1`, `localhost`) are accepted. If the default port is busy a free port is chosen; an explicit `-addr` that is busy is an error. |
| `-no-open` | off | Do not open the browser. |

### `doctor` flags

None. `doctor` takes no arguments.

### Exit status

`0` on success. `1` on any error, with a message of the form
`wsdlparser: <reason>` on stderr.

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

## The doctor subcommand

```bash
./wsdlparser doctor
```

Builds or repairs the application directory
(`~/Documents/go-data-discovery/{data,wsdl}`): whichever of the root and its
two children are missing get created; anything already present is left
untouched. It prints one line per path, `ok <path>` or `created <path>`, then
a summary line.

Unlike `cmd/initapp` (used by `build.sh` to guard first-time setup), `doctor`
never fails just because the directory already exists — that's the normal,
expected case on every run after the first. It fails only if a path that
should be a directory is something else (a file, for example), or if
`~/Documents` itself is missing, since `doctor` creates the application
root and its children but not arbitrary missing ancestors.

Run it any time the application directory has been moved, partially deleted,
or was never created because you built with `go build` directly instead of
`./build.sh`. The logic is `appdir.Ensure`, alongside `appdir.Create` in
`internal/appdir/appdir.go`.

## Enterprise WSDL Explorer (SPA)

`web/` is a [SvelteKit](https://svelte.dev) 3 project (Svelte 5, TypeScript)
built with `adapter-static` into `web/build/`, which the Go binary embeds
(`web/embed.go`). It uses hash routing (`#/objects?o=Account`), so the Go file
server needs no route table. [D3](https://d3js.org) modules (scale, array,
force, format) do the computation; Svelte renders the SVG. All parsing happens
in the browser; nothing is uploaded.

### Running

```bash
./wsdlparser serve
```

The app no longer runs from `file://`: it loads its scripts from absolute
`/_app/…` URLs, so it needs a server. For development, `cd web && npm run dev`
serves it with hot reload; the `/api/*` endpoints exist only under
`wsdlparser serve`, so run both and expect the org features to be unavailable in
the dev server.

Load a file by clicking **Open file…**, or drag one onto the page. Accepted
inputs (detected by content, not extension):

| Input | Notes |
|-------|-------|
| An Enterprise WSDL | Parsed in the browser with `DOMParser`. The API version and generation date are read from the header comment when present. |
| JSON from `wsdlparser -json` | Any file starting with `{`. Must contain an `SObjects` array; see [JSON output schema](#json-output-schema). |

Files with no sObjects are rejected with "No sObjects found. Is this an
Enterprise WSDL?". A failed load keeps whatever was already showing and reports
the error in a toast. Only the Enterprise WSDL has been tested.

### Embedded local web server

`wsdlparser serve` serves the app from inside the binary. `web/embed.go` embeds
`web/build/`, so run `npm run build` in `web/` before `go build` (`build.sh` does).

| Endpoint | Returns |
|----------|---------|
| `GET /` and static assets | The embedded SPA. |
| `GET /api/files` | JSON list `[{name, size}]` of `.wsdl`/`.xml` files in `~/Documents/go-data-discovery/wsdl/` (empty if the directory is absent). |
| `GET /api/model?file=<name>` | The parsed model, identical to `wsdlparser -json`. `<name>` must be a plain filename in that directory. `400` for an invalid name, `404` if missing, `422` if it does not parse. |

The page fetches `/api/files`, shows a button per file, and auto-loads when there
is exactly one.

Safeguards: the listener refuses to start on, or to end up bound to, anything
but a loopback address; requests whose `Host` header is not `localhost` or a
loopback IP literal get `403` (blocks DNS rebinding); every `GET /api/*` and
`POST /api/orgs/*` route rejects a cross-site request (`Origin` /
`Sec-Fetch-Site`), so another page open in the browser can't drive the CLI or
read org data; `/api/model` caps the file size it will parse and caches the
parsed result per file (invalidated on a size/mtime change); concurrent `sf`
calls are capped, so a burst of requests can't spawn unbounded CLI processes;
the API reads nothing outside `wsdl/` (names containing separators, `..`, or
other extensions are rejected); responses carry `nosniff`, `no-referrer`, and a
restrictive `Content-Security-Policy` (`default-src 'self'`). SvelteKit's
single inline bootstrap `<script>` is allowed by SHA-256 hash: at startup the
server hashes every inline script in the embedded `index.html` and adds them to
`script-src`, so scripts stay limited to `'self'` plus that block, without
`'unsafe-inline'`. The server has no authentication, which is why it never binds
beyond the local machine.

### Views

Each view is a route (`/`, `/objects`, `/operations`, `/enums`, `/descriptions`,
`/orgs`). The selected object is in the URL (`#/objects?o=Account`), so it can be
bookmarked and Back works; the object filter, kind and sort persist across tabs.

| Tab | Shows |
|-----|-------|
| **Overview** | KPI tiles; largest and most-referenced objects (select a bar to open it); objects by kind; fields-per-object histogram; field types. |
| **Objects** | Filterable, sortable list of sObjects. The selected object shows KPIs, a relationship graph (select a neighbour to re-center), a filterable field table with nillable/optional/repeated flags and type links, and a table of what it references and what references it. |
| **Operations** | Operations grouped by purpose (Describe, Query & search, Data change, Session & password, Email & templates, Other), plus a filterable table of request/response types, faults, and documentation. |
| **Enumerations** | The 15 largest enums and a filterable table of every enum with its values. |
| **Missing descriptions** | Which custom objects (`__c`) lack a description, checked against the default org or a separately loaded export (see below). |
| **Orgs** | Authenticated orgs from the Salesforce CLI (see below). Works without a WSDL loaded. |

Every tab that names an object shows its label instead of its API name once
labels are available (see [Object labels](#object-labels)); the top bar then
reads "labels from <org>".

Readability and accessibility: a skip link, a visible focus ring, `aria-current`
on the active tab and `aria-sort` on sorted columns; chart marks are
keyboard-focusable and every chart has a **View as table** twin; toasts and
result counts are live regions; the org-removal confirmation is a modal
`<dialog>`; `prefers-reduced-motion` and forced-colors are respected. The
**Theme** control offers system, light and dark, stored in `localStorage` under
`wsdl-theme`.

### Missing descriptions

The WSDL declares no description for an sObject (its only `documentation`
elements are on operations and enumeration values), so this view needs a
second source for each object's description. There are two.

**From the default org** (needs `wsdlparser serve` and the `sf` CLI). Click
**Get descriptions from default org**. The server takes the default org chosen
on the Orgs tab and runs

```bash
sf sobject list --sobject custom --target-org <alias>
```

using the org's alias, or its username when it has none. It then reads each
listed object's `Description` from the Tooling API's `EntityDefinition`
(`sf data query --use-tooling-api`, in batches of 200 names). `describeSObjects`
is not used: neither the SOAP nor the REST describe result carries an object's
description. The summary reports how many custom objects have a description and
how many are missing one (blank, or not returned by the org). The endpoint is
`POST /api/orgs/descriptions` (same guards as the other mutating endpoints). It
only reads, and returns `{org, command, objects: [{name, description}]}`. It
answers 400 when no default org is set. Listed names must look like `Name__c`
before they are put into the query.

**From a file.** Load it from the tab (**Choose descriptions file…**) after a
WSDL is loaded. It is read in the browser and never uploaded; the Go server is
not involved.

Accepted formats, matched by file extension and content:

- **CSV** with a header row and an API-name column plus a `Description`
  column. Quoted fields, doubled quotes, and newlines inside quotes are handled.
- **JSON**: an array of records, or an `sf ... --json` result (`result.records`).

The API-name column may be `QualifiedApiName`, `ApiName`, `FullName`,
`DeveloperName`, `SObjectType`, `Name`, or `Object` (case-insensitive).
`DeveloperName` values without the `__c` suffix still match. A file with no
`Description` column is rejected, since every object would otherwise look
undocumented. One way to produce a suitable file:

```bash
sf data query --use-tooling-api --result-format csv \
  -q "SELECT QualifiedApiName, Description FROM EntityDefinition WHERE QualifiedApiName LIKE '%__c'" > descriptions.csv
```

Each custom object gets one of three statuses: **Has description**, **Blank
description** (present in the export, empty or whitespace), or **Not in
export**. Objects with either of the last two statuses count as "lacking". Export rows
that match no custom object in the WSDL are counted as *unmatched*.
Only custom objects are checked; standard objects, custom metadata, and
platform events are out of scope. `web/src/lib/wsdl/descriptions.ts` holds the parsing and
analysis; `web/src/routes/descriptions/+page.svelte` renders it.

### Object labels

The WSDL has no object-level label — only field values literally named
`Label`/`MasterLabel` on Custom Metadata Type (`__mdt`) records, which are
record data, not sObject metadata — so, like descriptions, labels come from
the default org.

Unlike descriptions, this isn't a button: once a WSDL is loaded, `app.js`
fetches labels automatically in the background, with no user action and
nothing blocked on it. If the fetch succeeds, every view that names an object
switches from the API name to its label — Overview's "Largest objects" and
"Most referenced objects" charts, the Objects & relationships list, detail
KPI, relationship graph and table, and the Missing descriptions table and
search — while the API name keeps doing the actual work (lookups, routing,
sorting, CSV export, the object link target). If there's no default org, no `sf`
CLI, or the app is not running under `wsdlparser serve`, the fetch is
skipped or fails silently and API names are shown, exactly as before this
feature existed.

The server endpoint is `POST /api/orgs/labels` (same guards as the other
mutating endpoints — same-origin, `application/json`, 4KB body cap). It takes
the default org chosen on the Orgs tab (alias, or username when
it has none) and makes one call:

```bash
sf api request rest /services/data/latest/sobjects --target-org <alias>
```

This is a global describe: one REST call returns every object's `label` and
`labelPlural` in the org (tested at 3,000+ objects in a few seconds), which is
why it's used instead of a per-object describe. `latest` is used for the API
version so the server never needs to know the org's specific version. The
endpoint returns `{org, labels: {"<ApiName>": {label, labelPlural}, ...}}` and
answers 400 when no default org is set. A non-2xx HTTP response from the org
(e.g. a 404) is distinguished from a true CLI/auth failure and surfaced as a
descriptive error rather than silently treated as success — `sf api request
rest` reports both the same way at its top level. `internal/server/labels.go`
holds the handler; `web/src/lib/explorer.svelte.ts`'s `loadLabels` keeps the
labels in app state as `app.labelFor(name)`, which every view calls for display and falls
back to returning `name` unchanged until labels arrive (or if they never do).
The meta bar names the org labels came from (e.g. "labels from
chenson@..."), so it's visible when they're showing.

Labels are scoped to whichever org was default when they were fetched. If the
default org changes — a different one is picked, a new one logs in, or the
current default logs out — `app.js`'s `syncOrgScoped` drops any labels and any
org-fetched descriptions that no longer match, and re-fetches labels for the
new default. A load already in flight for the old org is also disarmed, so it
can't land after the switch and show the wrong org's labels. Loading a second
WSDL file while the first is still parsing has the same kind of guard: each
load is numbered, and only the newest number's result is applied.

### Authenticated orgs

The **Orgs** tab is driven by the embedded server's `/api/orgs` endpoints, which call the Salesforce CLI (`sf auth list`, `sf org login web`, etc.) and manage the `target-org` config. The browser never runs `sf` itself — it just has a UI for it.

**Read:**
- GET `/api/orgs` — returns `{orgs: [{username, alias, orgId, instanceUrl, isDevHub, isSandbox, isScratchOrg, oauthMethod, expired}, ...], default: "<username or empty>"}`. Sorted by alias. Tokens are never returned.

**Write (guarded by same-origin JSON checks; no CORS granted):**
- POST `/api/orgs/default` — `{"username": "..."}` sets `target-org` in the global config.
- POST `/api/orgs/logout` — `{"username": "..."}` calls `sf org logout --target-org=<username> --no-prompt`.
- POST `/api/orgs/login` — `{"alias": "...", "instanceUrl": "..."}` (both optional) calls `sf org login web`. The user finishes in a browser window; the endpoint waits (timeout 5m) and returns the updated list. One login at a time.

Only usernames/aliases that `sf auth list` reports are accepted for removal or default-setting (injection is prevented by checking against the read-only list first).

Single-org auto-default: if the list has exactly one org and no default is set, the server sets it as default (idempotent, best-effort).

`web/src/routes/orgs/+page.svelte` renders the table and drives the form; `internal/server/orgs.go` handles the endpoints and CLI.

### How relationships and kinds are derived

The WSDL has no explicit foreign keys, so `web/src/lib/wsdl/model.ts` infers them:

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
- **Operation group:** matched by name patterns in `OP_GROUPS` (`model.ts`).

### Layout

```
web/
  package.json, vite.config.ts   Kit 3 config lives in vite.config.ts (hash router, adapter-static)
  embed.go                       go:embed of build/, used by `serve`
  build/                         generated by `npm run build`; not committed
  src/
    app.html, app.css            document shell; design tokens and base styles
    lib/wsdl/                    parser.ts, model.ts, descriptions.ts, types.ts, tests
    lib/explorer.svelte.ts       app state: model, labels, descriptions, orgs, toasts, theme
    lib/api.ts                   fetch wrapper for /api/*
    lib/components/              Card, DataTable, BarChart, ColumnChart, EgoGraph, ...
    routes/                      +layout.svelte (shell) and one folder per tab
```

Imports use the `#lib` alias (Node subpath imports, declared under `imports` in
`package.json`); SvelteKit 3 removed `$lib`.

### Keeping it in sync with the Go tool

`web/src/lib/wsdl/parser.ts` reimplements the extraction rules from
`internal/wsdl` in TypeScript and must produce the same shape as the Go JSON
output. If you add a field to the Go model (see [Extending](#extending)), mirror
it in `parseWsdl` and `parseJson`, or the SPA will not see it when loading a
WSDL directly. `npm test` covers the parser, model and description logic.

## Project layout and design

```
cmd/initapp/
  main.go           creates ~/Documents/go-data-discovery/{data,wsdl}; run by build.sh
cmd/wsdlparser/
  main.go           entry point, flag handling, WSDL flow, JSON file output
  serve.go          `serve` subcommand: listener, browser launch, graceful shutdown
  doctor.go         `doctor` subcommand: build/repair the application directory
internal/appdir/
  appdir.go         Root(), Create(), and Ensure(): the application directory
internal/wsdl/
  types.go          encoding/xml structs mirroring the WSDL document
  parse.go          Parse(path): read and unmarshal the WSDL
  model.go          BuildModel: reduce raw WSDL to SObjects/Enums/Operations
internal/report/
  report.go         terminal summary and JSON writer
internal/server/
  server.go         HTTP handler: embedded SPA (hash-based CSP) + /api/files, /api/model
  orgs.go           /api/orgs endpoints: list/login/logout/set-default via sf
  descriptions.go   /api/orgs/descriptions: custom objects + Tooling API descriptions
  labels.go         /api/orgs/labels: every object's label via one global describe
web/                SvelteKit SPA (see Enterprise WSDL Explorer above)
  embed.go          go:embed of web/build, used by `serve`
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

### Extending

- *New field attribute in the JSON:* add it to `types.go` (parse), `Field` and
  `fieldFromElement` in `model.go`, and a case in `TestFieldFromElement`.
- *New subcommand:* dispatch on `args[0]` in `run()` in `main.go`, as `serve`
  and `doctor` do, and add any value-taking flags to `flagsTakingValue`.
- *New application-directory child:* add it to `appdir.Children`; both
  `Create` and `Ensure` (and so `initapp` and `doctor`) pick it up
  automatically.

## Testing

```bash
go build ./... && go vet ./... && go test ./...
```

| Package | Covers |
|---------|--------|
| `cmd/wsdlparser` | `reorderFlagsFirst` argument ordering. |
| `internal/wsdl` | `BuildModel` (sObject/enum/operation extraction and skipping rules, empty input), `fieldFromElement`, `isGreaterThanOne`, `localName`. |
| `internal/appdir` | Directory creation, halt when the root exists (as directory or file), missing parent, root path, bare-filename input/output resolution rules, and `Ensure`'s create-missing/leave-existing/fail-on-non-directory behavior. |
| `internal/server` | Asset serving, security headers, file listing (including a missing `wsdl/`), model endpoint, path-traversal and bad-name rejection, non-loopback `Host` rejection, GET-only. |
| `cmd/wsdlparser` (serve) | Loopback-only `-addr` check, serving the embedded SPA, graceful stop on cancel, argument rejection. |

`internal/report` has no tests yet. The SPA's logic is tested with Vitest
(`cd web && npm test`) and type-checked with `npm run check`; its Svelte
components have no automated tests, so check UI changes by loading a WSDL under
`wsdlparser serve` and walking each tab.

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| `no such file or directory: ./wsdlparser` | The binary isn't built yet. Run the build command in [Building](#building) from this directory. |
| Bare filenames aren't found in `wsdl/`/`data/`, or the file dialog opens somewhere unexpected | The application directory is missing or incomplete (for example you built with `go build` directly instead of `./build.sh`). Run `./wsdlparser doctor` to create whatever's missing. |
| `no file selected` | You cancelled the file dialog. Pass the path as an argument instead. |
| `cannot read "<path>"` | The WSDL path doesn't exist or isn't readable. |
| An XML parse error | The file isn't a well-formed WSDL. The tool is built and tested against the Enterprise WSDL; other WSDLs (for example Partner) haven't been verified. |
| SPA is a blank page, or `go build` fails with "pattern all:build: no matching files" | `web/build/` is missing. Run `npm ci && npm run build` in `web/` (or `./build.sh`). A blank page with a CSP error in the console means the served `index.html` changed after startup; restart `serve`. |
| Opening the page from disk (`file://`) shows nothing | Expected: the app needs `wsdlparser serve` (or `npm run dev`). |
| SPA: `Could not read <file>: Not well-formed XML` | The file isn't a valid WSDL. Load the JSON from `wsdlparser -json` instead. |
| SPA: `JSON is not wsdlparser output` | The JSON has no `SObjects` array. |
| `-json out.json` ignored | Should not happen (flags are reordered). If you added a new flag, make sure it's in `flagsTakingValue`. |
