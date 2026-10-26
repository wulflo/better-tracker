# Decisiones técnicas

## Nombre e identidad
Better Tracker. El nombre se define en `tauri.conf.json` (`productName`) y se usa en los nombres de archivo. El logo original se guarda como fuente en `src-tauri/icons/icon-source.png`; `tauri icon` genera `.ico`, `.icns` y los PNG. La misma imagen se usa en la interfaz (`public/logo.png`) y en el splash.

## Plataformas
Desktop, sin móvil:
- Linux x86_64: `.deb`, `.rpm`, `.AppImage`. Wayland mediante GTK/WebKit de Tauri 2.
- Windows 10/11 x64: NSIS (instalación `currentUser`) y MSI.
- macOS 11+: `.dmg` y `.app` universal (Intel + Apple Silicon).

Cada plataforma tiene su archivo de configuración (`tauri.linux.conf.json`, `tauri.windows.conf.json`, `tauri.macos.conf.json`) para que los targets y el instalador no interfieran entre sí.

## Stack
Tauri 2 + React 18 + TypeScript + Vite. La lógica de archivos y comandos vive en Rust; el frontend usa IPC tipado y un mock de navegador solo para pruebas visuales.

## Almacenamiento
Bóveda en una carpeta elegida por el usuario. Eventos append-only en JSONL por dispositivo (`devices/<id>/events.jsonl`). La reducción es determinista por timestamp; los borrados usan eventos de “limpieza” o lápidas. Sin cifrado activo, sin fotos y sin adjuntos.

## Entrada de datos
El pegado y el arrastre se interceptan globalmente. Solo se acepta `text/plain`; en campos de una línea se eliminan los saltos de línea. No se aceptan archivos, HTML enriquecido ni imágenes.

## Actualizaciones
- Plugin oficial `tauri-plugin-updater` + `tauri-plugin-process`.
- Comprobación **manual** desde Ajustes. No hay chequeo automático en segundo plano.
- Manifiesto estático `latest.json` en el release de GitHub, con una entrada por plataforma/arquitectura:
  - `linux-x86_64` → AppImage + `.AppImage.sig`.
  - `windows-x86_64` → instalador NSIS `.exe` + `.exe.sig` (MSI como alternativa).
  - `darwin-x86_64` y `darwin-aarch64` → `.app.tar.gz` universal + firma.
- El plugin verifica la firma minisign antes de instalar. Si el manifiesto o la firma no son válidos, se muestra un error y no se instala nada.
- Linux solo puede actualizarse solo con AppImage; `.deb` y `.rpm` se actualizan manualmente desde el release. La interfaz detecta el formato y desactiva el botón cuando no corresponde.
- Windows prefiere NSIS sobre MSI para evitar permisos de administrador.
- La comprobación de red solo ocurre al pulsar “Buscar actualizaciones”.

## Claves y secretos
- La clave privada del updater nunca se versiona. Vive en GitHub Actions Secrets (`TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) y en una copia local con permisos `0600` fuera del repositorio.
- La clave pública está en `tauri.conf.json` (`plugins.updater.pubkey`).
- Los certificados opcionales de Windows y macOS se cargan desde secrets y se importan en el runner. Si no existen, el build sale sin firma de sistema; el updater sigue firmado.
- `.key`, `.pem` y `.p12` están ignorados por git. Ver `docs/RELEASE_SECRETS.md`.

## Versión y release
`VERSION` es la fuente única y el tag es exactamente `v<VERSION>`. El workflow ya no calcula el patch con el número de commits. `scripts/sync-version.mjs` sincroniza `package.json`, `package-lock.json`, `tauri.conf.json`, `Cargo.toml` y `Cargo.lock`, y CI falla si hay desincronización.

El workflow compila las tres plataformas, sube los instaladores y los artefactos del updater, genera `latest.json`, `release-manifest.json` y `SHA256SUMS.txt`, y publica el release solo cuando todos los builds y las verificaciones terminan bien.

## UI
Cuatro secciones: Panel, Entrenamiento, Historial y Figura corporal. Entrenamiento incluye biblioteca, rutinas, plan, sesión, calendario y progreso. Los mesociclos y recordatorios están integrados en el plan y el panel. El logo se muestra tal cual, sin contenedor circular ni recorte adicional; su propia forma redondeada define el borde.

## Progreso de grasa
La serie se calcula con las medidas guardadas. `bodyProgressSeries` deduplica por fecha y usa `bodyComposition` para obtener % grasa, masa grasa, masa magra y cintura. El % de grasa puede estimarse sin báscula mediante RFM/Navy; la masa grasa en kg solo aparece si hay peso. El gráfico no usa base cero para que los cambios pequeños sean visibles, y es orientativo.

## Ingesta, comidas y alimentos
- La base de alimentos es local y estática (`src/foodDb.ts`), con más de 200 alimentos comunes y valores aproximados por 100 g/ml. Los alimentos personalizados se guardan como eventos `food.saved` en la bóveda y se reducen al último evento por id.
- Las comidas del día son un borrador efímero en `localStorage` (`bt.meal.draft.v1`), con fecha. Si la fecha no coincide con hoy, se elimina al cargar; un intervalo de 30 s también lo limpia al cruzar medianoche. No forman parte de la bóveda.
- El log de ingesta sí es un evento append-only `nutrition.logged`. Solo hay un log lógico por fecha: al guardar de nuevo se añade un evento nuevo y la reducción determinista por fecha + timestamp hace que gane el último. No se muta ni se borra el evento anterior.
- Las medidas se convierten a gramos con `units` por alimento; `g` y `ml` son equivalentes aproximados y el resto usa pesos por unidad, taza, cucharada, porción, etc.
- Los valores son estimaciones orientativas y no sustituyen etiquetas o consejo profesional.

## Limitaciones
- Sin cifrado de bóveda.
- Sin fotos de progreso.
- Recordatorios solo mientras la app está abierta; no se programan en el sistema operativo.
- Los builds de Windows/macOS no se prueban localmente en este equipo Linux.
- Las estimaciones y la base de alimentos son orientativas y no sustituyen valoración médica.
