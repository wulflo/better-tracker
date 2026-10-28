# Avances recientes

## Bóveda
- Todos los datos viven en `<bóveda>/omega`; cada evento nuevo se guarda como archivo propio en `omega/devices/<id>/events/<event-id>.json`.
- Los `events.jsonl` antiguos se siguen leyendo; todos los eventos se deduplican por `id`.
- Migración automática en escritorio de `devices/` a `omega/devices/`.
- Selección de carpeta en Android mediante SAF, con permiso persistente entre reinicios.
- Aviso si el número de eventos baja respecto al último visto para esa bóveda (posible reversión de FolderSync).
- Eliminada por completo la sincronización LAN/P2P: no quedan módulos, comandos ni interfaz.

## Copias de seguridad
- Copia de `omega` al día y por dispositivo en `<bóveda>/Longlife/<dispositivo>/<AAAA-MM-DD>`.
- `snapshot.json` con dispositivo, plataforma, fecha y versión; así el PC identifica las copias creadas en Android.
- Las copias antiguas en `Longlife/<AAAA-MM-DD>` se siguen listando como legado.
- Retención de las 7 copias más recientes **por dispositivo**.
- Marcador `.backup-complete` para detectar y reemplazar copias interrumpidas.
- Estado, copia manual, listado con fecha/dispositivo/tamaño y **Restaurar** en Ajustes.
- Restauración no destructiva: importa solo los eventos que faltan en `omega/devices/restored-<copia>-<marca>/`; nunca sobrescribe ni borra eventos.
- El borrado de todas las copias es una acción de alto riesgo con confirmación y no se recrea hasta el día siguiente.

## Android
- Actualizaciones híbridas: `latest.json` incluye `android-aarch64` con URL, tamaño y SHA-256.
- La APK se descarga con el plugin HTTP nativo, se verifica y se guarda en `Descargas/BetterTracker` mediante MediaStore. La instalación es manual.
- Iconos: master único en `src-tauri/icons/app-icon.png`; `npm run icons` regenera escritorio y mipmaps (legacy + adaptativos) y los copia al proyecto `gen/`. Antes solo se hacía en CI, así que los builds locales mostraban el icono genérico de Tauri.
- Escáner: el frontend comprueba y solicita el permiso `CAMERA`, muestra el error real (sin `[object Object]`) y ofrece **Abrir ajustes** si está denegado.
- `scripts/patch-android-manifest.mjs` añade `CAMERA` y `uses-feature` de forma idempotente al manifiesto generado; CI lo ejecuta tras `tauri android init`.
- Formatos nativos sin `QRCode` explícito para evitar el formato inválido `0` de `mapFormats`; el plugin añade QR internamente.
- Búsqueda de producto por variantes UPC/EAN/GTIN (exacto, sin ceros, 12/13/14 dígitos) en Rust y en navegador; el producto guarda el código escaneado original.
- `tauri-plugin-android-fs` 30.2.0 con `compileSdk = 36`: la APK vuelve a compilar en CI sin parches manuales del registro de Cargo. Las rutas SAF guardadas por 2.x se siguen leyendo.

## Interfaz y marca
- Logo actualizado a mancuernas moradas (`public/logo.png`, iconos Tauri y Android).
- Soporte de idioma inglés (selector en Ajustes, persistencia en `localStorage`).

## Datos nutricionales
- Base de alimentos ampliada a 521 entradas.
- Sin marcas; valores por 100 g/ml.

## Pendiente / posible
- Las copias Longlife no están cifradas.
- En SAF, borrar copias deja carpetas vacías porque el plugin no expone borrado de directorios.
