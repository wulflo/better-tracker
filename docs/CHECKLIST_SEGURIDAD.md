# Checklist de endurecimiento de seguridad

Estado: fases 1–3 implementadas; pendiente la verificación manual y la release de prueba de la fase 2.
Fecha de revisión: 2026-11-03.
Alcance: Better Fitness Tracker escritorio (Linux/Windows/macOS) y Android.

Este documento recoge las medidas de seguridad detectadas en la revisión
estática. Está pensado para aplicarse por fases, sin cambiar el formato de la
bóveda y sin romper el flujo de actualización.

## Decisiones tomadas

- **Cifrado de bóveda: fuera de alcance por ahora.** Los datos se consideran no
  críticos y el uso es personal/local. Se acepta el riesgo de que la bóveda y
  las copias estén en claro. Revisar esta decisión si se sincroniza la bóveda
  con la nube, se comparte el equipo o cambia el modelo de uso.
- **Clave de firma:** la clave privada de minisign está en GitHub Secrets y
  respaldada en Drive/Bitwarden. No reutilizarla para cifrado.
- **Sin cambios de formato:** las fases 1 y 2 no modifican los archivos de
  `omega/` ni de `longlife/`.
- **No mezclar con cambios de UI:** los cambios de sidebar/Panel que estén sin
  commitear deben quedar en un commit aparte.

## Orden recomendado

| Fase | Contenido | Riesgo |
|---|---|---|
| 0 | Baseline: build, tests y comprobación manual | Ninguno |
| 1 | CI, rutas de actualización, symlinks, permisos, CSP, capacidades, plugins, `PATH`, actions | Bajo |
| 2 | Firma y verificación de `.deb`/`.rpm` | Medio (cadena de release) |
| 3 | Aviso de privacidad y documentación de la bóveda en claro | Bajo |
| 4 | Cifrado de bóveda (opcional, solo si cambia el modelo de uso) | Alto |

Las referencias de línea son aproximadas y pueden desplazarse al editar.

---

## Fase 0 — Baseline

- [ ] Confirmar que el árbol de trabajo está limpio o que los cambios de UI
      están identificados y separados.
- [ ] Ejecutar la línea base:

```bash
npm ci
npx tsc --noEmit
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

- [ ] Abrir la app en modo navegador y en escritorio.
- [ ] Probar: crear un evento, leer la bóveda, hacer una copia y restaurarla.
- [ ] Probar el panel de actualizaciones con una release de prueba.

**Criterio de aceptación:** todo pasa antes de tocar seguridad, para poder
distinguir un fallo nuevo de uno previo.

---

## Fase 1 — Medidas sin cambio de formato

### 1.1 CI: que las vulnerabilidades bloqueen de verdad

**Evidencia**

- `.github/workflows/ci.yml:46-53` usa `|| true` al instalar y ejecutar
  `cargo-deny` y `cargo-audit`.
- `src-tauri/deny.toml` declara `vulnerability = "deny"`, pero en `[bans]`
  incluye `reqwest` y `hyper`, que el proyecto usa. Si se ejecutara de verdad,
  fallaría.
- No hay paso de `npm audit`.

**Cambios**

- [x] Quitar `|| true` de la instalación y de la ejecución de `cargo-deny`.
- [x] Quitar `|| true` de `cargo-audit`, o sustituirlo por `cargo deny check
      advisories` para no duplicar herramientas.
- [x] Corregir `[bans]` en `src-tauri/deny.toml`: eliminar `reqwest` y `hyper`
      de la lista de denegados. Si la intención era evitar clientes HTTP
      duplicados, usar `multiple-versions = "warn"` o `wrappers`.
- [x] Añadir `npm audit --omit=dev --audit-level=high` (o `osv-scanner`).
- [x] Documentar las excepciones con `# reason` si alguna es inevitable.

**Criterio de aceptación**

- `cargo deny check` pasa en el árbol actual.
- Un PR con una dependencia vulnerable conocida falla el job.
- `npm audit` falla con vulnerabilidades altas o críticas.

### 1.2 `open_update_file`: limitar ruta y quitar `cmd /C start`

**Evidencia**

- `src-tauri/src/commands.rs:313-328` solo comprueba que el archivo exista y
  tenga extensión `deb`, `rpm`, `apk`, `appimage`, `msi` o `exe`.
- `src-tauri/src/commands.rs:218-257` lo abre con el sistema.
- `src-tauri/src/commands.rs:236-243` usa `cmd /C start "" <ruta>` en Windows.

**Cambios**

- [x] Guardar en el backend la última ruta descargada y verificada (por ejemplo,
      `Mutex<Option<PathBuf>>` en el estado de Tauri).
