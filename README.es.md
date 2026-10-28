# Better Tracker

Entrenamiento, composición corporal, nutrición y carga semanal en una app de escritorio local-first.

Versión actual: **0.9.3**.

[Read in English](README.md)

## Plataformas

Better Tracker se compila y publica para Linux, Windows y Android.

| Sistema | Artefactos | Actualización integrada |
| --- | --- | --- |
| Linux x86_64 | `.AppImage`, `.deb`, `.rpm` | Solo AppImage. `.deb` y `.rpm` se actualizan instalando el paquete nuevo. |
| Windows 10/11 x64 | NSIS `.exe` (instalación por usuario), `.msi` | NSIS. |
| Android (arm64) | `.apk` firmada | La app descarga y verifica la APK, la guarda en `Descargas/BetterTracker` y el usuario la instala manualmente. |

En Linux la app usa GTK/WebKit y funciona en Wayland de forma nativa. Si un driver propietario provoca fallos de renderizado, iníciala con `WEBKIT_DISABLE_DMABUF_RENDERER=1`.

## Funciones

### Panel

- Resumen diario con peso actual, IMC, porcentaje de grasa estimado y volumen de entrenamiento de la semana.
- Registro rápido de peso y formulario completo de medidas sin salir del panel.
- Resumen de composición corporal, objetivos de macros, agua y fibra.
- Banner de agua con botones rápidos (+250 ml, +500 ml, +1 L) que guardan el total del día en el log de ingesta al momento.
- Modelo de saciedad dual: presión gástrica según el volumen de comida y señal bioquímica según proteína, fibra y composición de las comidas.
- Gráfico de descenso de grasa basado en las medidas guardadas, sin depender de la báscula.
- Resumen semanal de entrenamiento con mapa de calor muscular y zona más cargada.
- Alertas de sobreentrenamiento por zona, comparando series y minutos semanales con rangos razonables.
- Recordatorios locales mientras la app está abierta.

### Entrenamiento

- Biblioteca de ejercicios con zonas musculares e instrucciones, más ejercicios personalizados guardados en la bóveda.
- Rutinas reutilizables con ejercicios ordenados, series y repeticiones objetivo, y notas.
- Plan semanal para asignar rutinas a los días y mantener el calendario visible.
- Mesociclos con duración, objetivo y progresión semanal.
- Sesión en vivo con series, repeticiones, peso, RPE, temporizador de descanso y duración.
- Detección automática de marcas personales cuando una serie supera el mejor peso anterior del ejercicio.
- Calendario de sesiones, sesiones recientes, carga semanal y rendimiento por ejercicio.
- Mapa de calor muscular, alertas de carga, carga por zona, marcas personales y progreso por zona.
- Historial de ejercicios y entrenamientos integrado con la bóveda append-only.

### Historial

- Registro completo de sesiones con fecha, rutina, duración, RPE y todas las series.
- Vistas de entrenamientos y marcas personales con filtros.
- Borrado visible de registros individuales o de todo el historial, implementado como eventos nuevos en la bóveda y no como reescritura destructiva.

### Figura corporal

- Silueta adaptativa cuya forma sigue las circunferencias guardadas; los nodos se pueden arrastrar para previsualizar cambios.
- Medidas de peso, altura, edad, sexo, cuello, pecho, cintura, cadera, brazo, muslo, pantorrilla y muñeca.
- Estimaciones de grasa con RFM, US Navy, Deurenberg y CUN-BAE, mostrando los métodos disponibles por separado y su media.
- IMC, cintura/cadera, cintura/altura, masa grasa y masa magra.
- TMB con Mifflin-St Jeor, Katch-McArdle y Cunningham cuando hay datos suficientes.
- TDEE estimado y tendencia de grasa. El porcentaje de grasa y la cintura se pueden seguir solo con medidas, sin báscula; la masa grasa en kg aparece cuando también hay peso.

### Nutrición

