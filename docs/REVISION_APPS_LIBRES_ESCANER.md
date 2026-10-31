# Revisión complementaria: escáner y datos frente a apps libres

> Fecha: 2026-10-31. Comparación de **Better Tracker 0.9.7** con tres apps
> libres que ya integraron el mismo problema (escáner de códigos + base de
> alimentos + datos locales): **Waistline** (GPLv3, F-Droid), **OpenNutriTracker**
> (GPLv3, Flutter) y **Food You** (GPLv3+, F-Droid), más el propio
> `tauri-plugin-barcode-scanner` oficial (2.5.3 / 2.6).
> Propósito: detectar lo que nos falta antes de la próxima release.

## 1. Con qué se compara

| App | Plataforma/stack | Escáner | Datos |
| --- | --- | --- | --- |
| Waistline | Android nativo (Java) | Cámara + Open Food Facts | Todo local, export/import |
| OpenNutriTracker | Flutter, iOS+Android | Escaneo, **pegado manual del código**, y adjuntar código a alimentos propios | Cifrado en el dispositivo; OFF + USDA + BLS seleccionables; export JSON/CSV |
| Food You | Android nativo (Kotlin), Material You | Escaneo con la cámara | OFF + USDA + base suiza; en 3.4.7 tuvo que añadir **credenciales de OFF** porque su API de búsqueda empezó a exigirlas |

## 2. Lo que YA cubrimos (paridad o mejor)

- **Local-first**: todo en la bóveda (`omega`) con copias `longlife/`; ni
  Waistline ni OpenNutriTracker van más allá de export/import manual.
- **Catálogo local AR/PE/MX (~521 entradas)** que ninguno de los tres tiene:
  da respuesta sin red y sin exponer el código a nadie.
- **Variantes UPC/EAN/GTIN** antes de decir «no existe» (12/13/14 dígitos, con
  y sin ceros) en Rust y en navegador; la mayoría no lo hace y falla con
  UPC-A de 12 dígitos, un clásico de envases americanos.
- **Adjuntar el código a alimentos propios** (OpenNutriTracker lo publicita;
  nosotros lo hacemos al guardar un alimento personalizado con `barcode`).
- **Dedup**: repite el scan de un producto ya guardado → «Producto ya guardado»
  sin pedir nada a la red.
- **Flujo de permisos**: check → request → mensaje claro → **Abrir ajustes**,
  igual que las apps Material; falta el *rationale* (ver 3.d).
- **Decodificación desde imagen** (nuevo, escritorio): la app de OFF hace lo
  mismo desde la galería; nosotros con validación de MIME/tamaño.
- **Privacidad documentada**: solo sale el código de barras, hacia OFF, con
  User-Agent propio en Rust; sin telemetría. OpenNutriTracker comparte
  «fotos y actividad» según su ficha de Play; nosotros no.
- **Errores útiles** (sin `[object Object]`), cancel del escaneo soportado.

## 3. Lo que NOS FALTA (por orden de valor/coste)

### a) Validación de checksum EAN/UPC antes de consultar (barato, alto valor)
Hoy `normalizeBarcode` solo deja dígitos; un número mal tecleado arriba
dispara 2-4 peticiones reales a OFF (variantes). Las apps serias validan el
dígito de control GTIN (mod 10) en el cliente.
- Dónde: `src/foodDb.ts` (`normalizeBarcode`) + `handleBarcode` en
  `src/components/FoodLog.tsx`; mensaje «El código no es válido (dígito de
  control): revisa los dígitos» y opción de continuar.
- Prueba unitaria con códigos reales del catálogo (`src/barcodeCatalog.json`).

### b) Vibración al detectar el código (barato)
El plugin expone `vibrate()` y **no la llamamos** (solo `RestTimer` usa
`navigator.vibrate`, que además no aplica en el WebView Android).
- Dónde: en `BarcodeScanner.tsx`, al recibir resultado nativo, `vibrate()` con
  catch silencioso. Es el patrón de todas las apps comparadas.

### c) Escribir/pegar el código a mano en el modal del escáner (barato)
OpenNutriTracker lo promociona: «paste a barcode manually when the camera
struggles». Nosotros solo tenemos el campo de código dentro de «crear alimento
personalizado», que exige que el usuario ya haya cerrado el escáner.
- Dónde: `src/components/BarcodeScanner.tsx` — input numérico reutilizándo
  `onResult` (lo aplica el propio `handleBarcode`). Vale para móvil cuando el
  escáner falla y para escritorio sin webcam.

### d) Pantalla de justificación del permiso (rationale) (barato)
Manejamos `prompt-with-rationale` igual que `prompt` y pedimos el permiso
directo. Material pide explicar primero. Texto corto («usamos la cámara solo
para leer el código del envase; nada sale del equipo») antes de
`requestPermissions()`.

### e) Linterna (torch) con escaneo nativo (medio; requiere dependencia nueva)
Los escáneres de las apps comparadas tienen botón de flash; el nuestro no.
La copia del plugin ya deja preparado `getActiveCamera()` (lo consume el
plugin de torch por reflexión, ver comentario del companion en
`BarcodeScannerPlugin.kt`). Necesita `tauri-plugin-torch` o invocación
`CameraControl.enableTorch(true)` en Kotlin: **no hacerlo offline**, requiere
crates/npm nuevos (regla §4 del checklist de reanudación).

### f) Historial/chips de escaneos recientes en el modal (medio, opcional)
OpenNutriTracker muestra «recently logged items ready to re-add in one tap».
Ya deduplicamos, así que el valor es solo velocidad. Diferir.

### g) Cámara frontal / dirección (opcional, baja)
El plugin soporta `cameraDirection: "front"`; no hay UI para elegir. En
alimentos casi no se usa. Diferir.

### h) Endurecer la respuesta de OFF (opcional, bajo)
`barcode.rs` hace `.json()` sin tope de tamaño; el parser ya extrae solo los
campos necesarios (`product_for_barcode`), pero un cuerpo gigante igual entra
a memoria. Tope de bytes al leer (read parcial + límite) cuando se toque ese
archivo. Baja prioridad: OFF es TLS + dominio fijo.

## 4. Vigilancia (no aplicar hoy)

- **OFF: autenticación de la API de búsqueda.** Food You 3.4.7 (03-2026) tuvo
  que añadir credenciales de OFF *para su búsqueda por nombre*. Nosotros solo
  usamos la **API de producto por código** (`/api/v2/product/<código>.json`),
  que sigue abierta. Si algún día se añade búsqueda por nombre contra OFF,
  habrá que soportar credenciales opcionales + rate limits.
- **Contribuir el producto a OFF desde la app** (lo hace Waistline):
  contradice el perfil local/sin telemetría de esta app; decidir NO por ahora,
  y documentarlo en `DECISIONES.md` si se pregunta.
- **GS1 DataBar** (alimentos frescos): el plugin 2.6 lo soporta solo iOS 15.4+;
  Android no lo soporta. No pedirlo en la UI hasta que el nativo lo soporte.

## 5. Conclusión

El integración escáner↔datos está en paridad (o por encima) de las apps libres
comparadas. Los huecos reales son 4 arreglos **baratos** (a-d) más el flash
(e) que exige red para la dependencia. Sugerencia de partida en la próxima
sesión: a + b + c en un mismo commit (tolcan `FoodLog.tsx`/`BarcodeScanner.tsx`/`foodDb.ts`), d detrás, y e cuando haya internet.
