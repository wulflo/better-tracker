use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone)]
pub struct Event {
    pub id: String,
    pub device_id: String,
    pub timestamp: String,
    pub kind: String,
    pub payload: serde_json::Value,
}

pub fn app_data_dir(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().expect("app data dir")
}

pub fn config_path(app: &AppHandle) -> PathBuf {
    app_data_dir(app).join("config.json")
}

#[derive(Serialize, Deserialize, Default)]
pub struct Config {
    pub vault_path: Option<String>,
    pub device_id: Option<String>,
}

pub fn load_config(app: &AppHandle) -> Config {
    let p = config_path(app);
    if let Ok(s) = fs::read_to_string(&p) {
        serde_json::from_str(&s).unwrap_or_default()
    } else {
        Config::default()
    }
}

pub fn save_config(app: &AppHandle, cfg: &Config) {
    let p = config_path(app);
    if let Some(parent) = p.parent() { let _ = fs::create_dir_all(parent); }
    let _ = fs::write(&p, serde_json::to_string_pretty(cfg).unwrap());
}

pub fn device_id(app: &AppHandle) -> String {
    let mut cfg = load_config(app);
    if cfg.device_id.is_none() {
        cfg.device_id = Some(uuid::Uuid::new_v4().to_string());
        save_config(app, &cfg);
    }
    cfg.device_id.clone().unwrap()
}

pub fn vault_path(app: &AppHandle) -> Option<PathBuf> {
    load_config(app).vault_path.map(PathBuf::from)
}

pub fn set_vault_path(app: &AppHandle, path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if !p.exists() { fs::create_dir_all(p).map_err(|e| e.to_string())?; }
    // ensure devices dir
    fs::create_dir_all(p.join("devices")).map_err(|e| e.to_string())?;
    let mut cfg = load_config(app);
    cfg.vault_path = Some(path.to_string());
    save_config(app, &cfg);
    Ok(())
}

pub fn append_event(app: &AppHandle, event: &Event) -> Result<(), String> {
    let vp = vault_path(app).ok_or("no vault")?;
    let dev = &event.device_id;
    let dir = vp.join("devices").join(dev);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join("events.jsonl");
    use std::io::Write;
    let mut f = fs::OpenOptions::new().create(true).append(true).open(&file).map_err(|e| e.to_string())?;
    let line = serde_json::to_string(event).map_err(|e| e.to_string())? + "\n";
    f.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    f.sync_all().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn read_events(app: &AppHandle) -> Result<Vec<Event>, String> {
    let vp = vault_path(app).ok_or("no vault")?;
    let devices_dir = vp.join("devices");
    let mut events = Vec::new();
    if let Ok(entries) = fs::read_dir(&devices_dir) {
        for e in entries.flatten() {
            let p = e.path().join("events.jsonl");
            if let Ok(content) = fs::read_to_string(&p) {
                for line in content.lines() {
                    if line.trim().is_empty() { continue; }
                    if let Ok(ev) = serde_json::from_str::<Event>(line) {
                        events.push(ev);
                    }
                }
            }
        }
    }
    // sort by timestamp then id
    events.sort_by(|a, b| a.timestamp.cmp(&b.timestamp).then(a.id.cmp(&b.id)));
    Ok(events)
}