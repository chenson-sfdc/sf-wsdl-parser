#!/usr/bin/env bash
# Builds the web app (web/), creates ~/Documents/go-data-discovery/{data,wsdl},
# then builds ./wsdlparser with the app embedded. Halts before compiling if the
# application directory already exists. Needs Node 20+ and Go.
set -euo pipefail
cd "$(dirname "$0")"

(cd web && npm ci && npm run build)
go run ./cmd/initapp
go build -o wsdlparser ./cmd/wsdlparser
echo "built ./wsdlparser"
