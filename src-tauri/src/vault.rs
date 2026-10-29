//! Almacenamiento local de la bóveda.
//!
//! La app solo usa `<bóveda>/omega` como fuente de datos. Cada evento se guarda
//! como archivo propio en `omega/devices/<device>/events/<id>.json` para que
//! FolderSync no tenga que fusionar un JSONL compartido. Las copias diarias
//! viven en `<bóveda>/Longlife/<device>/<AAAA-MM-DD>` y se pueden listar,
//! restaurar (solo eventos que falten) o borrar desde Ajustes.
//!
//! En Android la bóveda se elige con el selector SAF y se conserva el permiso
//! entre reinicios, igual que en SinNotas. En escritorio se usa una carpeta
//! normal del sistema.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[cfg(target_os = "android")]
use tauri_plugin_android_fs::{AndroidFsExt, FsUri};

pub const DATA_DIR: &str = "omega";
const DEVICES_DIR: &str = "devices";
const EVENTS_FILE: &str = "events.jsonl";
const EVENTS_DIR: &str = "events";
pub const BACKUP_DIR: &str = "Longlife";
const BACKUP_MARKER: &str = ".backup-complete";
const SNAPSHOT_META: &str = "snapshot.json";
pub const BACKUP_RETENTION: usize = 7;
#[cfg(target_os = "android")]
const MAX_SAF_DEPTH: usize = 64;

/// Serializa las escrituras dentro del proceso para que dos comandos no
/// compitan por el mismo archivo de evento o por la copia diaria.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Event {
    pub id: String,
    pub device_id: String,
    pub timestamp: String,
    pub kind: String,
    pub payload: serde_json::Value,
}

/// Un evento se guarda en su propio archivo para que FolderSync nunca tenga que
/// fusionar dos versiones del mismo JSONL. El nombre es el id del evento, que
/// es único y estable.
fn event_file_name(event: &Event) -> Result<String, String> {
    if event.id.is_empty()
        || event.id.len() > 128
        || !event
            .id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("El identificador del evento no es válido.".to_string());
    }
    Ok(format!("{}.json", event.id))
}

fn app_data_dir(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().expect("app data dir")
}

fn config_path(app: &AppHandle) -> PathBuf {
    app_data_dir(app).join("config.json")
}

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct Config {
    pub vault_path: Option<String>,
    #[serde(default)]
    pub vault_label: Option<String>,
    pub device_id: Option<String>,
    /// Fecha en la que el usuario borró las copias. Evita que la copia
    /// automática vuelva a crearlas el mismo día.
    #[serde(default)]
    pub backup_skip_date: Option<String>,
}

fn load_config(app: &AppHandle) -> Config {
    let p = config_path(app);
    if let Ok(s) = fs::read_to_string(&p) {
        serde_json::from_str(&s).unwrap_or_default()
    } else {
        Config::default()
    }
}

fn save_config(app: &AppHandle, cfg: &Config) -> Result<(), String> {
    let p = config_path(app);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("No se pudo preparar la configuración: {error}"))?;
    }
    let text = serde_json::to_string_pretty(cfg)
        .map_err(|error| format!("No se pudo serializar la configuración: {error}"))?;
    fs::write(&p, text).map_err(|error| format!("No se pudo guardar la configuración: {error}"))
}

pub fn device_id(app: &AppHandle) -> String {
    let mut cfg = load_config(app);
    if cfg
        .device_id
        .as_deref()
        .map(str::trim)
        .unwrap_or("")
        .is_empty()
    {
        cfg.device_id = Some(uuid::Uuid::new_v4().to_string());
        let _ = save_config(app, &cfg);
    }
    cfg.device_id.unwrap_or_default()
}

/* ------------------------------------------------------------------ */
/* Ubicación activa                                                   */
/* ------------------------------------------------------------------ */

#[cfg(target_os = "android")]
struct SafLocation {
    root: FsUri,
}

enum VaultLocation {
    Local(PathBuf),
    #[cfg(target_os = "android")]
    Saf(SafLocation),
}

/// Reconoce la representación serializada de `FsUri` que produce
/// `tauri-plugin-android-fs` 30.x (`{"uri":…,"documentTopTreeUri":…}`) y la de
/// 2.x (`{"topTreeUri":…,"relativeTerms":[]}`), además de una URI `content://`
/// plana por compatibilidad.
#[cfg(target_os = "android")]
fn saf_uri_from_root(root_path: &str) -> Result<Option<FsUri>, String> {
    let trimmed = root_path.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    if trimmed.starts_with("content://") || trimmed.starts_with("file://") {
        return Ok(Some(FsUri {
            uri: trimmed.to_string(),
            document_top_tree_uri: Some(trimmed.to_string()),
        }));
    }

    if !trimmed.starts_with('{') {
        return Ok(None);
    }

    let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) else {
        return Ok(None);
    };

    // Formato del plugin 30.x.
    if let Some(uri) = value.get("uri").and_then(|value| value.as_str()) {
        if !uri.starts_with("content://") && !uri.starts_with("file://") {
            return Ok(None);
        }
        return Ok(Some(FsUri {
            uri: uri.to_string(),
            document_top_tree_uri: value
                .get("documentTopTreeUri")
                .and_then(|value| value.as_str())
                .map(str::to_string),
        }));
    }

    // Formato del plugin 2.x. La raíz elegida con el selector se guardaba con
    // `relativeTerms` vacío, así que basta con su `topTreeUri`.
    let Some(top_tree_uri) = value.get("topTreeUri").and_then(|value| value.as_str()) else {
        return Ok(None);
    };
    if !top_tree_uri.starts_with("content://") {
        return Ok(None);
    }
    Ok(Some(FsUri {
        uri: top_tree_uri.to_string(),
        document_top_tree_uri: Some(top_tree_uri.to_string()),
    }))
}

fn current_location(app: &AppHandle) -> Result<Option<VaultLocation>, String> {
    let cfg = load_config(app);
    let Some(raw) = cfg.vault_path else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    #[cfg(target_os = "android")]
    {
        if let Some(dir) = saf_uri_from_root(trimmed)? {
            return Ok(Some(VaultLocation::Saf(SafLocation { root: dir })));
        }
    }

    Ok(Some(VaultLocation::Local(PathBuf::from(trimmed))))
}

/// Nombre legible para una raíz guardada. Para SAF no se puede reconstruir el
/// nombre real sin consultar el plugin, así que se usa una etiqueta estable.
fn label_from_path(raw: &str) -> String {
    if raw.starts_with('{') || raw.starts_with("content://") {
        return "Bóveda Android".to_string();
    }
    Path::new(raw)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("Bóveda")
        .to_string()
}

fn save_selection(app: &AppHandle, raw: &str, label: &str) -> Result<(), String> {
    let mut cfg = load_config(app);
    cfg.vault_path = Some(raw.to_string());
    cfg.vault_label = Some(label.to_string());
    cfg.backup_skip_date = None;
    save_config(app, &cfg)?;
    Ok(())
}

