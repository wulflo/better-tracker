# Avances recientes

## Bóveda
- Todos los datos viven en `<bóveda>/omega`; los eventos siguen siendo JSONL append-only por dispositivo en `omega/devices/<id>/events.jsonl`.
- Migración automática en escritorio de `devices/` a `omega/devices/`.
- Selección de carpeta en Android mediante SAF, con permiso persistente entre reinicios.
- Eliminada por completo la sincronización LAN/P2P: no quedan módulos, comandos ni interfaz.

## Copias de seguridad
- Copia idéntica de `omega` al día en `<bóveda>/Longlife/<AAAA-MM-DD>`.
- Retención de las 7 copias más recientes.
- Marcador `.backup-complete` para detectar y reemplazar copias interrumpidas.
- Estado, copia manual y borrado de todas las copias en Ajustes; el borrado es una acción de alto riesgo con confirmación y no se recrea hasta el día siguiente.
- La app no usa `Longlife` como fuente de datos: solo enumera las copias para mostrarlas y borrarlas. Restaurar exige mover una copia a `omega`.

## Android
- Actualizaciones híbridas: `latest.json` incluye `android-aarch64` con URL, tamaño y SHA-256.
- La APK se descarga con el plugin HTTP nativo, se verifica y se guarda en `Descargas/BetterTracker` mediante MediaStore. La instalación es manual.
- Permiso de cámara con mensajes claros y detección nativa de Android mediante `plugin-os` antes de abrir el escáner.
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
