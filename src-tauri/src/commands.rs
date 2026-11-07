use crate::vault;
use crate::version;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;

const UPDATE_MANIFEST_URL: &str =
    "https://github.com/wulflo/better-tracker/releases/latest/download/latest.json";
const RELEASE_PREFIX: &str = "https://github.com/wulflo/better-tracker/releases/";
/// Clave pública minisign del updater, en el mismo formato que
/// `plugins.updater.pubkey` de `tauri.conf.json` (base64 de `minisign.pub`).
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
const UPDATER_PUBKEY_B64: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDAzNzg0OTE2MEI1MUVCNDYKUldSRzYxRUxGa2w0QTZmQnJLVkJ2M3RpMlRtN2hDUU1HbGZ5c2o2WDhnTVhBV2d6Y3NOeGdrMW8K";
/// Primera versión que exige firma minisign también para `.deb`/`.rpm`. Las
/// releases anteriores sin firma se aceptan con el SHA-256 y un aviso.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
const SIGNED_LINUX_PACKAGES_FROM: &str = "0.9.10";
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
const MAX_APK_BYTES: u64 = 180 * 1024 * 1024;
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
const MAX_PACKAGE_BYTES: u64 = 300 * 1024 * 1024;

/// Última ruta descargada y verificada por el actualizador. `open_update_file`
/// solo puede abrir exactamente esa ruta, de modo que el webview no pueda
/// pedir que se ejecute un archivo arbitrario del disco.
#[derive(Default)]
pub struct UpdateState {
    last_download: Mutex<Option<PathBuf>>,
}

impl UpdateState {
    fn remember(&self, path: &Path) {
        let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        *self.last_download.lock().unwrap_or_else(|e| e.into_inner()) = Some(canonical);
    }

    fn last_download(&self) -> Option<PathBuf> {
        self.last_download
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
}

fn update_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .user_agent(concat!(
            "BetterTracker/",
            env!("CARGO_PKG_VERSION"),
            " (+https://github.com/wulflo/better-tracker)"
        ))
        .build()
        .map_err(|error| format!("No se pudo crear el cliente HTTP: {error}"))
}

fn validate_release_url(url: &str) -> Result<(), String> {
    if !url.starts_with(RELEASE_PREFIX) {
        return Err("La URL de actualización no pertenece a las releases de Better Tracker.".into());
    }
    if !url.starts_with("https://") {
        return Err("La URL de actualización debe usar HTTPS.".into());
    }
    Ok(())
}

fn validate_sha256(value: &str) -> Result<(), String> {
    if value.len() != 64 || !value.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("El SHA-256 publicado no es válido.".into());
    }
    Ok(())
}

fn decode_base64_text(value: &str, label: &str) -> Result<String, String> {
    let bytes = BASE64
        .decode(value.trim())
        .map_err(|_| format!("{label} no está codificada en base64."))?;
    String::from_utf8(bytes).map_err(|_| format!("{label} no contiene texto UTF-8 válido."))
}

fn signed_version(trusted_comment: &str) -> Option<&str> {
    trusted_comment
        .split('\t')
        .find_map(|field| field.strip_prefix("version:"))
}

/// Verifica la firma minisign del paquete con la misma clave pública que usa
/// el updater de Tauri. Se hace en streaming para no cargar en memoria un
/// `.deb`/`.rpm` de hasta 300 MB.
fn verify_package_signature(
    path: &Path,
    signature_b64: &str,
    announced_version: &str,
) -> Result<(), String> {
    verify_package_signature_with_key(path, signature_b64, announced_version, UPDATER_PUBKEY_B64)
}

