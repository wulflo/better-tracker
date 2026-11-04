#!/usr/bin/env bash
# Prepara la raíz del .deb que consumen el snap y el Flatpak.
#
# Uso:
#   scripts/package-linux.sh             # compila el .deb y extrae su contenido
#   scripts/package-linux.sh --no-build  # reutiliza el último .deb generado
#
# El resultado queda en packaging/linux/deb-root/ (ignorado por git) y contiene
# el mismo binario, iconos y .desktop que el instalador .deb.
#
# Después:
#   snapcraft pack
#   flatpak-builder --force-clean --repo=repo flatpak_app packaging/flatpak/com.bettertracker.desktop.yml
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

build=1
if [[ "${1:-}" == "--no-build" ]]; then
  build=0
fi

if [[ "$build" -eq 1 ]]; then
  # createUpdaterArtifacts está activado en tauri.conf.json para las releases.
  # Aquí se desactiva: el .deb de Snap/Flatpak no se firma con la clave del
  # updater y no debe generar .sig.
  npm run tauri build -- --bundles deb \
    --config '{"bundle":{"createUpdaterArtifacts":false}}'
fi

deb="$(find src-tauri/target/release/bundle/deb -maxdepth 1 -type f -name '*.deb' -print -quit)"
if [[ -z "$deb" ]]; then
  echo "No se encontró ningún .deb. Ejecuta scripts/package-linux.sh sin --no-build." >&2
  exit 1
fi

dest="packaging/linux/deb-root"
rm -rf "$dest"
mkdir -p "$dest"

if command -v dpkg-deb >/dev/null 2>&1; then
  dpkg-deb -x "$deb" "$dest"
else
  # Distribuciones sin dpkg (Arch, Fedora…): un .deb no es más que un ar con
  # los tarballs control.tar.* y data.tar.*.
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/better-tracker-deb.XXXXXX")"
  trap 'rm -rf "$tmp"' EXIT
  ( cd "$tmp" && ar x "$ROOT/$deb" && tar -xf data.tar.* -C "$ROOT/$dest" )
fi

test -x "$dest/usr/bin/better-tracker"
test -f "$dest/usr/share/applications/Better Tracker.desktop"
test -f "$dest/usr/share/icons/hicolor/512x512/apps/better-tracker.png"

echo "Raíz del .deb lista en $dest"
echo "  snap:     snapcraft pack"
echo "  flatpak:  flatpak-builder --force-clean --repo=repo flatpak_app packaging/flatpak/com.bettertracker.desktop.yml"
