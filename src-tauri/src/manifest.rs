//! Strict parsing of the release manifest (future, opt-in update checks).
//!
//! The application does not fetch this manifest today (no network). These
//! helpers exist so a future update check can parse it with a strict schema
//! and select an asset by (platform, arch, install format) instead of by
//! filename or URL.

use serde::Deserialize;

#[derive(Deserialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ManifestAsset {
    pub file: String,
    pub platform: String,
    pub arch: String,
    pub format: String,
    pub sha256: String,
    pub size: u64,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ReleaseManifest {
    pub version: String,
    pub commit: String,
    pub date: String,
    pub vault_schema_version: u32,
    pub assets: Vec<ManifestAsset>,
}

pub fn parse_manifest(json: &str) -> Result<ReleaseManifest, String> {
    serde_json::from_str(json).map_err(|e| format!("invalid manifest: {e}"))
}

pub fn select_asset<'a>(
    manifest: &'a ReleaseManifest,
    platform: &str,
    arch: &str,
    format: &str,
) -> Option<&'a ManifestAsset> {
    manifest
        .assets
        .iter()
        .find(|a| a.platform == platform && a.arch == arch && a.format == format)
}

/// Compare two SemVer strings using the shared helper (never string compare).
pub fn is_newer(candidate: &str, current: &str) -> bool {
    crate::version::compare_versions(candidate, current) > 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strict_parse_rejects_unknown_fields() {
        let json = r#"{"version":"1.0.0","commit":"abc","date":"d","vault_schema_version":1,"assets":[],"extra":1}"#;
        assert!(parse_manifest(json).is_err());
    }

    #[test]
    fn select_by_tuple() {
        let json = r#"{"version":"1.0.0","commit":"abc","date":"d","vault_schema_version":1,"assets":[{"file":"a.deb","platform":"linux","arch":"x86_64","format":"deb","sha256":"0000000000000000000000000000000000000000000000000000000000000000","size":1}]}"#;
        let m = parse_manifest(json).unwrap();
        assert!(select_asset(&m, "linux", "x86_64", "deb").is_some());
        assert!(select_asset(&m, "linux", "x86_64", "rpm").is_none());
    }
}