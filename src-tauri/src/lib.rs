use std::thread;
use std::time::Duration;
use tauri::Manager;

pub mod barcode;
pub mod commands;
pub mod manifest;
pub mod vault;
pub mod version;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init());

    // El actualizador nativo y el relanzado solo existen en escritorio. En
    // Android el frontend descarga el APK y el backend lo publica en Descargas.
    #[cfg(not(target_os = "android"))]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    #[cfg(target_os = "android")]
    {
        builder = builder
            .plugin(tauri_plugin_android_fs::init())
            .plugin(tauri_plugin_barcode_scanner::init())
            .plugin(tauri_plugin_http::init());
    }

    builder
        .setup(|app| {
            let app_handle = app.handle().clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_secs(10));
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
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::get_app_version,
            commands::get_version_info,
            commands::get_build_info,
            commands::get_version,
            commands::frontend_ready,
            commands::get_device_id,
            commands::list_events,
            commands::append_event,
            commands::fetch_update_manifest,
            commands::download_and_install_linux_package,
            commands::open_update_file,
            commands::download_android_apk,
            vault::select_vault,
            vault::get_vault_info,
            vault::get_vault_path,
            vault::vault_backup_status,
            vault::vault_run_backup,
            vault::vault_restore_snapshot,
            vault::vault_delete_backups,
            barcode::lookup_barcode,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