fn verify_package_signature_with_key(
    path: &Path,
    signature_b64: &str,
    announced_version: &str,
    public_key_b64: &str,
) -> Result<(), String> {
    use minisign_verify::{PublicKey, Signature};
    use std::io::Read;

    let public_key_text = decode_base64_text(public_key_b64, "La clave pública del updater")?;
    let public_key = PublicKey::decode(&public_key_text)
        .map_err(|error| format!("La clave pública del updater no es válida: {error}"))?;
    let signature_text = decode_base64_text(signature_b64, "La firma del paquete")?;
    let signature = Signature::decode(&signature_text)
        .map_err(|error| format!("La firma del paquete no es válida: {error}"))?;

    match public_key.verify_stream(&signature) {
        Ok(mut verifier) => {
            let mut file = std::fs::File::open(path)
                .map_err(|error| format!("No se pudo leer el paquete para verificar la firma: {error}"))?;
            let mut buffer = vec![0u8; 1024 * 1024];
            loop {
                let read = file
                    .read(&mut buffer)
                    .map_err(|error| format!("No se pudo leer el paquete para verificar la firma: {error}"))?;
                if read == 0 {
                    break;
                }
                verifier.update(&buffer[..read]);
            }
            verifier
                .finalize()
                .map_err(|error| format!("La firma del paquete no es válida: {error}"))?;
        }
        Err(minisign_verify::Error::UnsupportedLegacyMode) => {
            // El CLI de Tauri firma en modo pre-hasheado; este camino solo
            // cubre paquetes antiguos firmados con minisign clásico.
            let data = std::fs::read(path)
                .map_err(|error| format!("No se pudo leer el paquete para verificar la firma: {error}"))?;
            public_key
                .verify(&data, &signature, true)
                .map_err(|error| format!("La firma del paquete no es válida: {error}"))?;
        }
        Err(error) => return Err(format!("La firma del paquete no es válida: {error}")),
    }

    if let Some(signed) = signed_version(signature.trusted_comment()) {
        if version::compare_versions(signed, announced_version) != 0 {
            return Err(format!(
                "La firma corresponde a la versión {signed}, no a la {announced_version} anunciada."
            ));
        }
    }
    Ok(())
}

/// Descarga `latest.json` sin caché. GitHub y las CDN pueden cachear el
/// manifiesto varios minutos; el preflight nativo evita que una versión recién
/// publicada tarde en detectarse.
#[tauri::command]
pub async fn fetch_update_manifest() -> Result<Value, String> {
    let client = update_client()?;
    let url = format!(
        "{UPDATE_MANIFEST_URL}?bt={}",
        chrono::Utc::now().timestamp_millis()
    );
    let response = client
        .get(url)
        .header(reqwest::header::CACHE_CONTROL, "no-cache, no-store, max-age=0")
        .header(reqwest::header::PRAGMA, "no-cache")
        .send()
        .await
        .map_err(|error| format!("No se pudo consultar el manifiesto de actualizaciones: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "El manifiesto de actualizaciones respondió con estado {}.",
            response.status()
        ));
    }
    response
        .json::<Value>()
        .await
        .map_err(|error| format!("El manifiesto de actualizaciones no es JSON válido: {error}"))
}

#[cfg_attr(
    not(any(target_os = "linux", target_os = "android")),
    allow(dead_code)
)]
fn emit_progress(app: &AppHandle, phase: &str, downloaded: u64, total: Option<u64>) {
    let _ = app.emit(
        "update-progress",
        serde_json::json!({
            "phase": phase,
            "downloaded": downloaded,
            "total": total,
        }),
    );
}

