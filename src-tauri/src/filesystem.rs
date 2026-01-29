use crate::models::{Client, FileItem, Metadata};
use crate::paths::{get_config_path, get_user_data_dir};
use crate::setup_directories::ensure_user_setup;
use drag::{self, DragItem, DragMode, Image, Options};
use tauri::Emitter;
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::process::Command;
use std::time::SystemTime;
use walkdir::WalkDir;


// ==========================================
// FUNCIONES AUXILIARES
// ==========================================

// Función auxiliar para detectar tipo por magic bytes
fn detect_file_type_by_magic(path: &std::path::Path) -> Option<String> {
    // Intentar abrir el archivo
    let mut file = fs::File::open(path).ok()?;
    let mut buffer = [0u8; 8]; // Leer primeros 8 bytes para identificación
    if file.read_exact(&mut buffer).is_err() {
        return None;
    }

    // Identificación por firmas (Magic Bytes)

    // PSD: 8BPS
    if buffer.starts_with(b"8BPS") {
        return Some("psd".to_string());
    }
    // PDF: %PDF
    if buffer.starts_with(b"%PDF") {
        return Some("pdf".to_string());
    }

    // CorelDRAW (CDR): Puede ser ZIP (PK..) o RIFF (CDR)
    if buffer.starts_with(b"PK\x03\x04") {
        return Some("zip".to_string()); // Muchos formatos modernos son zips renombrados
    }
    if buffer.starts_with(b"RIFF") && buffer.len() >= 8 {
        // Podría ser CDR u otro RIFF, asumimos CDR en este contexto si es necesario o devolvemos cdr
        return Some("cdr".to_string());
    }

    // PNG
    if buffer.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("png".to_string());
    }
    // JPEG
    if buffer.starts_with(b"\xff\xd8\xff") {
        return Some("jpg".to_string());
    }

    None
}

fn resolve_path(folder: &str, subfolder: &str) -> PathBuf {
    let user_data_dir = get_user_data_dir();
    let parts: Vec<&str> = folder.split('/').collect();

    if parts.len() > 1 {
        let mut p = user_data_dir.join(parts[0]).join(subfolder);
        for part in &parts[1..] {
            p = p.join(part);
        }
        p
    } else {
        user_data_dir.join(folder).join(subfolder)
    }
}

// ==========================================
// GESTIÓN DE CLIENTES
// ==========================================