#[derive(Serialize, Clone)]
pub struct VaultInfo {
    pub path: Option<String>,
    pub label: Option<String>,
    /// Ruta visible de los datos. En SAF se muestra solo `omega`.
    pub data_dir: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct VaultSelection {
    pub path: String,
    pub label: String,
}

pub fn vault_info(app: &AppHandle) -> VaultInfo {
    let cfg = load_config(app);
    let path = cfg
        .vault_path
        .clone()
        .filter(|value| !value.trim().is_empty());
    let label = cfg
        .vault_label
        .clone()
        .or_else(|| path.as_deref().map(label_from_path));
    let data_dir = path.as_deref().map(|raw| {
        #[cfg(target_os = "android")]
        {
            if raw.starts_with('{') || raw.starts_with("content://") {
                return DATA_DIR.to_string();
            }
        }
        Path::new(raw).join(DATA_DIR).to_string_lossy().into_owned()
    });

    VaultInfo {
        path,
        label,
        data_dir,
    }
}

/// Abre el selector de carpetas. En Android usa SAF y conserva el permiso de
/// lectura/escritura; en escritorio usa el diálogo nativo.
#[tauri::command]
pub async fn select_vault(app: AppHandle) -> Result<VaultSelection, String> {
    #[cfg(target_os = "android")]
    {
        let api = app.android_fs();
        let Some(dir_uri) = api
            .picker()
            .pick_dir(None, false)
            .map_err(|error| format!("No se pudo abrir el selector de carpetas: {error}"))?
        else {
            return Err("cancelled".to_string());
        };

        api.picker()
            .persist_uri_permission(&dir_uri)
            .map_err(|error| format!("No se pudo conservar el permiso de la carpeta: {error}"))?;

        let serialized = dir_uri
            .to_json_string()
            .map_err(|error| format!("La ruta SAF no es válida: {error}"))?;
        let label = api
            .get_name(&dir_uri)
            .unwrap_or_else(|_| "Bóveda Android".to_string());

        save_selection(&app, &serialized, &label)?;
        Ok(VaultSelection {
            path: serialized,
            label,
        })
    }

    #[cfg(target_os = "ios")]
    {
        let _ = app;
        Err("En iOS se usa la bóveda interna de la aplicación.".to_string())
    }

    #[cfg(all(not(target_os = "android"), not(target_os = "ios")))]
    {
        use tauri_plugin_dialog::DialogExt;

        let app2 = app.clone();
        let handle = tauri::async_runtime::spawn_blocking(move || {
            app2.dialog().file().blocking_pick_folder()
        });
        let folder = handle.await.map_err(|e| e.to_string())?;
        let Some(fp) = folder else {
            return Err("cancelled".to_string());
        };
        let path = fp.into_path().map_err(|e| e.to_string())?;
        ensure_local_layout(&path)?;
        let raw = path.to_string_lossy().into_owned();
        let label = label_from_path(&raw);
        save_selection(&app, &raw, &label)?;
        Ok(VaultSelection { path: raw, label })
    }
}

#[tauri::command]
pub fn get_vault_info(app: AppHandle) -> VaultInfo {
    vault_info(&app)
}

#[tauri::command]
pub fn get_vault_path(app: AppHandle) -> Option<String> {
    load_config(&app)
        .vault_path
        .filter(|value| !value.trim().is_empty())
}

/* ------------------------------------------------------------------ */
/* Layout local y migración                                           */
/* ------------------------------------------------------------------ */

fn ensure_local_layout(root: &Path) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|e| format!("No se pudo crear la bóveda: {e}"))?;

    let omega = root.join(DATA_DIR);
    let omega_devices = omega.join(DEVICES_DIR);
    let legacy_devices = root.join(DEVICES_DIR);

    // Versiones anteriores guardaban `devices/` en la raíz de la bóveda. Se
    // mueve una sola vez para que la app siga leyendo todo desde `omega`.
    if legacy_devices.is_dir() {
        fs::create_dir_all(&omega).map_err(|e| format!("No se pudo crear omega: {e}"))?;
        fs::create_dir_all(&omega_devices)
            .map_err(|e| format!("No se pudo crear la carpeta de eventos: {e}"))?;
        if let Ok(entries) = fs::read_dir(&legacy_devices) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                let target = omega_devices.join(&name);
                if target.exists() {
                    // Si ya existe un dispositivo con ese nombre, no se
                    // descarta la copia antigua: se conserva aparte para que
                    // `read_events` la siga leyendo.
                    let fallback = omega_devices.join(format!(
                        "legacy-{}-{}",
                        name.to_string_lossy(),
                        uuid::Uuid::new_v4()
                    ));
                    if fs::rename(entry.path(), &fallback).is_err() {
                        let is_dir = entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false);
                        if is_dir {
                            copy_dir_recursive(&entry.path(), &fallback)?;
                        } else {
                            fs::copy(entry.path(), &fallback).map_err(|e| {
                                format!("No se pudo conservar un dato antiguo de la bóveda: {e}")
                            })?;
                        }
                    }
                    continue;
                }
                if fs::rename(entry.path(), &target).is_err() {
                    let is_dir = entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false);
                    if is_dir {
                        copy_dir_recursive(&entry.path(), &target)?;
                    } else {
                        fs::copy(entry.path(), &target).map_err(|e| {
                            format!("No se pudo migrar un dato antiguo de la bóveda: {e}")
                        })?;
                    }
                }
            }
        }
        let _ = fs::remove_dir(&legacy_devices);
    }

    fs::create_dir_all(&omega_devices)
        .map_err(|e| format!("No se pudo crear la carpeta de eventos: {e}"))?;
    Ok(())
}

fn validate_device_id(device_id: &str) -> Result<(), String> {
    if device_id.is_empty()
        || device_id.len() > 128
        || !device_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("El identificador del dispositivo no es válido.".to_string());
    }
    Ok(())
}

/* ------------------------------------------------------------------ */
/* Lectura y escritura de eventos                                     */
/* ------------------------------------------------------------------ */

pub fn append_event(app: &AppHandle, event: &Event) -> Result<(), String> {
    validate_device_id(&event.device_id)?;
    let file_name = event_file_name(event)?;
    let location =
        current_location(app)?.ok_or_else(|| "No hay una bóveda seleccionada.".to_string())?;
    let payload = serde_json::to_vec(event).map_err(|e| e.to_string())?;

    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());

    match location {
        VaultLocation::Local(root) => write_local_event(&root, event, &file_name, &payload),
        #[cfg(target_os = "android")]
        VaultLocation::Saf(saf) => {
            let relative = format!(
                "{DATA_DIR}/{DEVICES_DIR}/{}/{EVENTS_DIR}/{file_name}",
                event.device_id
            );
            if saf_lookup_file(app, &saf.root, &relative)?.is_some() {
                return Ok(());
            }
            let file = app
                .android_fs()
                .create_new_file(&saf.root, &relative, Some("application/json"))
                .map_err(|e| format!("No se pudo crear el evento: {e}"))?;
            app.android_fs()
                .write(&file, &payload)
                .map_err(|e| format!("No se pudo guardar el evento: {e}"))
        }
    }
}

fn write_local_event(
    root: &Path,
    event: &Event,
    file_name: &str,
    payload: &[u8],
) -> Result<(), String> {
    ensure_local_layout(root)?;
    let dir = root
        .join(DATA_DIR)
        .join(DEVICES_DIR)
        .join(&event.device_id)
        .join(EVENTS_DIR);
    fs::create_dir_all(&dir)
        .map_err(|e| format!("No se pudo crear la carpeta del dispositivo: {e}"))?;
    let file = dir.join(file_name);
    if file.is_file() {
        return Ok(());
    }

    // Escribir en un temporal y renombrar evita que un lector (o FolderSync)
    // vea un evento a medias.
    let tmp = dir.join(format!(".{file_name}.{}.tmp", uuid::Uuid::new_v4()));
    {
        let mut handle = fs::File::create(&tmp)
            .map_err(|e| format!("No se pudo abrir el archivo de eventos: {e}"))?;
        handle
            .write_all(payload)
            .map_err(|e| format!("No se pudo escribir el evento: {e}"))?;
        handle
            .sync_all()
            .map_err(|e| format!("No se pudo confirmar el evento: {e}"))?;
    }
    match fs::rename(&tmp, &file) {
        Ok(()) => Ok(()),
        Err(_) if file.is_file() => {
            let _ = fs::remove_file(&tmp);
            Ok(())
        }
        Err(error) => {
            let _ = fs::remove_file(&tmp);
            Err(format!("No se pudo publicar el evento: {error}"))
        }
    }
}

