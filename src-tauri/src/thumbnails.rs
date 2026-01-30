use std::fs;
use std::io::{Cursor, Read};
use std::os::unix::fs::symlink;
use std::path::Path;
use std::process::Command;

use base64::{engine::general_purpose, Engine as _};
use image::ImageFormat;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, State};
use walkdir::WalkDir;

use crate::paths::{get_cache_dir, get_cached_path, get_user_data_dir};

// ==========================================
// STATE
// ==========================================

pub struct CacheCancellation {
    pub canceled: AtomicBool,
}

// ==========================================
// CONSTANTS
// ==========================================

const VALID_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "webp", "bmp", "psd", "psb", "ai", "indd", "pdf", "eps", "tiff", "tif",
    "raw", "dng", "cdr", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "gif", "svg", "ico",
];

// ==========================================
// HELPERS
// ==========================================

fn convert_to_webp(data: &[u8]) -> Result<Vec<u8>, String> {
    let img =
        image::load_from_memory(data).map_err(|e| format!("Error decodificando imagen: {}", e))?;
    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), ImageFormat::WebP)
        .map_err(|e| format!("Error codificando a WebP: {}", e))?;
    Ok(buf)
}

fn calculate_hash(path: &Path) -> String {
    let mut hasher = Sha256::new();
    let path_str = path.to_string_lossy().to_string();
    hasher.update(path_str.as_bytes());

    if let Ok(metadata) = fs::metadata(path) {
        if let Ok(modified) = metadata.modified() {
            if let Ok(duration) = modified.duration_since(std::time::SystemTime::UNIX_EPOCH) {
                hasher.update(duration.as_secs().to_le_bytes());
            }
        }
    }
    format!("{:x}", hasher.finalize())
}

fn save_and_return_webp(data: &[u8], cache_path: &Path) -> Result<String, String> {
    let webp_data = convert_to_webp(data)?;
    let _ = fs::write(cache_path, &webp_data);
    let b64 = general_purpose::STANDARD.encode(&webp_data);
    Ok(format!("data:image/webp;base64,{}", b64))
}

fn get_candidates() -> Vec<std::path::PathBuf> {
    let user_data_dir = get_user_data_dir();
    let mut candidates = Vec::new();
    let walker = WalkDir::new(&user_data_dir).into_iter().filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        !name.starts_with('.') && name != "node_modules"
    });

    for entry in walker.flatten() {
        let path = entry.path();
        if path.is_file() {
            let ext = path
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();

            if VALID_EXTENSIONS.contains(&ext.as_str()) {
                candidates.push(path.to_path_buf());
            }
        }
    }
    candidates
}

// ==========================================
// BACKGROUND TASKS
// ==========================================

pub fn cache_cleanup() {
    tauri::async_runtime::spawn(async move {
        let cache_dir = get_cache_dir();

        if !cache_dir.exists() {
            return;
        }

        // 1. Recolectar hashes válidos
        let mut valid_hashes = std::collections::HashSet::new();
        let candidates = get_candidates();

        for path in candidates {
            valid_hashes.insert(calculate_hash(&path));
        }

        // 2. Borrar huérfanos
        if let Ok(entries) = fs::read_dir(&cache_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        if !valid_hashes.contains(stem) {
                            let _ = fs::remove_file(path);
                        }
                    }
                }
            }
        }
    });
}

// ==========================================
// COMMANDS
// ==========================================

#[derive(Serialize)]
pub struct CacheStats {
    pub file_count: usize,
    pub total_size: u64,
    pub missing_count: usize,
}

