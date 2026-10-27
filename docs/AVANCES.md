# Avances recientes

## Interfaz y marca
- Logo actualizado a mancuernas moradas (`public/logo.png`, iconos Tauri y Android).
- Soporte inicial de idioma inglés (selector en Ajustes, persistencia en `localStorage`).

## Datos nutricionales
- Base de alimentos ampliada a 521 entradas (incluye base extendida proporcionada).
- Sin marcas; valores por 100 g/ml.

## Sincronización P2P
- Sincronización append-only por id (sin sobrescrituras).
- Autodescubrimiento LAN por UDP.
- Emparejamiento por QR (generación SVG + pegado de payload).
- Firma de APK Android mediante keystore en secrets (de unsigned a signed).

## Android
- Soporte activo.
- Build de APK firmado en CI cuando existen los secrets `ANDROID_KEYSTORE_*`.

## Pendiente / posible
- Reconocimiento de productos por código de barras: posible con ML Kit (Google) o ZXing, requiere permiso de cámara en Android y acceso desde WebView/Tauri.
