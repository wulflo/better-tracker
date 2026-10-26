# Secretos de compilación y firma

Nunca subas claves privadas, certificados `.p12`/`.pfx` ni contraseñas al repositorio. `.gitignore` bloquea `*.key`, `*.pem` y los archivos habituales de entorno, pero la comprobación importante es no hacer `git add` de esos archivos.

## Updater (obligatorio)

El release necesita estas dos GitHub Actions Secrets:

| Secreto | Contenido |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Contenido completo de la clave privada minisign (texto). |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Contraseña de esa clave. |

La clave pública correspondiente está en `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`. No es secreta.

Generar un par nuevo (solo si se rota la clave):

```bash
npx tauri signer generate -w ~/.config/better-tracker/better-tracker-updater.key
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.config/better-tracker/better-tracker-updater.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

Después hay que copiar la clave pública nueva a `tauri.conf.json` y publicar una versión. Los clientes antiguos siguen confiando en la clave pública antigua: para rotar sin romper actualizaciones hay que firmar primero una versión intermedia con la clave antigua que incluya la nueva clave pública.

La copia local de la clave debe tener permisos `0600` y quedar fuera del repositorio. Si se pierde la clave o la contraseña, los clientes existentes no podrán verificar nuevas actualizaciones.

## Firma de código de Windows (opcional)

| Secreto | Contenido |
| --- | --- |
| `WINDOWS_CERTIFICATE` | PFX en base64 (una sola línea). |
| `WINDOWS_CERTIFICATE_PASSWORD` | Contraseña del PFX. |

El workflow importa el certificado en el almacén `CurrentUser\My`, obtiene el thumbprint y configura Tauri para firmar con `signtool`. Si el secreto no existe, el build sigue y se publica sin Authenticode.

Para exportar el PFX:

```powershell
certutil -encode certificate.pfx certificate-base64.txt
```

El contenido útil es el bloque entre las líneas `-----BEGIN CERTIFICATE-----` y `-----END CERTIFICATE-----`, sin saltos de línea. También puedes usar el PFX directamente en base64 con `[Convert]::ToBase64String([IO.File]::ReadAllBytes('certificate.pfx'))`.

Variable opcional del repositorio: `WINDOWS_TIMESTAMP_URL` (por defecto `http://timestamp.digicert.com`).

## Comprobar secretos

```bash
gh secret list
gh variable list
```

No es posible leer el valor de un secreto desde `gh`; solo se lista su nombre y fecha. Para rotar, genera el valor de nuevo y vuelve a ejecutar `gh secret set`.

## Qué firma cada cosa

- **Firma del updater (minisign)**: obligatoria para que la app acepte la actualización. La verifica el plugin Tauri antes de instalar.
- **Authenticode (Windows)**: reduce avisos de SmartScreen y permite verificar el editor. No sustituye la firma del updater.
- **SHA-256**: integridad de las descargas manuales, no autenticidad criptográfica por sí solo.