#[tauri::command]
pub fn list_clients() -> Result<Vec<Client>, String> {
    let user_data_dir = get_user_data_dir();
    let mut clients = Vec::new();

    if !user_data_dir.exists() {
        return Ok(vec![]);
    }

    if let Ok(entries) = fs::read_dir(&user_data_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if !name.starts_with('.') {
                        // Verificar metadatos de anclaje (pin)
                        let metadata_path = path.join(".metadatos.json");
                        let mut pinned = false;
                        if metadata_path.exists() {
                            if let Ok(content) = fs::read_to_string(&metadata_path) {
                                if let Ok(meta) = serde_json::from_str::<Metadata>(&content) {
                                    pinned = meta.pin.unwrap_or(false);
                                }
                            }
                        }

                        clients.push(Client {
                            name: name.to_string(),
                            pinned,
                        });
                    }
                }
            }
        }
    }

    // Ordenar: Anclados primero, luego alfabéticamente
    clients.sort_by(|a, b| {
        if a.pinned != b.pinned {
            b.pinned.cmp(&a.pinned) // True (anclado) va primero
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(clients)
}

#[tauri::command]
pub fn create_client(name: String) -> Result<(), String> {
    let target_path = get_user_data_dir().join(&name);

    if target_path.exists() {
        return Err("Ya existe un cliente con ese nombre".to_string());
    }

    fs::create_dir_all(&target_path).map_err(|e| e.to_string())?;
    let _ = ensure_user_setup(); // Create subfolders
    Ok(())
}

#[tauri::command]
pub fn rename_client(old_name: String, new_name: String) -> Result<(), String> {
    let base = get_user_data_dir();
    let old_path = base.join(&old_name);
    let new_path = base.join(&new_name);

    if !old_path.exists() {
        return Err("El cliente original no existe".to_string());
    }
    if new_path.exists() && old_name.to_lowercase() != new_name.to_lowercase() {
        return Err("Ya existe un cliente con el nuevo nombre".to_string());
    }

    fs::rename(old_path, new_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_client(name: String) -> Result<(), String> {
    let target_path = get_user_data_dir().join(&name);
    if !target_path.exists() {
        return Err("El cliente no existe".to_string());
    }
    trash::delete(target_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn start_drag_files(window: tauri::WebviewWindow, paths: Vec<String>) -> Result<(), String> {
    let mut files: Vec<std::path::PathBuf> = Vec::new();
    // Clonamos paths para usarlos en el drag, ya que paths se consume en el bucle
    let paths_for_check = paths.clone();

    for p in paths {
        let pb = std::path::PathBuf::from(p);
        if !pb.is_absolute() {
            continue;
        }
        if !pb.exists() {
            continue;
        }
        files.push(pb);
    }
    if files.is_empty() {
        return Err("Sin archivos para arrastrar".to_string());
    }

    let item = DragItem::Files(files);
    const TRANSPARENT_PNG_1X1: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49,
        0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
        0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44,
        0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D,
        0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42,
        0x60, 0x82,
    ];
    let preview_icon = Image::Raw(TRANSPARENT_PNG_1X1.to_vec());

    let opts = Options {
                skip_animatation_on_cancel_or_failure: true,
                mode: DragMode::CopyMove,
            };

    let window_clone = window.clone();
    // Usamos el clon que creamos al principio
    let paths_clone = paths_for_check;
    
    let _ = drag::start_drag(&window, item, preview_icon, move |result, _cursor| {
        // Solo intentamos detectar cambios si se soltó el archivo (Dropped)
        // Si se canceló, no hacemos nada (o podríamos emitir evento igual, pero no hace falta recargar)
        if let drag::DragResult::Dropped = result {
             let window_thread = window_clone.clone();
             let paths_thread = paths_clone.clone();
             
             std::thread::spawn(move || {
                // Polling: Verificar si los archivos desaparecen (Move)
                // Intentamos durante 2 segundos (20 * 100ms)
                for _ in 0..20 {
                    let any_missing = paths_thread.iter().any(|p| !std::path::Path::new(p).exists());
                    if any_missing {
                        // Si alguno falta, asumimos que se movió.
                        // Emitimos evento y terminamos.
                        let _ = window_thread.emit("drag-finished", ());
                        return;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                
                // Si llegamos aquí, los archivos siguen existiendo.
                // Puede ser una copia (Copy) o un movimiento muy lento.
                // Emitimos el evento de todas formas para asegurar consistencia.
                let _ = window_thread.emit("drag-finished", ());
             });
        }
    }, opts);
    Ok(())
}

#[tauri::command]
pub fn toggle_pin_client(name: String, pin: bool) -> Result<(), String> {
    let metadata_path = get_user_data_dir().join(&name).join(".metadatos.json");

    let mut meta = if metadata_path.exists() {
        fs::read_to_string(&metadata_path)
            .ok()
            .and_then(|c| serde_json::from_str::<Metadata>(&c).ok())
            .unwrap_or(Metadata {
                fecha: None,
                date: None,
                pin: None,
            })
    } else {
        Metadata {
            fecha: None,
            date: None,
            pin: None,
        }
    };

    meta.pin = Some(pin);

    let json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(metadata_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

// ==========================================
// LISTADO Y OPERACIONES DE ARCHIVOS
// ==========================================

#[tauri::command]
pub fn list_files(folder: String) -> Result<Vec<FileItem>, String> {
    let folder_path = resolve_path(&folder, "Biblioteca");

    if !folder_path.exists() || !folder_path.is_dir() {
        return Err("Carpeta no encontrada".to_string());
    }

    let mut files = Vec::new();

    if let Ok(entries) = fs::read_dir(&folder_path) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }

            let path = entry.path();
            let is_dir = path.is_dir();
            let metadata = entry.metadata().map_err(|e| e.to_string())?;

            // Lógica de fechas
            let mut folder_date = metadata
                .created()
                .unwrap_or(SystemTime::now())
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;
            let mtime = metadata
                .modified()
                .unwrap_or(SystemTime::now())
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;

            let mut has_metadata = false;
            if is_dir {
                let meta_path = path.join(".metadatos.json");
                if meta_path.exists() {
                    if let Ok(content) = fs::read_to_string(&meta_path) {
                        if let Ok(meta) = serde_json::from_str::<Metadata>(&content) {
                            if let Some(d) = meta.fecha.or(meta.date) {
                                folder_date = d;
                                has_metadata = true;
                            }
                        }
                    }
                }
            }

            // Tamaño y conteo de items
            let mut item_count = 0;
            let mut size = metadata.len();

            if is_dir {
                // Contar hijos inmediatos
                if let Ok(sub) = fs::read_dir(&path) {
                    item_count = sub
                        .flatten()
                        .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
                        .count();
                }

                // Calcular tamaño total (recursivo) - ELIMINADO POR RENDIMIENTO
                // El cálculo recursivo causaba un retraso de 3-5 segundos.
                // Se asigna 0 o se podría implementar un cálculo asíncrono en segundo plano si fuera crítico.
                size = 0;
            }

            // Tipo detectado
            let mut detected_type = if is_dir {
                "directory".to_string()
            } else {
                path.extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("unknown")
                    .to_lowercase()
            };

            // Si es desconocido o no tiene extensión, intentar detectar por magic bytes
            if !is_dir && (detected_type == "unknown" || detected_type.is_empty()) {
                if let Some(magic_type) = detect_file_type_by_magic(&path) {
                    detected_type = magic_type;
                }
            }

            files.push(FileItem {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir,
                item_count,
                size,
                mtime,
                date: folder_date,
                has_metadata,
                detected_type,
            });
        }
    }

    Ok(files)
}

#[tauri::command]
pub fn create_folder(parent: String, name: String) -> Result<(), String> {
    let target_base = resolve_path(&parent, "Biblioteca");
    let target_path = target_base.join(&name);

    if target_path.exists() {
        return Err("Ya existe una carpeta con ese nombre".to_string());
    }

    fs::create_dir_all(&target_path).map_err(|e| e.to_string())?;

    // Crear metadatos con la marca de tiempo actual
    let meta_path = target_path.join(".metadatos.json");
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let meta = Metadata {
        fecha: Some(now),
        date: None,
        pin: None,
    };
    let json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(meta_path, json).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn rename_folder(parent: String, old_name: String, new_name: String) -> Result<(), String> {
    let base_path = resolve_path(&parent, "Biblioteca");
    let old_path = base_path.join(&old_name);
    let new_path = base_path.join(&new_name);

    if !old_path.exists() {
        return Err("La carpeta original no existe".to_string());
    }
    if new_path.exists() && old_name.to_lowercase() != new_name.to_lowercase() {
        return Err("Ya existe una carpeta con el nuevo nombre".to_string());
    }

    fs::rename(old_path, new_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_folder(parent: String, name: String) -> Result<(), String> {
    let base_path = resolve_path(&parent, "Biblioteca");
    let target_path = base_path.join(&name);

    if !target_path.exists() {
        return Err("La carpeta no existe".to_string());
    }

    trash::delete(target_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn import_dropped_items(folder: String, paths: Vec<String>, copy_mode: bool) -> Result<(), String> {
    println!("Importing items. Copy mode: {}", copy_mode);
    let dest_dir = resolve_path(&folder, "Biblioteca");
    if !dest_dir.exists() || !dest_dir.is_dir() {
        return Err("Carpeta destino no encontrada".to_string());
    }

    fn unique_dest_path(dest_dir: &std::path::Path, base_name: &str, is_dir: bool) -> PathBuf {
        let initial = dest_dir.join(base_name);
        if !initial.exists() {
            return initial;
        }

        let (stem, ext) = if !is_dir {
            match base_name.rsplit_once('.') {
                Some((s, e)) if !s.is_empty() && !e.is_empty() => (s.to_string(), Some(e.to_string())),
                _ => (base_name.to_string(), None),
            }
        } else {
            (base_name.to_string(), None)
        };

        for n in 2..10_000 {
            let candidate_name = match &ext {
                Some(e) => format!("{} ({}).{}", stem, n, e),
                None => format!("{} ({})", stem, n),
            };
            let candidate = dest_dir.join(candidate_name);
            if !candidate.exists() {
                return candidate;
            }
        }

        dest_dir.join(base_name)
    }

    fn copy_dir_recursive(src_dir: &std::path::Path, dest_dir: &std::path::Path) -> bool {
        if let Err(e) = fs::create_dir_all(dest_dir) {
            eprintln!("Error creando carpeta de destino {:?}: {}", dest_dir, e);
            return false;
        }

        let mut success = true;
        for entry in WalkDir::new(src_dir).follow_links(false).into_iter() {
            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    eprintln!("Error recorriendo carpeta {:?}: {}", src_dir, e);
                    success = false;
                    continue;
                }
            };

            let src_path = entry.path();
            if src_path == src_dir {
                continue;
            }

            let rel = match src_path.strip_prefix(src_dir) {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("Error calculando ruta relativa {:?}: {}", src_path, e);
                    success = false;
                    continue;
                }
            };

            let dest_path = dest_dir.join(rel);

            if entry.file_type().is_dir() {
                if let Err(e) = fs::create_dir_all(&dest_path) {
                    eprintln!("Error creando subcarpeta {:?}: {}", dest_path, e);
                    success = false;
                }
            } else {
                if let Some(parent) = dest_path.parent() {
                    if let Err(e) = fs::create_dir_all(parent) {
                        eprintln!("Error creando carpeta padre {:?}: {}", parent, e);
                        success = false;
                        continue;
                    }
                }
                if let Err(e) = fs::copy(src_path, &dest_path) {
                    eprintln!("Error copiando archivo {:?} a {:?}: {}", src_path, dest_path, e);
                    success = false;
                }
            }
        }
        success
    }

    let mut copied_any = false;
    let mut last_error: Option<String> = None;
    let mut skipped_same_dir = false;

    for p in paths {
        let src = PathBuf::from(p);
        if !src.is_absolute() {
            continue;
        }
        if !src.exists() {
            continue;
        }

        if let Some(parent) = src.parent() {
            if parent == dest_dir {
                skipped_same_dir = true;
                continue;
            }
        }

        let file_name = match src.file_name().and_then(|n| n.to_str()) {
            Some(n) if !n.is_empty() => n.to_string(),
            _ => continue,
        };

        if src.is_dir() {
            let dest = unique_dest_path(&dest_dir, &file_name, true);
            
            let mut moved = false;
            if !copy_mode {
                match fs::rename(&src, &dest) {
                    Ok(_) => {
                        copied_any = true;
                        moved = true;
                    }
                    Err(e) => {
                        println!("No se pudo renombrar carpeta (posiblemente entre discos): {}, intentando copia recursiva y borrado", e);
                    }
                }
            }

            if !moved {
                if copy_dir_recursive(&src, &dest) {
                    copied_any = true;
                    if !copy_mode {
                        if let Err(e) = fs::remove_dir_all(&src) {
                            eprintln!("Error borrando carpeta original {:?}: {}", src, e);
                            last_error = Some(format!("Se copió pero no se pudo borrar la carpeta original: {}", e));
                        }
                    }
                } else {
                     last_error = Some(format!("Error al copiar carpeta {:?}", src));
                }
            }
        } else {
            let dest = unique_dest_path(&dest_dir, &file_name, false);
            
            let mut moved = false;
            if !copy_mode {
                 match fs::rename(&src, &dest) {
                    Ok(_) => {
                        copied_any = true;
                        moved = true;
                    }
                    Err(e) => {
                        println!("No se pudo renombrar archivo (posiblemente entre discos): {}, intentando copiar y borrar", e);
                    }
                }
            }

            if !moved {
                match fs::copy(&src, &dest) {
                    Ok(_) => {
                        copied_any = true;
                        if !copy_mode {
                            if let Err(e) = fs::remove_file(&src) {
                                eprintln!("Error borrando archivo original {:?}: {}", src, e);
                                last_error = Some(format!("Se copió pero no se pudo borrar el original: {}", e));
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("Error copiando archivo {:?} a {:?}: {}", src, dest, e);
                        last_error = Some(format!("No se pudo copiar {:?}: {}", src, e));
                    }
                }
            }
        }
    }

    if copied_any {
        Ok(())
    } else if skipped_same_dir && last_error.is_none() {
        Ok(())
    } else {
        Err(last_error.unwrap_or_else(|| "No se pudieron importar los archivos arrastrados".to_string()))
    }
}

// ==========================================
// OPERACIONES DE RECURSOS
// ==========================================

#[tauri::command]
pub fn list_resources(folder: String) -> Result<Vec<FileItem>, String> {
    let folder_path = resolve_path(&folder, "Recursos");

    if !folder_path.exists() || !folder_path.is_dir() {
        return Err("Carpeta no encontrada".to_string());
    }

    let mut files = Vec::new();

    if let Ok(entries) = fs::read_dir(&folder_path) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            // Filtro: solo ocultos
            if name.starts_with('.') {
                continue;
            }

            let path = entry.path();
            let is_dir = path.is_dir();
            let metadata = entry.metadata().map_err(|e| e.to_string())?;
            let mtime = metadata
                .modified()
                .unwrap_or(SystemTime::now())
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;
            let size = metadata.len();

            let mut item_count = 0;
            if is_dir {
                if let Ok(sub) = fs::read_dir(&path) {
                    item_count = sub
                        .flatten()
                        .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
                        .count();
                }
            }

            files.push(FileItem {
                name: name.clone(),
                path: path.to_string_lossy().to_string(),
                is_dir,
                item_count,
                size,
                mtime,
                date: 0,
                has_metadata: false,
                detected_type: if is_dir {
                    "directory".to_string()
                } else {
                    path.extension()
                        .map(|e| e.to_string_lossy().to_string().to_lowercase())
                        .unwrap_or("unknown".to_string())
                },
            });
        }
    }

    Ok(files)
}

#[tauri::command]
pub fn create_resource(parent: String, name: String) -> Result<(), String> {
    let target_base = resolve_path(&parent, "Recursos");
    let target_path = target_base.join(&name);

    if target_path.exists() {
        return Err("Ya existe un recurso con ese nombre".to_string());
    }

    fs::create_dir_all(&target_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn rename_resource(parent: String, old_name: String, new_name: String) -> Result<(), String> {
    let base_path = resolve_path(&parent, "Recursos");
    let old_path = base_path.join(&old_name);
    let new_path = base_path.join(&new_name);

    if !old_path.exists() {
        return Err("El recurso original no existe".to_string());
    }
    if new_path.exists() && old_name.to_lowercase() != new_name.to_lowercase() {
        return Err("Ya existe un recurso con el nuevo nombre".to_string());
    }

    fs::rename(old_path, new_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_resource(parent: String, name: String) -> Result<(), String> {
    let base_path = resolve_path(&parent, "Recursos");
    let target_path = base_path.join(&name);

    if !target_path.exists() {
        return Err("El recurso no existe".to_string());
    }

    trash::delete(target_path).map_err(|e| e.to_string())?;
    Ok(())
}

// Función auxiliar para extraer texto de RTF simple
fn extract_rtf_text(rtf_content: &str) -> String {
    let mut result = String::new();
    let mut stack = vec![true]; // Visible by default
    let mut chars = rtf_content.chars().peekable();
    let mut just_opened_group = false;

    while let Some(c) = chars.next() {
        match c {
            '{' => {
                let parent_visible = *stack.last().unwrap_or(&true);
                stack.push(parent_visible);
                just_opened_group = true;
            }
            '}' => {
                if stack.len() > 1 {
                    stack.pop();
                }
                just_opened_group = false;
            }
            '\\' => {
                let mut cmd = String::new();
                if let Some(&next) = chars.peek() {
                    if !next.is_alphabetic() {
                        chars.next();
                        match next {
                            '*' => {
                                if just_opened_group {
                                    if let Some(last) = stack.last_mut() {
                                        *last = false;
                                    }
                                }
                            }
                            '\'' => {
                                let mut hex = String::new();
                                if let Some(h1) = chars.next() {
                                    hex.push(h1);
                                }
                                if let Some(h2) = chars.next() {
                                    hex.push(h2);
                                }
                                if *stack.last().unwrap_or(&true) {
                                    if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                                        // Mapeo simple byte a char (Latin1)
                                        result.push(byte as char);
                                    }
                                }
                            }
                            '\\' | '{' | '}' => {
                                if *stack.last().unwrap_or(&true) {
                                    result.push(next);
                                }
                            }
                            _ => {}
                        }
                        just_opened_group = false;
                        continue;
                    }
                }

                while let Some(&next) = chars.peek() {
                    if next.is_alphabetic() {
                        cmd.push(next);
                        chars.next();
                    } else {
                        break;
                    }
                }

                // Ignorar parámetro numérico
                while let Some(&next) = chars.peek() {
                    if next.is_numeric() || next == '-' {
                        chars.next();
                    } else {
                        break;
                    }
                }

                // Consumir espacio delimitador
                if let Some(&next) = chars.peek() {
                    if next == ' ' {
                        chars.next();
                    }
                }

                if just_opened_group {
                    match cmd.as_str() {
                        "fonttbl" | "colortbl" | "stylesheet" | "info" | "pict" | "header"
                        | "footer" => {
                            if let Some(last) = stack.last_mut() {
                                *last = false;
                            }
                        }
                        _ => {}
                    }
                    just_opened_group = false;
                }

                if *stack.last().unwrap_or(&true) {
                    match cmd.as_str() {
                        "par" | "line" => result.push('\n'),
                        "tab" => result.push('\t'),
                        "emdash" => result.push('—'),
                        "endash" => result.push('–'),
                        "quote" => result.push('\''),
                        "ldblquote" => result.push('“'),
                        "rdblquote" => result.push('”'),
                        _ => {}
                    }
                }
            }
            '\r' | '\n' => {} // Ignorar saltos de línea crudos en RTF
            _ => {
                if *stack.last().unwrap_or(&true) {
                    result.push(c);
                }
                just_opened_group = false;
            }
        }
    }
    result
}

#[tauri::command]
pub fn read_file_preview(path: String) -> Result<serde_json::Value, String> {
    let file_path = PathBuf::from(&path);

    // Validar seguridad básica
    let user_data_dir = get_user_data_dir();
    if !file_path.starts_with(&user_data_dir) {
        // Permitir acceso solo si está dentro de user_data_dir (o subdirectorios permitidos)
        // Nota: Esto es estricto. Si se requiere acceso fuera, ajustar.
        // Dado el contexto de "Recursos" y "Biblioteca", suele ser dentro de user_data_dir.
        // Pero para estar seguros y no romper nada si el usuario tiene symlinks o rutas raras:
        // Si no empieza con user_data_dir, chequeamos si existe y es un archivo regular.
        // Para máxima seguridad según instrucciones previas:
        // if !file_path.starts_with(user_data_dir) { return Err("Acceso denegado".to_string()); }
        // Pero mantendremos el comportamiento previo si no estamos seguros de la restricción.
        // El usuario pidió "no tocar cosas extras". Mejor no agrego restricciones de ruta nuevas si no me las pidieron explícitamente AHORA.
        // Simplemente validamos existencia.
    }

    if !file_path.exists() {
        return Err("Archivo no encontrado".to_string());
    }

    let is_rtf = path.to_lowercase().ends_with(".rtf");
    let limit = if is_rtf { 16384 } else { 4096 }; // Leer más bytes para RTF por la cabecera

    // Leer como string con límite de tamaño
    let file = fs::File::open(&file_path).map_err(|e| e.to_string())?;
    let mut buffer = Vec::new();
    file.take(limit)
        .read_to_end(&mut buffer)
        .map_err(|e| e.to_string())?;

    let raw_content = String::from_utf8_lossy(&buffer).to_string();
    let content = if is_rtf {
        extract_rtf_text(&raw_content)
    } else {
        raw_content
    };

    Ok(serde_json::json!({
        "content": content
    }))
}

// ==========================================
// OPERACIONES DEL SISTEMA
// ==========================================

#[tauri::command]
pub fn open_in_finder(
    folder: Option<String>,
    item: Option<String>,
    subfolder: Option<String>,
) -> Result<(), String> {
    let user_data_dir = get_user_data_dir();
    let mut path = user_data_dir;

    if let Some(f) = folder {
        let sub = subfolder.unwrap_or_else(|| "Biblioteca".to_string());
        let parts: Vec<&str> = f.split('/').collect();
        if parts.len() > 1 {
            path = path.join(parts[0]).join(&sub);
            for part in &parts[1..] {
                path = path.join(part);
            }
        } else {
            path = path.join(&f).join(&sub);
        }
    }

    if let Some(ref i) = item {
        path = path.join(i);
    }

    if !path.exists() {
        return Err("Path not found".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("open");
        if item.is_some() {
            command.arg("-R");
        }

        command.arg(path).spawn().map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg("/select,")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn open_config() -> Result<(), String> {
    let config_path = get_config_path();

    if !config_path.exists() {
        return Err("Archivo de configuración no encontrado".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(config_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(config_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}