#[tauri::command]
pub async fn get_cache_stats() -> Result<CacheStats, String> {
    let cache_dir = get_cache_dir();

    // Calcular estadísticas de archivos existentes en caché
    let mut file_count: usize = 0;
    let mut total_size: u64 = 0;

    if cache_dir.exists() {
        if let Ok(entries) = fs::read_dir(&cache_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    file_count += 1;
                    if let Ok(metadata) = fs::metadata(&path) {
                        total_size += metadata.len();
                    }
                } else if path.is_dir() {
                    // Contar recursivamente si hay subdirectorios (aunque el cache suele ser plano)
                    for sub in WalkDir::new(&path).into_iter().flatten() {
                        let p = sub.path();
                        if p.is_file() {
                            file_count += 1;
                            if let Ok(metadata) = fs::metadata(p) {
                                total_size += metadata.len();
                            }
                        }
                    }
                }
            }
        }
    }

    // Calcular archivos faltantes
    let candidates = get_candidates();
    let mut missing_count = 0;

    // Optimización: podríamos paralelizar esto si fuera muy lento, pero por ahora iteramos
    for path in candidates {
        let hash = calculate_hash(&path);
        let cache_path = get_cached_path(&hash);
        if !cache_path.exists() {
            missing_count += 1;
        }
    }

    Ok(CacheStats {
        file_count,
        total_size,
        missing_count,
    })
}

