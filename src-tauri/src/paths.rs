use crate::models::AppConfig;
use std::fs;
use std::path::PathBuf;

// ==========================================
// CONSTANTES Y RUTAS
// ==========================================

pub fn get_user_data_dir() -> PathBuf {
    dirs::home_dir()
        .expect("No se pudo encontrar el directorio de inicio")
        .join("ARCHI")
}

pub fn get_cache_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        dirs::cache_dir()
            .expect("No se pudo encontrar el directorio de caché")
            .join("ARCHI")
            .join("cache")
    }
    #[cfg(not(target_os = "macos"))]
    {
        get_user_data_dir().join("cache")
    }
}

pub fn get_config_path() -> PathBuf {
    get_user_data_dir().join("config.json")
}

// ==========================================
// GESTIÓN DE CONFIGURACIÓN
// ==========================================

#[tauri::command]
pub fn get_config() -> AppConfig {
    let config_path = get_config_path();
    let default_config = AppConfig::default();

    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(user_config) = serde_json::from_str::<AppConfig>(&content) {
                // Asegurarse de que no falten claves (serde maneja esto parcialmente con default,
                // pero si queremos fusionar valores por defecto explícitos para claves faltantes,
                // podríamos necesitar más lógica. Por ahora, confiamos en los valores por defecto de serde si faltan campos)
                return user_config;
            }
        }
    }

    // Si el archivo no existe o es inválido, guardar por defecto y retornarlo
    let _ = save_config(default_config.clone());
    default_config
}

#[tauri::command]
pub fn save_config(config: AppConfig) -> Result<(), String> {
    let config_path = get_config_path();
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    
    // Asegurar que el directorio exista
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(config_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_module(module_id: String) -> Result<(), String> {
    if module_id == "M-Settings" {
        return Ok(());
    }
    let mut config = get_config();
    config.current_module = module_id;
    save_config(config)
}

#[tauri::command]
pub fn get_default_config() -> AppConfig {
    AppConfig::default()
}

pub fn get_cached_path(hash: &str) -> PathBuf {
    get_cache_dir().join(format!("{}.webp", hash))
}
