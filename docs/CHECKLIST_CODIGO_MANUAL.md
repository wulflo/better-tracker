# Checklist: reemplazo del escáner por entrada manual del código de barras

> Objetivo: eliminar por completo la cámara y la carga de imágenes para leer
> códigos de barras, y dejar una entrada manual de dígitos (integrada en el
> buscador de Ingesta) como única vía para buscar productos por EAN/UPC.
>
> Fecha de inicio: 2026-11-03. Base del repo: `0.9.8` (`057e3cc`).
> Este documento está pensado para retomar el trabajo **sin internet** y sin
> romper el código. Si algo se corta, lee la sección 1 y sigue desde la primera
> casilla sin marcar de la sección 5.

## 1. Contexto para retomar en 30 segundos

Pega esto al inicio de una nueva conversación:

```text
Estamos en /home/alonso/Documentos/Repositorios/better-tracker (Better Fitness Tracker
0.9.8, base git 057e3cc). Lee docs/CHECKLIST_CODIGO_MANUAL.md y continúa desde
la primera casilla sin marcar de la sección 5. El objetivo es quitar la cámara
y la imagen del escáner y dejar solo la entrada manual de dígitos del código de
barras. No hagas git reset --hard ni borres datos de usuario. Antes de tocar
código, revisa `git status --short` por si hay trabajo previo.
```

## 2. Decisiones ya cerradas con el usuario

| Tema | Decisión |
| --- | --- |
| Alcance | Reemplazo total: fuera cámara y fuera carga de imagen. |
| Interfaz | Campo numérico siempre visible, integrado en el buscador de Ingesta, con botón «Buscar». |
| Validación | Mantener la actual: limpiar a dígitos, aceptar 6–14, avisar si falla el dígito de control y permitir «Buscar igual». |
| Plataformas | Android y escritorio con el mismo comportamiento. |
| Limpieza técnica | Completa: dependencias JS, plugin nativo, permiso `CAMERA`, script del manifiesto, capability y archivos/tests de imagen. |
| Lector físico USB/Bluetooth | Sí: el campo acepta dígitos + Enter y envía la búsqueda automáticamente. |
| Checklist | Este archivo dedicado. |

## 3. Qué NO se debe tocar

1. **La búsqueda del producto se queda**: `lookup_barcode` en Rust
   (`src-tauri/src/barcode.rs`), `lookupBarcode` en `src/vault.ts`, el catálogo
   local (`src/barcodeCatalog.ts`, `src/data/barcodeCatalog*.json`) y Open Food
   Facts.
2. **La validación GTIN se queda**: `normalizeBarcode`, `isGtinLength`,
   `validBarcodeChecksum`, `barcodeVariants` y `findFoodByBarcode` en
   `src/foodDb.ts`, con sus pruebas.
3. **No borrar datos de usuario**: `omega/`, `longlife/`, bóvedas ni copias.
4. **No tocar lo generado**: `src-tauri/gen/**`, `dist/`, `node_modules/`,
   `src-tauri/target/`.
5. **No cambiar la versión** salvo petición expresa. Este trabajo no necesita
   release para funcionar.
6. **Mantener el comportamiento al no encontrar producto**: abrir el formulario
   de alimento nuevo con el código ya rellenado.
7. **Mantener los textos en español** como el resto de componentes; no hace
   falta tocar `i18n.tsx`.

## 4. Mapa de archivos

### Se modifica
- `src/components/FoodLog.tsx` — quita el modal y el componente de escáner; añade
  el campo manual integrado y conserva `handleBarcode`/`processBarcode`.
- `src/styles.css` — quita estilos del modal/cámara; ajusta la fila del código.
- `package.json` y `package-lock.json` — quitan `@tauri-apps/plugin-barcode-scanner`,
  `@zxing/browser` y `@zxing/library` (y transitivas huérfanas).
- `src-tauri/Cargo.toml` y `src-tauri/Cargo.lock` — quitan el plugin local.
- `src-tauri/src/lib.rs` — quita el registro del plugin en Android.
- `src-tauri/capabilities/mobile.json` — quita `barcode-scanner:default` y
  actualiza la descripción.
