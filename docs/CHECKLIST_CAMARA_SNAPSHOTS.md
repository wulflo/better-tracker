# Checklist: cámara, escaneo y recuperación de snapshots

> Estado: **implementado y compilado; falta verificación en un Android real**.
> Build local del APK verificado con `CAMERA` presente (2026-10-28).
> Fecha de inicio: 2026-10-28. Última actualización: 2026-10-28.
> Objetivo: corregir la cámara/escaneo en Android, hacer accesibles las copias desde la app
> y blindar la bóveda contra sobrescrituras de FolderSync.

## 1. Cámara y permisos (Android)

- [x] Localizado el flujo actual: `src/components/BarcodeScanner.tsx` usa el plugin nativo
  `@tauri-apps/plugin-barcode-scanner` y pide permiso antes de `scan()`.
- [x] Confirmado que el manifiesto generado localmente puede quedarse sin `CAMERA`; el
  workflow de release lo parchea, pero `tauri android init` local no.
- [x] Extraer el parche del manifiesto a un script reutilizable (`scripts/patch-android-manifest.mjs`),
  usado por CI y ejecutable en local (`node scripts/patch-android-manifest.mjs`).
- [x] Flujo de permiso: `checkPermissions()` → `requestPermissions()` → `scan()`; si el
  permiso queda denegado se muestra el motivo y un botón **Abrir ajustes**. `scan()` se
  reintenta con **Reintentar**.
- [x] Quitar `QRCode` de la lista nativa: el plugin ya añade QR y su conversión interna puede
  generar un formato inválido (`0`).
- [x] Formatear errores objeto de Tauri (`[object Object]`) con `errorText` (`src/errors.ts`).
- [x] Añadir botón “Abrir ajustes” cuando el permiso esté denegado.
- [x] Corregir el NPE que aparecía justo después de conceder el permiso:
  `No se pudo abrir la cámara: attempt to invoke virtual method 'java.lang.Class
  java.lang.Object.getClass()' on a null object reference`. Origen: Tauri
  entrega a `load()` la primera WebView creada, que aquí es la del `splash` y se
  cierra al arrancar; el plugin 2.5.3 se quedaba con esa WebView sin padre y
  `webView.parent as ViewGroup` lanzaba el NPE (R8 compila esa comprobación como
  `Object.getClass()`). `getSystemService(VIBRATOR_SERVICE) as Vibrator` era otro
  posible nulo. Además, al fallar dejaba la vista previa montada y el fondo de
  la WebView transparente, así que «Reintentar» no recuperaba la app.
- [x] Copiar el plugin a `src-tauri/plugins/barcode-scanner` (2.5.3 + parches)
  y apuntar ahí la dependencia de Android. Parches: contenedor de respaldo para
  la vista previa, vibrador opcional, desmontaje siempre, `scan()` limpia antes
  de rechazar, `mapFormats` sin ceros y ML Kit empaquetado (sin Play Services).
  Detalle en `src-tauri/plugins/barcode-scanner/UPSTREAM.md`.
- [x] Aviso comprensible en el frontend si llega un error nativo sin mensaje
  (`null object reference` / `getClass()`), en vez de mostrar el texto de Java.
- [x] Cerrar el modal cancela el escaneo pendiente: el *cleanup* del componente
  llama a `cancel()`, así la cámara nativa no se queda abierta por detrás.
- [x] Verificado en emulador x86_64 (API 35, sin Play Store): permiso concedido,
  `scan()` abre la vista previa sin NPE, la interfaz sigue visible y usable
  (`windowed`), **Cancelar** suelta la cámara y un segundo `scan()` vuelve a
  abrirla.
- [x] Verificado que el ML Kit empaquetado decodifica un EAN-13 **con Google Play
  Services desactivado** (`pm disable-user com.google.android.gms`):
  `cd src-tauri/gen/android && ./gradlew :tauri-plugin-barcode-scanner:connectedDebugAndroidTest`
  (2 pruebas en verde).
- [ ] Verificar en un Android real: permiso concedido, cámara abierta y código leído.
- [ ] Verificar en un Android real: permiso denegado y mensaje comprensible.

## 2. Código escaneado → producto

- [x] Diagnóstico: el lector entrega UPC-A de 12 dígitos y Open Food Facts suele usar
  EAN-13 con cero inicial (o al contrario); la búsqueda local ya prueba variantes, la
  consulta remota no.
- [x] Probar variantes de código en Rust (`lookup_barcode`): exacto, 12/13 dígitos,
  sin ceros iniciales y GTIN-14.
- [x] Probar las mismas variantes en el modo navegador (Open Food Facts directo).
- [x] Asociar el producto encontrado al código escaneado original para que el siguiente
  escaneo haga match local.
- [x] Añadir pruebas unitarias de variantes UPC/EAN en Rust (`src-tauri/src/barcode.rs`) y
  TypeScript (`src/foodDb.test.ts`).

## 3. Snapshots accesibles y restauración

- [x] Diagnóstico: `Longlife/<AAAA-MM-DD>` es compartido por todos los dispositivos.
  Dos dispositivos pueden escribir la misma carpeta del día y FolderSync decide quién gana.
