# Versionado, releases y actualizaciones

## Fuente única

- `VERSION` (raíz): SemVer estricto `X.Y.Z`, sin prefijo `v` ni sufijos.
- `VAULT_SCHEMA_VERSION` (raíz): entero con la versión del esquema de bóveda soportada.
- El tag del release es `v` + el contenido exacto de `VERSION`. El workflow **no** calcula el patch con el número de commits.

La app no lee `VERSION` en runtime. `src-tauri/build.rs` incrusta `APP_VERSION`, `GIT_COMMIT`, `BUILD_DATE` y `VAULT_SCHEMA_VERSION`; el comando `get_app_info` los expone al frontend.

## Sincronización

```bash
# 1. Edita VERSION
# 2. Sincroniza todos los archivos
node scripts/sync-version.mjs
# 3. Comprueba que no queden diferencias
git diff -- package.json package-lock.json src-tauri/tauri.conf.json \
  src-tauri/Cargo.toml src-tauri/Cargo.lock
```

`scripts/sync-version.mjs` escribe la misma cadena en `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` y verifica el resultado. CI ejecuta el script y falla si `git diff` detecta cambios, para que el release no se cree con versiones mezcladas.

## Proceso de release

1. Actualiza `VERSION` y ejecuta `node scripts/sync-version.mjs`.
2. Añade notas en `docs/releases/vX.Y.Z.md` (opcional; si no existe se usa un texto mínimo).
3. Haz commit y push a `main`.
4. El workflow `.github/workflows/release.yml`:
   - ejecuta CI;
   - crea un release draft con el tag exacto;
   - compila Linux, Windows y macOS;
   - firma los artefactos del updater con la clave de GitHub Secrets;
   - verifica los instaladores y las firmas;
   - sube los assets;
   - genera `latest.json`, `release-manifest.json` y `SHA256SUMS.txt`;
   - publica el release.

Los cambios que solo tocan `*.md` o `docs/**` no disparan el workflow por `paths-ignore`. Si quieres republicar sin cambiar código, usa `workflow_dispatch`.

## Artefactos por plataforma

| Plataforma | Instalador manual | Artefacto del updater | Clave en `latest.json` |
| --- | --- | --- | --- |
| Linux x86_64 | `.AppImage`, `.deb`, `.rpm` | El propio `.AppImage` + `.AppImage.sig` | `linux-x86_64` |
| Windows x64 | NSIS `.exe`, `.msi` | El `.exe` de NSIS + `.exe.sig` (preferido; MSI como alternativa) | `windows-x86_64` |
| macOS universal | `.dmg` | `.app.tar.gz` + `.app.tar.gz.sig` | `darwin-x86_64` y `darwin-aarch64` |

Tauri verifica la firma minisign del artefacto del updater antes de instalar. El `.dmg`, `.deb` y `.rpm` no son artefactos de actualización automática; se descargan manualmente.

## `latest.json`

Es el manifiesto que lee el plugin updater. Se genera con `scripts/generate-updater-manifest.mjs` a partir de los `.sig` reales subidos:

```json
{
  "version": "0.8.1",
  "notes": "Notas del release",
  "pub_date": "2026-10-26T00:00:00.000Z",
  "platforms": {
    "linux-x86_64": { "signature": "...", "url": "https://github.com/.../download/v0.8.1/..." }
  }
}
```

El endpoint configurado es:

```text
https://github.com/wulflo/better-tracker/releases/latest/download/latest.json
```

El workflow exige las cuatro claves (`linux-x86_64`, `windows-x86_64`, `darwin-x86_64`, `darwin-aarch64`) antes de publicar. Si falta un build o una firma, el release queda en draft.

## `release-manifest.json` y `SHA256SUMS.txt`

Además del manifiesto del updater, el release incluye el catálogo interno de artefactos (`release-manifest.json`) y hashes SHA-256 de todos los assets. `scripts/validate-manifest.mjs` valida el esquema y `scripts/check-sha256sums.mjs` comprueba que los hashes coinciden. Esto sirve para auditoría y descargas manuales; no lo consume el updater.

## Firma de código del sistema operativo

- **Windows**: si existe `WINDOWS_CERTIFICATE`, el workflow importa el PFX y añade `certificateThumbprint`, `digestAlgorithm` y `timestampUrl` a la configuración de Windows. Si no existe, el instalador se publica sin Authenticode.
- **macOS**: si existe `APPLE_CERTIFICATE`, se importa en un keychain temporal y se configura `APPLE_SIGNING_IDENTITY`. Si además están `APPLE_ID`, `APPLE_PASSWORD` y `APPLE_TEAM_ID`, Tauri notariza. Si no, se publica sin firma/notarización.
- El updater siempre va firmado con la clave minisign, independientemente de la firma del sistema operativo.

Ver `docs/RELEASE_SECRETS.md` para la lista de secretos.

## Normalización de versiones por formato

`scripts/normalize-version.mjs` descarta revisiones de empaquetador (`-1`) y epochs (`1:`); `1.2.3-1` y `1:1.2.3` se normalizan a `1.2.3`.

Verificación en el workflow:
- `.deb`: `dpkg-deb -I`.
- `.rpm`: `rpm -qpi`.
- AppImage: extracción y comprobación del `.desktop`.
- `.dmg`/`.app`: `CFBundleShortVersionString` y, si hay certificado, `codesign`/`spctl`.
- Windows: presencia de NSIS, MSI y sus firmas del updater; Authenticode si hay certificado.
- Updater: `.sig` con cabecera minisign válida y manifiesto con todas las plataformas.

## Actualización en la app

- Se comprueba solo al pulsar **Buscar actualizaciones** en Ajustes.
- Si no hay versión nueva, se muestra “Ya tienes la última versión”.
- Si hay una, se muestra la versión y las notas; el usuario decide instalar.
- En Linux el botón se desactiva para `.deb`, `.rpm`, binarios portables y formatos desconocidos. Solo AppImage puede autoactualizarse.
- Tras instalar, la app se reinicia. En Windows el instalador NSIS se encarga del cierre.
