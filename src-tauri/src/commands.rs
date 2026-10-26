use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use crate::vault;
use crate::version;

#[tauri::command]
pub fn get_app_info() -> version::AppInfo { version::app_info() }

#[tauri::command]
pub fn get_app_version() -> version::AppInfo { version::app_info() }

#[tauri::command]
pub fn get_version_info() -> version::AppInfo { version::app_info() }

#[tauri::command]
pub fn get_build_info() -> version::AppInfo { version::app_info() }

#[tauri::command]
pub fn get_version() -> String { version::VERSION.to_string() }

#[tauri::command]
pub fn frontend_ready(app: AppHandle) {
    if let Some(w) = app.get_webview_window("splash") { let _ = w.close(); }
    if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.set_focus(); }
}

#[tauri::command]
pub fn get_vault_path(app: AppHandle) -> Option<String> {
    vault::vault_path(&app).map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_device_id(app: AppHandle) -> String {
    vault::device_id(&app)
}

#[tauri::command]
pub async fn select_vault(app: AppHandle) -> Result<String, String> {
    let app2 = app.clone();
    let handle = tauri::async_runtime::spawn_blocking(move || {
        app2.dialog().file().blocking_pick_folder()
    });
    let folder = handle.await.map_err(|e| e.to_string())?;
    match folder {
        Some(fp) => {
            let p = fp.to_string();
            vault::set_vault_path(&app, &p)?;
            Ok(p)
        }
        None => Err("cancelled".into()),
    }
}

#[tauri::command]
pub fn list_events(app: AppHandle) -> Result<Vec<vault::Event>, String> {
    vault::read_events(&app)
}

#[tauri::command]
pub fn append_event(app: AppHandle, event: vault::Event) -> Result<(), String> {
    vault::append_event(&app, &event)
}

#[tauri::command]
pub async fn export_events(app: AppHandle) -> Result<String, String> {
    let app2 = app.clone();
    let handle = tauri::async_runtime::spawn_blocking(move || {
        app2.dialog().file().add_filter("JSON", &["json"]).blocking_save_file()
    });
    let path = handle.await.map_err(|e| e.to_string())?;
    match path {
        Some(fp) => {
            let events = vault::read_events(&app)?;
            let json = serde_json::to_string_pretty(&events).map_err(|e| e.to_string())?;
            std::fs::write(fp.to_string(), json).map_err(|e| e.to_string())?;
            Ok(fp.to_string())
        }
        None => Err("cancelled".into()),
    }
}

#[tauri::command]
pub async fn save_text_file(app: AppHandle, content: String, filter_name: String, ext: String) -> Result<String, String> {
    let app2 = app.clone();
    let filter = filter_name.clone();
    let extension = ext.clone();
    let handle = tauri::async_runtime::spawn_blocking(move || {
        app2.dialog().file().add_filter(&filter, &[&extension]).blocking_save_file()
    });
    let path = handle.await.map_err(|e| e.to_string())?;
    match path {
        Some(fp) => {
            std::fs::write(fp.to_string(), content).map_err(|e| e.to_string())?;
            Ok(fp.to_string())
        }
        None => Err("cancelled".into()),
    }
}