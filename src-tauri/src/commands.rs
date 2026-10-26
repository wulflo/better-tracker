use crate::version;

#[tauri::command]
pub fn get_app_info() -> version::AppInfo {
    version::app_info()
}

#[tauri::command]
pub fn get_version() -> String {
    version::VERSION.to_string()
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