/// Descarga en streaming con verificación SHA-256. El callback recibe el
/// progreso como máximo cada 512 KB para no saturar el puente con el webview.
#[cfg_attr(
    not(any(target_os = "linux", target_os = "android")),
    allow(dead_code)
)]
async fn stream_to_file(
    url: &str,
    path: &Path,
    expected_sha256: &str,
    expected_size: Option<u64>,
    max_bytes: u64,
    on_progress: &mut (dyn FnMut(u64, Option<u64>) + Send),
) -> Result<u64, String> {
    validate_release_url(url)?;
    validate_sha256(expected_sha256)?;
    if let Some(size) = expected_size {
        if size > max_bytes {
            return Err("El archivo de actualización supera el tamaño máximo permitido.".into());
        }
    }

    let client = update_client()?;
    let mut response = client
        .get(url)
        .header(reqwest::header::CACHE_CONTROL, "no-cache")
        .send()
        .await
        .map_err(|error| format!("No se pudo descargar la actualización: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "La descarga de la actualización respondió con estado {}.",
            response.status()
        ));
    }
    let header_size = response.content_length();
    if let Some(size) = expected_size.or(header_size) {
        if size > max_bytes {
            return Err("El archivo de actualización supera el tamaño máximo permitido.".into());
        }
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("No se pudo preparar la carpeta de descargas: {error}"))?;
    }
    let mut file = std::fs::File::create(path)
        .map_err(|error| format!("No se pudo crear el archivo de actualización: {error}"))?;
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let total = expected_size.or(header_size);
    let mut reported: u64 = 0;
    on_progress(0, total);
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("La descarga se interrumpió: {error}"))?
    {
        downloaded += chunk.len() as u64;
        if downloaded > max_bytes {
            let _ = std::fs::remove_file(path);
            return Err("El archivo de actualización supera el tamaño máximo permitido.".into());
        }
        hasher.update(&chunk);
        file.write_all(&chunk)
            .map_err(|error| format!("No se pudo escribir la actualización: {error}"))?;
        if downloaded.saturating_sub(reported) >= 512 * 1024 || total == Some(downloaded) {
            on_progress(downloaded, total);
            reported = downloaded;
        }
    }
    on_progress(downloaded, total);
    file.flush()
        .map_err(|error| format!("No se pudo cerrar la actualización: {error}"))?;
    drop(file);

    if let Some(size) = expected_size.or(header_size) {
        if downloaded != size {
            let _ = std::fs::remove_file(path);
            return Err(format!(
                "La descarga está incompleta: {downloaded} de {size} bytes."
            ));
        }
    }
    let digest = format!("{:x}", hasher.finalize());
    if digest != expected_sha256.to_ascii_lowercase() {
        let _ = std::fs::remove_file(path);
        return Err("El SHA-256 del archivo descargado no coincide con el publicado.".into());
    }
    Ok(downloaded)
}

fn extension_from_url(url: &str) -> Result<&'static str, String> {
    let clean = url.split('?').next().unwrap_or(url).split('#').next().unwrap_or(url);
    let lower = clean.to_ascii_lowercase();
    if lower.ends_with(".deb") {
        Ok("deb")
    } else if lower.ends_with(".rpm") {
        Ok("rpm")
    } else if lower.ends_with(".apk") {
        Ok("apk")
    } else if lower.ends_with(".appimage") {
        Ok("AppImage")
    } else if lower.ends_with(".msi") {
        Ok("msi")
    } else if lower.ends_with(".exe") {
        Ok("exe")
    } else {
        Err("El archivo de actualización no tiene una extensión admitida.".into())
    }
}

fn safe_version(value: &str) -> String {
    let cleaned: String = value
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-' || *c == '_')
        .take(32)
        .collect();
    if cleaned.is_empty() {
        "update".into()
    } else {
        cleaned
    }
}