- [x] `open_update_file` solo debe aceptar esa ruta exacta, canonicalizada, y
      con una extensión permitida.
- [x] Rechazar rutas relativas, UNC (`\\servidor\...`) y componentes `..`.
- [x] En Windows, sustituir `cmd /C start` por `Command::new(path)` o
      `ShellExecuteW`. No pasar la ruta por `cmd`.
- [ ] En Linux, pasar `--` antes de la ruta a `xdg-open` y `gio open`.
- [x] Añadir tests unitarios de validación de rutas.

**Criterio de aceptación**

- El botón de “abrir instalador” sigue funcionando tras descargar un paquete.
- `open_update_file("/tmp/foo.exe")` se rechaza.
- No se puede abrir un archivo que no haya descargado la app.
- En Windows, una ruta con `&` no ejecuta comandos adicionales.

### 1.3 Lectura de la bóveda: symlinks, profundidad y tamaño

**Evidencia**

- `src-tauri/src/vault.rs:542-564` usa `path.is_dir()` (sigue symlinks) y
  recursión sin límite.
- `fs::read_to_string` no tiene límite de tamaño.
- En Android sí existe `MAX_SAF_DEPTH = 64` (`vault.rs:40`), pero la ruta local
  no lo aplica.

**Cambios**

- [x] Usar `entry.file_type()` y saltar enlaces simbólicos dentro de la
      recursión.
- [x] Añadir un límite de profundidad (por ejemplo 16).
- [x] Añadir un tamaño máximo por archivo (por ejemplo 8 MB) antes de leer.
- [x] Leer solo la estructura esperada (`omega/devices/<id>/events/`) en lugar
      de recorrer cualquier subdirectorio.
- [x] Mantener el comportamiento si la raíz de la bóveda es un symlink: solo se
      saltan los symlinks encontrados dentro.
- [x] Añadir tests: symlink circular, symlink a archivo grande, archivo
      legítimo.

**Criterio de aceptación**

- Un symlink circular no cae la app.
- Un `.json` enorme no agota la memoria.
- Los eventos normales se siguen leyendo y las copias se siguen restaurando.

### 1.4 Permisos de archivo en Unix

**Evidencia**

- `src-tauri/src/vault.rs:460-503` y `1188-1213` crean archivos sin
  `set_permissions`.
- Los permisos dependen del `umask` (habitualmente `0644`/`0755`).

**Cambios**

- [x] Añadir un helper `harden_permissions(path, is_dir)` con `#[cfg(unix)]`.
- [x] Directorios de `omega/`, `longlife/` y config: `0700`.
- [x] Archivos de eventos, copias y config: `0600`.
- [x] Aplicarlo al crear y al escribir; no fallar si el sistema de archivos no
      soporta permisos (exFAT/NTFS), solo registrar el error.
- [x] No hacer nada en Windows.

**Criterio de aceptación**

- `stat -c '%a'` muestra `700` en directorios y `600` en archivos.
- La app sigue funcionando en una carpeta exFAT/NTFS sin romperse.

### 1.5 Endurecer la CSP

**Evidencia**

- `src-tauri/tauri.conf.json:37`.

**Cambios**

- [x] Añadir `base-uri 'none'; form-action 'none'; frame-ancestors 'none';
      object-src 'none'`.
- [x] Mantener `connect-src 'none'`.
- [x] Revisar si `style-src 'unsafe-inline'` se puede sustituir por hashes o
      nonces; si no, dejarlo documentado.

**Criterio de aceptación**

- La app carga sin errores de CSP en la consola.
- No hay peticiones salientes desde el webview.
- El splash y la ventana principal siguen funcionando.

### 1.6 Reducir la superficie de Tauri

**Evidencia**

- `src-tauri/src/lib.rs:13-33` registra `plugin-fs` y `plugin-http` aunque no se
  usan en el frontend.
- `src-tauri/capabilities/main.json:6-12` y `mobile.json` conceden
  `opener:default`, `opener:allow-open-url`, `dialog:default` y
  `os:allow-platform`.
- `src-tauri/src/lib.rs:52-74` expone todos los comandos personalizados.

**Cambios**

- [x] Verificar con `grep` que no se usan `@tauri-apps/plugin-fs`,
      `@tauri-apps/plugin-http`, `@tauri-apps/plugin-os` ni
      `@tauri-apps/plugin-dialog` en `src/`.
- [x] Eliminar `tauri_plugin_fs`, `tauri_plugin_http` y `tauri_plugin_os` de
      `lib.rs`, `Cargo.toml` y `package.json` si no se usan.
- [x] **No eliminar `tauri-plugin-dialog`:** `select_vault` lo usa desde Rust
      (`vault.rs:318-336`).
