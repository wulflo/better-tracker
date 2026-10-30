# Checklist: cierres en Android (escáner + actualizaciones), longlife y Android 13+

> Estado: **causa raíz corregida y verificada en la máquina local; falta verificar en un Android físico**.
> Fecha: 2026-10-30. Versión de partida: 0.9.6.
> Objetivo: documentar todo lo hecho y lo que falta, de forma que se pueda seguir
> trabajando **sin internet**: cada sección tiene comandos locales y qué comprobar.

## 1. Por qué cerraba la app (causa raíz, para poder reconstruir el razonamiento offline)

- El backend configuraba `reqwest 0.13` con la feature `rustls`. Esa feature
  activa `rustls-platform-verifier`, que en Android necesita inicialización JNI
  manual (`rustls_platform_verifier::android::init_with_env`) que Tauri no hace.
- Al construir el cliente (un simple `Client::builder().build()`), la lib entra
  en `panic` («Expect rustls-platform-verifier to be initialized») y el perfil
  release de `src-tauri/Cargo.toml` tiene `panic = "abort"`: **proceso
  exterminado al instante**.
- Vía exacta en cada síntoma:
  - «Buscar actualizaciones» → `fetch_update_manifest` (`src-tauri/src/commands.rs`)
    construye el cliente → abort. Por eso ni siquiera llegaba a descargar la APK.
  - «Usar el escáner» → el escaneo detecta el código y el frontend llama a
    `lookup_barcode` (`src-tauri/src/barcode.rs`, búsqueda en Open Food Facts)
    → mismo abort. El NPE de la WebView del splash ya estaba corregido en 0.9.6;
    este segundo bug estaba oculto debajo.
  - Escritorio no se ve afectado: ahí el platform-verifier sí se inicializa
    (Linux/Windows/macOS usan la plataforma directamente).
- **Solución aplicada**: `src-tauri/Cargo.toml` usa `reqwest 0.12` con la
  feature `rustls-tls-webpki-roots` (raíces de Mozilla). Es la misma pila que
  usa `tauri-plugin-http` (que funciona en Android) y no necesita la
  inicialización JNI. GitHub y Open Food Facts usan ISRG/DigiCert, incluidas en
  webpki-roots, así que la verificación de certificados sigue funcionando.
- Regla para el futuro: **ninguna dependencia nueva con reqwest 0.13 +
  `rustls`** en un build Android. Si hace falta HTTPS desde Rust: reqwest 0.12
  `rustls-tls-webpki-roots` o pasarlo por `tauri-plugin-http`.

## 2. Cambios hechos (mapa de archivos)

- [x] `src-tauri/Cargo.toml`: reqwest 0.12.28 + `rustls-tls-webpki-roots` con
  comentario explicando el porqué (los cierres).
- [x] Verificación cartera de comandos HTTP: `fetch_update_manifest`,
  `download_android_apk` (`commands.rs`) y `lookup_barcode` (`barcode.rs`) usan
  la misma API de reqwest; no requirieron cambios de código.
- [x] `src-tauri/src/vault.rs`: carpeta de copias `Longlife` → `longlife`
  (constante `BACKUP_DIR`), migración automática en escritorio y lectura
  dual-nueva/heredada en escritorio y SAF. 3 pruebas nuevas.
- [x] `src/App.tsx`, `src/vault.ts`: textos de la UI con `longlife` en minúsculas.
- [x] `src-tauri/tauri.conf.json`: `bundle.android.minSdkVersion: 33`.
- [x] `src-tauri/gen/android/app/build.gradle.kts`: `minSdk = 33` (local;
  `gen/` está en `.gitignore`, el workflow regenera el proyecto desde
  `tauri.conf.json`, de ahí viene el minSdk con `tauri android init`).
- [x] `src-tauri/Cargo.toml`: fuera la feature `legacy-storage-permission` de
  `tauri-plugin-android-fs` (solo servía para Android ≤ 9).
- [x] `scripts/patch-android-manifest.mjs`: ya no añade WRITE/READ_EXTERNAL
  (`maxSdkVersion="28"`); solo CAMERA + `uses-feature`.
- [x] `src-tauri/gen/android/app/src/main/AndroidManifest.xml` (local): sin las
  dos líneas de almacenamiento heredado.
- [x] `src/components/UpdatePanel.tsx`: fuera el aviso de «Android 9 o anterior».
- [x] `README.md`, `README.es.md`, `DECISIONES.md`, `docs/AVANCES.md` actualizados.
- [x] Verificación del lado del servidor en línea (2026-10-30, solo lectura):
  `latest.json` responde 200 con `version 0.9.6` y `android-aarch64`
  (URL, size y sha256); el `Content-Length` del APK publicado (72 506 957) coincide
  con el `size` del manifiesto. La petición en sí está bien; el cierre era el
  cliente TLS, no el servidor.

## 3. Verificación sin internet (todo local)

