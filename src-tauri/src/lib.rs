use std::thread;
use std::time::Duration;
use tauri::Manager;

pub mod commands;
pub mod manifest;
pub mod vault;
pub mod version;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::get_app_version,
            commands::get_version_info,
            commands::get_build_info,
            commands::get_version,
            commands::frontend_ready,
            commands::get_vault_path,
            commands::get_device_id,
            commands::select_vault,
            commands::list_events,
            commands::append_event,
            commands::export_events,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_secs(10));
                // Fallback: if frontend never signaled ready, show main anyway.
                if let Some(w) = app_handle.get_webview_window("main") {
                    if !w.is_visible().unwrap_or(false) {
                        if let Some(s) = app_handle.get_webview_window("splash") {
                            let _ = s.close();
                        }
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}