pub fn read_events(app: &AppHandle) -> Result<Vec<Event>, String> {
    let location =
        current_location(app)?.ok_or_else(|| "No hay una bóveda seleccionada.".to_string())?;
    let mut events = match location {
        VaultLocation::Local(root) => read_local_events(&root)?,
        #[cfg(target_os = "android")]
        VaultLocation::Saf(saf) => read_saf_events(app, &saf.root)?,
    };

    events.sort_by(|a, b| a.timestamp.cmp(&b.timestamp).then(a.id.cmp(&b.id)));
    // FolderSync puede duplicar un archivo o una línea. El id del evento es
    // estable, así que una bóveda sincronizada nunca debe mostrar duplicados.
    events.dedup_by(|a, b| a.id == b.id);
    Ok(events)
}

fn parse_event_content(content: &str, out: &mut Vec<Event>) {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return;
    }
    if trimmed.starts_with('{') && !trimmed.contains('\n') {
        if let Ok(event) = serde_json::from_str::<Event>(trimmed) {
            out.push(event);
        }
        return;
    }
    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(event) = serde_json::from_str::<Event>(line) {
            out.push(event);
        }
    }
}

fn read_local_events_from_dir(dir: &Path, events: &mut Vec<Event>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            read_local_events_from_dir(&path, events);
            continue;
        }
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if name == SNAPSHOT_META || name == BACKUP_MARKER || name.ends_with(".tmp") {
            continue;
        }
        if name == EVENTS_FILE || name.ends_with(".json") {
            if let Ok(content) = fs::read_to_string(&path) {
                parse_event_content(&content, events);
            }
        }
    }
}

fn read_local_events(root: &Path) -> Result<Vec<Event>, String> {
    ensure_local_layout(root)?;
    let devices_dir = root.join(DATA_DIR).join(DEVICES_DIR);
    let mut events = Vec::new();
    if !devices_dir.is_dir() {
        return Ok(events);
    }
    read_local_events_from_dir(&devices_dir, &mut events);
    dedup_events(&mut events);
    Ok(events)
}

/* ------------------------------------------------------------------ */
/* Copias diarias Longlife                                           */
/* ------------------------------------------------------------------ */

#[derive(Serialize, Clone)]
pub struct SnapshotInfo {
    /// Identificador estable: `<fecha>` para copias antiguas o `<device>/<fecha>`.
    pub id: String,
    pub date: String,
    pub device_id: String,
    pub device_label: String,
    pub files: u64,
    pub bytes: u64,
    /// Archivos que debería contener según `snapshot.json`. `None` en copias
    /// creadas antes de 0.9.4, que no guardaban el manifiesto.
    pub expected_files: Option<u64>,
    pub expected_bytes: Option<u64>,
    /// Hay marcador de copia completa pero el contenido no coincide con el
    /// manifiesto: una sincronización a medias o un borrado externo.
    pub damaged: bool,
    pub complete: bool,
    pub legacy: bool,
    pub current_device: bool,
}

#[derive(Serialize, Clone)]
pub struct BackupStatus {
    pub retention_days: usize,
    pub last_backup: Option<String>,
    pub copies: Vec<SnapshotInfo>,
    pub total_bytes: u64,
}

#[derive(Serialize, Clone)]
pub struct BackupRunResult {
    pub created: bool,
    pub skipped: Option<String>,
    pub date: Option<String>,
    pub status: BackupStatus,
}

#[derive(Serialize, Clone)]
pub struct RestoreResult {
    pub imported: u64,
    pub already_present: u64,
    pub source_events: u64,
    pub folder: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct SnapshotMeta {
    device_id: String,
    device_label: String,
    created_at: String,
    platform: String,
    app_version: String,
    /// Nº de archivos de `omega` copiados. Ausente en copias antiguas.
    #[serde(default)]
    files: Option<u64>,
    /// Bytes de esos archivos. Ausente en copias antiguas.
    #[serde(default)]
    bytes: Option<u64>,
}

fn empty_backup_status() -> BackupStatus {
    BackupStatus {
        retention_days: BACKUP_RETENTION,
        last_backup: None,
        copies: Vec::new(),
        total_bytes: 0,
    }
}

fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

fn is_date_name(name: &str) -> bool {
    name.len() == 10 && chrono::NaiveDate::parse_from_str(name, "%Y-%m-%d").is_ok()
}

fn platform_name() -> &'static str {
    if cfg!(target_os = "android") {
        "Android"
    } else if cfg!(target_os = "windows") {
        "Windows"
    } else if cfg!(target_os = "macos") {
        "macOS"
    } else if cfg!(target_os = "ios") {
        "iOS"
    } else {
        "Linux"
    }
}

fn short_id(device_id: &str) -> &str {
    device_id.get(..8).unwrap_or(device_id)
}

fn device_label(device_id: &str) -> String {
    format!("{} · {}", platform_name(), short_id(device_id))
}

fn snapshot_meta(device_id: &str, files: u64, bytes: u64) -> SnapshotMeta {
    SnapshotMeta {
        device_id: device_id.to_string(),
        device_label: device_label(device_id),
        created_at: chrono::Local::now().to_rfc3339(),
        platform: platform_name().to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        files: Some(files),
        bytes: Some(bytes),
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(u64, u64), String> {
    fs::create_dir_all(dst).map_err(|e| format!("No se pudo crear la copia: {e}"))?;
    let mut files = 0u64;
    let mut bytes = 0u64;

    let entries = fs::read_dir(src).map_err(|e| format!("No se pudo leer la bóveda: {e}"))?;
    for entry in entries.flatten() {
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };
        let source = entry.path();
        let target = dst.join(entry.file_name());

        if file_type.is_dir() {
            let (child_files, child_bytes) = copy_dir_recursive(&source, &target)?;
            files += child_files;
            bytes += child_bytes;
        } else if file_type.is_file() {
            fs::copy(&source, &target).map_err(|e| {
                format!(
                    "No se pudo copiar {}: {e}",
                    source
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("archivo")
                )
            })?;
            files += 1;
            bytes += fs::metadata(&source).map(|meta| meta.len()).unwrap_or(0);
        }
    }

    Ok((files, bytes))
}

/// Cuenta archivos y bytes de una copia **sin** su propia metadata
/// (`snapshot.json` y `.backup-complete`): así el resultado se puede comparar
/// con el manifiesto que describe el contenido de `omega`.
fn count_dir(dir: &Path) -> Result<(u64, u64), String> {
    let mut files = 0u64;
    let mut bytes = 0u64;
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok((0, 0)),
        Err(error) => return Err(format!("No se pudo leer la copia: {error}")),
    };

    for entry in entries.flatten() {
        let name = entry.file_name();
        if name == BACKUP_MARKER || name == SNAPSHOT_META {
            continue;
        }
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };
        if file_type.is_dir() {
            let (child_files, child_bytes) = count_dir(&entry.path())?;
            files += child_files;
            bytes += child_bytes;
        } else if file_type.is_file() {
            files += 1;
            bytes += entry.metadata().map(|meta| meta.len()).unwrap_or(0);
        }
    }

    Ok((files, bytes))
}

fn read_local_meta(dir: &Path) -> Option<SnapshotMeta> {
    fs::read_to_string(dir.join(SNAPSHOT_META))
        .ok()
        .and_then(|text| serde_json::from_str::<SnapshotMeta>(&text).ok())
}

/// Compara el contenido real de una copia con el manifiesto de su
/// `snapshot.json`. Las copias antiguas (sin manifiesto) se consideran válidas:
/// no hay nada con lo que compararlas.
fn manifest_matches(dir: &Path) -> Result<bool, String> {
    let Some(meta) = read_local_meta(dir) else {
        return Ok(true);
    };
    let Some(expected_files) = meta.files else {
        return Ok(true);
    };
    let (files, bytes) = count_dir(dir)?;
    if expected_files != files {
        return Ok(false);
    }
    match meta.bytes {
        Some(expected_bytes) => Ok(expected_bytes == bytes),
        None => Ok(true),
    }
}

