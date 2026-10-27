use std::thread;
use std::time::Duration;
use tauri::Manager;

pub mod commands;
#[cfg(target_os = "android")]
pub mod android_fs;
pub mod event_store;
pub mod manifest;
pub mod sync;
pub mod vault;
pub mod version;

use event_store::{store_append, store_device_id, store_ensure_layout, store_mtimes, store_read};
use sync::manager::{IdentityInfo, SyncBatchResult, SyncLocalInfo, SyncManager};
use sync::pairing::PendingPairing;
use sync::peer::Peer;
use tauri::AppHandle;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(not(target_os = "android"))]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(|app| {
            app.manage(SyncManager::new(app.handle().clone()));
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
            commands::get_vault_path,
            commands::get_device_id,
            commands::select_vault,
            commands::list_events,
            commands::append_event,
            // event store (sync layout)
            get_app_data_dir,
            store_default_root,
            store_ensure_layout,
            store_append,
            store_read,
            store_mtimes,
            store_device_id,
            // sync
            sync_get_identity,
            sync_local_info,
            sync_start,
            sync_stop,
            sync_list_peers,
            sync_pair_listen_start,
            sync_pair_listen_stop,
            sync_pair_pending,
            sync_pair_connect,
            sync_pair_confirm,
            sync_pair_cancel,
            sync_now,
            sync_set_peer_address,
            sync_remove_peer,
            sync_auto_get,
            sync_auto_set,
            sync_discover,
            generate_qr_svg,
            battery_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/* ------------------------------------------------------------------ */
/* App data dir / default root                                        */
/* ------------------------------------------------------------------ */

#[tauri::command]
fn get_app_data_dir(app: AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn store_default_root(app: AppHandle) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(dir.to_string_lossy().to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        event_store::default_root()
    }
}

/* ------------------------------------------------------------------ */
/* Sync commands                                                      */
/* ------------------------------------------------------------------ */

#[tauri::command]
fn sync_get_identity(state: tauri::State<'_, SyncManager>, name: String) -> Result<IdentityInfo, String> {
    let identity = state.ensure_identity(&name)?;
    let fingerprint = identity.fingerprint();
    Ok(IdentityInfo {
        device_id: identity.device_id,
        name: identity.name,
        fingerprint,
    })
}

#[tauri::command]
fn sync_local_info(
    state: tauri::State<'_, SyncManager>,
    name: Option<String>,
) -> Result<SyncLocalInfo, String> {
    if let Some(name) = name {
        state.ensure_identity(&name)?;
    }
    Ok(state.local_info())
}

#[tauri::command]
async fn sync_start(
    state: tauri::State<'_, SyncManager>,
    name: String,
) -> Result<SyncLocalInfo, String> {
    #[cfg(target_os = "android")]
    crate::android_fs::multicast_acquire();
    state.start(&name).await
}

#[tauri::command]
fn sync_stop(state: tauri::State<'_, SyncManager>) -> Result<(), String> {
    state.stop();
    #[cfg(target_os = "android")]
    crate::android_fs::multicast_release();
    Ok(())
}

#[tauri::command]
fn sync_list_peers(state: tauri::State<'_, SyncManager>) -> Result<Vec<Peer>, String> {
    Ok(state.list_peers())
}

#[tauri::command]
async fn sync_pair_listen_start(
    state: tauri::State<'_, SyncManager>,
    name: String,
) -> Result<serde_json::Value, String> {
    let (info, expires_at) = state.start_pairing(&name).await?;
    Ok(serde_json::json!({ "info": info, "expires_at": expires_at }))
}

#[tauri::command]
fn sync_pair_listen_stop(state: tauri::State<'_, SyncManager>) -> Result<(), String> {
    state.stop_pairing();
    Ok(())
}

#[tauri::command]
fn sync_pair_pending(
    state: tauri::State<'_, SyncManager>,
) -> Result<Option<PendingPairing>, String> {
    Ok(state.pending_pairing())
}

#[tauri::command]
async fn sync_pair_connect(
    state: tauri::State<'_, SyncManager>,
    name: String,
    address: String,
) -> Result<PendingPairing, String> {
    state.connect_pairing(&name, &address).await
}

#[tauri::command]
fn sync_pair_confirm(
    state: tauri::State<'_, SyncManager>,
    device_id: String,
) -> Result<Peer, String> {
    state.confirm_pairing(&device_id)
}

#[tauri::command]
fn sync_pair_cancel(state: tauri::State<'_, SyncManager>, device_id: String) -> Result<(), String> {
    state.reject_pairing(&device_id);
    Ok(())
}

#[tauri::command]
async fn sync_now(
    state: tauri::State<'_, SyncManager>,
    device_id: Option<String>,
    address: Option<String>,
) -> Result<SyncBatchResult, String> {
    match device_id {
        Some(device_id) => {
            let report = state.sync_peer(&device_id, address.as_deref()).await?;
            Ok(SyncBatchResult {
                reports: vec![report],
                errors: Vec::new(),
            })
        }
        None => state.sync_all().await,
    }
}

#[tauri::command]
fn sync_set_peer_address(
    state: tauri::State<'_, SyncManager>,
    device_id: String,
    address: Option<String>,
) -> Result<Peer, String> {
    state.set_peer_address(&device_id, address.as_deref())
}

#[tauri::command]
fn sync_remove_peer(state: tauri::State<'_, SyncManager>, device_id: String) -> Result<(), String> {
    state.remove_peer(&device_id)
}

#[tauri::command]
async fn sync_discover(duration_ms: Option<u64>) -> Result<Vec<serde_json::Value>, String> {
    use std::collections::BTreeSet;
    use tokio::net::UdpSocket;
    let dur = duration_ms.unwrap_or(2000);
    let sock = UdpSocket::bind("0.0.0.0:0").await.map_err(|e| e.to_string())?;
    sock.set_broadcast(true).map_err(|e| e.to_string())?;
    let _ = sock.send_to(b"DISCOVER", "255.255.255.255:14244").await;
    let mut buf = [0u8; 2048];
    let mut found = Vec::new();
    let mut seen = BTreeSet::new();
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_millis(dur);
    loop {
        tokio::select! {
            _ = tokio::time::sleep_until(deadline) => break,
            res = sock.recv_from(&mut buf) => {
                if let Ok((len, src)) = res {
                    if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&buf[..len]) {
                        if json.get("app").and_then(|v| v.as_str()) == Some("better-tracker") {
                            let port = json.get("port").and_then(|v| v.as_u64()).unwrap_or(14242);
                            let addr = format!("{}:{}", src.ip(), port);
                            if seen.insert(addr.clone()) {
                                let mut entry = json.clone();
                                if let Some(obj) = entry.as_object_mut() {
                                    obj.insert("address".to_string(), serde_json::Value::String(addr));
                                }
                                found.push(entry);
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(found)
}

#[tauri::command]
fn generate_qr_svg(text: String) -> Result<String, String> {
    use qrcode::QrCode;
    let code = QrCode::new(text.as_bytes()).map_err(|e| e.to_string())?;
    Ok(code.render::<qrcode::render::svg::Color>().build())
}

/* ------------------------------------------------------------------ */
/* Auto sync config + battery                                         */
/* ------------------------------------------------------------------ */

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct SyncAutoConfig {
    enabled: bool,
    respect_battery_saver: bool,
}

impl Default for SyncAutoConfig {
    fn default() -> Self {
        Self { enabled: false, respect_battery_saver: true }
    }
}

fn sync_config_path(root: &str) -> std::path::PathBuf {
    std::path::Path::new(root).join("sync_auto.json")
}

#[tauri::command]
fn sync_auto_get(root: String) -> Result<SyncAutoConfig, String> {
    let p = sync_config_path(&root);
    if !p.exists() {
        return Ok(SyncAutoConfig::default());
    }
    let s = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

#[tauri::command]
fn sync_auto_set(root: String, enabled: bool, respect_battery_saver: bool) -> Result<(), String> {
    let p = sync_config_path(&root);
    let cfg = SyncAutoConfig { enabled, respect_battery_saver };
    let s = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    std::fs::write(&p, s).map_err(|e| e.to_string())
}

#[tauri::command]
fn battery_status() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        // Minimal: no JNI bridge yet.
        return Ok(serde_json::json!({
            "power_save_mode": false,
            "battery_level": 100,
            "is_charging": true,
            "effective_mode": "normal"
        }));
    }
    #[cfg(not(target_os = "android"))]
    {
        Ok(serde_json::json!({
            "power_save_mode": false,
            "battery_level": 100,
            "is_charging": true,
            "effective_mode": "normal"
        }))
    }
}