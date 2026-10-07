#!/usr/bin/env bash
# Creates ~/Documents/go-data-discovery/{data,wsdl}, then builds ./wsdlparser.
# Halts before compiling if the application directory already exists.
set -euo pipefail
cd "$(dirname "$0")"

go run ./cmd/initapp
go build -o wsdlparser ./cmd/wsdlparser
echo "built ./wsdlparser"
