use crate::paths::{get_cache_dir, get_config, get_user_data_dir};
use std::fs;

// ==========================================
// LÓGICA DE INSTALACIÓN
// ==========================================

#[tauri::command]
pub fn ensure_user_setup() -> Result<(), String> {
    let user_data_dir = get_user_data_dir();

    // 1. Crear directorio principal
    if !user_data_dir.exists() {
        fs::create_dir_all(&user_data_dir).map_err(|e| e.to_string())?;
    }

    // 2. Asegurar que existe configuración
    let _ = get_config();

    // 3. Asegurar que existe directorio de caché
    let cache_dir = get_cache_dir();
    if !cache_dir.exists() {
        let _ = fs::create_dir_all(&cache_dir);
    }

    // 4. Iniciar limpieza de caché en segundo plano
    crate::thumbnails::cache_cleanup();

    // 5. Asegurar subcarpetas para cada cliente
    ensure_client_subfolders(&user_data_dir)?;

    Ok(())
}

fn ensure_client_subfolders(user_data_dir: &std::path::Path) -> Result<(), String> {
    let required_subfolders = ["Recursos", "Biblioteca", "Contaduria", "Notas"];

    let entries = fs::read_dir(user_data_dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if !name.starts_with('.') {
                    for sub in &required_subfolders {
                        let sub_path = path.join(sub);
                        if !sub_path.exists() {
                            let _ = fs::create_dir_all(&sub_path);
                        }
                    }
                }
            }
        }
    }
    Ok(())
}