/// Intenta primero una ruta absoluta conocida y, si no existe, el nombre para
/// que el sistema lo resuelva por `PATH`. Así una instalación normal no depende
/// de un `PATH` modificado.
#[cfg_attr(not(any(target_os = "linux", target_os = "macos")), allow(dead_code))]
fn resolve_program(candidates: &[&'static str]) -> &'static str {
    candidates
        .iter()
        .find(|candidate| Path::new(**candidate).is_file())
        .copied()
        .unwrap_or_else(|| candidates.last().copied().unwrap_or(""))
}

fn open_with_system(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        // `xdg-open` no documenta `--`; pasar la ruta absoluta ya evita que
        // empiece por `-`. `gio` sí acepta el terminador de opciones.
        let opening: [(&str, Vec<&std::ffi::OsStr>); 2] = [
            (
                resolve_program(&["/usr/bin/xdg-open", "/bin/xdg-open", "xdg-open"]),
                vec![path.as_os_str()],
            ),
            (
                resolve_program(&["/usr/bin/gio", "/bin/gio", "gio"]),
                vec![
                    std::ffi::OsStr::new("open"),
                    std::ffi::OsStr::new("--"),
                    path.as_os_str(),
                ],
            ),
        ];
        let mut last_error = String::new();
        for (program, args) in opening {
            if program.is_empty() {
                continue;
            }
            match std::process::Command::new(program).args(args).spawn() {
                Ok(_) => return Ok(()),
                Err(error) => last_error = format!("{program}: {error}"),
            }
        }
        Err(format!(
            "No se pudo abrir el instalador automáticamente ({last_error}). Ábrelo desde tu carpeta de Descargas."
        ))
    }
    #[cfg(target_os = "windows")]
    {
        // Sin `cmd /C start`: la ruta se pasa como argumento directo, así que
        // caracteres como `&` no pueden encadenar comandos. Los `.msi` se
        // abren con msiexec; el resto de instaladores son ejecutables.
        let is_msi = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("msi"))
            .unwrap_or(false);
        let result = if is_msi {
            let msiexec = std::env::var_os("SystemRoot")
                .map(PathBuf::from)
                .map(|root| root.join("System32").join("msiexec.exe"))
                .filter(|candidate| candidate.is_file())
                .unwrap_or_else(|| PathBuf::from("msiexec.exe"));
            std::process::Command::new(msiexec)
                .arg("/i")
                .arg(path)
                .spawn()
        } else {
            std::process::Command::new(path).spawn()
        };
        result
            .map(|_| ())
            .map_err(|error| format!("No se pudo abrir el instalador: {error}"))
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new(resolve_program(&["/usr/bin/open", "/bin/open", "open"]))
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("No se pudo abrir el instalador: {error}"))
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        let _ = path;
        Err("Abrir instaladores solo está disponible en escritorio.".into())
    }
}

/// Descarga un `.deb`/`.rpm` publicado, verifica su SHA-256 y firma minisign,
/// y lo abre con el instalador del sistema. El paquete se guarda en Descargas
/// con un nombre único para no chocar con descargas anteriores.
#[tauri::command]
pub async fn download_and_install_linux_package(
    app: AppHandle,
    state: tauri::State<'_, UpdateState>,
    url: String,
    sha256: String,
    signature: Option<String>,
    size: Option<u64>,
    version: String,
) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let extension = extension_from_url(&url)?;
        if extension != "deb" && extension != "rpm" {
            return Err("El paquete de Linux debe ser .deb o .rpm.".into());
        }
        let downloads = app
            .path()
            .download_dir()
            .or_else(|_| app.path().home_dir())
            .map_err(|error| format!("No se pudo resolver la carpeta de Descargas: {error}"))?;
        let stamp = chrono::Utc::now().timestamp();
        let file_name = format!(
            "BetterTracker-{}-{stamp}.{extension}",
            safe_version(&version)
        );
        let path = downloads.join(file_name);
        let progress_app = app.clone();
        let mut on_progress = move |downloaded: u64, total: Option<u64>| {
            emit_progress(&progress_app, "download", downloaded, total);
        };
        stream_to_file(
            &url,
            &path,
            &sha256,
            size,
            MAX_PACKAGE_BYTES,
            &mut on_progress,
        )
        .await?;

        match signature.as_deref().filter(|value| !value.trim().is_empty()) {
            Some(signature) => {
                if let Err(error) = verify_package_signature(&path, signature, &version) {
                    let _ = std::fs::remove_file(&path);
                    return Err(error);
                }
            }
            None => {
                if version::compare_versions(&version, SIGNED_LINUX_PACKAGES_FROM) >= 0 {
                    let _ = std::fs::remove_file(&path);
                    return Err(
                        "La release no publica una firma minisign para este paquete; no se abrirá el instalador."
                            .into(),
                    );
                }
                eprintln!(
                    "Aviso: la release {version} es anterior a {SIGNED_LINUX_PACKAGES_FROM} y no incluye firma; se acepta solo la comprobación SHA-256."
                );
            }
        }

        state.remember(&path);
        open_with_system(&path)?;
        Ok(path.to_string_lossy().to_string())
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (app, state, url, sha256, signature, size, version);
        Err("La instalación de paquetes .deb/.rpm solo está disponible en Linux.".into())
    }
}

