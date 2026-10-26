# Decisiones técnicas

## Nombre de la app
Better Tracker. Definido en `tauri.conf.json` (productName) y usado en nombres de archivo.

## Plataformas
Solo Linux x86_64 (.deb, .rpm, .AppImage) y macOS (.dmg universal arm64+x86_64). Sin Windows/Android/iOS.

## Stack
Tauri 2 + React + TypeScript + Vite. Toda la lógica de archivos en Rust. Frontend solo llama comandos tipados.

## Almacenamiento
Bóveda en carpeta elegida por el usuario. Eventos append-only JSONL por dispositivo (`devices/<id>/events.jsonl`). Fusión determinista por timestamp. Lápidas para borrados.

## Icono placeholder
Se usa un icono temporal (los del repo). El usuario debe reemplazarlos manualmente. Anotado aquí.

## Entrada de datos
Bloqueo global de pegado/arrastrar. Controles numéricos con min/max. Tabla de límites compartida pendiente de generar para Rust.

## Cifrado
Diseñado el envelope con versión y campo de cifrado. Implementación (Argon2id + XChaCha20-Poly1305) pendiente. Documentado como vía futura.

## Otras plataformas
La capa de almacenamiento está detrás de un trait para añadir backends futuros.

## Limitaciones
- Sin cifrado activo todavía.
- Sin fotos de progreso.
- Sin mesociclos ni recordatorios.
- Tests visuales y de sincronización pendientes.