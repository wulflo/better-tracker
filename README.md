# Better Tracker

Aplicación de entrenamiento personal de escritorio, 100% local.

## Instalación
Descarga el último release desde GitHub Releases (.deb, .rpm, .AppImage, .dmg).

## Bóveda y sincronización
Elige una carpeta como bóveda. Sincronízala con Syncthing, Google Drive, Samba o Nextcloud. No sincronices archivos temporales ni el directorio de datos privado.

## Seguridad
Sin red, sin telemetría, sin updater. CSP estricta.

## Compilación
```bash
npm install
npm run build
cargo build --manifest-path src-tauri/Cargo.toml
```