/// Abre un archivo de actualización ya descargado. Solo se permite la última
/// ruta que el propio actualizador descargó y verificó, canonicalizada y con
/// una extensión admitida.
#[tauri::command]
pub fn open_update_file(state: tauri::State<'_, UpdateState>, path: String) -> Result<(), String> {
    let expected = state
        .last_download()
        .ok_or_else(|| "No hay ningún instalador descargado por la app.".to_string())?;
    let canonical = validate_update_file_path(&path, &expected)?;
    open_with_system(&canonical)
}

fn validate_update_file_path(path: &str, expected: &Path) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(path);
    if !candidate.is_absolute()
        || candidate
            .components()
            .any(|component| matches!(component, Component::ParentDir))
    {
        return Err("La ruta del instalador no es válida.".into());
    }
    #[cfg(windows)]
    {
        // Rechaza rutas UNC (\\servidor\recurso) y las que empiezan por \\?\.
        if path.starts_with(r"\\") || path.starts_with("//") {
            return Err("La ruta del instalador no es válida.".into());
        }
    }

    let canonical = candidate
        .canonicalize()
        .map_err(|_| "El archivo de actualización ya no existe.".to_string())?;
    if !canonical.is_file() {
        return Err("El archivo de actualización ya no existe.".into());
    }
    let extension = canonical
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let allowed = ["deb", "rpm", "apk", "appimage", "msi", "exe"];
    if !allowed.contains(&extension.as_str()) {
        return Err("El archivo no es un instalador admitido.".into());
    }
    if canonical != expected {
        return Err("Solo se puede abrir el instalador que descargó la app.".into());
    }
    Ok(canonical)
}

/// Descarga la APK en Rust, verifica tamaño y SHA-256 y la publica en
/// Descargas con MediaStore. Evita el camino JS → memoria → plugin-fs que
/// provocaba cierres en Android con APK grandes.
#[tauri::command]
pub async fn download_android_apk(
    app: AppHandle,
    url: String,
    sha256: String,
    size: Option<u64>,
    version: String,
) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        let extension = extension_from_url(&url)?;
        if extension != "apk" {
            return Err("El archivo de actualización de Android debe ser una APK.".into());
        }
        let cache_dir = app
            .path()
            .app_cache_dir()
            .map_err(|error| format!("No se pudo resolver la caché de la app: {error}"))?;
        let stamp = chrono::Utc::now().timestamp();
        let temp_name = format!("BetterTracker-{}-{stamp}.apk", safe_version(&version));
        let temp_path = cache_dir.join(&temp_name);
        let progress_app = app.clone();
        let mut on_progress = move |downloaded: u64, total: Option<u64>| {
            emit_progress(&progress_app, "download", downloaded, total);
        };
        stream_to_file(
            &url,
            &temp_path,
            &sha256,
            size,
            MAX_APK_BYTES,
            &mut on_progress,
        )
        .await?;

        // La publicación en MediaStore y la copia de 47 MB son operaciones
        // bloqueantes. Se ejecutan en un hilo de bloqueo para que el runtime
        // async y la interfaz sigan respondiendo; antes la copia se hacía en el
        // propio comando async y la app parecía congelarse.
        let display_path = tauri::async_runtime::spawn_blocking(move || {
            let result = publish_apk(&app, &temp_path, &version);
            let _ = std::fs::remove_file(&temp_path);
            result
        })
        .await
        .map_err(|error| format!("No se pudo guardar la APK: {error}"))??;
        Ok(display_path)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, url, sha256, size, version);
        Err("La descarga de APK solo está disponible en Android.".into())
    }
}

