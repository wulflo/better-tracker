# Decisiones técnicas

## Nombre e identidad
Better Tracker. El nombre se define en `tauri.conf.json` (`productName`) y se usa en los nombres de archivo. El logo se guarda como master en `src-tauri/icons/app-icon.png` con el manifiesto `app-icon.json`; `npm run icons` regenera desde ahí los iconos de escritorio (`.ico`, `.icns`, PNG y Store) y los mipmaps de Android (legacy y adaptativos), incluidos los del proyecto generado en `src-tauri/gen/`. La marca sin fondo de la interfaz vive en `public/logo.png` y en el splash.

## Plataformas
Escritorio y Android:
- Linux x86_64: `.deb`, `.rpm`, `.AppImage`. Wayland mediante GTK/WebKit de Tauri 2.
- Windows 10/11 x64: NSIS (instalación `currentUser`) y MSI.
- Android arm64: APK firmada; la bóveda se elige con SAF. **minSdk 33** (`bundle.android.minSdkVersion` en `tauri.conf.json`): la app solo admite Android 13 o superior, lo que elimina las ramas y permisos para Android 9/10 (`WRITE/READ_EXTERNAL_STORAGE`, `legacy-storage-permission`).

Cada plataforma de escritorio tiene su archivo de configuración (`tauri.linux.conf.json`, `tauri.windows.conf.json`) para que los targets y el instalador no interfieran entre sí.

## Stack
Tauri 2 + React 18 + TypeScript + Vite. La lógica de archivos y comandos vive en Rust; el frontend usa IPC tipado y un mock de navegador solo para pruebas visuales.

### HTTP y TLS (Rust)
- El backend usa `reqwest 0.12` con `rustls-tls-webpki-roots` (raíces de Mozilla, como `tauri-plugin-http`). No se usa la feature `rustls` de reqwest 0.13: activa `rustls-platform-verifier`, que en Android requiere inicialización JNI manual que Tauri no hace; al construir el cliente entra en panic y, con `panic = "abort"` del perfil release, **cierra la app**. Ese era el motivo de los cierres al escanear (la búsqueda en Open Food Facts usa la misma pila) y al comprobar actualizaciones.
- Consecuencia: si algún módulo necesita HTTPS en Android, debe pasar por reqwest 0.12 con webpki-roots (o por `tauri-plugin-http`), nunca por reqwest 0.13 + `rustls`.

## Almacenamiento
Bóveda en una carpeta elegida por el usuario. Todos los datos de la app viven en `<bóveda>/omega`; los eventos son append-only. Cada evento nuevo se escribe como archivo propio (`omega/devices/<id>/events/<event-id>.json`) con temporal + rename en escritorio y `create_new_file` en SAF. Los `events.jsonl` antiguos se siguen leyendo para no romper bóvedas existentes y todos los eventos se deduplican por `id` al leer. La reducción es determinista por timestamp; los borrados usan eventos de “limpieza” o lápidas. Sin cifrado activo, sin fotos y sin adjuntos.

Escribir un archivo por evento evita que dos dispositivos (o FolderSync) reescriban el mismo JSONL y se pisen datos: un evento creado en Android nunca puede ser borrado por una versión antigua del archivo que tenga el PC.

En Android la carpeta se elige con el selector SAF (`tauri-plugin-android-fs`), se concede permiso persistente de lectura/escritura y se guarda la ruta serializada en la configuración de la app. La app no usa `longlife` como fuente de datos: solo lo enumera para mostrar el estado, restaurar o borrar copias.