- [x] Sustituir `openUrl` de `src/links.ts` por un comando Rust
      `open_external` con allowlist estricta (repositorio y releases).
- [x] Quitar `opener:default` y `opener:allow-open-url` de las capabilities;
      el comando Rust no necesita permiso de webview.
- [x] Quitar `dialog:default` y `os:allow-platform` de las capabilities si no
      hay llamadas desde el webview.
- [x] Mantener `core:default` y añadir solo lo imprescindible.

**Criterio de aceptación**

- Los enlaces “Repositorio” y “Releases” siguen abriendo el navegador.
- Un enlace a otro dominio se rechaza.
- La app compila en escritorio y Android sin los plugins eliminados.
- La selección de bóveda sigue funcionando.

### 1.7 Rutas absolutas para abrir archivos

**Evidencia**

- `src-tauri/src/commands.rs:218-257` usa `xdg-open`, `gio`, `cmd` y `open` por
  nombre, resolviendo por `PATH`.

**Cambios**

- [x] Probar primero rutas absolutas conocidas:
      `/usr/bin/xdg-open`, `/usr/bin/gio`, `/usr/bin/open`.
- [x] Si no existen, usar el nombre como fallback.
- [x] Mantener mensajes de error claros para el usuario.
- [x] En Windows, usar `%SystemRoot%\System32\...` solo si sigue haciendo falta
      `cmd`; preferiblemente eliminar `cmd`.

**Criterio de aceptación**

- Abrir un `.deb`/`.rpm` funciona en Linux.
- La app no depende de un `PATH` modificado.

### 1.8 Actions fijadas por SHA

**Evidencia**

- `.github/workflows/ci.yml:17-18`.
- `.github/workflows/release.yml:91,94,102`.

**Cambios**

- [x] Fijar `actions/checkout`, `actions/setup-node`, `actions/setup-java`,
      `dtolnay/rust-toolchain` y las demás a un SHA de commit.
- [x] Añadir `.github/dependabot.yml` para actualizar GitHub Actions y Cargo/npm.
- [x] Revisar permisos de cada workflow: `contents: read` por defecto,
      `contents: write` solo donde haga falta.

**Criterio de aceptación**

- Los workflows siguen pasando con los SHA fijados.
- Dependabot abre PRs de actualización.

---

## Fase 2 — Firma de `.deb`/`.rpm`

### 2.1 Incluir la firma en el manifiesto

**Evidencia**

- `.github/workflows/release.yml:186-197` ya sube `.deb.sig` y `.rpm.sig`.
- `scripts/generate-updater-manifest.mjs:99-122` pone `signature: ''` para
  `.deb`/`.rpm` y solo guarda `sha256`.

**Cambios**

- [x] Leer el `.sig` correspondiente y rellenar `signature` en `latest.json`
      para `linux-deb-x86_64` y `linux-rpm-x86_64`.
- [x] Mantener `sha256` como comprobación adicional.
- [x] Validar en `scripts/validate-manifest.mjs` que la firma no está vacía
      para esos formatos.

**Criterio de aceptación**

- `latest.json` contiene firmas válidas para deb/rpm.
- El manifiesto sigue validando el resto de plataformas.

### 2.2 Verificar la firma en Rust

**Evidencia**

