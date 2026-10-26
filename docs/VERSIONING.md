# Versionado único y consistente

## Fuente única

- `VERSION` (raíz): SemVer estricto `X.Y.Z`, sin prefijo `v` ni sufijos.
- `VAULT_SCHEMA_VERSION` (raíz): entero con la versión del esquema de bóveda soportada.

La app **nunca** lee `VERSION` en tiempo de ejecución. `src-tauri/build.rs` lee
`VERSION`, el commit de git y la fecha de compilación, y los incrusta en el
binario mediante variables de entorno de compilación (`APP_VERSION`,
`GIT_COMMIT`, `BUILD_DATE`, `VAULT_SCHEMA_VERSION`). El módulo Rust
`src-tauri/src/version.rs` los expone como constantes (`env!`). El frontend los
obtiene con el comando Tauri `get_app_info` y los muestra en Ajustes > Acerca de.

## `--version`

`src-tauri/src/main.rs` procesa `--version` (o `-V`) al principio de `main`,
antes de crear ventanas o red, imprime la versión incrustada y sale.

## Sincronización de archivos

`scripts/sync-version.mjs` lee `VERSION` y escribe la misma cadena en
`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y
`src-tauri/Cargo.lock`. Verifica que todos coincidan tras escribirlos y falla
si alguno difiere.

## Normalización de versiones por formato

Regla compartida (`scripts/normalize-version.mjs`): si el empaquetador añade un
sufijo de revisión (por ejemplo `-1` en `.deb` o `.rpm`) o un epoch (`1:`),
se descarta todo a partir del primer `-` y antes del último `:`. Así
`1.2.3-1` y `1:1.2.3` se normalizan a `1.2.3`.

Verificación por formato (CI):
- `.deb`: `dpkg-deb -f <archivo> Version`
- `.rpm`: `rpm -qp --queryformat '%{VERSION}' <archivo>`
- AppImage: extraer, ejecutar el binario con `--version` y comprobar el `.desktop`
- `.dmg`: montar, leer `CFBundleShortVersionString` del `Info.plist` y ejecutar
  el binario con `--version`

Un job final de consistencia compara todas las versiones leídas, los nombres de
archivo y `VERSION`.

## Manifiesto del release

`release-manifest.json` (nombre fijo) con esquema único:
`version`, `commit`, `date`, `vault_schema_version` y `assets[]`
(`file`, `platform`, `arch`, `format`, `sha256`, `size`).

Lo genera `scripts/generate-release-manifest.mjs` a partir de los archivos
realmente subidos. CI lo valida con `schemas/release-manifest.schema.json` y lo
compara con `SHA256SUMS.txt` mediante `scripts/check-sha256sums.mjs`.

La app no consulta el manifiesto (sin red).

## Comprobación futura de actualizaciones (fuera de alcance)

Si se añade, la app solo leerá ese manifiesto con esquema estricto y comparará
versiones con SemVer (nunca cadenas) contra la versión incrustada. El archivo se
elige por `(plataforma, arquitectura, formato de instalación)` según el
manifiesto. El formato de instalación se detecta por mecanismo explícito:
- AppImage: variable de entorno `APPIMAGE` (no vacía).
- Otros: variable de entorno `TAURI_INSTALL_FORMAT` con un valor de la lista
  documentada.

Si el manifiesto falta o es inválido, se muestra un error legible; no se
confunde con "no hay actualizaciones" ni se cierra la app. Antes de reutilizar
el updater de Tauri, verificar en su documentación actual qué artefacto usa en
cada plataforma.