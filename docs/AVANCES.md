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
- `tauri-plugin-android-fs` 30.2.0 con `compileSdk = 36`: la APK vuelve a compilar en CI sin parches manuales del registro de Cargo. Las rutas SAF guardadas por 2.x se siguen leyendo.

## Escritorio Linux
- El AppImage fuerza `WEBKIT_DMABUF_RENDERER_FORCE_SHM=1` al arrancar. Esto evita el `SIGABRT` de `WebKitWebProcess` durante el cierre con la ruta EGL/DMA-BUF de Mesa, mantiene la composición acelerada y solo se aplica dentro de un AppImage. Un valor previo de la variable (incluido `0`) se respeta.
- **NVIDIA propietario**: si se detecta el driver `nvidia` (por `/proc/driver/nvidia`, `/sys/module/nvidia` o el symlink de `/sys/class/drm/card*/device/driver`), se fija `WEBKIT_DISABLE_DMABUF_RENDERER=1` antes de inicializar GTK. Con la serie 580 el `WebKitWebProcess` moría con `SIGSEGV` dentro de `libnvidia-eglcore`; el compositor quedaba esperando fences inválidos, la ventana mostraba artefactos y el equipo se congelaba. La detección funciona también dentro de Flatpak/Snap y cubre portátiles híbridos donde WebKit elige el render node de NVIDIA aunque la GPU primaria sea la integrada. Cualquier variable de renderizado fijada por la persona usuaria desactiva la detección.
- **Instancia única**: `tauri-plugin-single-instance` enfoca la ventana existente y cierra la segunda ejecución. Evita ventanas apiladas, procesos WebKit duplicados y escrituras concurrentes en la misma bóveda cuando se lanza la app varias veces. En Snap usa el nombre D-Bus namespaced `snap.better-tracker.better-tracker`.
- **Sin `backdrop-filter`**: se retiraron los cuatro desenfoques de fondo (sidebar, topbar, modal y navegación inferior). Cada blur obliga a WebKitGTK a recomponer la escena en cada fotograma al arrastrar o redimensionar; era el principal sospechoso de los artefactos grises, el consumo de CPU/VRAM y los cierres. Los paneles usan ahora fondos opacos del tema.
- **Menos IPC al redimensionar**: `WindowControls` deja de escuchar `resize` del DOM y consultar `isMaximized()` en cada evento. Usa `onResized` de Tauri y agrupa las consultas (140 ms) para hacer una sola llamada tras el último cambio.
- **Ventana sin marco estable**: el arreglo del redimensionado sigue al de Study Planner (su `CHANGELOG`, 0.1.1). Tres partes: fuera los `backdrop-filter`; fondos sólidos, con `--topbar-bg` y `--sidebar-bg` pasando de `rgba(...)` al color ya compuesto sobre `--bg` (es justo la zona de arrastre, así el compositor no mezcla transparencia en cada fotograma); y tiradores de redimensionado ocultos cuando la ventana está maximizada, porque un tirador fijo pegado al borde deja artefactos de repintado en algunos compositores. `WindowResizeHandles` escucha `onResized` y no pinta nada si está maximizada. Además `splash` y `main` declaran `transparent: false` y `backgroundColor: "#0d0a13"` (el `--bg` del tema oscuro), como en `SinNotas`, para que el compositor no mezcle un visual ARGB en cada fotograma.
- **Flatpak**: el runtime pasa a `org.gnome.Platform` 51 (antes 48). Con GNOME 48 (WebKitGTK 2.48) el `WebKitNetworkProcess` no lograba arrancar dentro del sandbox y el proceso de la app moría con `SIGKILL` a los ~400 ms: la app instalada no abría y no dejaba ningún error en consola. Desde GNOME 49 el runtime trae WebKitGTK 2.50, donde el fallo está corregido; 0.9.16 ejecutado contra 49, 50 y 51 arranca y se mantiene estable. El manifiesto y la imagen de CI (`gnome-51`) deben ir siempre a la par.

