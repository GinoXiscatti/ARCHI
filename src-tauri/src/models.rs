use serde::{Deserialize, Serialize};

// ==========================================
// MODELOS DE CONFIGURACIÓN
// ==========================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Resolution {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub primary_color: String,
    pub border_color: String,
    pub accent_color: String,
    pub warning_color: String,
    pub current_module: String,
    pub remember_module: bool,
    pub lowercase_path: bool,
    pub resolution: Resolution,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            primary_color: "#111b23".to_string(),
            border_color: "rgba(124, 124, 124, 0.33)".to_string(),
            accent_color: "#2fa5a2".to_string(),
            warning_color: "#ff6b6b".to_string(),
            current_module: "M-Inicio".to_string(),
            remember_module: true,
            lowercase_path: false,
            resolution: Resolution {
                width: 1000,
                height: 600,
            },
        }
    }
}

// ==========================================
// MODELOS DE DATOS
// ==========================================

#[derive(Debug, Serialize, Deserialize)]
pub struct Client {
    pub name: String,
    pub pinned: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub item_count: usize,
    pub size: u64,
    pub mtime: i64,
    pub date: i64,
    pub has_metadata: bool,
    pub detected_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Metadata {
    pub fecha: Option<i64>,
    pub date: Option<i64>,
    pub pin: Option<bool>,
}
