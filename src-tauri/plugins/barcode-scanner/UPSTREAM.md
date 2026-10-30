# Copia local de `tauri-plugin-barcode-scanner`

Este directorio es una copia de `tauri-plugin-barcode-scanner` **2.5.3**
(crates.io, licencia Apache-2.0 OR MIT; ver `LICENSE_*`). Se añadió al repo
porque esa versión —y también la `3.0.0-alpha.3`— tiene dos fallos que rompen
el escáner en Android y no hay release upstream con el arreglo.

`src-tauri/Cargo.toml` apunta aquí con `path` solo para Android:

```toml
[target.'cfg(target_os = "android")'.dependencies]
tauri-plugin-barcode-scanner = { path = "plugins/barcode-scanner" }
```

## Cambios respecto a upstream

`android/src/main/java/BarcodeScannerPlugin.kt`:

1. **Contenedor de la vista previa** (`setupCamera` / `dismantleCamera`).
   Upstream hace `val parent = webView.parent as ViewGroup`. Si
   `WebView.parent` es nulo, Kotlin lanza un NPE sin mensaje útil y la interfaz
   solo muestra `attempt to invoke virtual method 'java.lang.Class
   java.lang.Object.getClass()' on a null object reference`. R8 compila la
   comprobación de nulo de ese `as` como una llamada a `Object.getClass()`, de
   ahí el texto.

   La causa de que el `parent` sea nulo en esta app: Tauri entrega a `load()` la
   **primera** WebView que crea, y aquí la primera ventana es `splash`, que se
   cierra al arrancar. El plugin se queda apuntando a esa WebView ya
   desmontada. Ahora `visibleWebView()` usa la WebView del plugin si sigue
   montada y, si no, la que está dentro del contenido de la actividad (búsqueda
   en profundidad); el contenedor se recuerda en `previewContainer` para retirar
   las vistas exactamente de donde se añadieron.

2. **Vibrador opcional** (`configureCamera` / `vibrate`). Upstream hace
   `activity.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator` y luego
   `vibrator!!`. En dispositivos sin servicio de vibración (algunos ROM
   personalizados, emuladores, Android 12+ con `vibrator_manager` caído) eso
   también produce el NPE de `getClass()`. Ahora es `as? Vibrator` y la
   vibración simplemente no ocurre si no está disponible.

3. **`dismantleCamera` deja de depender de `cameraProvider`**. Antes solo
   retiraba las vistas si `cameraProvider != null`; si algo fallaba justo
   después de montarlas, la actividad quedaba con una capa transparente y la
   cámara enlazada hasta reiniciar la app. Ahora retira siempre las vistas que
   haya y suelta la cámara.

4. **`scan()` limpia antes de rechazar**. Si `prepare()` o `configureCamera()`
   fallan, se llama a `destroy()` (desmonta la vista previa y restaura el fondo
   de la WebView) y se propaga el error, para que «Reintentar» funcione sin
   reiniciar. Además, si el dispositivo no tiene cámara, se rechaza la promesa
   en vez de dejarla pendiente para siempre.

5. **Mensajes en español** en los errores que puede ver el usuario
   («Something went wrong configuring the BarcodeScanner» pasa a español).

6. **`mapFormats` sin ceros**. Si la lista de formatos incluía QR, upstream
   dejaba un `0` en el array y el nativo ya añade `FORMAT_QR_CODE`; un formato
   `0` es inválido para ML Kit. Ahora se filtra.

`android/build.gradle.kts`:

7. **ML Kit empaquetado**. Cambia
   `com.google.android.gms:play-services-mlkit-barcode-scanning:18.1.0`
   (variante que descarga el modelo con Google Play Services y falla en
   dispositivos sin GMS) por `com.google.mlkit:barcode-scanning:17.3.0`, que
   lleva el modelo dentro del APK. Cuesta ~2 MB más de APK y elimina la
   dependencia de Play Services y la descarga en el primer escaneo.

No se ha tocado el resto: API pública del plugin, identificador
`app.tauri.barcodescanner`, nombres de comandos, permisos y
`getActiveCamera()` (lo usa por reflexión el plugin de linterna).

## Prueba de decodificación

`android/src/androidTest/java/BarcodeDecodingTest.kt` decodifica un EAN-13
(`android/src/androidTest/assets/ean13.png`) con el ML Kit empaquetado, sin
Google Play Services. Se ejecuta en un emulador o dispositivo conectado:

```bash
cd src-tauri/gen/android
./gradlew :tauri-plugin-barcode-scanner:connectedDebugAndroidTest
```

## Cómo actualizar

1. Descargar la versión nueva del crate y sustituir `src/`, `android/`, `ios/`,
   `permissions/`, `build.rs` y `api-iife.js`.
2. Volver a aplicar los puntos 1-6 anteriores sobre
   `android/src/main/java/BarcodeScannerPlugin.kt` y `android/build.gradle.kts`.
3. Revisar los cambios con `git diff` y comprobar que
   `src-tauri/gen/android/tauri.settings.gradle` apunta a este directorio
   (se regenera solo en cada `tauri android build`).
4. Borrar este directorio y volver a la dependencia de crates.io cuando
   upstream publique los arreglos.

## Qué se ha omitido de la copia

`android/.tauri/` (solo sirve para compilar el plugin por separado),
`android/settings.gradle`, `android/build/`, `guest-js/`, `Cargo.lock` y los
banners del README.
