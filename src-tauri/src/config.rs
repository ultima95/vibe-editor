use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    #[serde(default = "default_sidebar_position")]
    pub sidebar_position: String,
    #[serde(default = "default_sidebar_visible")]
    pub sidebar_visible: bool,
    #[serde(default = "default_font_size")]
    pub font_size: u16,
    #[serde(default = "default_font_family")]
    pub font_family: String,
}

fn default_sidebar_position() -> String { "left".into() }
fn default_sidebar_visible() -> bool { true }
fn default_font_size() -> u16 { 14 }
fn default_font_family() -> String { "SF Mono, Menlo, Monaco, monospace".into() }

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            sidebar_position: default_sidebar_position(),
            sidebar_visible: default_sidebar_visible(),
            font_size: default_font_size(),
            font_family: default_font_family(),
        }
    }
}

fn config_path() -> PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("vibe-editor");
    fs::create_dir_all(&dir).ok();
    dir.join("config.toml")
}

pub fn load_config() -> AppConfig {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(content) => toml::from_str(&content).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path();
    let content = toml::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write config: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = AppConfig::default();
        assert_eq!(config.sidebar_position, "left");
        assert!(config.sidebar_visible);
        assert_eq!(config.font_size, 14);
    }

    #[test]
    fn test_serialize_deserialize() {
        let config = AppConfig::default();
        let toml_str = toml::to_string_pretty(&config).unwrap();
        let parsed: AppConfig = toml::from_str(&toml_str).unwrap();
        assert_eq!(parsed.sidebar_position, config.sidebar_position);
        assert_eq!(parsed.font_size, config.font_size);
    }

    #[test]
    fn test_partial_toml_uses_defaults() {
        let partial = r#"sidebar_visible = false"#;
        let config: AppConfig = toml::from_str(partial).unwrap();
        assert!(!config.sidebar_visible);
        assert_eq!(config.sidebar_position, "left");
        assert_eq!(config.font_size, 14);
    }
}