- [x] Cambiar a snapshots por dispositivo: `Longlife/<device-id>/<AAAA-MM-DD>`.
- [x] Escribir `snapshot.json` dentro de cada copia con dispositivo, plataforma, fecha y versión.
- [x] Seguir leyendo y mostrando las copias antiguas `Longlife/<AAAA-MM-DD>` (legado).
- [x] UI en Ajustes: listar fecha, dispositivo, tamaño, estado y botón **Restaurar**.
- [x] Restauración no destructiva: importar solo eventos que falten en una carpeta
  `omega/devices/restored-<snapshot>-<marca>-<uuid>/`, sin sobrescribir `omega`.
- [x] Restaurar también desde Android (SAF) y desde escritorio.
- [ ] Probar restauración de una copia creada en Android desde la PC (requiere dispositivo).

## 4. Blindaje contra FolderSync

- [x] Guardar cada evento nuevo como archivo propio
  (`omega/devices/<device>/events/<event-id>.json`) en vez de reescribir un JSONL completo.
- [x] Mantener lectura de los `events.jsonl` antiguos.
- [x] Deduplicar eventos por `id` al leer, aunque FolderSync duplique archivos.
- [x] Retención de copias por dispositivo (7 por dispositivo), sin borrar las de otros.
- [x] Aviso en la UI si el número de eventos baja respecto al último visto para esa bóveda
  (una bóveda append-only nunca debería decrecer).
- [x] Documentar que FolderSync debe sincronizar la bóveda completa, incluyendo `Longlife`,
  y que nunca debe resolverse un conflicto borrando `devices/` ni `Longlife/`
  (ver `DECISIONES.md`, sección FolderSync).
- [x] Manifiesto de integridad en `snapshot.json` (`files`/`bytes` del contenido): una copia
  con marcador pero sin todos sus archivos se marca como **dañada**, y la copia del día se
  rehace sola (también desde «Crear copia de hoy»). Las copias sin manifiesto se aceptan.
- [x] Pruebas: `detects_snapshots_that_do_not_match_their_manifest`,
  `snapshot_counts_ignore_its_own_metadata`, `snapshots_without_manifest_are_still_considered_valid`.

## 5. Iconos (escritorio y Android)

- [x] Diagnóstico: los mipmaps de Android solo se generaban en CI; un build local
  dejaba el icono genérico de Tauri. Los iconos de escritorio venían de un PNG con el
  dibujo pequeño y sin los aros del logo.
- [x] Master único: `src-tauri/icons/app-icon.png` (1024×1024) + `app-icon.json`.
- [x] `scripts/generate-icons.mjs` (`npm run icons`) regenera escritorio (`.ico`, `.icns`,
  PNG y Store), iOS y los mipmaps de Android (legacy + adaptativos), copiándolos a
  `src-tauri/gen/android/app/src/main/res/`.
- [x] `npm run android:prepare` = iconos + manifiesto `CAMERA`; documentado en ambos README.
- [x] CI: el workflow de release usa `npm run icons` y `ci.yml` verifica que los iconos
  commiteados estén sincronizados con el master (excepto `icon.icns`, que el CLI genera
  de forma no determinista).
- [x] Verificado dentro del APK: `ic_launcher` y `ic_launcher_foreground` contienen el logo.

## 6. Verificación técnica

- [x] `npm test` (22 pruebas)
- [x] `npx tsc --noEmit`
- [x] `cargo test --manifest-path src-tauri/Cargo.toml` (18 pruebas)
- [x] `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`
- [x] `npm run build`
- [x] Build local de Android con `npm run tauri android build -- --apk` (APK universal
  `app-universal-release-unsigned.apk`, 4 ABIs).
- [x] Comprobar `aapt2 dump badging ... | grep CAMERA` en el APK resultante:
  `uses-permission: name='android.permission.CAMERA'` presente.
- [x] Actualizar `README.es.md`, `README.md`, `DECISIONES.md` y `docs/AVANCES.md`.

## 7. Recuperación de datos ya perdidos

1. No borrar ni mover nada de `Longlife` ni de `omega`.
2. Hacer una copia completa de la bóveda en otro disco antes de tocar nada.
3. Abrir **Ajustes → Copias de seguridad**. La lista muestra fecha, dispositivo, tamaño y si
   la copia está completa.
4. Pulsar **Restaurar** en la copia más reciente que contenga los datos que faltan. La app
   importa solo los eventos ausentes en `omega/devices/restored-<copia>-<marca>/` y refresca
   la vista; no borra ni sobrescribe nada.
5. Si no aparece la copia esperada, comprobar que FolderSync haya terminado de sincronizar
   `Longlife` y reabrir Ajustes.
6. Como último recurso manual: copiar los eventos que falten a
   `omega/devices/restored-manual-<fecha>/events.jsonl` (nunca sobrescribir el archivo actual).

> Cuando se retome: la única tarea pendiente es la verificación en un Android real
> (permiso concedido/denegado, cámara abierta, escaneo EAN/UPC y restauración de una
> copia creada en el móvil). El build ya compila y el APK lleva `CAMERA`.