### Copias longlife
- La carpeta se llama `longlife` (minúsculas) para que las bóvedas sincronizadas entre sistemas que distinguen mayúsculas (Linux, Android/SAF) no terminen con dos carpetas distintas (`Longlife` y `longlife`).
- En escritorio, `<bóveda>/Longlife` se renombra a `longlife` la primera vez que se abre la bóveda (`fs::rename`, sin mover archivos). Si ambas existen a la vez, ambas se listan y se deduplican por `device/fecha`; la heredada se lee como legado y ninguna copia deja de verse.
- En SAF (Android) no existe renombrado por API: las copias nuevas se crean siempre en `longlife/` y la carpeta `Longlife` se sigue **leyendo y restaurando** como legado (también se borra desde «Borrar todas las copias»). El usuario puede moverla a mano con el explorador cuando quiera.
- Una copia de `omega` por día y dispositivo en `<bóveda>/longlife/<dispositivo>/<AAAA-MM-DD>`. Cada dispositivo escribe solo en su carpeta, así que dos móviles/PC nunca compiten por la misma copia diaria.
- Las copias antiguas en `<bóveda>/longlife/<AAAA-MM-DD>` se listan como legado y también se pueden restaurar.
- Se conservan las 7 copias más recientes **de cada dispositivo**; las de otros dispositivos no se tocan.
- `snapshot.json` dentro de cada copia guarda `device_id`, etiqueta, plataforma, fecha y versión de la app. Así el PC puede mostrar correctamente una copia creada en Android.
- Un marcador `.backup-complete` dentro de la carpeta del día distingue una copia completa de una interrumpida. Si falta, la copia parcial se reemplaza.
- `snapshot.json` guarda también `files` y `bytes` del contenido de `omega`. Al listar se comparan con lo que hay en disco: si no coinciden, la copia se marca como **dañada** (sincronización a medias, borrado externo…) y no cuenta como completa. Las copias sin manifiesto (anteriores a 0.9.4) se aceptan. La copia automática del día se rehace sola si está dañada, así que «Crear copia de hoy» también sirve para repararla.
- La comprobación se ejecuta al arrancar, tras el primer evento y cada 6 horas; es idempotente.
- **Restaurar no es destructivo**: se comparan los `id` de la copia con la bóveda actual y solo los eventos que faltan se escriben en `omega/devices/restored-<copia>-<marca>-<uuid8>/events.jsonl`. El sufijo aleatorio evita que dos restauraciones del mismo segundo compartan carpeta y se pisen. Nunca se modifica ni se borra un evento existente; al leer se deduplican por `id`.
- El borrado de todas las copias está en Ajustes como acción de alto riesgo con confirmación. Tras borrarlas, el automatismo no vuelve a crear la copia de ese día; se reanuda al día siguiente. En SAF se borran los archivos recursivamente porque el plugin no expone borrado de directorios; pueden quedar carpetas vacías.
- Si el número de eventos de una bóveda baja respecto al último valor visto (guardado en `localStorage` por ruta de bóveda), la app muestra un aviso y sugiere restaurar una copia.

### FolderSync
- La bóveda completa (incluida `longlife`) puede sincronizarse entre Android y PC.
- Los conflictos nunca deben resolverse borrando `omega/devices/` ni `longlife/`: los eventos son inmutables y las copias por dispositivo no colisionan.
- Recomendado: configurar FolderSync como copia incremental del móvil al PC (o desactivar la propagación de borrados). Un modo espejo puede borrar en el PC eventos que ya no existan en el origen, y una copia antigua del PC nunca debe sincronizarse sobre el móvil.
- Si una sincronización antigua revierte la bóveda, la UI detecta la caída de eventos y la restauración recupera solo lo que falte.

Los datos de versiones anteriores en `<bóveda>/devices` se migran una vez a `<bóveda>/omega/devices` al abrir la bóveda en escritorio.

## Entrada de datos
El pegado y el arrastre se interceptan globalmente. Solo se acepta `text/plain`; en campos de una línea se eliminan los saltos de línea. No se aceptan archivos, HTML enriquecido ni imágenes.

## Escáner de códigos de barras
- Android usa `tauri-plugin-barcode-scanner` con permiso `CAMERA`. Como `src-tauri/gen/` está en `.gitignore`, `scripts/patch-android-manifest.mjs` añade el permiso y `uses-feature` de forma idempotente; CI y los builds locales deben ejecutarlo tras `tauri android init`.
- El plugin no solicita el permiso por sí solo: el frontend comprueba, solicita si hace falta y, si queda denegado, explica cómo activarlo y ofrece **Abrir ajustes**.
- A la lista nativa de formatos no se le pasa `QRCode`: `mapFormats` del plugin convierte QR en `0` y el nativo vuelve a añadir QR; pasar QR explícitamente puede generar un formato inválido y romper `scan()`.
- Los rechazos de Tauri se convierten con `errorText` (`src/errors.ts`) para no mostrar `[object Object]`.
- El plugin vive en `src-tauri/plugins/barcode-scanner` (copia de la 2.5.3 con arreglos propios; ver `UPSTREAM.md`). Causa del fallo `attempt to invoke virtual method 'java.lang.Class java.lang.Object.getClass()' on a null object reference`: Tauri entrega a `load()` la primera WebView creada y aquí la primera ventana es `splash`, que se cierra al arrancar; el plugin se quedaba con esa WebView desmontada y `webView.parent as ViewGroup` lanzaba un NPE (R8 compila esa comprobación como `Object.getClass()`). La copia local busca la WebView visible, trata el vibrador como opcional, desmonta la cámara si algo falla (antes quedaba la capa transparente y **Reintentar** no recuperaba la app) y usa ML Kit empaquetado (`com.google.mlkit:barcode-scanning`), que decodifica sin Google Play Services. Se vuelve a la dependencia de crates.io cuando upstream publique estos arreglos.
- La búsqueda prueba variantes del código (exacto, sin ceros iniciales y relleno a 12/13/14 dígitos) en Rust y en el modo navegador. El producto se guarda con el código escaneado original para que el siguiente escaneo haga match local.

