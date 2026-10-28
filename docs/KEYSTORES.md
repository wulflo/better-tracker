# Keystores y backups de firma

## Regla de oro

Los keystores, archivos `.gpg`, `.base64.txt`, `keystore.properties`, `key.properties`
y las contraseñas **no se guardan en el repositorio**. Ni en una carpeta ignorada,
ni "solo para la primera compilación". Si se commitean una vez, quedan en el
historial de Git para siempre. Este repositorio es público.

- Backups: `/home/alonso/Documentos/Archivos/Otros/Repos/keystores-3-apps-2026-10-27/` (fuera del repo).
- Secretos locales: `~/.config/better-tracker/secrets/` (permisos 700/600).
- CI: GitHub Secrets.

`.gitignore` es solo una red de seguridad, no el mecanismo de protección.

## Backup completo

`/home/alonso/Documentos/Archivos/Otros/Repos/keystores-3-apps-2026-10-27/better-tracker/better-tracker-keystore-2026-10-27.tar.gz.gpg`

Contiene:

- `release.keystore` (PKCS12, clave activa)
- `release-old-2026-10-27.keystore` (legado, solo histórico)
- `release.keystore.base64.txt`
- `better-tracker-updater.key` y `.pub`
- `credentials.txt`, `README.txt`, `SHA256SUMS.txt`

El backup está cifrado con GPG simétrico AES-256. La passphrase está en el
archivo `GPG-PASSPHRASE-FINAL.txt` del set, y hay una copia en
`~/.config/keystore-backups/GPG-PASSPHRASE-FINAL-2026-10-27.txt`. Guárdala en
Bitwarden; no la guardes en el repo.

Restaurar y verificar:

```bash
cd /home/alonso/Documentos/Archivos/Otros/Repos/keystores-3-apps-2026-10-27/better-tracker
./restore.sh
# o indicando archivo y destino:
./restore.sh better-tracker-keystore-2026-10-27.tar.gz.gpg /tmp/restore-bt
```

## Identidad de firma

| Dato | Valor |
|---|---|
| Package | `com.bettertracker.desktop` |
| Alias | `better-tracker` |
| Tipo | PKCS12 |
| Cert SHA-256 | `37:39:6F:10:EC:9B:18:67:8B:FA:02:6D:D6:31:EC:DC:56:D7:1A:06:BB:BF:69:63:E0:41:A7:9E:F7:80:C3:B0` |
| Cert SHA-1 | `83:E6:CC:04:D3:43:A0:C0:09:88:84:1C:B9:71:0C:D4:50:6C:70:94` |
| Validez | 2026-10-27 → 2054-03-14 |
| Updater | minisign/rsign; password en `credentials.txt` |

Desde v0.8.7 la clave activa es la nueva (`37:39:...`). La clave legado queda
solo como registro histórico y no se usa más:

- Cert SHA-256 legado (histórico): `76:FA:C8:DF:B2:64:E3:84:98:2A:5E:74:42:F3:8C:BF:78:05:CE:A2:FF:4E:6C:87:55:2B:49:A5:C8:6F:CD:5B`

## GitHub Secrets

| Secreto | Uso |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | keystore en base64 |
| `ANDROID_KEYSTORE_PASSWORD` | store password |
| `ANDROID_KEY_ALIAS` | alias (`better-tracker`) |
| `ANDROID_KEY_PASSWORD` | key password |
| `TAURI_SIGNING_PRIVATE_KEY` | clave privada del updater |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | password del updater |

## Verificación local

```bash
export KEYSTORE_PATH="$HOME/.config/better-tracker/secrets/release.keystore"
read -rsp 'Store password: ' KEYSTORE_PASSWORD; echo; export KEYSTORE_PASSWORD
export KEY_ALIAS=better-tracker
read -rsp 'Key password: ' KEY_PASSWORD; echo; export KEY_PASSWORD
scripts/verify-signing.sh
```

Debe imprimir `OK` y el fingerprint `37:39:...`.

La contraseña de la clave legado no está registrada en archivos locales. El
backup incluye el keystore legado solo como histórico, y no se puede verificar
sin esa contraseña. Si aparece, se puede comprobar con el mismo script:

```bash
EXPECTED_SHA256='76:FA:C8:DF:B2:64:E3:84:98:2A:5E:74:42:F3:8C:BF:78:05:CE:A2:FF:4E:6C:87:55:2B:49:A5:C8:6F:CD:5B' \
KEYSTORE_PATH="$HOME/.config/better-tracker/secrets/release-old-2026-10-27.keystore" \
KEYSTORE_PASSWORD='...' KEY_ALIAS='...' KEY_PASSWORD='...' \
scripts/verify-signing.sh
```

## Firma local

El keystore está fuera del repo, en
`~/.config/better-tracker/secrets/release.keystore`. Las variables están en
`~/.config/better-tracker/secrets/signing.env` (600).

```bash
scripts/sign-local.sh
# o indicando el APK:
scripts/sign-local.sh /ruta/app-universal-release.apk
```

El script firma con `apksigner` y verifica el certificado `37:39:...`. No guarda
secretos en el repo. Para verificar solo el keystore:

```bash
set -a; source ~/.config/better-tracker/secrets/signing.env; set +a
scripts/verify-signing.sh
```

`build.gradle.kts` también puede leer `ANDROID_KEYSTORE_PATH`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`, pero
no hace falta copiar el keystore al repositorio.

## Referencias

- `docs/RELEASE_SECRETS.md`
- `scripts/verify-signing.sh`