fn local_snapshot_info(
    dir: &Path,
    id: String,
    date: String,
    fallback_device: &str,
    fallback_label: &str,
    legacy: bool,
    current_device: &str,
) -> Result<Option<SnapshotInfo>, String> {
    let (files, bytes) = count_dir(dir)?;
    if files == 0 {
        return Ok(None);
    }
    let meta = read_local_meta(dir);
    let device_id = meta
        .as_ref()
        .map(|meta| meta.device_id.clone())
        .unwrap_or_else(|| fallback_device.to_string());
    let label = meta
        .as_ref()
        .map(|meta| meta.device_label.clone())
        .unwrap_or_else(|| fallback_label.to_string());
    let expected_files = meta.as_ref().and_then(|meta| meta.files);
    let expected_bytes = meta.as_ref().and_then(|meta| meta.bytes);
    let healthy = manifest_matches(dir)?;
    let marker = dir.join(BACKUP_MARKER).is_file();
    Ok(Some(SnapshotInfo {
        id,
        date,
        device_id: device_id.clone(),
        device_label: label,
        files,
        bytes,
        expected_files,
        expected_bytes,
        damaged: marker && !healthy,
        complete: marker && healthy,
        legacy,
        current_device: device_id == current_device,
    }))
}

fn list_local_backups(root: &Path, current_device: &str) -> Result<Vec<SnapshotInfo>, String> {
    let backup_root = root.join(BACKUP_DIR);
    let entries = match fs::read_dir(&backup_root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("No se pudo leer Longlife: {error}")),
    };

    let mut copies = Vec::new();
    for entry in entries.flatten() {
        if !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
            continue;
        }
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };

        if is_date_name(name) {
            // Formato antiguo: Longlife/<fecha>. Sigue siendo legible, pero
            // nunca se usa para escribir copias nuevas porque todos los
            // dispositivos competían por la misma carpeta.
            if let Some(info) = local_snapshot_info(
                &entry.path(),
                name.to_string(),
                name.to_string(),
                "legacy",
                "Copia antigua (sin dispositivo)",
                true,
                current_device,
            )? {
                copies.push(info);
            }
            continue;
        }

        let device_entries = match fs::read_dir(entry.path()) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for day in device_entries.flatten() {
            if !day.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
                continue;
            }
            let Some(date) = day.file_name().to_str().map(str::to_string) else {
                continue;
            };
            if !is_date_name(&date) {
                continue;
            }
            let id = format!("{name}/{date}");
            if let Some(info) = local_snapshot_info(
                &day.path(),
                id,
                date,
                name,
                &format!("Dispositivo {}", short_id(name)),
                false,
                current_device,
            )? {
                copies.push(info);
            }
        }
    }
    copies.sort_by(|a, b| a.date.cmp(&b.date).then(a.device_id.cmp(&b.device_id)));
    Ok(copies)
}

fn prune_local_device_backups(root: &Path, device: &str) -> Result<(), String> {
    let device_dir = root.join(BACKUP_DIR).join(device);
    let Ok(entries) = fs::read_dir(&device_dir) else {
        return Ok(());
    };

    let mut days: Vec<(String, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name();
            let date = name.to_str()?.to_string();
            if !is_date_name(&date) || !entry.file_type().ok()?.is_dir() {
                return None;
            }
            let path = entry.path();
            if count_dir(&path)
                .map(|(files, _)| files == 0)
                .unwrap_or(false)
            {
                return None;
            }
            Some((date, path))
        })
        .collect();
    days.sort_by(|a, b| a.0.cmp(&b.0));

    while days.len() > BACKUP_RETENTION {
        let (_, path) = days.remove(0);
        let _ = fs::remove_dir_all(path);
    }
    Ok(())
}

fn resolve_snapshot_dir(root: &Path, id: &str) -> Result<PathBuf, String> {
    let parts: Vec<&str> = id.split('/').filter(|part| !part.is_empty()).collect();
    if parts.is_empty() || parts.len() > 2 {
        return Err("La copia seleccionada no es válida.".to_string());
    }
    let mut dir = root.join(BACKUP_DIR);
    for part in parts {
        if part == "." || part == ".." || part.contains('\\') || part.len() > 128 {
            return Err("La copia seleccionada no es válida.".to_string());
        }
        dir.push(part);
    }
    if !dir.is_dir() {
        return Err("La copia ya no existe. Actualiza la lista.".to_string());
    }
    Ok(dir)
}

#[tauri::command]
pub async fn vault_backup_status(app: AppHandle) -> Result<BackupStatus, String> {
    tauri::async_runtime::spawn_blocking(move || backup_status(&app))
        .await
        .map_err(|error| format!("No se pudo consultar Longlife: {error}"))?
}

pub fn backup_status(app: &AppHandle) -> Result<BackupStatus, String> {
    let Some(location) = current_location(app)? else {
        return Ok(empty_backup_status());
    };
    let current_device = device_id(app);

    let copies = match location {
        VaultLocation::Local(root) => list_local_backups(&root, &current_device)?,
        #[cfg(target_os = "android")]
        VaultLocation::Saf(saf) => list_saf_backups(app, &saf.root, &current_device)?,
    };

    let total_bytes = copies.iter().map(|copy| copy.bytes).sum();
    // La copia de hoy de otro dispositivo no debe impedir la copia de este.
    let last_backup = copies
        .iter()
        .filter(|copy| copy.current_device)
        .map(|copy| copy.date.clone())
        .max();
    Ok(BackupStatus {
        retention_days: BACKUP_RETENTION,
        last_backup,
        copies,
        total_bytes,
    })
}

/// Crea como máximo una copia completa por día y dispositivo en
/// `Longlife/<device>/<fecha>`. Así dos dispositivos nunca escriben la misma
/// carpeta del día y FolderSync no tiene que resolver un conflicto destructivo.
#[tauri::command]
pub async fn vault_run_backup(
    app: AppHandle,
    force: Option<bool>,
) -> Result<BackupRunResult, String> {
    let force = force.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || run_daily_backup(&app, force))
        .await
        .map_err(|error| format!("No se pudo crear la copia: {error}"))?
}

pub fn run_daily_backup(app: &AppHandle, force: bool) -> Result<BackupRunResult, String> {
    let Some(location) = current_location(app)? else {
        return Ok(BackupRunResult {
            created: false,
            skipped: Some("No hay una bóveda seleccionada.".to_string()),
            date: None,
            status: empty_backup_status(),
        });
    };

    let date = today();
    let device = device_id(app);
    // El lock también protege la fecha de omisión: si el usuario borra las
    // copias mientras una copia automática está en curso, esa copia no debe
    // recrearlas después del borrado.
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut cfg = load_config(app);
    let skipped_today = cfg.backup_skip_date.as_deref() == Some(date.as_str());
    if skipped_today && !force {
        return Ok(BackupRunResult {
            created: false,
            skipped: Some("Has borrado las copias de hoy; se reanudará mañana.".to_string()),
            date: None,
            status: backup_status(app)?,
        });
    }
    if cfg.backup_skip_date.is_some() {
        cfg.backup_skip_date = None;
        save_config(app, &cfg)?;
    }

    let mut skipped: Option<String> = None;

    match location {
        VaultLocation::Local(root) => {
            ensure_local_layout(&root)?;
            let omega = root.join(DATA_DIR);
            let (files, _) = count_dir(&omega)?;
            if files == 0 {
                skipped = Some("La carpeta omega está vacía; no hay nada que copiar.".to_string());
            } else {
                let day = root.join(BACKUP_DIR).join(&device).join(&date);
                // Una copia completa pero con menos archivos que los del
                // manifiesto está dañada (sincronización a medias, borrado
                // externo…): se rehace en vez de darla por buena.
                let healthy = day.join(BACKUP_MARKER).is_file() && manifest_matches(&day)?;
                if healthy {
                    skipped = Some("La copia de hoy ya existe.".to_string());
                } else {
                    if day.exists() {
                        let _ = fs::remove_dir_all(&day);
                    }
                    fs::create_dir_all(&day)
                        .map_err(|e| format!("No se pudo crear la copia: {e}"))?;
                    let (copied_files, copied_bytes) = copy_dir_recursive(&omega, &day)?;
                    let meta = serde_json::to_vec_pretty(&snapshot_meta(
                        &device,
                        copied_files,
                        copied_bytes,
                    ))
                    .map_err(|e| format!("No se pudo describir la copia: {e}"))?;
                    fs::write(day.join(SNAPSHOT_META), meta)
                        .map_err(|e| format!("No se pudo describir la copia: {e}"))?;
                    fs::write(day.join(BACKUP_MARKER), b"ok\n")
                        .map_err(|e| format!("No se pudo cerrar la copia: {e}"))?;
                    prune_local_device_backups(&root, &device)?;
                }
            }
        }
        #[cfg(target_os = "android")]
        VaultLocation::Saf(saf) => {
            skipped = run_saf_backup(app, &saf.root, &date, &device)?;
        }
    }

    let created = skipped.is_none();
    Ok(BackupRunResult {
        created,
        skipped,
        date: if created { Some(date) } else { None },
        status: backup_status(app)?,
    })
}