#[cfg(target_os = "android")]
fn publish_apk(app: &AppHandle, temp_path: &Path, version: &str) -> Result<String, String> {
    use std::io::{Read, Write};
    use tauri_plugin_android_fs::{AndroidFsExt, PublicGeneralPurposeDir};

    const PUBLIC_SUBDIR: &str = "BetterTracker";
    const APK_MIME: &str = "application/vnd.android.package-archive";
    let public_name = format!("BetterTracker-{}.apk", safe_version(version));
    let relative_path = format!("{PUBLIC_SUBDIR}/{public_name}");
    let api = app.android_fs();

    // La app exige Android 13 (minSdk 33), donde publicar en Descargas con
    // MediaStore no necesita permisos de almacenamiento; esta llamada
    // comprueba el caso heredado y devuelve `true` al instante en 10+.
    if !api
        .public_storage()
        .request_permission()
        .map_err(|error| format!("No se pudo comprobar el permiso de almacenamiento: {error}"))?
    {
        return Err(
            "Android necesita permiso de almacenamiento para guardar la APK en Descargas. Concédelo y vuelve a intentarlo."
                .into(),
        );
    }

    // `pending` mantiene la APK oculta hasta que la copia termina, de modo que
    // ningún gestor de archivos puede abrir un archivo a medio escribir.
    let uri = api
        .public_storage()
        .create_new_file_with_pending(
            None,
            PublicGeneralPurposeDir::Download,
            &relative_path,
            Some(APK_MIME),
        )
        .map_err(|error| format!("No se pudo crear la APK en Descargas: {error}"))?;

    let save_total = std::fs::metadata(temp_path).map(|meta| meta.len()).unwrap_or(0);
    let write_result = (|| -> Result<(), String> {
        let mut source = std::fs::File::open(temp_path)
            .map_err(|error| format!("No se pudo abrir la APK descargada: {error}"))?;
        let mut destination = api
            .open_file_writable(&uri)
            .map_err(|error| format!("No se pudo abrir la APK en Descargas: {error}"))?;
        // Buffer grande: la copia por FUSE/MediaStore con el buffer por defecto
        // de 8 KB tardaba demasiado y parecía un cuelgue.
        let mut buffer = vec![0u8; 1024 * 1024];
        let mut written: u64 = 0;
        let mut reported: u64 = 0;
        emit_progress(app, "save", 0, Some(save_total));
        loop {
            let read = source
                .read(&mut buffer)
                .map_err(|error| format!("No se pudo leer la APK descargada: {error}"))?;
            if read == 0 {
                break;
            }
            destination
                .write_all(&buffer[..read])
                .map_err(|error| format!("No se pudo escribir la APK en Descargas: {error}"))?;
            written += read as u64;
            if written.saturating_sub(reported) >= 512 * 1024 || written == save_total {
                emit_progress(app, "save", written, Some(save_total));
                reported = written;
            }
        }
        destination
            .flush()
            .map_err(|error| format!("No se pudo cerrar la APK en Descargas: {error}"))?;
        emit_progress(app, "save", written, Some(save_total));
        Ok(())
    })();

    if let Err(error) = write_result {
        let _ = api.remove_file(&uri);
        return Err(error);
    }

    api.public_storage()
        .set_pending(&uri, false)
        .map_err(|error| format!("La APK se escribió pero no se pudo publicar en Descargas: {error}"))?;
    // `scan` solo fuerza la indexación; si falla, el archivo ya está escrito y
    // visible en Descargas, así que no convertimos eso en un error de guardado.
    let _ = api.public_storage().scan(&uri);

    let file_name = api.get_name_or_last_path_segment(&uri);
    Ok(format!("Descargas/{PUBLIC_SUBDIR}/{file_name}"))
}

