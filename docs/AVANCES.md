# Avances recientes

## Cierres de la app en Android (causa raíz)
- **Diagnóstico**: reqwest 0.13 con la feature `rustls` activa `rustls-platform-verifier`, que exige inicialización JNI (`android::init_with_env`) que Tauri no hace. Al construir el cliente HTTPS entra en panic y, con `panic = "abort"` del perfil release, la app muere al instante. Eso causaba los cierres al **comprobar actualizaciones** (`fetch_update_manifest`) y al **escanear** (buscar el producto en Open Food Facts usa la misma pila). Escritorio no se ve afectado porque ahí el verificador sí se inicializa.
- **Fix**: el backend pasa a `reqwest 0.12` con `rustls-tls-webpki-roots` (raíces de Mozilla, igual que `tauri-plugin-http`, que funciona en Android sin ese verificador).

## Bóveda
- Todos los datos viven en `<bóveda>/omega`; cada evento nuevo se guarda como archivo propio en `omega/devices/<id>/events/<event-id>.json`.
- Los `events.jsonl` antiguos se siguen leyendo; todos los eventos se deduplican por `id`.
- Migración automática en escritorio de `devices/` a `omega/devices/`.
- Selección de carpeta en Android mediante SAF, con permiso persistente entre reinicios.
- Aviso si el número de eventos baja respecto al último visto para esa bóveda (posible reversión de FolderSync).
- Eliminada por completo la sincronización LAN/P2P: no quedan módulos, comandos ni interfaz.

## Copias de seguridad
- La carpeta pasa a llamarse `longlife` (minúsculas) para no crear dos copias al sincronizar bóvedas entre sistemas con distinción de mayúsculas. En escritorio `Longlife` se renombra automáticamente al abrir la bóveda; en SAF se siguen leyendo ambas y las copias nuevas se crean en `longlife/`.
- Copia de `omega` al día y por dispositivo en `<bóveda>/longlife/<dispositivo>/<AAAA-MM-DD>`.
- `snapshot.json` con dispositivo, plataforma, fecha y versión; así el PC identifica las copias creadas en Android.
- Las copias antiguas en `longlife/<AAAA-MM-DD>` se siguen listando como legado.
- Retención de las 7 copias más recientes **por dispositivo**.
- Marcador `.backup-complete` para detectar y reemplazar copias interrumpidas.
- Estado, copia manual, listado con fecha/dispositivo/tamaño y **Restaurar** en Ajustes.
- Restauración no destructiva: importa solo los eventos que faltan en `omega/devices/restored-<copia>-<marca>/`; nunca sobrescribe ni borra eventos.
- Manifiesto de integridad en `snapshot.json` (archivos y bytes): una copia sincronizada a medias se marca como **dañada**, y la copia del día se rehace sola si no cuadra.
- El borrado de todas las copias es una acción de alto riesgo con confirmación y no se recrea hasta el día siguiente.

## Android
- **Compatibilidad cerrada a Android 13 o superior** (minSdk 33 vía `bundle.android.minSdkVersion` en `tauri.conf.json`). Se elimina la feature `legacy-storage-permission` de `tauri-plugin-android-fs` y el parche que añadía `WRITE/READ_EXTERNAL_STORAGE` con `maxSdkVersion="28"`: MediaStore en Descargas no pide permisos desde Android 10.
- Actualizaciones híbridas: `latest.json` incluye `android-aarch64` con URL, tamaño y SHA-256.
- La APK se descarga con el plugin HTTP nativo, se verifica y se guarda en `Descargas/BetterTracker` mediante MediaStore. La instalación es manual.
- Iconos: master único en `src-tauri/icons/app-icon.png`; `npm run icons` regenera escritorio y mipmaps (legacy + adaptativos) y los copia al proyecto `gen/`. Antes solo se hacía en CI, así que los builds locales mostraban el icono genérico de Tauri.
- Escáner: el frontend comprueba y solicita el permiso `CAMERA`, muestra el error real (sin `[object Object]`) y ofrece **Abrir ajustes** si está denegado.
- `scripts/patch-android-manifest.mjs` añade `CAMERA` y `uses-feature` de forma idempotente al manifiesto generado; CI lo ejecuta tras `tauri android init`.
- Formatos nativos sin `QRCode` explícito para evitar el formato inválido `0` de `mapFormats`; el plugin añade QR internamente.
- Escáner arreglado: el plugin 2.5.3 se quedaba con la WebView del splash (cerrada al arrancar) y `webView.parent as ViewGroup` lanzaba `attempt to invoke virtual method 'java.lang.Class java.lang.Object.getClass()' on a null object reference`; además dejaba la capa de cámara montada al fallar. Ahora vive en `src-tauri/plugins/barcode-scanner` con la WebView visible, vibrador opcional, limpieza al fallar y ML Kit empaquetado (funciona sin Google Play Services). Ver `UPSTREAM.md`.
- Búsqueda de producto por variantes UPC/EAN/GTIN (exacto, sin ceros, 12/13/14 dígitos) en Rust y en navegador; el producto guarda el código escaneado original.
- `tauri-plugin-android-fs` 30.2.0 con `compileSdk = 36`: la APK vuelve a compilar en CI sin parches manuales del registro de Cargo. Las rutas SAF guardadas por 2.x se siguen leyendo.

## Interfaz y marca
- Logo actualizado a mancuernas moradas (`public/logo.png`, iconos Tauri y Android).
- Soporte de idioma inglés (selector en Ajustes, persistencia en `localStorage`).

## Datos nutricionales
- Base de alimentos ampliada a 521 entradas.
- Sin marcas; valores por 100 g/ml.

## Pendiente / posible
- Las copias longlife no están cifradas.
- En SAF, borrar copias deja carpetas vacías porque el plugin no expone borrado de directorios.