#[tauri::command]
pub async fn vault_restore_snapshot(app: AppHandle, id: String) -> Result<RestoreResult, String> {
    tauri::async_runtime::spawn_blocking(move || restore_snapshot(&app, &id))
        .await
        .map_err(|error| format!("No se pudo restaurar la copia: {error}"))?
}

fn restore_folder_name(id: &str) -> String {
    let safe: String = id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    // Dos restauraciones del mismo día no deben compartir carpeta: la segunda
    // podría sobrescribir los eventos importados por la primera.
    let unique = uuid::Uuid::new_v4().simple().to_string();
    format!("restored-{safe}-{stamp}-{}", &unique[..8])
}

fn dedup_events(events: &mut Vec<Event>) {
    events.sort_by(|a, b| a.timestamp.cmp(&b.timestamp).then(a.id.cmp(&b.id)));
    events.dedup_by(|a, b| a.id == b.id);
}

fn build_restore_result(
    current: &[Event],
    mut snapshot_events: Vec<Event>,
    folder: String,
) -> (RestoreResult, Vec<Event>) {
    dedup_events(&mut snapshot_events);
    let source_events = snapshot_events.len() as u64;
    let current_ids: HashSet<&str> = current.iter().map(|event| event.id.as_str()).collect();
    let missing: Vec<Event> = snapshot_events
        .into_iter()
        .filter(|event| !current_ids.contains(event.id.as_str()))
        .collect();
    let imported = missing.len() as u64;
    (
        RestoreResult {
            imported,
            already_present: source_events.saturating_sub(imported),
            source_events,
            folder,
        },
        missing,
    )
}

fn restore_local_snapshot(root: &Path, id: &str) -> Result<RestoreResult, String> {
    let dir = resolve_snapshot_dir(root, id)?;
    let mut snapshot_events = Vec::new();
    read_local_events_from_dir(&dir, &mut snapshot_events);
    let current = read_local_events(root)?;
    let folder = restore_folder_name(id);
    let (result, missing) = build_restore_result(&current, snapshot_events, folder.clone());
    if missing.is_empty() {
        return Ok(result);
    }

    let restore_dir = root.join(DATA_DIR).join(DEVICES_DIR).join(&folder);
    fs::create_dir_all(&restore_dir)
        .map_err(|e| format!("No se pudo preparar la restauración: {e}"))?;
    let mut content = String::new();
    for event in missing {
        content.push_str(&serde_json::to_string(&event).map_err(|e| e.to_string())?);
        content.push('\n');
    }
    fs::write(restore_dir.join(EVENTS_FILE), content)
        .map_err(|e| format!("No se pudo guardar la restauración: {e}"))?;
    Ok(RestoreResult {
        folder: format!("omega/{DEVICES_DIR}/{folder}"),
        ..result
    })
}

fn restore_snapshot(app: &AppHandle, id: &str) -> Result<RestoreResult, String> {
    let location =
        current_location(app)?.ok_or_else(|| "No hay una bóveda seleccionada.".to_string())?;
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    match location {
        VaultLocation::Local(root) => restore_local_snapshot(&root, id),
        #[cfg(target_os = "android")]
        VaultLocation::Saf(saf) => restore_saf_snapshot(app, &saf.root, id),
    }
}

#[tauri::command]
pub async fn vault_delete_backups(app: AppHandle) -> Result<BackupStatus, String> {
    tauri::async_runtime::spawn_blocking(move || delete_backups(&app))
        .await
        .map_err(|error| format!("No se pudieron borrar las copias: {error}"))?
}

pub fn delete_backups(app: &AppHandle) -> Result<BackupStatus, String> {
    let Some(location) = current_location(app)? else {
        return Ok(empty_backup_status());
    };

    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    match location {
        VaultLocation::Local(root) => {
            let backup_root = root.join(BACKUP_DIR);
            if backup_root.exists() {
                fs::remove_dir_all(&backup_root)
                    .map_err(|e| format!("No se pudieron borrar las copias: {e}"))?;
            }
        }
        #[cfg(target_os = "android")]
        VaultLocation::Saf(saf) => {
            if let Some(backup_root) = saf_find_dir(app, &saf.root, BACKUP_DIR)? {
                saf_delete_tree(app, &backup_root)?;
            }
        }
    }

    // No recrear inmediatamente la copia de hoy por el automatismo diario.
    let mut cfg = load_config(app);
    cfg.backup_skip_date = Some(today());
    save_config(app, &cfg)?;

    backup_status(app)
}

/* ------------------------------------------------------------------ */
/* SAF (Android)                                                      */
/* ------------------------------------------------------------------ */

#[cfg(target_os = "android")]
fn read_saf_events_from_dir(
    app: &AppHandle,
    dir: &FsUri,
    events: &mut Vec<Event>,
) -> Result<(), String> {
    for entry in app
        .android_fs()
        .read_dir(dir)
        .map_err(|e| format!("No se pudo leer la carpeta SAF: {e}"))?
    {
        let name = entry.name();
        if name.is_empty() || name == "." || name == ".." {
            continue;
        }
        if entry.is_dir() {
            read_saf_events_from_dir(app, entry.uri(), events)?;
            continue;
        }
        if name != EVENTS_FILE && !name.ends_with(".json") {
            continue;
        }
        let content = app
            .android_fs()
            .read_to_string(entry.uri())
            .map_err(|e| format!("No se pudo leer el archivo de eventos: {e}"))?;
        parse_event_content(&content, events);
    }
    Ok(())
}

#[cfg(target_os = "android")]
fn read_saf_events(app: &AppHandle, root: &FsUri) -> Result<Vec<Event>, String> {
    let mut events = Vec::new();
    let Some(omega) = saf_find_dir(app, root, DATA_DIR)? else {
        return Ok(events);
    };
    let Some(devices) = saf_find_dir(app, &omega, DEVICES_DIR)? else {
        return Ok(events);
    };
    read_saf_events_from_dir(app, &devices, &mut events)?;
    dedup_events(&mut events);
    Ok(events)
}

#[cfg(target_os = "android")]
fn saf_snapshot_dir(app: &AppHandle, root: &FsUri, id: &str) -> Result<FsUri, String> {
    let parts: Vec<&str> = id.split('/').filter(|part| !part.is_empty()).collect();
    if parts.is_empty() || parts.len() > 2 {
        return Err("La copia seleccionada no es válida.".to_string());
    }
    let Some(mut dir) = saf_find_dir(app, root, BACKUP_DIR)? else {
        return Err("La copia ya no existe. Actualiza la lista.".to_string());
    };
    for part in parts {
        if part == "." || part == ".." || part.contains('\\') || part.len() > 128 {
            return Err("La copia seleccionada no es válida.".to_string());
        }
        dir = saf_find_dir(app, &dir, part)?
            .ok_or_else(|| "La copia ya no existe. Actualiza la lista.".to_string())?;
    }
    Ok(dir)
}

