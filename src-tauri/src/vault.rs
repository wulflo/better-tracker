//! Almacenamiento local de la bóveda.
//!
//! La app solo usa `<bóveda>/omega` como fuente de datos. Las copias diarias
//! viven en `<bóveda>/Longlife/<AAAA-MM-DD>` y solo se enumeran para mostrar su
//! estado o borrarlas; para restaurar, el usuario debe mover una copia a `omega`.
//!
//! En Android la bóveda se elige con el selector SAF y se conserva el permiso
//! entre reinicios, igual que en SinNotas. En escritorio se usa una carpeta
//! normal del sistema.

use serde::{Deserialize, Serialize};
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
pub const BACKUP_DIR: &str = "Longlife";
const BACKUP_MARKER: &str = ".backup-complete";
pub const BACKUP_RETENTION: usize = 7;
#[cfg(target_os = "android")]
const MAX_SAF_DEPTH: usize = 64;

/// Serializa las escrituras dentro del proceso para que dos comandos no
/// intercalen líneas en el mismo JSONL.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize, Clone)]
pub struct Event {
    pub id: String,
    pub device_id: String,
    pub timestamp: String,
    pub kind: String,
    pub payload: serde_json::Value,
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
    let location =
        current_location(app)?.ok_or_else(|| "No hay una bóveda seleccionada.".to_string())?;
    let line = serde_json::to_string(event).map_err(|e| e.to_string())? + "\n";

    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());

    match location {
        VaultLocation::Local(root) => {
            ensure_local_layout(&root)?;
            let dir = root.join(DATA_DIR).join(DEVICES_DIR).join(&event.device_id);
            fs::create_dir_all(&dir)
                .map_err(|e| format!("No se pudo crear la carpeta del dispositivo: {e}"))?;
            let file = dir.join(EVENTS_FILE);
            let mut handle = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&file)
                .map_err(|e| format!("No se pudo abrir el archivo de eventos: {e}"))?;
            handle
                .write_all(line.as_bytes())
                .map_err(|e| format!("No se pudo escribir el evento: {e}"))?;
            handle
                .sync_all()
                .map_err(|e| format!("No se pudo confirmar el evento: {e}"))?;
            Ok(())
        }
        #[cfg(target_os = "android")]
        VaultLocation::Saf(saf) => {
            let relative = format!("{DATA_DIR}/{DEVICES_DIR}/{}/{EVENTS_FILE}", event.device_id);
            append_saf_line(app, &saf.root, &relative, &line)
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
    Ok(events)
}

fn read_local_events(root: &Path) -> Result<Vec<Event>, String> {
    ensure_local_layout(root)?;
    let devices_dir = root.join(DATA_DIR).join(DEVICES_DIR);
    let mut events = Vec::new();

    let entries = match fs::read_dir(&devices_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(events),
        Err(error) => {
            return Err(format!(
                "No se pudo leer la carpeta de dispositivos: {error}"
            ))
        }
    };

    for entry in entries.flatten() {
        if !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
            continue;
        }
        let file = entry.path().join(EVENTS_FILE);
        let Ok(content) = fs::read_to_string(&file) else {
            continue;
        };
        for line in content.lines() {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(event) = serde_json::from_str::<Event>(line) {
                events.push(event);
            }
        }
    }

    Ok(events)
}

/* ------------------------------------------------------------------ */
/* Copias diarias Longlife                                           */
/* ------------------------------------------------------------------ */

#[derive(Serialize, Clone)]
pub struct BackupDay {
    pub date: String,
    pub files: u64,
    pub bytes: u64,
}

#[derive(Serialize, Clone)]
pub struct BackupStatus {
    pub retention_days: usize,
    pub last_backup: Option<String>,
    pub copies: Vec<BackupDay>,
    pub total_bytes: u64,
}