```bash
# Frontend
npm test                 # 57 pruebas esperadas
npx tsc --noEmit         # sin errores
npm run build            # bundle de producción

# Backend Rust
cd src-tauri
cargo test               # 25 pruebas esperadas (incluye 3 nuevas de longlife)
cargo clippy -- -D warnings

# Confirmar la versión/TLS de reqwest en el lock
grep -n 'reqwest' src-tauri/Cargo.lock | head
# debe aparecer reqwest 0.12.28 como la versión que usa better-tracker;
# 0.13.x solo puede aparecer como dependencia ajena de tauri/updater (sin TLS).

# Comprobar el minSdk del APK (una vez hecho el build)
cd src-tauri/gen/android && ./gradlew :app:assembleRelease   # usa caché local, sin red
SDK="$ANDROID_HOME/build-tools/34.0.0"   # ajustar a la build-tools instalada
"$SDK/aapt2" dump badging app/build/outputs/apk/release/*.apk | grep sdkVersion
# Esperado: sdkVersion:'33'
grep -rn "minSdk" src-tauri/gen/android/app/build.gradle.kts
node scripts/patch-android-manifest.mjs          # idempotente, sin almacenamiento legacy
```

Comprobaciones del manifiesto en `src-tauri/src/vault.rs`:

- `pub const BACKUP_DIR: &str = "longlife";` y `LEGACY_BACKUP_DIR = "Longlife"`.
- Las copias nuevas se escriben SIEMPRE en `longlife` (escritorio y SAF).
- Escritorio: `migrate_local_backup_dir` renombra una vez al abrir la bóveda.
- Si ambas carpetas existen: ambas se listan, deduplicadas por
  `<device>/<fecha>`; restaurar resuelve primero en `longlife` y luego en
  `Longlife`; «Borrar todas las copias» limpia las dos.

## 4. Verificación de la migración longlife sin internet (escritorio)

1. Copia de seguridad previa de la bóveda (sin tocar nada).
2. Renombrar a mano la carpeta de copias a `Longlife` (contenido intacto).
3. Abrir la app, elegir la bóveda, abrir Ajustes → Copias de seguridad.
4. Resultado esperado: la carpeta se llama `longlife` en disco, la lista muestra
   las mismas copias y la etiqueta «Copia antigua» no aparece con fecha/día.
5. Repetir el paso 2 pero creando TAMBIÉN una carpeta `longlife` con otra copia:
   ambas copias deben verse y ninguna repetirse.
6. En Android (SAF): la carpeta `Longlife` NO se renombra sola; debe seguir
   siendo legible en la lista. Las copias nuevas aparecen en `longlife/`.
   Moverla a mano con el explorador del sistema es opcional y seguro.

## 5. Verificación pendiente: Android físico (cuando haya dispositivo)

```bash
# Bitácora en vivo, filtrando los cierres
adb logcat -c
# usar la app (escáner, buscar actualizaciones) y luego:
adb logcat -d | grep -iE "better|panic|Fatal|SIGABRT|AndroidRuntime"
```

- [ ] Escáner: conceder permiso, abrir la cámara y leer un EAN/UPC real. La app
  NO debe cerrarse al encontrar el código (ese cierre era `lookup_barcode`).
- [ ] Escáner sin red: debe leer el código y fallar la búsqueda con un error
  correcto (no cierre). Con la bóveda ya vale, sin abrir la app de nuevo.
- [ ] Actualizaciones: Ajustes → Buscar actualizaciones. Con la app 0.9.6
  instalada y la última release 0.9.6 publicada debe responder «ya está
  actualizado» (sin cierre). Cuando exista una 0.9.7 en el release: descargar
  (`Descargas/BetterTracker/BetterTracker-0.9.7.apk`), comprobar el tamaño
  (~72 MB), instalar a mano y comprobar que abre.
- [ ] Instalación desde una bóveda de SAF: copia creada en el móvil restaurada
  desde el PC (pendiente histórico de la checklist de cámara).
- [ ] minSdk: probar de instalar el APK en un Android 12 o anterior → el sistema
  debe rechazarlo («incompatible»).

## 6. Si hay que rehacer el build de Android en frío

```bash
npm run icons               # regenera iconos escritorio + mipmaps
npm run tauri android init -- --ci   # regenera gen/ leyendo tauri.conf.json (minSdk 33)
node scripts/patch-android-manifest.mjs
npm run tauri android build -- --apk
```

- El `minSdk` puede venir de `bundle.android.minSdkVersion`; si el CLI lo ignorara,
  editar a mano `src-tauri/gen/android/app/build.gradle.kts` (`minSdk = 33`).
- Firma: `scripts/verify-signing.sh` + variables `ANDROID_*` (ver
  `docs/RELEASE_SECRETS.md`). En release la firma es obligatoria en CI.
- Compilación de ejemplo de la CI: `docs/VERSIONING.md` y el workflow de release
  (`"Patch Android manifest (camera)"` sigue siendo necesario, ya sin permisos
  de almacenamiento).

## 7. Próximo release (checklist de Versioning)

- [ ] Actualizar `VERSION` + `scripts/sync-version.mjs` + nota en
  `docs/releases/v<VERSION>.md` mencionando:
  cierres de Android corregidos (reqwest/TLS), `longlife` en minúsculas con
  migración, minSdk 33 (Android 13+).
- [ ] La nota del manifiesto debería decir «requiere Android 13 o superior».
- [ ] Verificar en el release publicado el `latest.json`: entrada
  `android-aarch64` con `size`/`sha256` correctos; descarga de la APK con
  `Content-Length` igual al `size` del `latest.json`.

## 8. Pendientes históricos que no se tocan aquí

- Verificación en Android físico (sección 5).
- Restaurar una copia creada en el móvil desde el PC.
- En SAF, borrar copias deja carpetas vacías (el plugin no expone borrado de
  directorios); documentado en `docs/AVANCES.md`.
