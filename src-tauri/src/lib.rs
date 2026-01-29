// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod filesystem;
mod models;
mod paths;
mod setup_directories;
mod thumbnails;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(thumbnails::CacheCancellation { canceled: std::sync::atomic::AtomicBool::new(false) })
        .setup(|app| {
            use tauri::Manager;
            
            // Asegurar setup de usuario (carpetas y config)
            if let Err(e) = setup_directories::ensure_user_setup() {
                eprintln!("Error en setup inicial: {}", e);
            }

            // Intentar aplicar resolución guardada al iniciar
            if let Some(window) = app.get_webview_window("main") {
                let config = paths::get_config();
                // Usar LogicalSize para que coincida con las medidas CSS/Web
                let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                    width: config.resolution.width as f64,
                    height: config.resolution.height as f64,
                }));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Configuración
            paths::get_config,
            paths::save_config,
            paths::update_module,
            paths::get_default_config,
            
            // Instalación/Setup
            setup_directories::ensure_user_setup,
            
            // Sistema de Archivos - Clientes
            filesystem::list_clients,
            filesystem::create_client,
            filesystem::rename_client,
            filesystem::delete_client,
            filesystem::toggle_pin_client,
            
            // Sistema de Archivos - Archivos/Carpetas
            filesystem::list_files,
            filesystem::create_folder,
            filesystem::rename_folder,
            filesystem::delete_folder,
            
            // Sistema de Archivos - Recursos
            filesystem::list_resources,
            filesystem::create_resource,
            filesystem::rename_resource,
            filesystem::delete_resource,
            filesystem::read_file_preview,
            
            // Sistema de Archivos - Sistema
            filesystem::open_in_finder,

            // Miniaturas
            thumbnails::generate_thumbnail,
            thumbnails::get_cache_stats,
            thumbnails::clear_all_cache,
            thumbnails::open_cache_folder,
            thumbnails::generate_missing_thumbnails,
            thumbnails::cancel_cache_generation,
            
            // Sistema
            filesystem::open_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
