// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod filesystem;
mod menu;
mod models;
mod paths;
mod setup_directories;
mod thumbnails;

#[tauri::command]
fn show_main_window(window: tauri::Window) {
    window.show().unwrap();
    window.set_focus().unwrap();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(thumbnails::CacheCancellation {
            canceled: std::sync::atomic::AtomicBool::new(false),
        })
        .setup(|app| {
            use tauri::Manager;

            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                use tauri_plugin_global_shortcut::{ShortcutState, Code, Modifiers};
                
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_shortcut("Alt+Space")?
                        .with_handler(|app, shortcut, event| {
                            if event.state() == ShortcutState::Pressed {
                                if shortcut.matches(Modifiers::ALT, Code::Space) {
                                    if let Some(window) = app.get_webview_window("main") {
                                        let is_visible = window.is_visible().unwrap_or(false);
                                        let is_focused = window.is_focused().unwrap_or(false);
                                        
                                        if is_visible && is_focused {
                                            let _ = window.hide();
                                        } else {
                                            let _ = window.show();
                                            let _ = window.set_focus();
                                        }
                                    }
                                }
                            }
                        })
                        .build(),
                )?;
            }

            // Configurar Menú
            let menu = menu::init(app)?;
            app.set_menu(menu)?;

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
        .on_menu_event(|app, event| {
            use tauri::Emitter;
            let id = event.id();
            if id.as_ref() == "module_inicio" {
                let _ = app.emit("switch-module", "M-Inicio");
            } else if id.as_ref() == "module_recursos" {
                let _ = app.emit("switch-module", "M-Recursos");
            } else if id.as_ref() == "module_biblioteca" {
                let _ = app.emit("switch-module", "M-Biblioteca");
            } else if id.as_ref() == "module_contaduria" {
                let _ = app.emit("switch-module", "M-Contaduria");
            } else if id.as_ref() == "file_new_folder" {
                let _ = app.emit("trigger-create-folder", ());
            } else if id.as_ref() == "file_new_client" {
                let _ = app.emit("trigger-create-client", ());
            } else if id.as_ref() == "toggle_archi" {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let is_visible = window.is_visible().unwrap_or(false);
                    let is_focused = window.is_focused().unwrap_or(false);
                    
                    if is_visible && is_focused {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            } else if id.as_ref() == "nav_up" {
                let _ = app.emit("nav-up", ());
            } else if id.as_ref() == "nav_down" {
                let _ = app.emit("nav-down", ());
            } else if id.as_ref() == "nav_left" {
                let _ = app.emit("nav-left", ());
            } else if id.as_ref() == "nav_right" {
                let _ = app.emit("nav-right", ());
            } else if id.as_ref() == "edit_paste_plain" {
                let _ = app.emit("finder-note-command", "pastePlain");
            } else if id.as_ref() == "edit_bold" {
                let _ = app.emit("finder-note-command", "bold");
            } else if id.as_ref() == "edit_italic" {
                let _ = app.emit("finder-note-command", "italic");
            } else if id.as_ref() == "edit_underline" {
                let _ = app.emit("finder-note-command", "underline");
            } else if id.as_ref() == "edit_list_bullets" {
                let _ = app.emit("finder-note-command", "insertUnorderedList");
            } else if id.as_ref() == "edit_list_numbered" {
                let _ = app.emit("finder-note-command", "insertOrderedList");
            }
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                #[cfg(target_os = "macos")]
                {
                    api.prevent_close();
                    window.hide().unwrap();
                }
            }
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
            filesystem::read_work_note,
            filesystem::save_work_note,
            filesystem::import_dropped_items,
            filesystem::import_dropped_resources,
            // Sistema de Archivos - Recursos
            filesystem::list_resources,
            filesystem::create_resource,
            filesystem::rename_resource,
            filesystem::delete_resource,
            filesystem::read_file_preview,
            // Sistema de Archivos - Sistema
            filesystem::open_in_finder,
            filesystem::start_drag_files,
            // Miniaturas
            thumbnails::generate_thumbnail,
            thumbnails::get_cache_stats,
            thumbnails::clear_all_cache,
            thumbnails::open_cache_folder,
            thumbnails::generate_missing_thumbnails,
            thumbnails::cancel_cache_generation,
            // Sistema
            filesystem::open_config,
            show_main_window
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    window.show().unwrap();
                    window.set_focus().unwrap();
                }
            }
        });
}
