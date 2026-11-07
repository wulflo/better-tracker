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
    // La build de Store no registra plugins opcionales en escritorio, así que
    // el binding deja de necesitar `mut`; se mantiene para el resto de builds.
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(commands::UpdateState::default());

    // El actualizador nativo y el relanzado solo existen en escritorio. En
    // Android el frontend descarga el APK y el backend lo publica en Descargas.
    //
    // La build de Microsoft Store (`--no-default-features --features
    // microsoft-store`) no compila el plugin: dentro de un MSIX la app es de
    // solo lectura y las actualizaciones las instala la Store.
    #[cfg(all(not(target_os = "android"), feature = "updater"))]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    #[cfg(target_os = "android")]
    {
        builder = builder.plugin(tauri_plugin_android_fs::init());
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
            commands::open_external,
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
