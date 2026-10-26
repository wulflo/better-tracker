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
    match std::env::var("TAURI_INSTALL_FORMAT").as_deref() {
        Ok("deb") => "deb",
        Ok("rpm") => "rpm",
        Ok("appimage") => "appimage",
        Ok("dmg") => "dmg",
        Ok("msi") => "msi",
        Ok("nsis") => "nsis",
        Ok("exe") => "exe",
        Ok("apk") => "apk",
        _ if cfg!(target_os = "windows") => "windows",
        _ if cfg!(target_os = "macos") => "macos",
        _ if cfg!(target_os = "linux") => "linux",
        _ => "unknown",
    }
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