## Actualizaciones
- Escritorio: plugin oficial `tauri-plugin-updater` + `tauri-plugin-process`.
- Android: `tauri-plugin-http` descarga `latest.json` y la APK desde GitHub Releases (los assets no envían CORS), se verifica el SHA-256 publicado, se escribe en la caché privada y el backend la publica en `Descargas/BetterTracker` con MediaStore. La instalación es manual.
- Comprobación **manual** desde Ajustes. No hay chequeo automático en segundo plano.
- Manifiesto estático `latest.json` en el release de GitHub, con una entrada por plataforma/arquitectura:
  - `linux-x86_64` → AppImage + `.AppImage.sig`.
  - `windows-x86_64` → instalador NSIS `.exe` + `.exe.sig` (MSI como alternativa).
  - `android-aarch64` → APK, tamaño y SHA-256.
- El plugin de escritorio verifica la firma minisign antes de instalar. Si el manifiesto o la firma no son válidos, se muestra un error y no se instala nada.
- Linux solo puede actualizarse solo con AppImage; `.deb` y `.rpm` se actualizan manualmente desde el release. La interfaz detecta el formato y desactiva el botón cuando no corresponde.
- Windows prefiere NSIS sobre MSI para evitar permisos de administrador.
- La comprobación de red solo ocurre al pulsar “Buscar actualizaciones”.

## Claves y secretos
- La clave privada del updater nunca se versiona. Vive en GitHub Actions Secrets (`TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) y en una copia local con permisos `0600` fuera del repositorio.
- La clave pública está en `tauri.conf.json` (`plugins.updater.pubkey`).
- El certificado opcional de Windows se carga desde secrets y se importa en el runner. Si no existe, el build sale sin firma de sistema; el updater sigue firmado.
- `.key`, `.pem` y `.p12` están ignorados por git. Ver `docs/RELEASE_SECRETS.md`.

## Versión y release
`VERSION` es la fuente única y el tag es exactamente `v<VERSION>`. El workflow ya no calcula el patch con el número de commits. `scripts/sync-version.mjs` sincroniza `package.json`, `package-lock.json`, `tauri.conf.json`, `Cargo.toml` y `Cargo.lock`, y CI falla si hay desincronización.

El workflow compila Linux, Windows y Android, sube los instaladores, la APK y los artefactos del updater, genera `latest.json` (incluida la entrada `android-aarch64`), `release-manifest.json` y `SHA256SUMS.txt`, y publica el release solo cuando todos los builds y las verificaciones terminan bien.

## UI
Cuatro secciones: Panel, Entrenamiento, Historial y Figura corporal. Entrenamiento incluye biblioteca, rutinas, plan, sesión, calendario y progreso. Los mesociclos y recordatorios están integrados en el plan y el panel. El logo se muestra tal cual, sin contenedor circular ni recorte adicional; su propia forma redondeada define el borde.

## Progreso de grasa
La serie se calcula con las medidas guardadas. `bodyProgressSeries` deduplica por fecha y usa `bodyComposition` para obtener % grasa, masa grasa, masa magra y cintura. El % de grasa puede estimarse sin báscula mediante RFM/Navy; la masa grasa en kg solo aparece si hay peso. El gráfico no usa base cero para que los cambios pequeños sean visibles, y es orientativo.

## Ingesta, comidas y alimentos
- La base de alimentos es local y estática (`src/foodDb.ts`), con más de 200 alimentos comunes y valores aproximados por 100 g/ml. Los alimentos personalizados se guardan como eventos `food.saved` en la bóveda y se reducen al último evento por id.
- Las comidas del día son un borrador efímero en `localStorage` (`bt.meal.draft.v1`), con fecha. Si la fecha no coincide con hoy, se elimina al cargar; un intervalo de 30 s también lo limpia al cruzar medianoche. No forman parte de la bóveda.
- El log de ingesta sí es un evento append-only `nutrition.logged`. Solo hay un log lógico por fecha: al guardar de nuevo se añade un evento nuevo y la reducción determinista por fecha + timestamp hace que gane el último. No se muta ni se borra el evento anterior.
- El Panel incluye un banner de agua con incrementos rápidos (+250 ml, +500 ml y +1 L) y una corrección de −250 ml. Cada cambio guarda al momento el total del día en el mismo log `nutrition.logged`, conservando los macros ya registrados.
- Las medidas se convierten a gramos con `units` por alimento; `g` y `ml` son equivalentes aproximados y el resto usa pesos por unidad, taza, cucharada, porción, etc.
- Los valores son estimaciones orientativas y no sustituyen etiquetas o consejo profesional.

## Limitaciones
- Sin cifrado de bóveda.
- Sin fotos de progreso.
- Recordatorios solo mientras la app está abierta; no se programan en el sistema operativo.
- El build de Windows se prueba en GitHub Actions, no localmente.
- Las estimaciones y la base de alimentos son orientativas y no sustituyen valoración médica.
