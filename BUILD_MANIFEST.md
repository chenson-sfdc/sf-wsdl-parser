# Build Manifest: wsdlparser

This document lists the files required to build `wsdlparser` from scratch.

## Essential files

Build and tests work with just these:

### Go module files
- **`go.mod`** (4 KB) — module name, Go version (1.27.1), and direct dependency (zenity).
- **`go.sum`** (4 KB) — checksums of all transitive dependencies; auto-updated by `go build` and `go mod tidy`.

If starting from a new directory, `go mod init wsdlparser` creates `go.mod`.

### Source code

**Entry point and flag handling:**
- **`cmd/wsdlparser/main.go`** (163 lines) — WSDL parsing flow, CLI flags, JSON output, file picker.
- **`cmd/wsdlparser/serve.go`** (119 lines) — `serve` subcommand: loopback listener, browser launch, graceful shutdown.
- **`cmd/wsdlparser/doctor.go`** (51 lines) — `doctor` subcommand: builds/repairs the application directory, reporting what it created vs. found.

**WSDL parsing packages:**
- **`internal/wsdl/types.go`** (184 lines) — `encoding/xml` structs mirroring the WSDL schema.
- **`internal/wsdl/parse.go`** (33 lines) — `Parse(path)` function to read and unmarshal the WSDL.
- **`internal/wsdl/model.go`** (164 lines) — `BuildModel(def)` to extract sObjects, enums, operations.

**Embedded web server packages:**
- **`internal/server/orgs.go`** (309 lines) — CLI wrappers (`execSF`, `sfJSON`), endpoints for listing/logging-in/logging-out, single-org auto-default, CSRF guards.
- **`internal/server/orgs_test.go`** (274 lines) — fakeSF mock runner, tests for list/remove/login/default-set, CSRF, error handling, secrets filtering.
- **`internal/server/server.go`** (138 lines) — HTTP handler: serves the embedded SPA plus `/api/files` and `/api/model`.
- **`visualizations/D3/embed.go`** (9 lines) — `go:embed` of the SPA files. **Required for the Go build** (the binary imports it); the SPA files it embeds (`index.html`, `css`, `js`, `vendor`) must therefore be present too.

**Output formatting package:**
- **`internal/report/report.go`** (74 lines) — terminal summary and JSON writer.

**Total:** 9 source files, 922 lines of code (excluding tests).

**Application directory (used by `build.sh` and the `doctor` subcommand):**
- **`build.sh`** (9 lines) — runs `go run ./cmd/initapp`, then `go build`; halts if the directory exists.
- **`cmd/initapp/main.go`** (31 lines) — creates `~/Documents/go-data-discovery/{data,wsdl}`; exits `1` and changes nothing if the root already exists.
- **`internal/appdir/appdir.go`** (123 lines) — `Root()`, `Create()`, and `Ensure()`; `Create` uses `os.Mkdir` so the existence check and creation are one step, while `Ensure` (used by `doctor.go` above) fills in whatever's missing without failing if the root already exists.

## Test files

Tests are optional but highly recommended. To run `go test ./...`, also need:

- **`internal/appdir/appdir_test.go`** (202 lines) — creation, halt-if-exists (directory and file), missing parent, root path, `Ensure` create/idempotent/partial-repair/fail-on-non-directory cases.
- **`internal/server/server_test.go`** (160 lines) — handler tests: assets, listing, model, path traversal, host checks.
- **`cmd/wsdlparser/serve_test.go`** (75 lines) — loopback check, serving and graceful stop.
- **`cmd/wsdlparser/main_test.go`** (64 lines) — `reorderFlagsFirst` tests.
- **`internal/wsdl/model_test.go`** (222 lines) — `BuildModel`, `fieldFromElement`, `isGreaterThanOne`.
- **`internal/wsdl/parse_test.go`** (19 lines) — `localName`.

Test files are excluded by the binary build (`go build`), so omitting them doesn't break the tool.

## Enterprise WSDL Explorer (SPA)

The browser app under `visualizations/D3/` has no package manager, bundler, or
build step: the files can be opened straight from disk (`file://`) and need no
Go to run. The Go binary, however, embeds them (`visualizations/D3/embed.go`),
so `go build` fails if the files listed below are missing.

All of these are required for the app to load:

- **`visualizations/D3/index.html`** — page shell; loads the scripts below in order.
- **`visualizations/D3/css/styles.css`** (218 lines) — layout, light/dark themes.
- **`visualizations/D3/vendor/d3.min.js`** — D3 v7.9.0, vendored so the app works offline with no CDN.
- **`visualizations/D3/vendor/d3.LICENSE`** — D3's ISC license; keep it alongside `d3.min.js`.
- **`visualizations/D3/js/util.js`** (107 lines) — `App` namespace, DOM helper `el`, cards, tooltip, theme, debounce.
- **`visualizations/D3/js/parser.js`** (150 lines) — browser-side WSDL XML and `wsdlparser` JSON parsing.
- **`visualizations/D3/js/model.js`** (119 lines) — derives kinds, relationship edges, type and operation groupings.
- **`internal/server/descriptions.go`** — `POST /api/orgs/descriptions`: runs `sf sobject list --sobject custom --target-org <alias|username>` for the default org, then reads each object's Description from the Tooling API's EntityDefinition. Feeds the Missing descriptions tab's "Get descriptions from default org" button.
- **`visualizations/D3/js/orgs.js`** (85 lines) — reads from the embedded server's `/api/orgs`, renders a D3 table of authenticated orgs, and drives the login/logout/default-set form.
- **`visualizations/D3/js/descriptions.js`** (106 lines) — parses a CSV/JSON description export and finds custom objects lacking a description.
- **`visualizations/D3/js/charts.js`** (191 lines) — bar, column, and relationship-graph charts.
- **`visualizations/D3/js/views.js`** (360+ lines) — Overview, Objects, Operations, Enumerations, Missing descriptions, and Authenticated orgs views.
- **`visualizations/D3/js/app.js`** (138 lines) — tabs, file loading, drag and drop, startup.

Script order in `index.html` matters (`util.js` first, `app.js` last); when adding a
file, load it after the modules it uses.

## Optional but recommended

- **`README.md`** — quick-start usage.
- **`DOCUMENTATION.md`** — full reference (JSON schema, API-limit behavior, design, troubleshooting).
- **`.gitignore`** — contains `/wsdlparser` (the built binary is not committed).

## Excluded

- **`out-data.json`** — generated JSON output (about 13 MB for a full Enterprise WSDL). Not committed; produce one with `wsdlparser -json`.

## Build process

```bash
# Download dependencies (one-time)
go mod download

# Create ~/Documents/go-data-discovery/{data,wsdl} and build the binary
# (halts if that directory already exists)
./build.sh

# Or build the binary only
go build -o wsdlparser ./cmd/wsdlparser

# Run tests (optional)
go test ./...

# Check code quality
go vet ./...
```

All of this uses the files listed above; no build configuration files beyond `go.mod` and `go.sum` are needed.

## Minimum viable rebuild from scratch

To build the tool in a fresh directory with the fewest files:

1. Copy `go.mod` and `go.sum`.
2. Copy all `.go` files from `cmd/wsdlparser` and `internal/*`.
3. Copy `visualizations/D3/` (`embed.go` and the SPA files it embeds).
4. Run `go build -o wsdlparser ./cmd/wsdlparser`.

This skips `README.md` and `DOCUMENTATION.md` (documentation only) and test files, and still produces a working binary.

## Dependency tree

The only direct dependency is `github.com/ncruces/zenity v0.10.15` (native file picker).

Transitive dependencies are:
- Platform-specific utilities (rsrc, goversioninfo) for Windows resource embedding.
- Image and system packages (golang.org/x/image, golang.org/x/sys) used by zenity.
- Testing indirect dependencies (testify, goleak, yaml) that are pulled in transitively; they don't affect the build unless tests are run.

`go.sum` pins all of them. `go mod download` fetches them; the build is reproducible.

## File manifest (for import into a new repo or archive)

```
go.mod
go.sum
build.sh
cmd/initapp/
  main.go
cmd/wsdlparser/
  main.go
  main_test.go
  serve.go
  serve_test.go
  doctor.go
internal/
  server/
    server.go
    server_test.go
  appdir/
    appdir.go
    appdir_test.go
  wsdl/
    types.go
    parse.go
    parse_test.go
    model.go
    model_test.go
  report/
    report.go
README.md
DOCUMENTATION.md
BUILD_MANIFEST.md
.gitignore
visualizations/D3/            (the SPA; embedded into the binary by embed.go)
  embed.go
  index.html
  css/styles.css
  vendor/d3.min.js
  vendor/d3.LICENSE
  js/
    util.js
    parser.js
    model.js
    descriptions.js
    charts.js
    views.js
    app.js
```

## Size reference

- **Total source:** 1,818 lines of Go code (including 742 lines of tests).
- **go.mod:** 4 KB.
- **go.sum:** 4 KB.
- **Typical binary size:** ~10–12 MB (unstripped), ~3–4 MB (stripped with `go build -ldflags="-s -w"`).
- **Dependencies downloaded:** ~50 MB (once per machine, cached in `$GOPATH/pkg/mod`).