/// Abre un enlace externo solo si pertenece al repositorio oficial. Se ejecuta
/// desde Rust para que el webview no necesite `opener:allow-open-url` y no
/// pueda abrir dominios arbitrarios.
#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    validate_external_url(&url)?;
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<String>)
        .map_err(|error| format!("No se pudo abrir el enlace: {error}"))
}

fn validate_external_url(value: &str) -> Result<(), String> {
    const REPOSITORY: &str = "https://github.com/wulflo/better-tracker";
    let url = value.trim();
    if url.is_empty()
        || url
            .chars()
            .any(|c| c.is_control() || c.is_whitespace() || c == '\\')
        || url.contains("..")
    {
        return Err("El enlace no es válido.".into());
    }
    let rest = url
        .strip_prefix(REPOSITORY)
        .ok_or_else(|| "El enlace no pertenece a Better Tracker.".to_string())?;
    if rest.is_empty()
        || rest == "/"
        || rest == "/releases"
        || rest.starts_with("/releases/")
        || rest == "/blob/main/PRIVACY_POLICY.md"
    {
        Ok(())
    } else {
        Err("El enlace no pertenece a Better Tracker.".into())
    }
}

#[tauri::command]
pub fn get_app_info() -> version::AppInfo {
    version::app_info()
}

#[tauri::command]
pub fn get_app_version() -> version::AppInfo {
    version::app_info()
}

#[tauri::command]
pub fn get_version_info() -> version::AppInfo {
    version::app_info()
}

#[tauri::command]
pub fn get_build_info() -> version::AppInfo {
    version::app_info()
}

#[tauri::command]
pub fn get_version() -> String {
    version::VERSION.to_string()
}

