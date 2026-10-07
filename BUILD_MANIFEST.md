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
- **`cmd/wsdlparser/describe.go`** (97 lines) — `describe` subcommand CLI wiring.

**WSDL parsing packages:**
- **`internal/wsdl/types.go`** (184 lines) — `encoding/xml` structs mirroring the WSDL schema.
- **`internal/wsdl/parse.go`** (33 lines) — `Parse(path)` function to read and unmarshal the WSDL.
- **`internal/wsdl/model.go`** (164 lines) — `BuildModel(def)` to extract sObjects, enums, operations.

**Describe subcommand package:**
- **`internal/describe/describe.go`** (309 lines) — `sf` CLI runner, `Client` struct, batch logic, names-file parsing.

**Output formatting package:**
- **`internal/report/report.go`** (74 lines) — terminal summary and JSON writer.

**Total:** 13 source files, 1,558 lines of code (including tests).

## Test files

Tests are optional but highly recommended. To run `go test ./...`, also need:

- **`cmd/wsdlparser/main_test.go`** (64 lines) — `reorderFlagsFirst` tests.
- **`internal/wsdl/model_test.go`** (222 lines) — `BuildModel`, `fieldFromElement`, `isGreaterThanOne`.
- **`internal/wsdl/parse_test.go`** (19 lines) — `localName`.
- **`internal/describe/describe_test.go`** (229 lines) — describe, batch, API limits, names parsing (uses a fake `sf` runner).

Test files are excluded by the binary build (`go build`), so omitting them doesn't break the tool.

## Optional but recommended

- **`README.md`** — quick-start usage.
- **`DOCUMENTATION.md`** — full reference (JSON schema, API-limit behavior, design, troubleshooting).
- **`.gitignore`** — contains `/wsdlparser` (the built binary is not committed).

## Excluded

- **`out-data.json`** (13 MB) — an example JSON output from a real Enterprise WSDL. This is not used by the build, but is helpful to understand the JSON structure.
- The `scripts/data-dictionary-tool/describe-sobjects.sh` script that was ported — not needed to build or run `wsdlparser`.

## Build process

```bash
cd scripts/wsdl-parser-tool

# Download dependencies (one-time)
go mod download

# Build the binary
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
3. Run `go build -o wsdlparser ./cmd/wsdlparser`.

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
cmd/wsdlparser/
  main.go
  main_test.go
  describe.go
internal/
  wsdl/
    types.go
    parse.go
    parse_test.go
    model.go
    model_test.go
  describe/
    describe.go
    describe_test.go
  report/
    report.go
README.md
DOCUMENTATION.md
BUILD_MANIFEST.md
.gitignore
```

## Size reference

- **Total source:** 1,558 lines of Go code (including 534 lines of tests).
- **go.mod:** 4 KB.
- **go.sum:** 4 KB.
- **Typical binary size:** ~10–12 MB (unstripped), ~3–4 MB (stripped with `go build -ldflags="-s -w"`).
- **Dependencies downloaded:** ~50 MB (once per machine, cached in `$GOPATH/pkg/mod`).
