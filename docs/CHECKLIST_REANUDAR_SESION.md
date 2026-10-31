# Checklist de reanudación tras corte de internet

> Objetivo: poder retomar las tareas de esta sesión **sin internet y sin romper
> nada**. Está escrito para volver a pegarlo en conversación con el asistente
> (o en una nueva sesión) y continuar desde aquí mismo.
> Fecha de cierre de la sesión: 2026-10-31. Base del repo: `0.9.7`
> (HEAD `351b5fb` + cambios **sin commit** de esta sesión, ver sección 2).

## 1. Contexto para retomar en 30 segundos

Copia esto al inicio de la nueva conversación si no recuerda el estado:

```
Estamos en /home/alonso/Documentos/Repositorios/fitness-app (mejor-tracker 0.9.7,
git base 351b5fb). Lee primero docs/CHECKLIST_REANUDAR_SESION.md y sigue lo
pendiente de la sección 5. Antes de tocar código vale las reglas de la sección 4.
```

## 2. Estado del árbol al cerrar la sesión

- `git reset --hard` **NO**: hay cambios de trabajo valiosos sin commit:
  - `src/PanelView.tsx`, `src/WellnessView.tsx`, `src/App.tsx` — select nativos migrados a `components/Select.tsx` (menús temáticos).
  - `src/styles.css` — `.select-menu`/`.select-option` con variables del tema y padding menor; `.settings-row .settings-select` (idioma); guard de `select`/`option` residuales con vars del tema.
  - `src/components/BarcodeScanner.tsx` — opción «Cargar imagen del código» en escritorio.
  - `src/barcodeImage.ts` + `src/barcodeImage.test.ts` — validación de seguridad de la imagen (nuevos).
  - `src-tauri/plugins/barcode-scanner/android/src/main/java/BarcodeScannerPlugin.kt` — `failScan()` (ver 5.1).
  - `docs/CHECKLIST_REANUDAR_SESION.md` (este archivo) y `docs/AVANCES.md`.
- Primera acción recomendada al retomar: `git status --short` + `git diff --stat`
  y comprobar que el listado coincide con lo de arriba. Si hay archivos extra,
  revisarlos antes de descartarlos (pueden ser trabajo del usuario).

## 3. Qué se pidió y qué quedó hecho

| Petición | Estado |
| --- | --- |
| Checklist en docs para reanudar tras corte de red | ✅ este documento |
| Menús dropdown con padding excesivo y colores fuera del tema | ✅ causa raíz: eran `<select>` nativos (nivel de actividad, frecuencia de hábitos, idioma) cuyo popup lo pinta el SO; migrados al componente `components/Select.tsx`; además `.select-menu` ahora usa `var(--surface-2)`, `var(--outline-variant)` y `var(--shadow-2)` con padding 4 px y opciones 7×9 px |
| Escritorio: cargar imagen en vez de escanear, con protocolos de seguridad | ✅ botón «Cargar imagen del código»; validación en `src/barcodeImage.ts` (lista cerrada de MIME rasterizados —sin SVG por scripting—, máx. 10 MB, archivos vacíos fuera), se lee como data URL local con `FileReader` (nada se sube a ningún servidor) y ZXing decodifica en memoria (`decodeFromImageUrl`) |
| Android: la app se cierra al dar permiso de cámara | 🔶 mitigación hecha (5.1), **sin poder compilar aquí**; verificación en dispositivo pendiente (5.2) |
| «Revisar todo lo que falte» | ✅ parcial: ver involuntarios y pendientes en sección 5 |
| Comparación del escáner/datos con apps libres (Waistline, OpenNutriTracker, Food You) | ✅ `docs/REVISION_APPS_LIBRES_ESCANER.md`: paridad en local-first, variantes de código, dedup y permisos; brechas a–h en la sección 5.5 de este checklist |

## 4. Reglas para no romper nada (memoria de fallos previos)

1. **Nunca** reintroducir `reqwest 0.13` con feature `rustls` en
   `src-tauri/Cargo.toml`: en Android entra en panic (rustls-platform-verifier
   no se inicializa por JNI) y con `panic = "abort"` en el perfil release la app
   muere al primer uso HTTP (buscar actualizaciones, `lookup_barcode`). Usar
   reqwest 0.12 + `rustls-tls-webpki-roots`. Detalle:
   `docs/CHECKLIST_ANDROID_ESCANER_ACTUALIZACIONES.md` §1.
2. **No tocar a mano lo generado**: `src-tauri/gen/**`, `dist/`, `node_modules/`,
   build outputs. Lo de `gen/` se regenera con `tauri android init`; lo único
   manual legítimo es `gen/android/app/build.gradle.kts` (`minSdk = 33`) si el
   CLI lo ignorara, y el manifiesto via `node scripts/patch-android-manifest.mjs`.