#[tauri::command]
pub fn frontend_ready(app: AppHandle) {
    if let Some(w) = app.get_webview_window("splash") {
        let _ = w.close();
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
pub fn get_device_id(app: AppHandle) -> String {
    vault::device_id(&app)
}

#[tauri::command]
pub async fn list_events(app: AppHandle) -> Result<Vec<vault::Event>, String> {
    tauri::async_runtime::spawn_blocking(move || vault::read_events(&app))
        .await
        .map_err(|error| format!("No se pudo leer la bóveda: {error}"))?
}

#[tauri::command]
pub async fn append_event(app: AppHandle, event: vault::Event) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || vault::append_event(&app, &event))
        .await
        .map_err(|error| format!("No se pudo guardar el evento: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_official_release_urls() {
        assert!(validate_release_url(
            "https://github.com/wulflo/better-tracker/releases/download/v0.9.5/app.apk"
        )
        .is_ok());
        assert!(validate_release_url(
            "https://github.com/wulflo/better-tracker/releases/latest/download/latest.json"
        )
        .is_ok());
        assert!(validate_release_url(
            "https://github.com/evil/better-tracker/releases/download/v1/app.apk"
        )
        .is_err());
        assert!(validate_release_url(
            "http://github.com/wulflo/better-tracker/releases/download/v1/app.apk"
        )
        .is_err());
        assert!(validate_release_url(
            "https://github.com/wulflo/better-tracker.evil/releases/download/v1/app.apk"
        )
        .is_err());
    }

    #[test]
    fn accepts_only_sha256_hex_digests() {
        assert!(validate_sha256(&"a".repeat(64)).is_ok());
        assert!(validate_sha256(&"A".repeat(64)).is_ok());
        assert!(validate_sha256(&"a".repeat(63)).is_err());
        assert!(validate_sha256(&"g".repeat(64)).is_err());
    }

    #[test]
    fn derives_download_extension_from_url() {
        assert_eq!(
            extension_from_url("https://x/app.apk").unwrap(),
            "apk"
        );
        assert_eq!(
            extension_from_url("https://x/app.deb?sig=1").unwrap(),
            "deb"
        );
        assert_eq!(
            extension_from_url("https://x/app.rpm#fragment").unwrap(),
            "rpm"
        );
        assert!(extension_from_url("https://x/app.zip").is_err());
    }

    #[test]
    fn sanitizes_version_for_file_names() {
        assert_eq!(safe_version("0.9.5"), "0.9.5");
        assert_eq!(safe_version("../../etc/passwd"), "....etcpasswd");
        assert_eq!(safe_version(""), "update");
        assert!(safe_version(&"9".repeat(100)).len() <= 32);
    }

    #[test]
    fn allows_only_official_external_links() {
        assert!(validate_external_url("https://github.com/wulflo/better-tracker").is_ok());
        assert!(validate_external_url("https://github.com/wulflo/better-tracker/").is_ok());
        assert!(validate_external_url(
            "https://github.com/wulflo/better-tracker/releases"
        )
        .is_ok());
        assert!(validate_external_url(
            "https://github.com/wulflo/better-tracker/releases/tag/v0.9.9"
        )
        .is_ok());
        assert!(validate_external_url("https://github.com/wulflo/better-tracker.evil").is_err());
        assert!(validate_external_url("https://github.com/wulflo/better-tracker/releases-evil")
            .is_err());
        assert!(validate_external_url("https://github.com/evil/better-tracker").is_err());
        assert!(validate_external_url("http://github.com/wulflo/better-tracker").is_err());
        assert!(validate_external_url("javascript:alert(1)").is_err());
        assert!(validate_external_url("https://github.com/wulflo/better-tracker/../../evil")
            .is_err());
    }

    #[test]
    fn opens_only_the_file_downloaded_by_the_updater() {
        let dir = std::env::temp_dir().join(format!(
            "better-tracker-update-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let installer = dir.join("BetterTracker-0.9.10.deb");
        std::fs::write(&installer, b"deb").unwrap();
        let other = dir.join("other.deb");
        std::fs::write(&other, b"deb").unwrap();
        let text = dir.join("notes.txt");
        std::fs::write(&text, b"notes").unwrap();

        let canonical = installer.canonicalize().unwrap();
        assert_eq!(
            validate_update_file_path(&installer.to_string_lossy(), &canonical).unwrap(),
            canonical
        );
        assert!(validate_update_file_path(&other.to_string_lossy(), &canonical).is_err());
        assert!(validate_update_file_path(&text.to_string_lossy(), &canonical).is_err());
        assert!(validate_update_file_path("relative.deb", &canonical).is_err());
        assert!(validate_update_file_path("/tmp/../tmp/x.deb", &canonical).is_err());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn verifies_minisign_signatures() {
        // Vector público de `minisign-verify`: la firma cubre exactamente "test".
        const PUBLIC_KEY: &str = "untrusted comment: minisign public key E7620F1842B4E81F\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";
        const SIGNATURE: &str = "untrusted comment: signature from minisign secret key\nRUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\ntrusted comment: timestamp:1633700835\tfile:test\tprehashed\nwLMDjy9FLAuxZ3q4NlEvkgtyhrr0gtTu6KC4KBJdITbbOeAi1zBIYo0v4iTgt8jJpIidRJnp94ABQkJAgAooBQ==";
        let dir = std::env::temp_dir().join(format!(
            "better-tracker-signature-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("package.deb");
        std::fs::write(&file, b"test").unwrap();

        let public_key_b64 = BASE64.encode(PUBLIC_KEY);
        let signature_b64 = BASE64.encode(SIGNATURE);
        assert!(
            verify_package_signature_with_key(&file, &signature_b64, "1.2.3", &public_key_b64)
                .is_ok()
        );

        std::fs::write(&file, b"tampered").unwrap();
        assert!(
            verify_package_signature_with_key(&file, &signature_b64, "1.2.3", &public_key_b64)
                .is_err()
        );
        assert!(
            verify_package_signature_with_key(&file, "not-base64!", "1.2.3", &public_key_b64)
                .is_err()
        );

        let _ = std::fs::remove_dir_all(dir);
    }
}
