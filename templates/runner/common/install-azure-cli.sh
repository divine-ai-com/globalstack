#!/usr/bin/env bash
set -euo pipefail
# Use the signed Microsoft repository and fail if the selected package is unavailable.
install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --batch --yes --dearmor -o /etc/apt/keyrings/microsoft.gpg
chmod 0644 /etc/apt/keyrings/microsoft.gpg
cat > /etc/apt/sources.list.d/azure-cli.sources <<SOURCES
Types: deb
URIs: https://packages.microsoft.com/repos/azure-cli/
Suites: noble
Components: main
Architectures: $(dpkg --print-architecture)
Signed-by: /etc/apt/keyrings/microsoft.gpg
SOURCES
apt-get update
apt-get install -y --no-install-recommends azure-cli=2.92.0-1~noble
rm -rf /var/lib/apt/lists/*