- `.github/workflows/release.yml` — quita el parche del manifiesto y la
  comprobación de `CAMERA`.
- `README.md`, `README.es.md`, `DECISIONES.md`, `docs/AVANCES.md` — actualizan
  la descripción del escáner.
- `package.json` — quita los scripts `android:manifest`/`android:prepare` si ya
  no hacen falta (los iconos se generan con `npm run icons`).

### Se elimina
- `src/components/BarcodeScanner.tsx`
- `src/barcodeImage.ts`
- `src/barcodeImage.test.ts`
- `scripts/patch-android-manifest.mjs`
- `src-tauri/plugins/barcode-scanner/` (copia local completa del plugin)

### Se conserva
- `src-tauri/src/barcode.rs` (consulta de producto).
- `src/barcodeCatalog.ts`, `src/barcodeCatalog.test.ts`, `src/data/barcodeCatalog*.json`.
- `src/foodDb.ts` y `src/foodDb.test.ts` (validación y variantes).
- El icono `scan` de `src/components/Icons.tsx` como icono decorativo.

## 5. Fases y casillas

> Marca solo lo que esté realmente verificado. Si se corta la red, retoma en la
> primera casilla sin marcar.

### Fase 0 — Punto de partida seguro
- [x] `git status --short` revisado: no hay cambios ajenos que se puedan pisar.
- [x] `git diff --stat` guardado o revisado (punto de retorno: `057e3cc`).
- [x] Confirmado que no hay otra pantalla que use el escáner: solo
      `src/components/FoodLog.tsx` importa `BarcodeScanner`.
      Comprobar con `grep -rn "BarcodeScanner\|barcode-scanner\|@zxing" src`.

### Fase 1 — Interfaz manual en Ingesta
- [x] `FoodLog.tsx` ya no importa `BarcodeScanner`.
- [x] Eliminado el estado `scannerOpen` y el modal «Escanear producto».
- [x] Añadido estado del campo (`barcodeInput`) y de búsqueda
      (`barcodeBusy`, `barcodeNotice`).
- [x] Campo `inputMode="numeric"`, `autoComplete="off"`, longitud máxima 14,
      que limpia todo lo que no sea dígito (permite pegar con espacios/guiones).
- [x] `Enter` envía la búsqueda (soporta lectores físicos que teclean + Enter).
- [x] Al enviar se limpia el campo y se llama al mismo `handleBarcode`.
- [x] Se conserva el aviso de dígito de control con «Buscar igual»/«Descartar».
- [x] Se conserva el flujo: base local → catálogo local → Open Food Facts →
      formulario manual con el código rellenado.
- [x] Texto de ayuda visible: 6–14 dígitos, sin cámara, sin imagen.

### Fase 2 — Limpieza del frontend
- [x] Borrado `src/components/BarcodeScanner.tsx`.
- [x] Borrados `src/barcodeImage.ts` y `src/barcodeImage.test.ts`.
- [x] Quitados de `src/styles.css` `.barcode-scanner` y `.barcode-video`.
- [x] Renombrados/ajustados `.food-scan-button` y la fila del código (incluido
      el bloque responsive de móvil).
- [x] `grep -rn "barcodeImage\|BarcodeScanner\|@zxing\|plugin-barcode-scanner" src`
      no devuelve nada.

### Fase 3 — Dependencias JavaScript
- [x] Quitadas de `package.json`: `@tauri-apps/plugin-barcode-scanner`,
      `@zxing/browser`, `@zxing/library`.
- [x] Quitadas de la raíz de `package-lock.json` las mismas dependencias.
- [x] Quitadas del lock sus entradas `node_modules/...` y las transitivas que
      queden huérfanas (`@zxing/text-encoding`, `ts-custom-error`).
- [x] `grep -n "zxing\|barcode-scanner" package.json package-lock.json` vacío.
- [x] Si hay npm: `npm install --package-lock-only --offline` (o `npm ci`) sin
      errores de desincronización. Si no hay npm, anotarlo y validar el lock a
      mano (JSON válido y sin referencias).