#[cfg(target_os = "android")]
fn restore_saf_snapshot(app: &AppHandle, root: &FsUri, id: &str) -> Result<RestoreResult, String> {
    let dir = saf_snapshot_dir(app, root, id)?;
    let mut snapshot_events = Vec::new();
    read_saf_events_from_dir(app, &dir, &mut snapshot_events)?;
    let current = read_saf_events(app, root)?;
    let folder = restore_folder_name(id);
    let (result, missing) = build_restore_result(&current, snapshot_events, folder.clone());
    if missing.is_empty() {
        return Ok(result);
    }

    let relative = format!("{DATA_DIR}/{DEVICES_DIR}/{folder}/{EVENTS_FILE}");
    let file = app
        .android_fs()
        .create_new_file(root, &relative, Some("application/x-ndjson"))
        .map_err(|e| format!("No se pudo preparar la restauración: {e}"))?;
    let mut content = String::new();
    for event in missing {
        content.push_str(&serde_json::to_string(&event).map_err(|e| e.to_string())?);
        content.push('\n');
    }
    app.android_fs()
        .write(&file, content.as_bytes())
        .map_err(|e| format!("No se pudo guardar la restauración: {e}"))?;
    Ok(RestoreResult {
        folder: format!("omega/{DEVICES_DIR}/{folder}"),
        ..result
    })
}

#[cfg(target_os = "android")]
fn saf_find_dir(app: &AppHandle, parent: &FsUri, name: &str) -> Result<Option<FsUri>, String> {
    for entry in app
        .android_fs()
        .read_dir(parent)
        .map_err(|e| format!("No se pudo leer la carpeta SAF: {e}"))?
    {
        if entry.name() == name && entry.is_dir() {
            return Ok(Some(entry.uri().clone()));
        }
    }
    Ok(None)
}

#[cfg(target_os = "android")]
fn saf_find_file(app: &AppHandle, parent: &FsUri, name: &str) -> Result<Option<FsUri>, String> {
    for entry in app
        .android_fs()
        .read_dir(parent)
        .map_err(|e| format!("No se pudo leer la carpeta SAF: {e}"))?
    {
        if entry.name() == name && entry.is_file() {
            return Ok(Some(entry.uri().clone()));
        }
    }
    Ok(None)
}

#[cfg(target_os = "android")]
fn saf_lookup_file(app: &AppHandle, root: &FsUri, relative: &str) -> Result<Option<FsUri>, String> {
    let parts: Vec<&str> = relative
        .trim()
        .trim_start_matches('/')
        .split('/')
        .filter(|part| !part.is_empty() && *part != "." && *part != "..")
        .collect();
    if parts.is_empty() {
        return Ok(None);
    }

    let mut dir = root.clone();
    for (index, part) in parts.iter().enumerate() {
        if index + 1 == parts.len() {
            return saf_find_file(app, &dir, part);
        }
        match saf_find_dir(app, &dir, part)? {
            Some(child) => dir = child,
            None => return Ok(None),
        }
    }
    Ok(None)
}

#[cfg(target_os = "android")]
fn saf_collect_files(
    app: &AppHandle,
    dir: &FsUri,
    prefix: &str,
    depth: usize,
    out: &mut Vec<(String, FsUri)>,
) -> Result<(), String> {
    if depth > MAX_SAF_DEPTH {
        return Err("La carpeta SAF tiene demasiados niveles.".to_string());
    }

    for entry in app
        .android_fs()
        .read_dir(dir)
        .map_err(|e| format!("No se pudo leer la carpeta SAF: {e}"))?
    {
        let name = entry.name();
        if name.is_empty()
            || name == "."
            || name == ".."
            || name == BACKUP_MARKER
            || name == SNAPSHOT_META
        {
            continue;
        }
        let relative = if prefix.is_empty() {
            name.to_string()
        } else {
            format!("{prefix}/{name}")
        };
        if entry.is_file() {
            out.push((relative, entry.uri().clone()));
        } else {
            saf_collect_files(app, entry.uri(), &relative, depth + 1, out)?;
        }
    }
    Ok(())
}

#[cfg(target_os = "android")]
fn saf_count_dir(app: &AppHandle, dir: &FsUri) -> Result<(u64, u64), String> {
    let mut files = Vec::new();
    saf_collect_files(app, dir, "", 0, &mut files)?;
    let mut bytes = 0u64;
    for (_, file) in &files {
        bytes += app
            .android_fs()
            .read(file)
            .map(|content| content.len() as u64)
            .unwrap_or(0);
    }
    Ok((files.len() as u64, bytes))
}

#[cfg(target_os = "android")]
fn saf_delete_tree(app: &AppHandle, dir: &FsUri) -> Result<(), String> {
    for entry in app
        .android_fs()
        .read_dir(dir)
        .map_err(|e| format!("No se pudo leer la copia SAF: {e}"))?
    {
        if entry.is_file() {
            app.android_fs()
                .remove_file(entry.uri())
                .map_err(|e| format!("No se pudo borrar un archivo de la copia: {e}"))?;
        } else {
            saf_delete_tree(app, entry.uri())?;
        }
    }
    Ok(())
}

#[cfg(target_os = "android")]
fn saf_read_snapshot_meta(app: &AppHandle, dir: &FsUri) -> Option<SnapshotMeta> {
    let file = saf_find_file(app, dir, SNAPSHOT_META).ok().flatten()?;
    let text = app.android_fs().read_to_string(&file).ok()?;
    serde_json::from_str::<SnapshotMeta>(&text).ok()
}

/// Igual que `manifest_matches`, pero sobre SAF. Sin manifiesto no se puede
/// verificar y la copia se da por válida.
#[cfg(target_os = "android")]
fn saf_manifest_matches(app: &AppHandle, dir: &FsUri) -> Result<bool, String> {
    let Some(meta) = saf_read_snapshot_meta(app, dir) else {
        return Ok(true);
    };
    let Some(expected_files) = meta.files else {
        return Ok(true);
    };
    let (files, bytes) = saf_count_dir(app, dir)?;
    if expected_files != files {
        return Ok(false);
    }
    match meta.bytes {
        Some(expected_bytes) => Ok(expected_bytes == bytes),
        None => Ok(true),
    }
}

#[cfg(target_os = "android")]
#[allow(clippy::too_many_arguments)]
fn saf_snapshot_info(
    app: &AppHandle,
    dir: &FsUri,
    id: String,
    date: String,
    fallback_device: &str,
    fallback_label: &str,
    legacy: bool,
    current_device: &str,
) -> Result<Option<SnapshotInfo>, String> {
    let (files, bytes) = saf_count_dir(app, dir)?;
    if files == 0 {
        return Ok(None);
    }
    let meta = saf_read_snapshot_meta(app, dir);
    let device_id = meta
        .as_ref()
        .map(|meta| meta.device_id.clone())
        .unwrap_or_else(|| fallback_device.to_string());
    let label = meta
        .as_ref()
        .map(|meta| meta.device_label.clone())
        .unwrap_or_else(|| fallback_label.to_string());
    let expected_files = meta.as_ref().and_then(|meta| meta.files);
    let expected_bytes = meta.as_ref().and_then(|meta| meta.bytes);
    let marker = saf_find_file(app, dir, BACKUP_MARKER)?.is_some();
    let healthy = saf_manifest_matches(app, dir)?;
    Ok(Some(SnapshotInfo {
        id,
        date,
        device_id: device_id.clone(),
        device_label: label,
        files,
        bytes,
        expected_files,
        expected_bytes,
        damaged: marker && !healthy,
        complete: marker && healthy,
        legacy,
        current_device: device_id == current_device,
    }))
}