## Composición corporal
- Se añadieron las ecuaciones militares que faltaban: Ejército de EE. UU. (Vogel 1988, hombres y mujeres), Ejército actual de una sola medida (2023), Marines (Wright 1980, hombres y mujeres) y Friedl/Vogel (1997). Navy/Air Force ya estaba.
- Nuevas medidas opcionales: **abdomen al ombligo** y **antebrazo**. Si falta el abdomen se usa la cintura como aproximación; el antebrazo y la muñeca activan las ecuaciones femeninas del Ejército y Marines.
- El consenso deja de ser una media simple: cada método pesa según su error publicado y sus entradas, y las familias correlacionadas (abdominal, IMC, cintura-altura, multi-sitio) se reparten el peso para no contar dos veces la misma información. La tarjeta muestra el peso de cada método, la cobertura de medidas y una confianza orientativa 0–100.
- Las medidas antiguas siguen cargando: los campos nuevos se rellenan con cero y la app calcula con lo que haya.

## Proyección de peso
- El peso objetivo ya no se recorta al IMC cuando hay composición: se calcula desde la masa magra que se espera conservar o ganar y la masa grasa necesaria para el porcentaje objetivo. La tarjeta muestra ambas cantidades y avisa si el IMC objetivo queda fuera del rango orientativo.
- Nuevo indicador mensual de fuerza: días distintos con ejercicio de tipo `fuerza` en los últimos 30 días. Ajusta la retención de masa magra, el ritmo seguro y la proporción del cambio de peso atribuible a grasa.
- Nuevo campo opcional de **pasos promedio al día** (evento `steps.average`) en Nutrición. Se traduce a un multiplicador de actividad orientativo y se usa el mayor entre ese valor y el nivel declarado/automático, para no duplicar el gasto. Los hitos de peso en fechas futuras se recalculan con ese TDEE.

## Interfaz y marca
- Logo actualizado a mancuernas moradas (`public/logo.png`, iconos Tauri y Android).
- Selector de tema **oscuro/claro** y de **color de acento** con 9 variantes (violeta, azul, turquesa, verde, ámbar, naranja, rojo, rosa e índigo) en Ajustes. Se guardan en `localStorage` y se aplican antes del primer pintado con `public/theme-init.js`.
- Cada acento tiñe fondo, superficies, tarjetas, sidebar, topbar y navegación inferior también en tema oscuro; el tema claro mantiene sus propios tonos y añade fondo a las tarjetas de métricas.
- El fondo ambiental de las páginas (base y resplandor radial) se tiñe con el acento activo, y el logo ya no lleva halo.
- Soporte de idioma inglés (selector en Ajustes, persistencia en `localStorage`).
- Los menús desplegables usan en todos lados el componente `components/Select.tsx` con su propio menú temático; los `<select>` nativos (nivel de actividad, frecuencia de hábitos, idioma) dibujaban el popup del sistema operativo con padding grande y colores ajenos al tema.
- El menú del selector (`.select-menu`) se pinta con variables del tema (`--surface-2`, `--outline-variant`, `--shadow-2`) y densidad menor, en vez de colores prefijados.

## Código de barras
- Reemplazado el escáner por cámara/imagen por un **campo manual** siempre visible en Ingesta: se escriben o pegan 6–14 dígitos y se pulsa «Buscar» (o Enter). Un lector USB/Bluetooth que teclea el código y termina en Enter funciona sin configuración.
- Se retiraron `@tauri-apps/plugin-barcode-scanner`, `@zxing/browser`, `@zxing/library`, la copia local del plugin, el permiso `CAMERA`, la carga de imágenes y el parche del manifiesto de Android. La app ya no solicita permisos de cámara.
- La búsqueda mantiene el flujo local → catálogo local AR/PE/MX → Open Food Facts → formulario manual con el código rellenado.
- El dígito de control GTIN se valida antes de consultar la red y, si no cuadra, se avisa con «Buscar igual / Descartar».

## Datos nutricionales
- Base de alimentos ampliada a 521 entradas.
- Sin marcas; valores por 100 g/ml.

## Pendiente / posible
- Las copias longlife no están cifradas.
- En SAF, borrar copias deja carpetas vacías porque el plugin no expone borrado de directorios.
- Probar la entrada manual y un lector físico USB/Bluetooth en un Android real.
