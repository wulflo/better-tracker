use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    // Re-run if the single source of truth changes.
    println!("cargo:rerun-if-changed=../VERSION");
    println!("cargo:rerun-if-changed=../VAULT_SCHEMA_VERSION");
    println!("cargo:rerun-if-changed=build.rs");

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let root = manifest_dir.parent().expect("crate has parent");

    // Single source of truth: the VERSION file at the repository root.
    let version = fs::read_to_string(root.join("VERSION"))
        .expect("VERSION file missing")
        .trim()
        .to_string();
    assert!(!version.is_empty(), "VERSION is empty");

    // Commit (best effort; falls back to "unknown" outside a git checkout).
    let commit = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(root)
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "unknown".to_string());

    // Build date in UTC (RFC3339 date).
    let date = Command::new("date")
        .args(["-u", "+%Y-%m-%dT%H:%M:%SZ"])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "unknown".to_string());

    let vault_schema = fs::read_to_string(root.join("VAULT_SCHEMA_VERSION"))
        .unwrap_or_else(|_| "1".to_string())
        .trim()
        .to_string();

    println!("cargo:rustc-env=APP_VERSION={version}");
    println!("cargo:rustc-env=GIT_COMMIT={commit}");
    println!("cargo:rustc-env=BUILD_DATE={date}");
    println!("cargo:rustc-env=VAULT_SCHEMA_VERSION={vault_schema}");

    // Generate a compile-time constant for the vault schema version, since
    // parsing a string in a `const` is not allowed on this toolchain.
    let out_dir = env::var("OUT_DIR").expect("OUT_DIR");
    fs::write(
        PathBuf::from(out_dir).join("version_consts.rs"),
        format!("pub const VAULT_SCHEMA_VERSION: u32 = {};", vault_schema),
    )
    .expect("write version_consts.rs");

    tauri_build::build()
}