- Base local con más de 200 alimentos comunes en 16 categorías.
- Búsqueda sin acentos, filtros por categoría y comidas para desayuno, comida, cena y snack.
- Alimentos personalizados guardados en la bóveda y disponibles en sesiones posteriores.
- Cantidades en gramos, mililitros, unidades, tazas, cucharadas, cucharaditas, porciones, rebanadas, vasos, latas, botellas, filetes y puñados.
- Cálculo dinámico de calorías, proteína, carbohidratos, grasas y fibra según cantidad y medida.
- Borrador diario efímero: se borra al cambiar el día y nunca se convierte en historial permanente por sí solo.
- Un único log de nutrición por fecha. Guardar de nuevo el mismo día actualiza el log de ese día de forma determinista y conserva el historial append-only.
- Ajuste manual opcional de macros, agua y los indicadores de saciedad dual.
- Valores nutricionales aproximados, pensados para estimar y no como prescripción médica o dietética.

## Datos y privacidad

- No hay cuentas, dependencia de la nube, telemetría ni sincronización LAN/P2P.
- La bóveda es una carpeta elegida por ti. Todos los datos de la app viven en `<bóveda>/omega`, y los eventos se guardan en JSONL append-only por dispositivo (`omega/devices/<id>/events.jsonl`).
- En Android la bóveda se elige con el selector de carpetas del sistema (SAF) y el permiso de lectura/escritura se conserva entre reinicios.
- La app crea una copia idéntica de `omega` al día en `<bóveda>/Longlife/<AAAA-MM-DD>` y conserva las 7 más recientes. `Longlife` nunca se lee automáticamente; para restaurar, mueve el contenido de una copia a `omega` manualmente.
- Los ajustes incluyen una acción de alto riesgo para borrar todas las copias de `Longlife`. Pide confirmación, no se puede deshacer y la copia diaria no se recrea hasta el día siguiente.
- No hay cifrado. No se guardan fotos ni archivos: el pegado se limita a texto plano.
- Las únicas conexiones de red son la comprobación **manual** de actualizaciones y la consulta opcional a Open Food Facts al escanear un código. No se ejecutan en segundo plano.
- En escritorio las actualizaciones se firman con minisign y se verifican antes de instalar. En Android se descarga la APK de la release, se verifica su SHA-256 publicado y se guarda en Descargas para instalarla manualmente.
- Al ser JSONL append-only, los datos siguen siendo legibles y portables sin la app.

## Compilar

Requisitos: Node 22, Rust estable y las dependencias de Tauri 2 para tu sistema.

```bash
npm ci
npm run build            # TypeScript + Vite
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build      # paquete de la plataforma actual
```

Para desarrollo: `npm run tauri dev`.

La versión vive en `VERSION`. Después de cambiarla:

```bash
node scripts/sync-version.mjs
```

El workflow de release compila Linux, Windows y Android, firma los artefactos del updater y la APK, genera `latest.json` con la entrada `android-aarch64` (URL, tamaño y SHA-256), `release-manifest.json` y `SHA256SUMS.txt`, y publica el release. Consulta [docs/VERSIONING.md](docs/VERSIONING.md) y [docs/RELEASE_SECRETS.md](docs/RELEASE_SECRETS.md).

## Verificación

- `npm test` ejecuta las pruebas unitarias de métricas, alimentos, alimentos personalizados y borrador diario.
- `npx tsc --noEmit` comprueba tipos.
- `cargo test`, `cargo clippy` y el workflow de CI comprueban Rust.
- El workflow de release verifica los artefactos de cada plataforma y exige las firmas del updater antes de publicar.

## Limitaciones conocidas

- La bóveda no está cifrada.
- El certificado de firma de código de Windows es opcional y no está incluido en el repositorio; sin él los instaladores se publican sin firma de sistema, aunque el updater sí va firmado.
- El build de Windows se verifica en GitHub Actions; Linux se verifica localmente y en CI.
- Las estimaciones de composición y carga son orientativas, no diagnóstico médico.
- La base de alimentos incluida usa valores aproximados por 100 g/ml y sirve para estimar; no sustituye etiquetas, tablas oficiales ni asesoramiento profesional.

## Licencia

MIT. Consulta [LICENSE](LICENSE).
