#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

node_is_compatible() {
  command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 24 ]
}

install_node() {
  echo '[start] Node.js 24+ bulunamadı; sistem paket yöneticisiyle kuruluyor...'

  if [ "$(id -u)" -eq 0 ]; then
    SUDO=()
  elif command -v sudo >/dev/null 2>&1; then
    SUDO=(sudo)
  else
    echo '[start] Node.js kurulumu için root yetkisi veya sudo gerekli.' >&2
    exit 1
  fi

  if command -v apt-get >/dev/null 2>&1; then
    command -v curl >/dev/null 2>&1 || { "${SUDO[@]}" apt-get update && "${SUDO[@]}" apt-get install -y curl; }
    setup_file="$(mktemp)"
    curl -fsSL https://deb.nodesource.com/setup_24.x -o "$setup_file"
    "${SUDO[@]}" bash "$setup_file"
    rm -f -- "$setup_file"
    "${SUDO[@]}" apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    command -v curl >/dev/null 2>&1 || "${SUDO[@]}" dnf install -y curl
    setup_file="$(mktemp)"
    curl -fsSL https://rpm.nodesource.com/setup_24.x -o "$setup_file"
    "${SUDO[@]}" bash "$setup_file"
    rm -f -- "$setup_file"
    "${SUDO[@]}" dnf install -y nodejs
  elif command -v pacman >/dev/null 2>&1; then
    "${SUDO[@]}" pacman -Sy --needed --noconfirm nodejs npm
  elif command -v apk >/dev/null 2>&1; then
    "${SUDO[@]}" apk add --no-cache nodejs-current npm
  else
    echo '[start] Desteklenen paket yöneticisi bulunamadı. Node.js 24+: https://nodejs.org' >&2
    exit 1
  fi
}

node_is_compatible || install_node
node_is_compatible || { echo '[start] Kurulan Node.js sürümü 24 altında.' >&2; exit 1; }

exec node scripts/setup-and-start.mjs "$@"
