use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{App, Runtime};

pub fn init<R: Runtime>(app: &App<R>) -> tauri::Result<Menu<R>> {
    let app_name = app.package_info().name.clone();

    // 1. App Menu (ARCHI)
    let about_metadata = AboutMetadata {
        name: Some("ARCHI™".to_string()),
        version: Some("0.5".to_string()),
        // En macOS, el campo 'comments' a menudo no se muestra en el panel estándar 'Acerca de'.
        // Para asegurar que el texto sea visible, lo agregamos al copyright.
        copyright: Some("Gestor de archivos personal para trabajos de diseño\n\n© 2026 Gino Xiscatti.\nTodos los derechos reservados".to_string()),
        ..Default::default()
    };

    let app_menu = Submenu::with_items(
        app,
        &app_name,
        true,
        &[&PredefinedMenuItem::about(
            app,
            Some("Acerca de ARCHI"),
            Some(about_metadata),
        )?],
    )?;

    // 2. Edit Menu (Edición)
    // Forzamos los nombres en español para asegurar consistencia en modo desarrollo y producción
    let edit_menu = Submenu::with_items(
        app,
        "Edición",
        true,
        &[
            &PredefinedMenuItem::undo(app, Some("Deshacer"))?,
            &PredefinedMenuItem::redo(app, Some("Rehacer"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some("Cortar"))?,
            &PredefinedMenuItem::copy(app, Some("Copiar"))?,
            &PredefinedMenuItem::paste(app, Some("Pegar"))?,
            &MenuItem::with_id(
                app,
                "edit_paste_plain",
                "Pegar sin formato",
                true,
                Some("CmdOrCtrl+Shift+V"),
            )?,
            &PredefinedMenuItem::select_all(app, Some("Seleccionar todo"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                "edit_bold",
                " ✎   Negrita",
                true,
                Some("CmdOrCtrl+B"),
            )?,
            &MenuItem::with_id(
                app,
                "edit_italic",
                " ✎   Cursiva",
                true,
                Some("CmdOrCtrl+I"),
            )?,
            &MenuItem::with_id(
                app,
                "edit_underline",
                " ✎   Subrayado",
                true,
                Some("CmdOrCtrl+U"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                "edit_list_bullets",
                " ✎   Lista de puntos",
                true,
                Some("CmdOrCtrl+L"),
            )?,
            &MenuItem::with_id(
                app,
                "edit_list_numbered",
                " ✎   Lista numérica",
                true,
                Some("CmdOrCtrl+K"),
            )?,
        ],
    )?;

    // 3. Window Menu (Ventana)
    let window_menu = Submenu::with_items(
        app,
        "Ventana",
        true,
        &[
            &PredefinedMenuItem::quit(app, Some("Cerrar ARCHI"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, Some("Cerrar ventana"))?,
            &PredefinedMenuItem::minimize(app, Some("Minimizar"))?,
            &PredefinedMenuItem::maximize(app, Some("Maximizar"))?,
            &PredefinedMenuItem::fullscreen(app, Some("Pantalla completa"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "toggle_archi", "✨ Invocar Archi", true, Some("Alt+Space"))?,
        ],
    )?;

    // 4. Modules Menu (Módulos)
    let modules_menu = Submenu::with_items(
        app,
        "Módulos",
        true,
        &[
            &MenuItem::with_id(app, "module_inicio", "Inicio", true, Some("CmdOrCtrl+1"))?,
            &MenuItem::with_id(
                app,
                "module_recursos",
                "Recursos",
                true,
                Some("CmdOrCtrl+2"),
            )?,
            &MenuItem::with_id(
                app,
                "module_biblioteca",
                "Biblioteca",
                true,
                Some("CmdOrCtrl+3"),
            )?,
            &MenuItem::with_id(
                app,
                "module_contaduria",
                "Contaduría",
                true,
                Some("CmdOrCtrl+4"),
            )?,
        ],
    )?;

    // 5. File Menu (Archivo) - For global shortcuts
    let file_menu = Submenu::with_items(
        app,
        "Archivo",
        true,
        &[
            &MenuItem::with_id(
                app,
                "file_new_folder",
                "Crear carpeta",
                true,
                Some("CmdOrCtrl+N"),
            )?,
            &MenuItem::with_id(
                app,
                "file_new_client",
                "Crear cliente",
                true,
                Some("CmdOrCtrl+Shift+N"),
            )?,
        ],
    )?;

    // 6. Navigation Menu (Navegación)
    let nav_menu = Submenu::with_items(
        app,
        "Navegación",
        true,
        &[
            &MenuItem::with_id(app, "nav_left", "Atrás", true, Some("Left"))?,
            &MenuItem::with_id(app, "nav_right", "Adelante", true, Some("Right"))?,
            &MenuItem::with_id(app, "nav_up", "Anterior", true, Some("Up"))?,
            &MenuItem::with_id(app, "nav_down", "Siguiente", true, Some("Down"))?,
        ],
    )?;

    Menu::with_items(
        app,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &nav_menu,
            &modules_menu,
            &window_menu,
        ],
    )
}
