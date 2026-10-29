use crate::vault;
use crate::version;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::AppHandle;
use tauri::Manager;

const UPDATE_MANIFEST_URL: &str =
    "https://github.com/wulflo/better-tracker/releases/latest/download/latest.json";
const RELEASE_PREFIX: &str = "https://github.com/wulflo/better-tracker/releases/";
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
const MAX_APK_BYTES: u64 = 180 * 1024 * 1024;
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
const MAX_PACKAGE_BYTES: u64 = 300 * 1024 * 1024;

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

async fn stream_to_file(
    url: &str,
    path: &Path,
    expected_sha256: &str,
    expected_size: Option<u64>,
    max_bytes: u64,
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
    }
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

fn open_with_system(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let attempts: [(&str, Vec<&std::ffi::OsStr>); 2] = [
            ("xdg-open", vec![path.as_os_str()]),
            ("gio", vec![std::ffi::OsStr::new("open"), path.as_os_str()]),
        ];
        let mut last_error = String::new();
        for (program, args) in attempts {
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
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path.to_string_lossy()])
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("No se pudo abrir el instalador: {error}"))
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
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

/// Descarga un `.deb`/`.rpm` publicado, verifica su SHA-256 y lo abre con el
/// instalador del sistema. El paquete se guarda en Descargas con un nombre
/// único para no chocar con descargas anteriores.
#[tauri::command]
pub async fn download_and_install_linux_package(
    app: AppHandle,
    url: String,
    sha256: String,
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
        stream_to_file(&url, &path, &sha256, size, MAX_PACKAGE_BYTES).await?;
        open_with_system(&path)?;
        Ok(path.to_string_lossy().to_string())
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (app, url, sha256, size, version);
        Err("La instalación de paquetes .deb/.rpm solo está disponible en Linux.".into())
    }
}

/// Abre un archivo de actualización ya descargado. Solo se permiten las
/// extensiones que genera la release.
#[tauri::command]
pub fn open_update_file(path: String) -> Result<(), String> {
    let candidate = PathBuf::from(&path);
    if !candidate.exists() {
        return Err("El archivo de actualización ya no existe.".into());
    }
    let extension = candidate
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let allowed = ["deb", "rpm", "apk", "appimage", "msi", "exe"];
    if !allowed.contains(&extension.as_str()) {
        return Err("El archivo no es un instalador admitido.".into());
    }
    open_with_system(&candidate)
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
        stream_to_file(&url, &temp_path, &sha256, size, MAX_APK_BYTES).await?;

        let display_path = publish_apk(&app, &temp_path, &version)?;
        let _ = std::fs::remove_file(&temp_path);
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
    use tauri_plugin_android_fs::{AndroidFsExt, PublicGeneralPurposeDir};

    const PUBLIC_SUBDIR: &str = "BetterTracker";
    const APK_MIME: &str = "application/vnd.android.package-archive";
    let public_name = format!("BetterTracker-{}.apk", safe_version(version));

    let mut source = std::fs::File::open(temp_path)
        .map_err(|error| format!("No se pudo abrir la APK descargada: {error}"))?;
    let relative_path = format!("{PUBLIC_SUBDIR}/{public_name}");
    let primary = app.android_fs().public_storage().create_new_file(
        None,
        PublicGeneralPurposeDir::Download,
        &relative_path,
        Some(APK_MIME),
    );

    let display_path = match primary {
        Ok(saved_path) => {
            let mut destination = app
                .android_fs()
                .open_file_writable(&saved_path)
                .map_err(|error| format!("No se pudo escribir la APK en Descargas: {error}"))?;
            std::io::copy(&mut source, &mut destination)
                .map_err(|error| format!("No se pudo escribir la APK en Descargas: {error}"))?;
            drop(destination);
            let file_name = app
                .android_fs()
                .get_name(&saved_path)
                .unwrap_or_else(|_| public_name.clone());
            format!("Descargas/{PUBLIC_SUBDIR}/{file_name}")
        }
        Err(primary_error) => {
            // Android < 10 no soporta `RELATIVE_PATH` en MediaStore. El selector
            // SAF funciona en todas las versiones y también evita duplicados.
            let chosen = app
                .android_fs()
                .picker()
                .save_file(None, &public_name, Some(APK_MIME), false)
                .map_err(|error| {
                    format!(
                        "No se pudo guardar la APK en Descargas ({primary_error}) ni abrir el selector de archivos: {error}"
                    )
                })?;
            let Some(chosen) = chosen else {
                return Err(format!("No se guardó la APK. MediaStore falló: {primary_error}"));
            };
            use std::io::{Seek, SeekFrom};
            source
                .seek(SeekFrom::Start(0))
                .map_err(|error| format!("No se pudo releer la APK descargada: {error}"))?;
            let mut destination = app
                .android_fs()
                .open_file_writable(&chosen)
                .map_err(|error| format!("No se pudo crear la APK elegida: {error}"))?;
            std::io::copy(&mut source, &mut destination)
                .map_err(|error| format!("No se pudo escribir la APK elegida: {error}"))?;
            drop(destination);
            app.android_fs()
                .get_name(&chosen)
                .unwrap_or_else(|_| public_name.clone())
        }
    };
    Ok(display_path)
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