#[cfg(target_os = "android")]
fn list_saf_backups(
    app: &AppHandle,
    root: &FsUri,
    current_device: &str,
) -> Result<Vec<SnapshotInfo>, String> {
    let Some(backup_root) = saf_find_dir(app, root, BACKUP_DIR)? else {
        return Ok(Vec::new());
    };

    let mut copies = Vec::new();
    for entry in app
        .android_fs()
        .read_dir(&backup_root)
        .map_err(|e| format!("No se pudo leer Longlife: {e}"))?
    {
        if !entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();

        if is_date_name(&name) {
            if let Some(info) = saf_snapshot_info(
                app,
                entry.uri(),
                name.clone(),
                name,
                "legacy",
                "Copia antigua (sin dispositivo)",
                true,
                current_device,
            )? {
                copies.push(info);
            }
            continue;
        }

        for day in app
            .android_fs()
            .read_dir(entry.uri())
            .map_err(|e| format!("No se pudo leer Longlife: {e}"))?
        {
            if !day.is_dir() {
                continue;
            }
            let date = day.name().to_string();
            if !is_date_name(&date) {
                continue;
            }
            let id = format!("{name}/{date}");
            if let Some(info) = saf_snapshot_info(
                app,
                day.uri(),
                id,
                date,
                &name,
                &format!("Dispositivo {}", short_id(&name)),
                false,
                current_device,
            )? {
                copies.push(info);
            }
        }
    }
    copies.sort_by(|a, b| a.date.cmp(&b.date).then(a.device_id.cmp(&b.device_id)));
    Ok(copies)
}

#[cfg(target_os = "android")]
fn run_saf_backup(
    app: &AppHandle,
    root: &FsUri,
    date: &str,
    device: &str,
) -> Result<Option<String>, String> {
    let Some(omega) = saf_find_dir(app, root, DATA_DIR)? else {
        return Ok(Some(
            "La carpeta omega no existe; no hay nada que copiar.".to_string(),
        ));
    };

    let mut files = Vec::new();
    saf_collect_files(app, &omega, "", 0, &mut files)?;
    if files.is_empty() {
        return Ok(Some(
            "La carpeta omega está vacía; no hay nada que copiar.".to_string(),
        ));
    }

    let backup_root = saf_find_dir(app, root, BACKUP_DIR)?;
    let device_dir = if let Some(backup_root) = &backup_root {
        saf_find_dir(app, backup_root, device)?
    } else {
        None
    };
    let day_dir = if let Some(device_dir) = &device_dir {
        saf_find_dir(app, device_dir, date)?
    } else {
        None
    };

    if let Some(day_dir) = &day_dir {
        // Igual que en local: una copia marcada como completa pero con menos
        // archivos que el manifiesto se rehace.
        if saf_find_file(app, day_dir, BACKUP_MARKER)?.is_some()
            && saf_manifest_matches(app, day_dir)?
        {
            return Ok(Some("La copia de hoy ya existe.".to_string()));
        }
        saf_delete_tree(app, day_dir)?;
    }

    let mut copied_bytes = 0u64;
    for (relative, file) in &files {
        let bytes = app
            .android_fs()
            .read(file)
            .map_err(|e| format!("No se pudo leer un archivo de omega: {e}"))?;
        copied_bytes += bytes.len() as u64;
        let target = format!("{BACKUP_DIR}/{device}/{date}/{relative}");
        let created = app
            .android_fs()
            .create_new_file(root, &target, Some(mime_for(relative)))
            .map_err(|e| format!("No se pudo escribir la copia: {e}"))?;
        app.android_fs()
            .write(&created, &bytes)
            .map_err(|e| format!("No se pudo escribir la copia: {e}"))?;
    }

    let meta = serde_json::to_vec_pretty(&snapshot_meta(device, files.len() as u64, copied_bytes))
        .map_err(|e| format!("No se pudo describir la copia: {e}"))?;
    let meta_path = format!("{BACKUP_DIR}/{device}/{date}/{SNAPSHOT_META}");
    let meta_uri = app
        .android_fs()
        .create_new_file(root, &meta_path, Some("application/json"))
        .map_err(|e| format!("No se pudo describir la copia: {e}"))?;
    app.android_fs()
        .write(&meta_uri, &meta)
        .map_err(|e| format!("No se pudo describir la copia: {e}"))?;

    let marker = format!("{BACKUP_DIR}/{device}/{date}/{BACKUP_MARKER}");
    let marker_uri = app
        .android_fs()
        .create_new_file(root, &marker, Some("text/plain"))
        .map_err(|e| format!("No se pudo cerrar la copia: {e}"))?;
    app.android_fs()
        .write(&marker_uri, b"ok\n")
        .map_err(|e| format!("No se pudo cerrar la copia: {e}"))?;

    prune_saf_device_backups(app, root, device)?;
    Ok(None)
}

#[cfg(target_os = "android")]
fn prune_saf_device_backups(app: &AppHandle, root: &FsUri, device: &str) -> Result<(), String> {
    let Some(backup_root) = saf_find_dir(app, root, BACKUP_DIR)? else {
        return Ok(());
    };
    let Some(device_dir) = saf_find_dir(app, &backup_root, device)? else {
        return Ok(());
    };

    let mut days: Vec<(String, FsUri)> = Vec::new();
    for entry in app
        .android_fs()
        .read_dir(&device_dir)
        .map_err(|e| format!("No se pudo leer Longlife: {e}"))?
    {
        if !entry.is_dir() || !is_date_name(entry.name()) {
            continue;
        }
        let (files, _) = saf_count_dir(app, entry.uri())?;
        if files > 0 {
            days.push((entry.name().to_string(), entry.uri().clone()));
        }
    }
    days.sort_by(|a, b| a.0.cmp(&b.0));

    while days.len() > BACKUP_RETENTION {
        let (_, day) = days.remove(0);
        saf_delete_tree(app, &day)?;
    }
    Ok(())
}