3. **El plugin barcode-scanner es una copia local** de 2.5.3 con parches: si se
   actualiza, re-aplicar los parches de `src-tauri/plugins/barcode-scanner/UPSTREAM.md`
   (webView visible, vibrador opcional, desmonte siempre, `scan()` limpia antes
   de rechazar, `mapFormats` sin ceros, ML Kit empaquetado, y el nuevo `failScan`).
4. **Nunca pasar `QRCode`/`FORMAT_QR_CODE` explícito** a `scan()` nativo: el
   formato llega como `0` inválido a ML Kit (`src/components/BarcodeScanner.tsx`
   → `NATIVE_FORMATS`).
5. Antes de commit: `npm test` (64), `npx tsc --noEmit`, `npm run build`,
   `cargo test` (25) y `cargo clippy -- -D warnings` (desde el sub-directorio
   `src-tauri`; ver comandos en sección 6).
6. Datos del usuario: bóveda en `omega/` y copias en `longlife/`. Nada de eso
   vive en el repo, pero al probar restauraciones **nunca** borrar `longlife/`
   ni `omega/`; la restauración es no destructiva (importa a
   `omega/devices/restored-*`).
7. Vale la regla general del repo: cifras y textos de UI en español están
   hardcodeados en los componentes; si se cambia texto, revisar `i18n.tsx`
   (claves `language`, etc.) para no desincronizar ES/EN.

## 5. Pendientes (por prioridad)

### 5.1 Compilar el parche Kotlin del plugin — ✅ CERRADO (2026-10-31)

- Resuelto instalando **Temurin JDK 21** en `~/jdks/jdk-21.0.13+9` (tarball
  descargado de Adoptium; no requiere `sudo`). Internet volvió a mediación
  de la sesión de revisión de apps libres, así que la regla de «no descargas»
  ya no bloqueaba.
- `./gradlew :tauri-plugin-barcode-scanner:compileDebugKotlin` → **BUILD
  SUCCESSFUL**: `failScan()` y sus 6 puntos de uso compilan sin errores, solo
  advertencias preexistentes (`setTargetResolution` de CameraX y
  `source/target 8`). Nada del código nuevo genera avisos.
- Ojo para futuros builds de Android en esta máquina: habrá que exportar
  `JAVA_HOME=~/jdks/jdk-21.0.13+9` (el JRE del sistema no basta para compilar).
- Queda la verificación en Android físico (5.2 abajo, no bloqueada por
  toolchain).
- Qué cambió en `BarcodeScannerPlugin.kt`: nuevo `failScan(message, e)` que
  rechaza el invoke pendiente y restablece la actividad; los cuerpos de
  `setupCamera` (todo el bloque `runOnUiThread`), el listener de
  `cameraProviderFuture` y el de `bindPreview` ya no tragan silencio ni dejan
  escapar excepciones al hilo principal; `configureCamera` envuelve todo su
  bloque. Esto cubre el cierre de la app al conceder el permiso de cámara: si
  algo falla al configurar la cámara, ahora la promesa se rechaza y la UI
  muestra «Reintentar / Abrir ajustes» en vez de matar el proceso.
- Comando que quedó funcionando (con `JAVA_HOME` apuntando al JDK de
  `~/jdks/` y `ANDROID_HOME=~/Android/Sdk`):

```bash
export JAVA_HOME=$(echo ~/jdks/jdk-21*) ANDROID_HOME=~/Android/Sdk
cd src-tauri/gen/android
./gradlew :tauri-plugin-barcode-scanner:compileDebugKotlin
```

### 5.2 Verificación en Android físico (acumulada de checklists previas)

- [ ] Escáner: conceder permiso → la app NO se cierra; abrir cámara, leer un
  EAN/UPC real, imagen no se rompe en el segundo intento.
- [ ] Escáner sin red: lee el código y muestra el error de búsqueda correcto.
- [ ] Bitácora de cierres: `adb logcat -d | grep -iE "better|panic|Fatal|SIGABRT|AndroidRuntime"`.
- [ ] Buscar actualizaciones con 0.9.7 publicada → «Ya tienes la última versión».
- [ ] Restaurar copia creada en el móvil desde el PC (pendiente histórico).
- [ ] minSdk 33: el sistema rechaza instalar el APK en Android ≤ 12.

### 5.3 Cierres de documentación de esta sesión

- [x] Release 0.9.8 publicada (2026-10-31): `VERSION` + `sync-version.mjs`
  (versionCode 9008), notas en `docs/releases/v0.9.8.md`, commit y push a
  `main` (el workflow de release se dispara solo al tocar código).
- [x] `README.md` / `README.es.md`: mención de la carga de imagen por código.
- [x] `DECISIONES.md` bajo «Escáner de códigos de barras»: (a) menús propios
  en vez de select nativo, (b) política de seguridad de la imagen (MIME
  cerrado sin SVG, 10 MB, procesamiento local), (c) `failScan` del plugin.
