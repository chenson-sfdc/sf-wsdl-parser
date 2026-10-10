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
- **`internal/server/orgs.go`** (370 lines) — CLI wrappers (`execSF`, `sfJSON`), endpoints for listing/logging-in/logging-out, single-org auto-default, CSRF guards.
- **`internal/server/descriptions.go`** (140 lines) — `POST /api/orgs/descriptions`: lists custom objects (`sf sobject list`) and reads each one's Description from the Tooling API.
- **`internal/server/labels.go`** (92 lines) — `POST /api/orgs/labels`: every object's label via one global describe (`sf api request rest /services/data/latest/sobjects`).
- **`internal/server/orgs_test.go`** (525 lines) — fakeSF mock runner, tests for list/remove/login/default-set/descriptions/labels, CSRF, error handling, secrets filtering.
- **`internal/server/server.go`** (139 lines) — HTTP handler: serves the embedded SPA (with a script-hash CSP) plus `/api/files`, `/api/model`, and the `/api/orgs/*` routes.
- **`web/embed.go`** — `go:embed` of `web/build/`. **Required for the Go build** (the binary imports it); `web/build/` is generated, not committed, so run `npm ci && npm run build` in `web/` first (`build.sh` does; the committed `web/build/.gitkeep` keeps the directory present).

**Output formatting package:**
- **`internal/report/report.go`** (74 lines) — terminal summary and JSON writer.

**Total:** 11 source files, 1,692 lines of code (excluding tests).

**Application directory (used by `build.sh` and the `doctor` subcommand):**
- **`build.sh`** — builds the web app, runs `go run ./cmd/initapp`, then `go build`; halts if the directory exists.
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

The browser app under `web/` is a SvelteKit 3 project built with Node 20+ and
npm. `npm run build` writes static files to `web/build/`; the Go binary embeds
them (`web/embed.go`), so `go build` fails if that directory has no build in it.
Source files:

- **`web/package.json`, `web/package-lock.json`** — dependencies and scripts (`dev`, `build`, `check`, `test`); the `imports` map defines the `#lib` alias.
- **`web/vite.config.ts`** — SvelteKit 3 config (hash router, `adapter-static` with `index.html` fallback) and Vitest settings. There is no `svelte.config.js`; Kit 3 rejects it.
- **`web/tsconfig.json`, `web/src/app.html`, `web/src/app.d.ts`, `web/src/app.css`** — TypeScript config, document shell, design tokens and base styles.
- **`web/src/lib/wsdl/`** — `parser.ts`, `model.ts`, `descriptions.ts`, `types.ts`, plus `fixture.ts` and `wsdl.test.ts` (Vitest).
- **`web/src/lib/`** — `explorer.svelte.ts` (app state), `api.ts`, `format.ts`, `chart.ts`, `nav.ts`, `tooltip.svelte.ts`.
- **`web/src/lib/components/`** — `Card`, `ChartCard`, `DataTable`, `BarChart`, `ColumnChart`, `EgoGraph`, `Kpi`, `ObjectDetail`, `PageHeader`, `Toasts`, `Tooltip`, `Welcome`.
- **`web/src/routes/`** — `+layout.svelte` (shell) and a `+page.svelte` for each of Overview, `objects`, `operations`, `enums`, `descriptions`, `orgs`.

## Optional but recommended

- **`README.md`** — quick-start usage.
- **`DOCUMENTATION.md`** — full reference (JSON schema, API-limit behavior, design, troubleshooting).
- **`.gitignore`** — contains `/wsdlparser` (the built binary is not committed) and `/web/build/*` (generated web output).
- **`.github/workflows/go.yml`** — CI: builds and tests the web app with Node 22, then builds and tests Go.

## Excluded

- **`out-data.json`** — generated JSON output (about 13 MB for a full Enterprise WSDL). Not committed; produce one with `wsdlparser -json`.

## Build process

```bash
# Download dependencies (one-time)
go mod download

# Build the web app, create ~/Documents/go-data-discovery/{data,wsdl}, and
# build the binary (halts if that directory already exists)
./build.sh

# Or build the binary only (web/build/ must already exist)
(cd web && npm ci && npm run build)
go build -o wsdlparser ./cmd/wsdlparser

# Run tests (optional)
go test ./...
(cd web && npm run check && npm test)

# Check code quality
go vet ./...
```

The Go build needs only `go.mod` and `go.sum` plus a built `web/build/`; building that needs the web files listed above.

## Minimum viable rebuild from scratch

To build the tool in a fresh directory with the fewest files:

1. Copy `go.mod` and `go.sum`.
2. Copy all `.go` files from `cmd/wsdlparser` and `internal/*`.
3. Copy `web/` (its source), then run `npm ci && npm run build` in it to produce `web/build/`.
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
    orgs.go
    orgs_test.go
    descriptions.go
    labels.go
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
web/                          (the SPA; web/build is embedded into the binary by embed.go)
  embed.go
  package.json
  package-lock.json
  vite.config.ts
  tsconfig.json
  build/.gitkeep
  src/
    app.html, app.css, app.d.ts
    lib/                        (wsdl/, components/, explorer.svelte.ts, api.ts, ...)
    routes/                     (+layout.svelte, +page.svelte, and one folder per tab)
.github/workflows/go.yml
```

## Size reference

- **Total source:** 2,959 lines of Go code (1,692 non-test, 1,267 tests).
- **go.mod:** 4 KB.
- **go.sum:** 4 KB.
- **Typical binary size:** ~10–12 MB (unstripped), ~3–4 MB (stripped with `go build -ldflags="-s -w"`).
- **Dependencies downloaded:** ~50 MB (once per machine, cached in `$GOPATH/pkg/mod`).