#[tauri::command]
pub async fn open_cache_folder() -> Result<(), String> {
    let cache_dir = get_cache_dir();

    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(cache_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(cache_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn clear_all_cache() -> Result<(), String> {
    let cache_dir = get_cache_dir();

    if !cache_dir.exists() {
        return Ok(()); // No hay nada que borrar
    }

    // Leer todos los archivos y carpetas en el directorio de cache
    let entries = fs::read_dir(&cache_dir).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.is_file() {
            // Borrar archivo
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        } else if path.is_dir() {
            // Borrar carpeta y todo su contenido recursivamente
            fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[derive(Clone, Serialize)]
struct CacheProgress {
    current: usize,
    total: usize,
    status: String,
}

#[tauri::command]
pub fn cancel_cache_generation(state: State<CacheCancellation>) -> Result<(), String> {
    state.canceled.store(true, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub async fn generate_missing_thumbnails(
    window: tauri::WebviewWindow,
    state: State<'_, CacheCancellation>,
) -> Result<String, String> {
    let cache_dir = get_cache_dir();

    // Resetear estado de cancelación
    state.canceled.store(false, Ordering::Relaxed);

    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }

    // 1. Recolectar candidatos
    let candidates = get_candidates();

    let total = candidates.len();
    let mut generated_count = 0;

    // Notificar inicio
    let _ = window.emit(
        "cache-progress",
        CacheProgress {
            current: 0,
            total,
            status: "Iniciando escaneo...".to_string(),
        },
    );

    for (i, path) in candidates.iter().enumerate() {
        if state.canceled.load(Ordering::Relaxed) {
            let _ = window.emit(
                "cache-progress",
                CacheProgress {
                    current: i,
                    total,
                    status: "Cancelado".to_string(),
                },
            );
            return Ok(format!(
                "Generación cancelada. Se generaron {} miniaturas.",
                generated_count
            ));
        }

        let hash = calculate_hash(path);
        let cache_path = get_cached_path(&hash);

        // Notificar progreso actual
        let _ = window.emit(
            "cache-progress",
            CacheProgress {
                current: i + 1,
                total,
                status: "Generando caché...".to_string(),
            },
        );

        if !cache_path.exists() {
            if generate_thumbnail(path.to_string_lossy().to_string())
                .await
                .is_ok()
            {
                generated_count += 1;
            }
        }
    }

    // Notificar finalización
    let _ = window.emit(
        "cache-progress",
        CacheProgress {
            current: total,
            total,
            status: "Finalizado".to_string(),
        },
    );

    Ok(format!(
        "Se generaron {} miniaturas nuevas",
        generated_count
    ))
}

#[tauri::command]
pub async fn generate_thumbnail(path: String) -> Result<String, String> {
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err("Archivo no encontrado".to_string());
    }

    let cache_dir = get_cache_dir();
    if !cache_dir.exists() {
        let _ = fs::create_dir_all(&cache_dir);
    }

    let hash = calculate_hash(file_path);
    let cache_path = get_cached_path(&hash);

    // 1. Verificar caché existente
    if cache_path.exists() {
        if let Ok(data) = fs::read(&cache_path) {
            let b64 = general_purpose::STANDARD.encode(data);
            return Ok(format!("data:image/webp;base64,{}", b64));
        }
    }

    // 2. Intentar extracción CDR (ZIP)
    if let Ok(data) = try_extract_cdr(file_path) {
        return save_and_return_webp(&data, &cache_path);
    }

    // 3. Fallback a QuickLook (qlmanage)
    generate_with_qlmanage(file_path, &cache_path)
}

// ==========================================
// GENERATION STRATEGIES
// ==========================================

fn try_extract_cdr(file_path: &Path) -> Result<Vec<u8>, ()> {
    let is_cdr = file_path.to_string_lossy().to_lowercase().ends_with(".cdr")
        || (file_path.extension().is_none()
            && fs::read(file_path)
                .ok()
                .map(|b| b.starts_with(b"PK\x03\x04") || b.starts_with(b"RIFF"))
                .unwrap_or(false));

    if !is_cdr {
        return Err(());
    }

    let list_output = Command::new("unzip")
        .arg("-l")
        .arg(file_path)
        .output()
        .map_err(|_| ())?;

    if !list_output.status.success() {
        return Err(());
    }

    let stdout = String::from_utf8_lossy(&list_output.stdout);
    let mut candidate = None;

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if let Some(name) = parts.last() {
            let lower = name.to_lowercase();
            if lower.ends_with(".png") || lower.ends_with(".bmp") || lower.ends_with(".jpg") {
                if lower.contains("thumb") || lower.contains("preview") {
                    candidate = Some(name.to_string());
                    break;
                }
                if candidate.is_none() {
                    candidate = Some(name.to_string());
                }
            }
        }
    }

    if let Some(target) = candidate {
        let output = Command::new("unzip")
            .arg("-p")
            .arg(file_path)
            .arg(&target)
            .output()
            .map_err(|_| ())?;

        if output.status.success() && !output.stdout.is_empty() {
            return Ok(output.stdout);
        }
    }

    Err(())
}

fn generate_with_qlmanage(file_path: &Path, cache_path: &Path) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let thumbs_dir = temp_dir.join("archi_thumbs");

    if !thumbs_dir.exists() {
        fs::create_dir_all(&thumbs_dir).map_err(|e| e.to_string())?;
    }

    let mut target_path_buf = file_path.to_path_buf();
    let mut is_symlink = false;

    // Manejo de archivos sin extensión
    if file_path.extension().is_none() {
        if let Ok(mut file) = fs::File::open(file_path) {
            let mut buffer = [0u8; 8];
            if file.read_exact(&mut buffer).is_ok() {
                let ext = if buffer.starts_with(b"8BPS") {
                    Some("psd")
                } else if buffer.starts_with(b"%PDF") {
                    Some("pdf")
                } else if buffer.starts_with(b"PK\x03\x04") {
                    Some("zip")
                } else if buffer.starts_with(b"RIFF") {
                    Some("cdr")
                } else {
                    None
                };

                if let Some(e) = ext {
                    let new_name =
                        format!("{}.{}", file_path.file_name().unwrap().to_string_lossy(), e);
                    let link_path = thumbs_dir.join(&new_name);
                    let _ = fs::remove_file(&link_path);

                    if symlink(file_path, &link_path).is_ok() {
                        target_path_buf = link_path;
                        is_symlink = true;
                    }
                }
            }
        }
    }

    let output = Command::new("qlmanage")
        .args(&["-t", "-s", "400", "-o"])
        .arg(&thumbs_dir)
        .arg(&target_path_buf)
        .output()
        .map_err(|e| format!("Error ejecutando qlmanage: {}", e))?;

    if is_symlink {
        let _ = fs::remove_file(&target_path_buf);
    }

    if !output.status.success() {
        return Err("No se pudo generar la miniatura".to_string());
    }

    let file_name = target_path_buf
        .file_name()
        .ok_or("Nombre de archivo inválido")?
        .to_string_lossy();

    let thumb_filename = format!("{}.png", file_name);
    let thumb_path = thumbs_dir.join(&thumb_filename);

    if thumb_path.exists() {
        let data = fs::read(&thumb_path).map_err(|e| e.to_string())?;
        let _ = fs::remove_file(thumb_path);

        return save_and_return_webp(&data, cache_path);
    }

    Err("Miniatura no generada en la ruta esperada".to_string())
}