- `src-tauri/src/commands.rs:99-183` solo verifica SHA-256.
- `src-tauri/src/commands.rs:262-308` descarga y abre el paquete.
- La clave pública ya está en `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).

**Cambios**

- [x] Añadir una dependencia de verificación minisign (por ejemplo
      `minisign-verify`) o reutilizar el verificador del plugin updater.
- [x] Verificar la firma antes de abrir el instalador.
- [x] Si la firma falta en una release antigua, aceptar solo si el SHA coincide
      y mostrar un aviso; a partir de una versión de corte, exigir firma.
- [x] Añadir tests: firma válida, firma manipulada, firma ausente, SHA
      incorrecto.

**Criterio de aceptación**

- Un paquete manipulado se rechaza.
- Un paquete firmado con la clave de release se acepta.
- Las releases antiguas sin firma no rompen la actualización durante la
      transición.

### 2.3 Probar el flujo completo

- [ ] Generar una release de prueba con firma.
- [ ] Instalar desde una versión anterior.
- [ ] Verificar que AppImage/Windows siguen usando minisign y no se ven
      afectados.
- [ ] Verificar que Android sigue usando la firma de APK del sistema.

**Rollback:** si la verificación falla en producción, publicar una release que
acepte firma ausente temporalmente y volver a exigirla después de corregir.

---

## Fase 3 — Privacidad y detalles

### 3.1 Aviso de Open Food Facts

**Evidencia**

- `src/vault.ts:221-238` y `src-tauri/src/barcode.rs:8,18-46` consultan
  `world.openfoodfacts.org` con el código escaneado.

**Cambios**

- [x] Añadir un texto en la UI de ingesta indicando que la búsqueda online envía
      el código a Open Food Facts.
- [x] Documentarlo en el README.
- [ ] Opcional: ajuste para desactivar la búsqueda online y usar solo la base
      local.

**Criterio de aceptación**

- El usuario puede saber que se hace una petición externa antes de usarla.
- Si se añade el ajuste, con la opción desactivada no se hace ninguna petición.

### 3.2 Documentar la bóveda en claro

- [x] Añadir una nota en el README: la bóveda se guarda como JSON en claro y no
      debe sincronizarse sin cifrar.
- [x] Indicar dónde están `omega/` y `longlife/`.

---

## Fase 4 — Cifrado de bóveda (opcional, no ahora)

No implementar salvo que cambie el modelo de uso. Si se retoma:

- [ ] Decidir modelo de clave: passphrase + Argon2id o clave en llavero del SO.
- [ ] Clave separada de la clave de firma.
- [ ] Migración idempotente: escribir cifrado, verificar, conservar copia y solo
      entonces borrar el claro.
- [ ] Soportar Android SAF.
- [ ] Definir recuperación (clave de recuperación, no solo contraseña).
- [ ] Probar clave incorrecta, migración interrumpida y restauración de copias.
- [ ] Documentar que perder la clave implica perder los datos.

---

## Verificación final

```bash
npm ci
npx tsc --noEmit
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo deny --manifest-path src-tauri/Cargo.toml check
cargo audit --file src-tauri/Cargo.lock
npm audit --omit=dev --audit-level=high
```

Comprobaciones manuales:

- [ ] Crear, leer y restaurar eventos.
- [ ] Seleccionar una bóveda nueva.
- [ ] Hacer una copia y restaurarla.
- [ ] Abrir un enlace del repositorio.
- [ ] Comprobar actualizaciones en Linux/Windows/Android.
- [ ] Revisar la consola del webview sin errores de CSP.
- [ ] Verificar permisos con `stat -c '%a'`.
- [ ] Probar un symlink circular en una bóveda de prueba.

## Notas de implementación (2026-11-03)

- **1.2 — `--` en `xdg-open`:** el script de `xdg-open` no documenta ni
  interpreta `--`; se pasa la ruta absoluta (que nunca empieza por `-`) y se
  reserva `--` para `gio open`, que sí lo admite. Ambas rutas se resuelven por
  ruta absoluta antes de caer al `PATH` (1.7).
- **1.5 — `style-src 'unsafe-inline'`:** se mantiene porque la interfaz usa
  estilos calculados inline. La CSP añade `base-uri`, `form-action`,
  `frame-ancestors` y `object-src` a `'none'`, y conserva `connect-src 'none'`.
- **1.6 — plugins:** se eliminan `fs`, `http` y `os` del backend y del
  frontend; `dialog` se conserva para el selector de bóveda en Rust. Los
  enlaces pasan por el comando `open_external`, con allowlist del repositorio y
  sus releases, y el webview ya no tiene permisos de `opener`.
- **2.2 — corte de firma:** `SIGNED_LINUX_PACKAGES_FROM = "0.9.10"`. Las
  releases anteriores sin firma se aceptan solo por SHA-256 y muestran un aviso;
  desde esa versión la firma minisign es obligatoria. La firma se verifica en
  streaming y se compara la versión del `trusted comment` con la anunciada.
- **Pendiente de verificación manual:** generar una release de prueba firmada
  (fase 2.3), comprobar el flujo real de actualización en Linux/Windows/Android,
  revisar la consola del webview y probar el symlink circular en una bóveda
  real. Las pruebas automáticas cubren rutas, firmas, permisos y symlinks.



- `src-tauri/src/commands.rs` — actualizador, apertura de archivos, red.
- `src-tauri/src/vault.rs` — bóveda, copias, restauración, permisos.
- `src-tauri/src/lib.rs` — plugins y comandos registrados.
- `src-tauri/tauri.conf.json` — CSP y configuración del updater.
- `src-tauri/capabilities/` — permisos del webview.
- `src-tauri/deny.toml` — política de dependencias.
- `.github/workflows/ci.yml` — controles de CI.
- `.github/workflows/release.yml` — firma y publicación.
- `scripts/generate-updater-manifest.mjs` — manifiesto de actualizaciones.
- `src/updater.ts` — flujo de actualización en el frontend.
- `src/links.ts` — apertura de enlaces externos.