- [ ] Opcional: arrastrar y soltar la imagen sobre el modal del escáner
  (hoy solo hay botón).

### 5.4 Verificaciones a la escucha (no bloquean)

- El menú del selector de idioma en Ajustes debe abrirse hacia arriba/sin
  taparse: es un menú absoluto dentro de una fila flex; si se corta, añadir
  `overflow: visible` al contenedor de `.settings-row`.
- La imagen a decodificar se prueba con los mismos formatos (EAN-13, EAN-8,
  UPC-A, UPC-E, Code 128, QR); fotos borrosas devuelven «No se detectó
  ningún código…», que es el mensaje correcto (probar con
  `src-tauri/plugins/barcode-scanner/android/src/androidTest/assets/ean13.png`).

### 5.5 Brechas del escáner frente a apps libres (de `docs/REVISION_APPS_LIBRES_ESCANER.md`)

Análisis completo en `docs/REVISION_APPS_LIBRES_ESCANER.md`. La conclusión del
estudio: estamos en paridad (o por encima) de Waistline, OpenNutriTracker y
Food You; los huecos reales, por orden de valor/coste:

- [ ] **(a) Checksum EAN/UPC antes de consultar** (barato): validar dígito de
  control GTIN mod 10 en `normalizeBarcode` (`src/foodDb.ts`) + aviso y opción
  de continuar en `handleBarcode` (`src/components/FoodLog.tsx`). Prueba
  unitaria con códigos de `src/barcodeCatalog.json`.
- [ ] **(b) Vibración al detectar el código** (barato): llamar `vibrate()` del
  plugin en `BarcodeScanner.tsx` al recibir el resultado nativo, con catch
  silencioso. Hoy no se llama en ningún lado.
- [ ] **(c) Escribir/pegar el código a mano en el modal del escáner** (barato):
  input numérico en `BarcodeScanner.tsx` que reutilice `onResult` (pasa por el
  mismo `handleBarcode`), como hace OpenNutriTracker.
- [ ] **(d) Rationale del permiso de cámara** (barato): en `prompt-with-rationale`
  mostrar antes un texto corto («solo para leer el código del envase; nada sale
  del equipo») en vez de pedir el permiso directo.
- [ ] **(e) Linterna/torch** (medio): necesita `tauri-plugin-torch` o tocar
  Kotlin; **posponer hasta tener internet** (regla §4.7). La copia del plugin
  ya prepara `getActiveCamera()`.
- **Diferidos**: chips de escaneos recientes (f, opcional), cámara frontal (g),
  tope de bytes en la respuesta de OFF (h).
- **Vigilancia** (no aplicar hoy): credenciales de OFF si algún día se usa búsqueda
  por nombre (Food You 3.4.7 las necesitó); sin contribuir productos a OFF; nada
  de GS1 DataBar en UI mientras Android no lo soporte.
- Sugerencia de partida de la revisión: **a + b + c en un mismo commit** (tocan
  `FoodLog.tsx`, `BarcodeScanner.tsx` y `foodDb.ts`), luego d, luego e con red.

## 6. Comandos de verificación local (sin internet)

```bash
# Frontend (todos usan node_modules ya instalado)
npm test                 # 64 pruebas esperadas (57 previas + 7 de barcodeImage)
npx tsc --noEmit         # sin errores
npm run build            # compila y llena dist/

# Backend Rust (solo si se toca src-tauri)
cd src-tauri && cargo test          # 25 pruebas esperadas
cargo clippy -- -D warnings

# Confirmar versiones críticas
grep -n 'reqwest' src-tauri/Cargo.toml   # debe ser 0.12.x + rustls-tls-webpki-roots
grep -rn "minSdk" src-tauri/gen/android/app/build.gradle.kts   # 33

# Kotlin del plugin (requiere JDK completo, ver 5.1)
cd src-tauri/gen/android
./gradlew :tauri-plugin-barcode-scanner:compileDebugKotlin --offline
```

## 7. Si internet se corta A mitad de algo

- **Tarea a mitad**: guardar el estado con `git stash list`/`git diff >
  /tmp/opencode/wip.diff` y anotar en este archivo qué faltaba. No rebases ni
  hagas amends a ciegas.
- **Build de Rust a mitad**: `cargo clean` solo como último recurso; el build
  incremental usa caché local y sigue funcionando sin red salvo por deps nuevas.
- **Descarga de dependencias nueva**: sin red es imposible; posponer las tareas
  que necesiten crates nuevos o `tauri android init` (usa red) y dejarlas
  anotadas en la sección 5.
- **test.datos**: si un test se rompe tras volver la red, aislarlo primero:
  `npx vitest run src/<archivo>.test.ts` para no mirar el paquete entero.