#[derive(Serialize, Clone)]
pub struct BackupRunResult {
    pub created: bool,
    pub skipped: Option<String>,
    pub date: Option<String>,
    pub status: BackupStatus,
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
        if name == BACKUP_MARKER {
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

fn list_local_backups(root: &Path) -> Result<Vec<BackupDay>, String> {
    let backup_root = root.join(BACKUP_DIR);
    let entries = match fs::read_dir(&backup_root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("No se pudo leer Longlife: {error}")),
    };

    let mut copies = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(date) = name.to_str() else { continue };
        if !is_date_name(date) || !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
            continue;
        }
        let (files, bytes) = count_dir(&entry.path())?;
        if files > 0 {
            copies.push(BackupDay {
                date: date.to_string(),
                files,
                bytes,
            });
        }
    }
    copies.sort_by(|a, b| a.date.cmp(&b.date));
    Ok(copies)
}

fn prune_local_backups(root: &Path) -> Result<(), String> {
    let backup_root = root.join(BACKUP_DIR);
    let Ok(entries) = fs::read_dir(&backup_root) else {
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
            // No cuentes carpetas de fecha vacías: no son copias y no deben
            // desplazar a una copia completa del límite de retención.
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

    let copies = match location {
        VaultLocation::Local(root) => list_local_backups(&root)?,
        #[cfg(target_os = "android")]
        VaultLocation::Saf(saf) => list_saf_backups(app, &saf.root)?,
    };

    let total_bytes = copies.iter().map(|copy| copy.bytes).sum();
    let last_backup = copies.last().map(|copy| copy.date.clone());
    Ok(BackupStatus {
        retention_days: BACKUP_RETENTION,
        last_backup,
        copies,
        total_bytes,
    })
}

/// Crea como máximo una copia completa por día en `Longlife/<fecha>` y
/// conserva las 7 más recientes. Si la copia del día ya está completa no hace
/// nada; si quedó a medias la reemplaza.
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
                let day = root.join(BACKUP_DIR).join(&date);
                let complete = day.join(BACKUP_MARKER).is_file();
                if complete {
                    skipped = Some("La copia de hoy ya existe.".to_string());
                } else {
                    if day.exists() {
                        let _ = fs::remove_dir_all(&day);
                    }
                    fs::create_dir_all(&day)
                        .map_err(|e| format!("No se pudo crear la copia: {e}"))?;
                    copy_dir_recursive(&omega, &day)?;
                    fs::write(day.join(BACKUP_MARKER), b"ok\n")
                        .map_err(|e| format!("No se pudo cerrar la copia: {e}"))?;
                    prune_local_backups(&root)?;
                }
            }
        }
        #[cfg(target_os = "android")]
        VaultLocation::Saf(saf) => {
            skipped = run_saf_backup(app, &saf.root, &date)?;
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
fn append_saf_line(
    app: &AppHandle,
    root: &FsUri,
    relative: &str,
    line: &str,
) -> Result<(), String> {
    let api = app.android_fs();

    if let Some(file) = saf_lookup_file(app, root, relative)? {
        let mut content = api
            .read_to_string(&file)
            .map_err(|e| format!("No se pudo leer el archivo de eventos: {e}"))?;
        content.push_str(line);
        api.write(&file, content.as_bytes())
            .map_err(|e| format!("No se pudo guardar el evento: {e}"))?;
        return Ok(());
    }

    let file = api
        .create_new_file(root, relative, Some("application/x-ndjson"))
        .map_err(|e| format!("No se pudo crear el archivo de eventos: {e}"))?;
    api.write(&file, line.as_bytes())
        .map_err(|e| format!("No se pudo guardar el evento: {e}"))?;
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

    for entry in app
        .android_fs()
        .read_dir(&devices)
        .map_err(|e| format!("No se pudo leer la carpeta de dispositivos: {e}"))?
    {
        if !entry.is_dir() {
            continue;
        }
        let Some(file) = saf_find_file(app, entry.uri(), EVENTS_FILE)? else {
            continue;
        };
        let content = app
            .android_fs()
            .read_to_string(&file)
            .map_err(|e| format!("No se pudo leer el archivo de eventos: {e}"))?;
        for line in content.lines() {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(event) = serde_json::from_str::<Event>(line) {
                events.push(event);
            }
        }
    }

    Ok(events)
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
        if name.is_empty() || name == "." || name == ".." || name == BACKUP_MARKER {
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
fn list_saf_backups(app: &AppHandle, root: &FsUri) -> Result<Vec<BackupDay>, String> {
    let Some(backup_root) = saf_find_dir(app, root, BACKUP_DIR)? else {
        return Ok(Vec::new());
    };

    let mut copies = Vec::new();
    for entry in app
        .android_fs()
        .read_dir(&backup_root)
        .map_err(|e| format!("No se pudo leer Longlife: {e}"))?
    {
        if !entry.is_dir() || !is_date_name(entry.name()) {
            continue;
        }
        let (files, bytes) = saf_count_dir(app, entry.uri())?;
        if files > 0 {
            copies.push(BackupDay {
                date: entry.name().to_string(),
                files,
                bytes,
            });
        }
    }
    copies.sort_by(|a, b| a.date.cmp(&b.date));
    Ok(copies)
}

#[cfg(target_os = "android")]
fn run_saf_backup(app: &AppHandle, root: &FsUri, date: &str) -> Result<Option<String>, String> {
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
    let day_dir = if let Some(backup_root) = &backup_root {
        saf_find_dir(app, backup_root, date)?
    } else {
        None
    };

    if let Some(day_dir) = &day_dir {
        if saf_find_file(app, day_dir, BACKUP_MARKER)?.is_some() {
            return Ok(Some("La copia de hoy ya existe.".to_string()));
        }
        saf_delete_tree(app, day_dir)?;
    }

    for (relative, file) in &files {
        let bytes = app
            .android_fs()
            .read(file)
            .map_err(|e| format!("No se pudo leer un archivo de omega: {e}"))?;
        let target = format!("{BACKUP_DIR}/{date}/{relative}");
        let created = app
            .android_fs()
            .create_new_file(root, &target, Some(mime_for(relative)))
            .map_err(|e| format!("No se pudo escribir la copia: {e}"))?;
        app.android_fs()
            .write(&created, &bytes)
            .map_err(|e| format!("No se pudo escribir la copia: {e}"))?;
    }

    let marker = format!("{BACKUP_DIR}/{date}/{BACKUP_MARKER}");
    let marker_uri = app
        .android_fs()
        .create_new_file(root, &marker, Some("text/plain"))
        .map_err(|e| format!("No se pudo cerrar la copia: {e}"))?;
    app.android_fs()
        .write(&marker_uri, b"ok\n")
        .map_err(|e| format!("No se pudo cerrar la copia: {e}"))?;

    prune_saf_backups(app, root)?;
    Ok(None)
}

#[cfg(target_os = "android")]
fn prune_saf_backups(app: &AppHandle, root: &FsUri) -> Result<(), String> {
    let Some(backup_root) = saf_find_dir(app, root, BACKUP_DIR)? else {
        return Ok(());
    };

    let mut days: Vec<(String, FsUri)> = Vec::new();
    for entry in app
        .android_fs()
        .read_dir(&backup_root)
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

    #[test]
    fn prunes_to_seven_most_recent_days() {
        let root = temp_dir("prune");
        let backup_root = root.join(BACKUP_DIR);
        for day in 1..=9 {
            let dir = backup_root.join(format!("2026-10-{day:02}"));
            fs::create_dir_all(&dir).unwrap();
            fs::write(dir.join("events.jsonl"), b"x").unwrap();
            fs::write(dir.join(BACKUP_MARKER), b"ok\n").unwrap();
        }
        let empty = backup_root.join("2026-09-30");
        fs::create_dir_all(&empty).unwrap();

        prune_local_backups(&root).unwrap();
        let remaining = list_local_backups(&root).unwrap();
        assert_eq!(remaining.len(), BACKUP_RETENTION);
        assert_eq!(remaining.first().unwrap().date, "2026-10-03");
        assert_eq!(remaining.last().unwrap().date, "2026-10-09");
        assert!(empty.exists(), "an empty date folder is not a backup");

        let _ = fs::remove_dir_all(root);
    }
}
