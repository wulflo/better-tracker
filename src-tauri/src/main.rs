// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Process --version at the very beginning of main, before creating any
    // window or touching the network. Prints the embedded version and exits.
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--version" || a == "-V") {
        println!("{}", better_tracker_lib::version::VERSION);
        return;
    }

    configure_webkit_rendering();

    better_tracker_lib::run();
}

/// Ajusta el renderizado de WebKitGTK antes de que se inicialice GTK.
///
/// Con el driver propietario de NVIDIA, la ruta DMA-BUF/EGL de WebKitGTK puede
/// terminar en un `SIGSEGV` dentro de `libnvidia-eglcore` (visto con la serie
/// 580). El proceso web muere, la ventana deja artefactos y el compositor se
/// queda esperando fences inválidos: la app se congela y no llega a guardar.
/// En esos equipos forzamos el renderer de memoria compartida, que no toca la
/// ruta EGL de NVIDIA. Es una decisión de estabilidad: la app es un formulario,
/// no un juego, así que perder aceleración es preferible a congelar el equipo.
///
/// En AppImage sin NVIDIA se mantiene el ajuste anterior: `FORCE_SHM` evita el
/// `SIGABRT` de `WebKitWebProcess` al cerrar con la ruta EGL/DMA-BUF de Mesa.
/// Cualquier variable fijada por la persona usuaria tiene prioridad y desactiva
/// la detección automática.
#[cfg(target_os = "linux")]
fn configure_webkit_rendering() {
    if user_overrode_webkit_rendering() {
        return;
    }

    if nvidia_driver_loaded() {
        // Debe ejecutarse antes de inicializar GTK/WebKit; los procesos hijo
        // (`WebKitWebProcess`, `WebKitNetworkProcess`) heredan el entorno.
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        return;
    }

    if std::env::var_os("APPIMAGE").is_some() {
        std::env::set_var("WEBKIT_DMABUF_RENDERER_FORCE_SHM", "1");
    }
}

#[cfg(not(target_os = "linux"))]
fn configure_webkit_rendering() {}

#[cfg(target_os = "linux")]
fn user_overrode_webkit_rendering() -> bool {
    [
        "WEBKIT_DISABLE_DMABUF_RENDERER",
        "WEBKIT_DMABUF_RENDERER_FORCE_SHM",
        "WEBKIT_DISABLE_COMPOSITING_MODE",
        "__NV_DISABLE_EXPLICIT_SYNC",
        "LIBGL_ALWAYS_SOFTWARE",
    ]
    .iter()
    .any(|name| std::env::var_os(name).is_some())
}

/// Detecta el driver propietario de NVIDIA (no `nouveau`).
///
/// `/proc/driver/nvidia` no existe dentro de Flatpak; `/sys/class/drm` sí se
/// comparte con el sandbox, así que se consultan ambos. En portátiles híbridos
/// basta con que NVIDIA esté cargado: WebKit puede elegir su render node aunque
/// la GPU primaria sea la integrada, como ocurre en este equipo.
#[cfg(target_os = "linux")]
fn nvidia_driver_loaded() -> bool {
    if std::path::Path::new("/proc/driver/nvidia/version").exists()
        || std::path::Path::new("/sys/module/nvidia").exists()
    {
        return true;
    }

    let Ok(entries) = std::fs::read_dir("/sys/class/drm") else {
        return false;
    };

    entries.flatten().any(|entry| {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        // Solo tarjetas (`card0`, `card1`…), no conectores (`card1-eDP-1`).
        if !name.starts_with("card") || name.contains('-') {
            return false;
        }
        let driver = entry.path().join("device/driver");
        std::fs::read_link(driver)
            .ok()
            .and_then(|target| target.file_name().map(|file| file == "nvidia"))
            .unwrap_or(false)
    })
}
