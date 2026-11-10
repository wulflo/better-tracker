# Microsoft Store (MSIX)

La Microsoft Store firma los paquetes MSIX después de la certificación, así que
este canal no necesita certificado de CA ni la clave del updater. La app se
instala en `WindowsApps` (solo lectura) y las actualizaciones las gestiona la
Store; por eso la build de tienda **no compila** `tauri-plugin-updater`.

## Flujo

- Workflow: `.github/workflows/store-msix.yml` (solo `workflow_dispatch`).
- Genera un `.msix` sin firmar como artifact de Actions; no toca GitHub
  Releases, no genera `latest.json` y no publica en la Store.
- Compila con `npm run build:store`, que usa
  `--no-default-features --features microsoft-store` y
  `src-tauri/tauri.store.conf.json`.
- El panel de actualizaciones detecta el formato `msix` y oculta el botón de
  buscar actualizaciones; solo explica que se actualiza desde la Store.

El paquete se sube a mano a Partner Center. Microsoft lo firma tras la
certificación.

## Identidad de Partner Center

Antes de enviar el paquete, crea la app en Partner Center y copia los valores
de **Product management → Product identity**:

- `Package/Identity/Name` (no es el nombre comercial y no puede tener espacios).
- `Package/Identity/Publisher`.
- `Package/Properties/PublisherDisplayName`.
- `Package/Properties/DisplayName`: tiene que ser un nombre reservado en
  Partner Center. En esta cuenta el valor es **Better Fitness Tracker**.

La identidad actual de la app es:

| Campo | Valor |
| --- | --- |
| Package/Identity/Name | `wulflo.BetterFitnessTracker` |
| Package family name | `wulflo.BetterFitnessTracker_m5406cz1kxxs8` |
| Display name | `Better Fitness Tracker` |

El workflow usa estos valores por defecto:

| Campo | Valor por defecto |
| --- | --- |
| `MS_STORE_PACKAGE_NAME` | `wulflo.BetterFitnessTracker` |
| `MS_STORE_PUBLISHER` | `CN=7F51EF66-8407-4798-A8F4-3C4A407DA359` |
| `MS_STORE_DISPLAY_NAME` | `Better Fitness Tracker` |
| `MS_STORE_PUBLISHER_DISPLAY_NAME` | `wulflo` |

Si la Store asigna otro nombre de paquete o el publisher cambia, define las
variables de repositorio en **Settings → Secrets and variables → Actions →
Variables**:

- `MS_STORE_PACKAGE_NAME`
- `MS_STORE_PUBLISHER`
- `MS_STORE_DISPLAY_NAME` (opcional)
- `MS_STORE_PUBLISHER_DISPLAY_NAME` (opcional)

El workflow falla si el nombre está vacío o contiene espacios.

## Generar el MSIX

1. Ejecuta **Actions → Microsoft Store (MSIX) → Run workflow** sobre `main`.
2. Descarga el artifact `store-msix`.
3. En Partner Center, crea un envío nuevo y sube el `.msix`.
4. Usa `PRIVACY_POLICY.md` como política de privacidad pública:
   `https://github.com/wulflo/better-tracker/blob/main/PRIVACY_POLICY.md`.
5. Completa la ficha de la Store (capturas, categoría, idiomas) y envía a
   certificación.

## Manifiesto y versión

El manifiesto se genera desde
`packaging/windows-store/AppxManifest.template.xml` con
`node scripts/prepare-store-msix.mjs`. La versión de `package.json` se
convierte a cuatro componentes (`0.9.17` → `0.9.17.0`); cada envío a la Store
debe subir ese número. Sincroniza la versión con `node scripts/sync-version.mjs`
antes de compilar.

El manifiesto declara dos idiomas (`en-US` y `es-ES`), `runFullTrust` y los
iconos de `src-tauri/icons`:

- `StoreLogo.png`
- `Square44x44Logo.png`
- `Square150x150Logo.png`
- `Square310x310Logo.png`

Si faltan, ejecuta `npm run icons` y commitea el resultado.

## Capacidad restringida `runFullTrust`

Partner Center muestra este aviso al validar el paquete:

> Package acceptance validation warning: The following restricted capabilities
> require approval before you can use them in your app: runFullTrust.

Es normal en apps de escritorio Win32 empaquetadas como MSIX (Tauri usa
WebView2 y necesita acceso a la bóveda que el usuario elige fuera del
contenedor). No hay que añadir nada al manifiesto: `runFullTrust` ya está
declarado. En la sección de capacidades restringidas del envío hay que pegar
una justificación de 50 palabras. Texto listo para usar en inglés:

```text
Better Fitness Tracker is a Win32 desktop app packaged as MSIX. runFullTrust is
required to run its WebView2 interface and read/write the local vault folder the
user selects outside the package container. It does not elevate, install
services, modify system settings, run in background, or collect telemetry. Data
stays local.
```

En español:

```text
Better Fitness Tracker es una app Win32 empaquetada como MSIX. runFullTrust es
necesaria para ejecutar su interfaz WebView2 y leer/escribir la carpeta de
bóveda que el usuario elige fuera del contenedor. No eleva privilegios, instala
servicios, modifica ajustes ni se ejecuta en segundo plano. No recopila
telemetría. Todo es local.
```

Microsoft revisa la justificación y suele aprobar `runFullTrust` para apps de
escritorio. El aviso no impide subir el paquete; se resuelve con la aprobación
de la capacidad durante la certificación.

## Notas de instalación

- WebView2 tiene que estar instalado (Windows 10/11 lo trae con Edge). Si
  falta, la app no arranca dentro del MSIX.
- Con `runFullTrust`, la bóveda elegida en Documentos sigue siendo accesible.
- Los datos que la app escriba en `%APPDATA%` pueden quedar virtualizados en
  `%LOCALAPPDATA%\Packages\<PackageFamilyName>\LocalCache\Roaming\`. La bóveda
  real vive en la carpeta que el usuario elige.
- Para probar el paquete en Windows sin publicarlo, se puede firmar con un
  certificado autofirmado e instalar con `Add-AppxPackage`. Ese certificado
  **no** se sube a Partner Center.