### Fase 4 — Limpieza nativa (Android/Rust)
- [x] Quitada la dependencia `tauri-plugin-barcode-scanner` de
      `src-tauri/Cargo.toml`.
- [x] Quitado `.plugin(tauri_plugin_barcode_scanner::init())` de
      `src-tauri/src/lib.rs`.
- [x] Borrado `src-tauri/plugins/barcode-scanner/`.
- [x] `tauri-plugin-barcode-scanner` eliminado de `src-tauri/Cargo.lock`
      (y de la lista de dependencias de `better-tracker`).
- [x] `barcode-scanner:default` eliminado de
      `src-tauri/capabilities/mobile.json`.
- [x] Confirmado que ya no queda ningún permiso `CAMERA` en el proyecto
      (`grep -rn "CAMERA\|camera" src-tauri scripts .github` solo debe mostrar
      textos históricos de docs, no configuración activa).
- [x] Si existe un `src-tauri/gen/android` de un build anterior, recuerda que no
      está versionado: regenerarlo (o borrar el permiso `CAMERA` a mano) para
      que el APK local tampoco lo lleve. En CI se parte de un `gen/` limpio.
- [x] `Cargo.lock` actualizado con `cargo metadata` (se usó online porque el
      índice offline estaba incompleto); no hubo cambios colaterales de versiones.

### Fase 5 — Scripts, CI y documentación
- [x] Borrado `scripts/patch-android-manifest.mjs`.
- [x] Quitados `android:manifest` y `android:prepare` de `package.json`; los
      builds de Android usan `npm run icons` para los iconos.
- [x] Quitado el paso «Patch Android manifest (camera)» de
      `.github/workflows/release.yml`.
- [x] Quitada la comprobación de `android.permission.CAMERA` del APK en el
      workflow.
- [x] README ES/EN: la viñeta del escáner describe la entrada manual, no la
      cámara ni la imagen.
- [x] README ES/EN: el bloque de Android ya no menciona `CAMERA` ni
      `android:prepare`.
- [x] `DECISIONES.md`: la sección «Escáner de códigos de barras» explica la
      entrada manual y que se retiraron cámara/imagen/permiso.
- [x] `docs/AVANCES.md`: añadida una entrada breve con el cambio.
- [x] `grep -rn "patch-android-manifest\|android:prepare\|CAMERA" README* DECISIONES.md docs .github package.json scripts`
      solo muestra documentos históricos de releases, no instrucciones activas.

### Fase 6 — Verificación
- [x] `npx tsc --noEmit` sin errores (si hay Node/npm).
- [x] `npm test` sin errores; el número baja porque se borran las 7 pruebas de
      `barcodeImage`, pero todas las de `foodDb`/catálogo siguen pasando.
- [x] `npm run build` genera `dist/`.
- [x] `cargo test --manifest-path src-tauri/Cargo.toml` sin errores.
- [x] `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`.
- [x] Prueba manual escritorio: escribir un EAN-13 real → encuentra el producto
      o abre el formulario con el código.
- [x] Prueba manual: código con dígito de control incorrecto → aviso y «Buscar
      igual» funciona.
- [x] Prueba manual: pegar `8 412345 678905` o `8-412345-678905` → se normaliza.
- [ ] Prueba manual: lector físico USB/Bluetooth que termina en Enter → busca.
      *(Implementado; pendiente de probar con hardware real.)*
- [ ] Prueba manual Android (si hay dispositivo): mismo flujo y **no** aparece
      solicitud de permiso de cámara.
- [x] `git diff --stat` revisado: no hay archivos generados ni datos de usuario.

### Fase 7 — Cierre
- [ ] Commit atómico con mensaje sugerido:
      `refactor(food): sustituir escáner por entrada manual de código`.
- [ ] `git status --short` limpio (salvo este checklist si se decidió no
      versionarlo).
- [x] Actualizar esta checklist marcando el estado final.

