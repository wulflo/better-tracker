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

/// Evita el aborto de `WebKitWebProcess` al cerrar la app desde un AppImage.
///
/// El AppImage empaqueta sus propias bibliotecas de WebKitGTK, así que no usa
/// la `webkit2gtk-4.1` del sistema. Con la ruta DMA-BUF/EGL de Mesa, el proceso
/// web puede abortar (`SIGABRT`) al destruir el contexto gráfico durante el
/// `exit()`. `WEBKIT_DMABUF_RENDERER_FORCE_SHM` mantiene la composición
/// acelerada pero envía los búferes por memoria compartida, sin tocar el
/// transporte EGL que falla. A diferencia de `WEBKIT_DISABLE_DMABUF_RENDERER`,
/// esta variable se evalúa después de registrar el transporte `SharedMemory`,
/// de modo que el backing store siempre queda válido.
///
/// Solo se aplica dentro de un AppImage (`APPIMAGE` lo define su runtime) y
/// nunca pisa un valor fijado por la persona usuaria.
fn configure_webkit_rendering() {
    if std::env::var_os("APPIMAGE").is_none() {
        return;
    }

    if std::env::var_os("WEBKIT_DMABUF_RENDERER_FORCE_SHM").is_some() {
        return;
    }

    // Debe ejecutarse antes de inicializar GTK/WebKit; los procesos hijo
    // (`WebKitWebProcess`, `WebKitNetworkProcess`) heredan el entorno.
    std::env::set_var("WEBKIT_DMABUF_RENDERER_FORCE_SHM", "1");
}
