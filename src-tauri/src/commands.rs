use crate::vault;
use crate::version;
use tauri::AppHandle;
use tauri::Manager;

#[cfg(target_os = "android")]
use tauri_plugin_android_fs::AndroidFs as _;

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

/// Guarda en la carpeta pública de Descargas el APK que el frontend descargó
/// previamente en la caché privada de la app.
///
/// En Android 10+ se usa MediaStore a través de `tauri-plugin-android-fs` y no
/// hacen falta permisos legacy. En versiones anteriores, o si MediaStore
/// falla, se abre el selector SAF para que el usuario elija dónde guardarlo.
/// La instalación sigue siendo manual: la app no ejecuta ni instala el APK.
#[tauri::command(async)]
pub fn save_android_apk(app: AppHandle) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        use tauri_plugin_android_fs::{AndroidFsExt, PublicGeneralPurposeDir, PublicStorage};

        const TEMP_APK_FILE_NAME: &str = "BetterTracker-update.apk";
        const PUBLIC_SUBDIR: &str = "BetterTracker";
        const PUBLIC_APK_FILE_NAME: &str = "BetterTracker-update.apk";
        const APK_MIME: &str = "application/vnd.android.package-archive";

        let cache_dir = app
            .path()
            .app_cache_dir()
            .map_err(|error| format!("No se pudo resolver la caché de la app: {error}"))?;
        let temp_path = cache_dir.join(TEMP_APK_FILE_NAME);
        let mut source = std::fs::File::open(&temp_path)
            .map_err(|error| format!("No se pudo abrir el APK descargado: {error}"))?;

        let relative_path = format!("{PUBLIC_SUBDIR}/{PUBLIC_APK_FILE_NAME}");
        let primary = app
            .android_fs()
            .public_storage()
            .write_with_contents_writer(
                PublicGeneralPurposeDir::Download,
                &relative_path,
                Some(APK_MIME),
                |destination| std::io::copy(&mut source, destination).map(|_| ()),
            );

        let display_path = match primary {
            Ok(saved_path) => {
                let file_name = app
                    .android_fs()
                    .get_file_name(&saved_path)
                    .unwrap_or_else(|_| PUBLIC_APK_FILE_NAME.to_string());
                format!("Descargas/{PUBLIC_SUBDIR}/{file_name}")
            }
            Err(primary_error) => {
                // Android < 10 no soporta `RELATIVE_PATH` en MediaStore. El
                // selector SAF funciona en todas las versiones.
                let chosen = app
                    .android_fs()
                    .show_save_file_dialog(PUBLIC_APK_FILE_NAME, Some(APK_MIME))
                    .map_err(|error| {
                        format!(
                            "No se pudo guardar el APK en Descargas ({primary_error}) ni abrir el selector de archivos: {error}"
                        )
                    })?;
                let Some(chosen) = chosen else {
                    return Err(format!(
                        "No se guardó el APK. MediaStore falló: {primary_error}"
                    ));
                };
                use std::io::{Seek, SeekFrom};
                source
                    .seek(SeekFrom::Start(0))
                    .map_err(|error| format!("No se pudo releer el APK descargado: {error}"))?;
                let mut destination = app
                    .android_fs()
                    .create_file(&chosen)
                    .map_err(|error| format!("No se pudo crear el APK elegido: {error}"))?;
                std::io::copy(&mut source, &mut destination)
                    .map_err(|error| format!("No se pudo escribir el APK elegido: {error}"))?;
                app.android_fs()
                    .get_file_name(&chosen)
                    .unwrap_or_else(|_| PUBLIC_APK_FILE_NAME.to_string())
            }
        };

        drop(source);
        let _ = std::fs::remove_file(&temp_path);
        Ok(display_path)
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("Guardar el APK en Descargas solo está disponible en Android.".to_string())
    }
}