#[cfg(target_os = "android")]
fn mime_for(name: &str) -> &'static str {
    if name.ends_with(".jsonl") {
        "application/x-ndjson"
    } else if name.ends_with(".json") {
        "application/json"
    } else if name.ends_with(".txt") || name.ends_with(".md") {
        "text/plain"
    } else {
        "application/octet-stream"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("better-tracker-{name}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn recognizes_only_real_dates() {
        assert!(is_date_name("2026-10-28"));
        assert!(!is_date_name("2026-13-01"));
        assert!(!is_date_name("2026-1-01"));
        assert!(!is_date_name("Longlife"));
        assert!(!is_date_name("2026-10-28-extra"));
    }

    #[test]
    fn migrates_legacy_devices_once() {
        let root = temp_dir("migrate");
        let legacy = root.join(DEVICES_DIR).join("device-a");
        fs::create_dir_all(&legacy).unwrap();
        fs::write(legacy.join(EVENTS_FILE), "{\"id\":\"1\"}\n").unwrap();

        ensure_local_layout(&root).unwrap();

        assert!(!root.join(DEVICES_DIR).exists());
        assert!(root
            .join(DATA_DIR)
            .join(DEVICES_DIR)
            .join("device-a")
            .join(EVENTS_FILE)
            .is_file());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn keeps_both_sources_when_legacy_device_already_exists() {
        let root = temp_dir("migrate-collision");
        let legacy = root.join(DEVICES_DIR).join("device-a");
        fs::create_dir_all(&legacy).unwrap();
        fs::write(legacy.join(EVENTS_FILE), "{\"id\":\"old\"}\n").unwrap();

        let current = root.join(DATA_DIR).join(DEVICES_DIR).join("device-a");
        fs::create_dir_all(&current).unwrap();
        fs::write(current.join(EVENTS_FILE), "{\"id\":\"new\"}\n").unwrap();

        ensure_local_layout(&root).unwrap();

        assert!(!root.join(DEVICES_DIR).exists());
        let dirs: Vec<_> = fs::read_dir(root.join(DATA_DIR).join(DEVICES_DIR))
            .unwrap()
            .flatten()
            .collect();
        assert_eq!(dirs.len(), 2, "the old device must not be discarded");
        let old = dirs
            .iter()
            .map(|entry| fs::read_to_string(entry.path().join(EVENTS_FILE)).unwrap())
            .find(|content| content.contains("\"old\""))
            .expect("legacy event preserved");
        assert!(old.contains("\"old\""));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn copies_nested_tree_and_counts_files() {
        let root = temp_dir("copy");
        let source = root.join("source");
        fs::create_dir_all(source.join("a/b")).unwrap();
        fs::write(source.join("one.jsonl"), b"one\n").unwrap();
        fs::write(source.join("a/b/two.json"), b"{}").unwrap();
        fs::write(source.join(BACKUP_MARKER), b"ignore\n").unwrap();

        let destination = root.join("destination");
        let (files, bytes) = copy_dir_recursive(&source, &destination).unwrap();
        assert_eq!(files, 3);
        assert!(bytes > 0);
        assert!(destination.join("a/b/two.json").is_file());

        let (counted_files, counted_bytes) = count_dir(&destination).unwrap();
        assert_eq!(counted_files, 2, "the marker must not count as data");
        assert!(counted_bytes > 0);

        let _ = fs::remove_dir_all(root);
    }

    fn sample_event(id: &str) -> Event {
        Event {
            id: id.to_string(),
            device_id: "device-a".to_string(),
            timestamp: format!("2026-10-28T12:00:0{}Z", id.len() % 10),
            kind: "weight.logged".to_string(),
            payload: serde_json::json!({ "date": "2026-10-28", "kg": 80 }),
        }
    }

    fn write_sample_event(root: &Path, event: &Event) {
        let file_name = event_file_name(event).unwrap();
        let payload = serde_json::to_vec(event).unwrap();
        write_local_event(root, event, &file_name, &payload).unwrap();
    }

    #[test]
    fn prunes_to_seven_most_recent_days_per_device() {
        let root = temp_dir("prune");
        let backup_root = root.join(BACKUP_DIR);
        for day in 1..=9 {
            let dir = backup_root
                .join("device-a")
                .join(format!("2026-10-{day:02}"));
            fs::create_dir_all(&dir).unwrap();
            fs::write(dir.join("events.jsonl"), b"x").unwrap();
            fs::write(dir.join(BACKUP_MARKER), b"ok\n").unwrap();
        }
        // Las copias de otro dispositivo no se tocan.
        let other = backup_root.join("device-b").join("2026-10-01");
        fs::create_dir_all(&other).unwrap();
        fs::write(other.join("events.jsonl"), b"x").unwrap();
        let empty = backup_root.join("device-a").join("2026-09-30");
        fs::create_dir_all(&empty).unwrap();

        prune_local_device_backups(&root, "device-a").unwrap();
        let remaining = list_local_backups(&root, "device-a").unwrap();
        let own: Vec<_> = remaining
            .iter()
            .filter(|copy| copy.id.starts_with("device-a/"))
            .collect();
        assert_eq!(own.len(), BACKUP_RETENTION);
        assert_eq!(own.first().unwrap().date, "2026-10-03");
        assert_eq!(own.last().unwrap().date, "2026-10-09");
        assert!(empty.exists(), "an empty date folder is not a backup");
        assert!(other.exists(), "other devices keep their snapshots");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn stores_one_file_per_event_and_deduplicates_legacy_jsonl() {
        let root = temp_dir("events");
        let event = sample_event("event-a");
        write_sample_event(&root, &event);
        write_sample_event(&root, &event);

        let device = root.join(DATA_DIR).join(DEVICES_DIR).join("device-a");
        let legacy = serde_json::to_string(&event).unwrap();
        fs::write(device.join(EVENTS_FILE), format!("{legacy}\n{legacy}\n")).unwrap();

        let events = read_local_events(&root).unwrap();
        assert_eq!(events.len(), 1, "duplicate ids are ignored");
        assert_eq!(events[0].id, "event-a");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn restores_missing_events_without_overwriting_current_vault() {
        let root = temp_dir("restore");
        let current = sample_event("current");
        write_sample_event(&root, &current);

        let snapshot_dir = root
            .join(BACKUP_DIR)
            .join("device-phone")
            .join("2026-10-27");
        fs::create_dir_all(&snapshot_dir).unwrap();
        let old = sample_event("only-in-snapshot");
        fs::write(
            snapshot_dir.join(EVENTS_FILE),
            format!(
                "{}\n{}\n",
                serde_json::to_string(&current).unwrap(),
                serde_json::to_string(&old).unwrap()
            ),
        )
        .unwrap();
        fs::write(snapshot_dir.join(BACKUP_MARKER), b"ok\n").unwrap();

        let result = restore_local_snapshot(&root, "device-phone/2026-10-27").unwrap();
        assert_eq!(result.imported, 1);
        assert_eq!(result.already_present, 1);
        assert_eq!(result.source_events, 2);

        let events = read_local_events(&root).unwrap();
        assert_eq!(events.len(), 2);
        assert!(events.iter().any(|event| event.id == "current"));
        assert!(events.iter().any(|event| event.id == "only-in-snapshot"));

        let _ = fs::remove_dir_all(root);
    }

    fn snapshot_with_manifest(root: &Path, files: &[(&str, &[u8])]) -> PathBuf {
        let dir = root.join(BACKUP_DIR).join("device-a").join("2026-10-28");
        fs::create_dir_all(&dir).unwrap();
        for (name, content) in files {
            let path = dir.join(name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(path, content).unwrap();
        }
        let (count, bytes) = count_dir(&dir).unwrap();
        let meta = serde_json::to_vec_pretty(&snapshot_meta("device-a", count, bytes)).unwrap();
        fs::write(dir.join(SNAPSHOT_META), meta).unwrap();
        fs::write(dir.join(BACKUP_MARKER), b"ok\n").unwrap();
        dir
    }

    fn snapshot_info(dir: &Path) -> SnapshotInfo {
        local_snapshot_info(
            dir,
            "device-a/2026-10-28".to_string(),
            "2026-10-28".to_string(),
            "device-a",
            "Dispositivo",
            false,
            "device-a",
        )
        .unwrap()
        .expect("la copia debe listarse")
    }

    #[test]
    fn snapshot_counts_ignore_its_own_metadata() {
        let root = temp_dir("count-meta");
        let dir = snapshot_with_manifest(&root, &[("events/a.json", b"aaaa")]);

        let (files, bytes) = count_dir(&dir).unwrap();
        assert_eq!(files, 1, "snapshot.json y el marcador no son datos");
        assert_eq!(bytes, 4);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn detects_snapshots_that_do_not_match_their_manifest() {
        let root = temp_dir("integrity");
        let dir = snapshot_with_manifest(
            &root,
            &[("events/a.json", b"aaaa"), ("events/b.json", b"bbbb")],
        );

        let healthy = snapshot_info(&dir);
        assert!(healthy.complete && !healthy.damaged);
        assert_eq!(healthy.expected_files, Some(2));
        assert_eq!(healthy.expected_bytes, Some(8));

        // Sincronización a medias: el marcador llegó pero falta un archivo.
        fs::remove_file(dir.join("events/b.json")).unwrap();
        let missing = snapshot_info(&dir);
        assert!(!missing.complete, "una copia incompleta no es restaurable de fiar");
        assert!(missing.damaged);
        assert_eq!(missing.files, 1);
        assert_eq!(missing.expected_files, Some(2));

        // Un archivo extra tampoco cuadra.
        fs::write(dir.join("events/b.json"), b"bbbb").unwrap();
        fs::write(dir.join("events/c.json"), b"c").unwrap();
        assert!(!manifest_matches(&dir).unwrap());
        assert!(snapshot_info(&dir).damaged);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn snapshots_without_manifest_are_still_considered_valid() {
        let root = temp_dir("no-manifest");
        let dir = root.join(BACKUP_DIR).join("device-a").join("2026-10-28");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("events.jsonl"), b"{\"id\":\"1\"}\n").unwrap();
        fs::write(dir.join(BACKUP_MARKER), b"ok\n").unwrap();

        assert!(manifest_matches(&dir).unwrap());
        let info = snapshot_info(&dir);
        assert!(info.complete && !info.damaged);
        assert_eq!(info.expected_files, None);

        let _ = fs::remove_dir_all(root);
    }
}
