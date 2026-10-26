pub mod commands;
pub mod manifest;
pub mod version;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::get_app_version,
            commands::get_version_info,
            commands::get_build_info,
            commands::get_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}