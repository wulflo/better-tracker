# Better Tracker

Entrenamiento, composición corporal, nutrición y carga semanal en una app de escritorio local-first.

Versión actual: **0.8.1**.

## Plataformas

| Sistema | Artefactos | Actualización integrada |
| --- | --- | --- |
| Linux x86_64 | `.AppImage`, `.deb`, `.rpm` | Solo AppImage. `.deb`/`.rpm` se actualizan con el paquete nuevo. |
| Windows 10/11 x64 | NSIS `.exe` (instalación por usuario), `.msi` | NSIS. |
| macOS 11+ (Intel y Apple Silicon) | `.dmg` universal | App firmada; el actualizador descarga el `.app.tar.gz` firmado. |

En Linux la app usa GTK/WebKit y funciona en Wayland de forma nativa. Si un driver propietario provoca fallos de renderizado, prueba a iniciar con `WEBKIT_DISABLE_DMABUF_RENDERER=1`.

## Qué incluye

- **Panel**: peso, composición, macros, agua, saciedad dual, progreso de grasa, recordatorios y alertas de carga.
- **Entrenamiento**: biblioteca de ejercicios, rutinas, plan semanal, sesión en vivo, calendario y progreso.
- **Historial**: sesiones, entrenamientos, marcas personales y borrado visible.
- **Figura corporal**: silueta adaptativa, circunferencias, estimaciones de grasa y gráfico de descenso de grasa. El % de grasa se puede seguir solo con medidas (cintura + altura), sin báscula.
- **Ingesta diaria**: buscador local con más de 200 alimentos comunes, cantidades en gramos, mililitros, unidades, tazas, cucharadas, porciones y otras medidas, cálculo dinámico de calorías/macros y alimentos personalizados guardados en la bóveda.
- **Borrador de comidas y log diario**: las comidas del día se guardan como borrador efímero y se borran al terminar el día. Al guardar la ingesta se crea un único log por fecha; volver a guardar el mismo día lo sobrescribe lógicamente sin borrar el historial append-only.

## Datos y privacidad

- No hay cuentas ni telemetría.
- La bóveda es una carpeta elegida por ti. Los eventos se guardan en JSONL append-only por dispositivo (`devices/<id>/events.jsonl`).
- No hay cifrado activo. No se guardan fotos ni archivos: el pegado se limita a texto plano.
- La única conexión de red es la comprobación **manual** de actualizaciones desde Ajustes. No se ejecuta en segundo plano.
- Las actualizaciones se firman con minisign y se verifican antes de instalar. El consentimiento es explícito: buscar, descargar e instalar.
- La bóveda se puede sincronizar con Syncthing, Nextcloud, Drive o Samba. Evita sincronizar archivos temporales.

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

El workflow de release compila Linux, Windows y macOS, firma los artefactos del updater, genera `latest.json`, `release-manifest.json` y `SHA256SUMS.txt`, y publica el release. Consulta [docs/VERSIONING.md](docs/VERSIONING.md) y [docs/RELEASE_SECRETS.md](docs/RELEASE_SECRETS.md).

## Verificación

- `npm test` ejecuta las pruebas unitarias de métricas, alimentos y borrador diario.
- `npx tsc --noEmit` comprueba tipos.
- `cargo test`, `cargo clippy` y el workflow de CI comprueban Rust.
- El workflow de release verifica los artefactos de cada plataforma y exige las firmas del updater.

## Limitaciones conocidas

- La bóveda no está cifrada.
- Los certificados de firma de código de Windows y macOS son opcionales y no están incluidos en el repositorio; sin ellos los instaladores se publican sin firma de sistema, aunque el updater sí va firmado.
- Los builds de Windows y macOS se verifican en GitHub Actions, no en esta máquina Linux.
- Las estimaciones de composición y carga son orientativas, no diagnóstico médico.
- La base de alimentos incluida usa valores aproximados por 100 g/ml y sirve para estimar; no sustituye etiquetas, tablas oficiales ni asesoramiento profesional.
