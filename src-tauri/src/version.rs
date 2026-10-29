/// Single source of truth for build-time version information.
///
/// These values are embedded into the binary at compile time from `build.rs`,
/// which reads the repository's `VERSION` file, the git commit and the build
/// date. The application never reads `VERSION` at runtime.
pub const VERSION: &str = env!("APP_VERSION");
pub const COMMIT: &str = env!("GIT_COMMIT");
pub const BUILD_DATE: &str = env!("BUILD_DATE");
include!(concat!(env!("OUT_DIR"), "/version_consts.rs"));

#[derive(serde::Serialize, Clone)]
pub struct AppInfo {
    pub version: String,
    pub commit: String,
    pub build_date: String,
    pub vault_schema_version: u32,
    pub install_format: String,
}

pub fn app_info() -> AppInfo {
    AppInfo {
        version: VERSION.to_string(),
        commit: COMMIT.to_string(),
        build_date: BUILD_DATE.to_string(),
        vault_schema_version: VAULT_SCHEMA_VERSION,
        install_format: detect_install_format().to_string(),
    }
}

/// Minimal SemVer comparison (major.minor.patch). Returns -1/0/1.
/// Used by the (currently opt-in/future) update check; never string compare.
pub fn compare_versions(a: &str, b: &str) -> i8 {
    let parse = |s: &str| -> (u64, u64, u64) {
        let core = s.split('-').next().unwrap_or(s).split('+').next().unwrap_or(s);
        let mut parts = core.split('.');
        let maj = parts.next().and_then(|x| x.parse().ok()).unwrap_or(0);
        let min = parts.next().and_then(|x| x.parse().ok()).unwrap_or(0);
        let pat = parts.next().and_then(|x| x.parse().ok()).unwrap_or(0);
        (maj, min, pat)
    };
    let (a1, a2, a3) = parse(a);
    let (b1, b2, b3) = parse(b);
    if (a1, a2, a3) < (b1, b2, b3) {
        -1
    } else if (a1, a2, a3) > (b1, b2, b3) {
        1
    } else {
        0
    }
}

/// Explicit, documented install-format detection. Never infers from file paths.
pub fn detect_install_format() -> &'static str {
    if std::env::var("APPIMAGE")
        .map(|v| !v.is_empty())
        .unwrap_or(false)
    {
        return "appimage";
    }
    if let Ok(value) = std::env::var("TAURI_INSTALL_FORMAT") {
        match value.as_str() {
            "deb" => return "deb",
            "rpm" => return "rpm",
            "appimage" => return "appimage",
            "msi" => return "msi",
            "nsis" => return "nsis",
            "exe" => return "exe",
            "apk" => return "apk",
            _ => {}
        }
    }
    #[cfg(target_os = "android")]
    {
        "apk"
    }
    #[cfg(target_os = "windows")]
    {
        "windows"
    }
    #[cfg(target_os = "linux")]
    {
        detect_linux_package_format().unwrap_or("linux")
    }
    #[cfg(not(any(target_os = "android", target_os = "windows", target_os = "linux")))]
    {
        "unknown"
    }
}

/// En Linux, un binario instalado por el sistema no lleva `TAURI_INSTALL_FORMAT`
/// en el entorno. Sin esta comprobación, un `.deb`/`.rpm` se mostraba como
/// "linux" y la app decía que no se podía actualizar. Distinguimos dpkg de rpm
/// por la base de datos del gestor y solo cuando el ejecutable vive en una ruta
/// de instalación del sistema (no en una carpeta personal o portátil).
#[cfg(target_os = "linux")]
fn detect_linux_package_format() -> Option<&'static str> {
    use std::path::Path;
    let exe = std::env::current_exe().ok()?;
    let path = exe.to_string_lossy();
    let installed = path.starts_with("/usr/bin/")
        || path.starts_with("/usr/local/bin/")
        || path.starts_with("/usr/lib/")
        || path.starts_with("/opt/");
    if !installed {
        return None;
    }
    if Path::new("/var/lib/dpkg/status").exists() || Path::new("/etc/debian_version").exists() {
        return Some("deb");
    }
    if Path::new("/etc/redhat-release").exists()
        || Path::new("/etc/fedora-release").exists()
        || Path::new("/var/lib/rpm").exists()
    {
        return Some("rpm");
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compare_versions_works() {
        assert_eq!(compare_versions("0.1.0", "0.1.0"), 0);
        assert!(compare_versions("0.2.0", "0.1.0") > 0);
        assert!(compare_versions("0.1.0", "0.2.0") < 0);
        // revision suffixes ignored
        assert_eq!(compare_versions("1.2.3-1", "1.2.3"), 0);
    }

    #[test]
    fn embedded_version_is_strict() {
        assert!(VERSION.chars().all(|c| c.is_ascii_digit() || c == '.'));
        assert_eq!(VERSION.split('.').count(), 3);
    }
}