## 6. Criterios de aceptación

El trabajo está terminado cuando:

1. En Ingesta se puede escribir o pegar un código de 6–14 dígitos y buscarlo
   sin abrir cámara ni modal.
2. Un lector físico que escribe dígitos + Enter dispara la búsqueda.
3. Un código válido del catálogo local u Open Food Facts selecciona el producto.
4. Un código desconocido abre «Añadir alimento a la base» con el código puesto.
5. Un dígito de control incorrecto muestra el aviso y permite buscar igual.
6. No queda ninguna referencia activa a cámara, ZXing, plugin de escáner ni
   permiso `CAMERA`.
7. `npm test`, `tsc`, `npm run build`, `cargo test` y `clippy` pasan (cuando el
   entorno tenga Node y las dependencias).

## 7. Comandos útiles (copiar y pegar)

```bash
# Estado y búsqueda de restos
git status --short
git diff --stat
grep -rn "BarcodeScanner\|barcodeImage\|@zxing\|plugin-barcode-scanner" src package.json package-lock.json
grep -rn "CAMERA\|patch-android-manifest\|android:prepare" src-tauri scripts .github package.json README.md README.es.md DECISIONES.md

# Verificación frontend (requiere Node 22 y npm ci)
npx tsc --noEmit
npm test
npm run build

# Verificación Rust (offline si el registro está en caché)
cargo test --manifest-path src-tauri/Cargo.toml --offline
cargo clippy --manifest-path src-tauri/Cargo.toml --offline -- -D warnings

# Android (requiere SDK + JDK 21; no es necesario para validar el cambio)
npm run tauri android init -- --ci
npm run icons
npm run tauri android build -- --apk --ci
```

## 8. Reanudación y reversión

- **Punto de retorno**: `057e3cc` (antes de este trabajo). No usar
  `git reset --hard` si hay otros cambios.
- Para revertir solo un archivo: `git restore -- <archivo>` únicamente si se
  confirmó que no contiene trabajo del usuario.
- Si se corta internet a mitad:
  1. `git status --short`.
  2. Abrir este archivo y buscar la primera casilla sin marcar.
  3. No ejecutar `npm ci` ni `cargo` si no hay red; seguir con ediciones y dejar
     la verificación para cuando vuelva.
  4. La copia local del plugin ya fue eliminada en esta sesión. Si hiciera falta
     revertirla, usar `git restore -- src-tauri/plugins/barcode-scanner` (nunca
     antes de confirmar que no hay trabajo del usuario en esos archivos).
- Este cambio **no** necesita red para el código: solo para instalar
  dependencias o compilar Rust si falta caché. La búsqueda de productos seguirá
  necesitando red solo cuando el código no esté en la base local ni en el
  catálogo local.

## 9. Resultado de esta sesión (2026-11-03)

- Frontend verificado con Node 22 instalado localmente en `/tmp/opencode/node`
  (el sistema no traía `node`/`npm`): `npm ci` sin errores, `npx tsc --noEmit`
  correcto, `npm test` → **62 pruebas en 9 archivos** (bajan 7 por la retirada de
  `barcodeImage.test.ts`), `npm run build` correcto.
- Rust verificado: `cargo test --offline` → **25 pruebas**, todas correctas.
  `cargo clippy --offline -- -D warnings` correcto tras instalar el componente
  `clippy` con rustup.
- `cargo metadata` se ejecutó **online** porque el índice offline estaba
  incompleto; el `Cargo.lock` quedó solo con la retirada del plugin, sin cambios
  colaterales de versiones.
- Prueba manual en navegador (Vite + bóveda mock):
  - El campo «Código de barras» aparece integrado bajo el buscador de alimentos.
  - `1000000040258` encuentra «granola» en el catálogo local.
  - `1000000040259` muestra el aviso de dígito de control con «Buscar igual» y
    «Descartar».
- Pendiente real: probar un lector USB/Bluetooth físico y un Android real, y
  decidir el commit final. No queda ninguna dependencia, permiso ni código de
  cámara activo.
