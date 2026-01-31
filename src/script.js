document.addEventListener('DOMContentLoaded', async () => {
    const tabs = document.querySelectorAll('.lateral-tab');
    const settingsIcon = document.querySelector('.settings-icon');
    const settingsTab = document.getElementById('lateral-tab-settings');
    const topTabs = document.querySelectorAll('.top-tab');
    const modules = document.querySelectorAll('.content > div[id^="M-"]');
    
    const realTabs = Array.from(tabs).filter(t => t !== settingsTab);

    // Variables para rastrear el estado previo antes de entrar en Ajustes
    let lastActiveLateralTab = null;
    let lastActiveTopTab = null;
    let dropCopyMode = false;
    let isAltPressed = false;

    const isTextEditingElement = (el) => {
        if (!el) return false;
        const tag = el.tagName;
        if (tag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return true;
        if (el.isContentEditable) return true;
        return !!el.closest?.('[contenteditable="true"]');
    };

    // ==========================================================================
    // UTILS & SHARED LOGIC
    // ==========================================================================
    window.utils = {
        async apiCall(url, body = null, method = 'POST') {
            // Adaptador para Tauri: Intercepta llamadas API y usa invoke
            const { invoke } = window.__TAURI__.core;
            console.log(`[Tauri Adapter] ${method} ${url}`, body);

            try {
                // --- CLIENTES ---
                if (url === '/api/clients' && method === 'GET') {
                    const clients = await invoke('list_clients');
                    return { status: 'success', clients };
                }
                if (url === '/api/clients' && method === 'POST') {
                    await invoke('create_client', { name: body.name });
                    return { status: 'success' };
                }

                // --- RECURSOS ---
                // Patrón: /api/files_resources/{folderName}
                if (url.startsWith('/api/files_resources/')) {
                    // Extraer todo después de /api/files_resources/
                    const rawFolder = url.replace('/api/files_resources/', '');
                    const folder = decodeURIComponent(rawFolder);
                    const files = await invoke('list_resources', { folder });
                    return { status: 'success', files };
                }

                // --- BIBLIOTECA (ARCHIVOS) ---
                // Patrón: /api/files/{folderName}
                if (url.startsWith('/api/files/')) {
                    const rawFolder = url.replace('/api/files/', '');
                    const folder = decodeURIComponent(rawFolder);
                    const result = await invoke('list_files', { folder });
                    return { status: 'success', files: result.files, layout: result.layout };
                }

                if (url.startsWith('/api/work_note/')) {
                    const rawFolder = url.replace('/api/work_note/', '');
                    const folder = decodeURIComponent(rawFolder);

                    if (method === 'GET') {
                        const content = await invoke('read_work_note', { folder });
                        return { status: 'success', content };
                    }
                    if (method === 'POST') {
                        await invoke('save_work_note', { folder, content: body?.content ?? '' });
                        return { status: 'success' };
                    }
                }

                // --- CLIENTES (CRUD) ---
                if (url === '/api/create_client') {
                    await invoke('create_client', { name: body.name });
                    return { status: 'success' };
                }
                if (url === '/api/rename_client') {
                    await invoke('rename_client', { oldName: body.old_name, newName: body.new_name });
                    return { status: 'success' };
                }
                if (url === '/api/delete_client') {
                    await invoke('delete_client', { name: body.name }); // body.name is client name
                    return { status: 'success' };
                }
                if (url === '/api/toggle_pin_client') {
                    await invoke('toggle_pin_client', { name: body.name, pin: body.pin });
                    return { status: 'success' };
                }

                // --- BIBLIOTECA (CRUD) ---
                if (url === '/api/create_folder') {
                    await invoke('create_folder', { parent: body.parent, name: body.name });
                    return { status: 'success' };
                }
                if (url === '/api/rename_folder') {
                    await invoke('rename_folder', { parent: body.parent, oldName: body.old_name, newName: body.new_name });
                    return { status: 'success' };
                }
                if (url === '/api/delete_folder') {
                    await invoke('delete_folder', { parent: body.parent, name: body.name });
                    return { status: 'success' };
                }

                // --- RECURSOS (CRUD) ---
                if (url === '/api/create_resource') {
                    await invoke('create_resource', { parent: body.parent, name: body.name });
                    return { status: 'success' };
                }
                if (url === '/api/rename_resource') {
                    await invoke('rename_resource', { parent: body.parent, oldName: body.old_name, newName: body.new_name });
                    return { status: 'success' };
                }
                if (url === '/api/delete_resource') {
                    await invoke('delete_resource', { parent: body.parent, name: body.name });
                    return { status: 'success' };
                }

                // --- CONFIGURACIÓN ---
                if (url === '/api/config' && method === 'GET') {
                    const config = await invoke('get_config');
                    return { status: 'success', config };
                }
                if (url === '/api/get_default_config') {
                    const defaults = await invoke('get_default_config');
                    return { status: 'success', defaults };
                }
                
                if (url === '/api/save_config' && method === 'POST') {
                    // Obtener configuración actual para mezclar cambios parciales
                    const currentConfig = await invoke('get_config');
                    const newConfig = { ...currentConfig, ...body };
                    await invoke('save_config', { config: newConfig });
                    return { status: 'success' };
                }

                // --- ACTUALIZAR MÓDULO ---
                if (url.startsWith('/update_module/') && method === 'GET') {
                    const moduleId = url.replace('/update_module/', '');
                    await invoke('update_module', { moduleId });
                    return { status: 'success' };
                }

                // --- SISTEMA ---
                if (url === '/api/open_config') {
                    await invoke('open_config');
                    return { status: 'success' };
                }
                
                if (url === '/api/open_in_finder' && method === 'POST') {
                    await invoke('open_in_finder', { 
                        folder: body.folder, 
                        item: body.item, 
                        subfolder: body.subfolder 
                    });
                    return { status: 'success' };
                }

                if (url === '/api/start_drag' && method === 'POST') {
                    await invoke('start_drag_files', { paths: body.paths });
                    return { status: 'success' };
                }

                if (url === '/api/save_work_layout' && method === 'POST') {
                    await invoke('save_work_layout', { 
                        folder: body.folder, 
                        positions: body.positions 
                    });
                    return { status: 'success' };
                }

                if (url === '/api/import_drop' && method === 'POST') {
                    await invoke('import_dropped_items', { 
                        folder: body.folder, 
                        paths: body.paths,
                        copyMode: body.copyMode 
                    });
                    return { status: 'success' };
                }

                if (url === '/api/import_drop_resources' && method === 'POST') {
                    await invoke('import_dropped_resources', { 
                        folder: body.folder, 
                        paths: body.paths,
                        copyMode: body.copyMode 
                    });
                    return { status: 'success' };
                }

                console.warn('Ruta API no implementada en adaptador Tauri:', url);
                return { status: 'error', error: 'Ruta no implementada' };

            } catch (error) {
                console.error('Error en Tauri Invoke:', error);
                return { status: 'error', error: error.toString() };
            }
        },

        convertFileSrc(filePath) {
            if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.convertFileSrc) {
                return window.__TAURI__.core.convertFileSrc(filePath);
            }
            return filePath;
        },

        generateThumbnailHtml(file) {
            let iconHtml;
            if (file.is_dir) {
                const iconPath = file.item_count === 0 ? 'assets/CarpetaVacia.svg' : 'assets/CarpetaLlena.svg';
                iconHtml = `<img src="${iconPath}" class="file-icon-svg" alt="folder">`;
            } else {
                 const ext = (file.detected_type && file.detected_type !== 'unknown') 
                     ? file.detected_type 
                     : file.name.split('.').pop().toLowerCase();
                 
                 const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
                 const videoExts = ['mp4', 'webm', 'ogg', 'mov'];
                 const nativeThumbExts = ['psd', 'psb', 'ai', 'indd', 'pdf', 'eps', 'tiff', 'tif', 'raw', 'dng', 'cdr', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
                 const textPreviewExts = ['txt', 'rtf', 'md', 'json', 'xml', 'log', 'ini', 'cfg', 'csv'];
                 const documentExts = [];
                 const zipExts = ['zip', 'rar', '7z', 'tar', 'gz'];
                 const aseExts = ['ase'];
                 
                 if (imageExts.includes(ext)) {
                     // Use placeholder for images to enable caching via enrichThumbnail
                     iconHtml = `<img src="assets/LogotipoARCHI.svg" class="file-thumbnail-img adobe-thumb thumb-fit-contain thumb-opacity-low">`;
                 } else if (videoExts.includes(ext)) {
                     const fileSrc = this.convertFileSrc(file.path);
                     iconHtml = `<video src="${fileSrc}" class="file-thumbnail-video" muted preload="metadata"></video>`;
                 } else if (textPreviewExts.includes(ext)) {
                     iconHtml = `<div class="file-thumbnail-text-preview"></div>`;
                 } else if (documentExts.includes(ext)) {
                     const iconName = `${ext.toUpperCase()}-Icon.svg`;
                     iconHtml = `<img src="assets/${iconName}" class="file-thumbnail-img adobe-thumb" style="padding: 15px; object-fit: contain;" onerror="this.src='assets/LogotipoARCHI.svg'">`;
                 } else if (nativeThumbExts.includes(ext)) {
                     iconHtml = `<img src="assets/LogotipoARCHI.svg" class="file-thumbnail-img adobe-thumb thumb-fit-contain thumb-opacity-low">`;
                 } else if (zipExts.includes(ext)) {
                     iconHtml = `<img src="assets/zip-icon.webp" class="file-thumbnail-img" style="object-fit: contain; padding: 10px;">`;
                 } else if (aseExts.includes(ext)) {
                    iconHtml = `<img src="assets/ase-icon.svg" class="file-thumbnail-img thumb-fit-contain">`;
                } else {
                     iconHtml = `
                     <div class="file-icon-svg" style="display:flex;align-items:center;justify-content:center; width:100%; height:100%;">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                     </div>`;
                 }
            }
            return iconHtml;
        },
    
        enrichThumbnail(containerElement, file) {
            if (file.is_dir) return;
    
            const ext = (file.detected_type && file.detected_type !== 'unknown') 
                     ? file.detected_type 
                     : file.name.split('.').pop().toLowerCase();
            
            const textPreviewExts = ['txt', 'rtf', 'md', 'json', 'xml', 'log', 'ini', 'cfg', 'csv'];
            const nativeThumbExts = ['psd', 'psb', 'ai', 'indd', 'pdf', 'eps', 'tiff', 'tif', 'raw', 'dng', 'cdr', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
            const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
    
            if (textPreviewExts.includes(ext)) {
                 if (window.__TAURI__ && window.__TAURI__.core) {
                    window.__TAURI__.core.invoke('read_file_preview', { path: file.path })
                        .then(response => {
                            const previewDiv = containerElement.querySelector('.file-thumbnail-text-preview');
                            if (previewDiv && response.content) {
                                if (ext === 'csv') {
                                    // Renderizar CSV como tabla simple
                                    const rows = response.content.split(/\r?\n/).filter(r => r.trim() !== '').slice(0, 20);
                                    let tableHtml = '<table class="file-thumbnail-csv-table">';
                                    
                                    rows.forEach((row, i) => {
                                        // Detectar separador (coma o punto y coma)
                                        let cells = row.split(',');
                                        if (cells.length < 2 && row.includes(';')) cells = row.split(';');
                                        
                                        tableHtml += '<tr>';
                                        cells.slice(0, 6).forEach(cell => { // Máximo 6 columnas
                                            const val = cell.replace(/^"|"$/g, '').trim();
                                            const bg = i === 0 ? '#f5f5f5' : '#fff';
                                            const fw = i === 0 ? 'bold' : 'normal';
                                            tableHtml += `<td class="file-thumbnail-csv-cell" style="background: ${bg}; font-weight: ${fw};">${val}</td>`;
                                        });
                                        tableHtml += '</tr>';
                                    });
                                    tableHtml += '</table>';
                                    
                                    previewDiv.innerHTML = tableHtml;
                                    previewDiv.style.padding = '0';
                                    previewDiv.style.display = 'flex';
                                    previewDiv.style.flexDirection = 'column';
                                } else {
                                    previewDiv.textContent = response.content.slice(0, 800); 
                                }
                            }
                        })
                        .catch(() => {
                            const previewDiv = containerElement.querySelector('.file-thumbnail-text-preview');
                            if (previewDiv) previewDiv.textContent = file.name;
                        });
                 }
            } else if (nativeThumbExts.includes(ext) || imageExts.includes(ext)) {
                 if (window.__TAURI__ && window.__TAURI__.core) {
                     window.__TAURI__.core.invoke('generate_thumbnail', { path: file.path })
                        .then(base64 => {
                            const img = containerElement.querySelector('.adobe-thumb');
                            if (img) {
                                const mode = this.thumbnailMode === 'fit' ? 'fit' : 'fill';
                                img.src = base64;
                                img.classList.remove('thumb-opacity-low');
                                img.style.padding = '0';
                                img.style.margin = '0';
                                img.style.opacity = '1';
                                if (mode === 'fit') {
                                    img.classList.add('thumb-fit-contain');
                                } else {
                                    img.classList.remove('thumb-fit-contain');
                                }
                            }
                        })
                        .catch(e => {
                            console.warn('No thumbnail for', file.name);
                            if (imageExts.includes(ext)) {
                                const img = containerElement.querySelector('.adobe-thumb');
                                if (img) {
                                    const mode = this.thumbnailMode === 'fit' ? 'fit' : 'fill';
                                    img.src = this.convertFileSrc(file.path);
                                    img.classList.remove('thumb-opacity-low');
                                    img.style.opacity = '1';
                                    if (mode === 'fit') {
                                        img.classList.add('thumb-fit-contain');
                                    } else {
                                        img.classList.remove('thumb-fit-contain');
                                    }
                                }
                            }
                        });
                 }
            }
        },

        async refreshLateralBar() {
            const result = await this.apiCall('/api/clients', null, 'GET');
            if (result.status === 'success') {
                const container = document.querySelector('.lateral-tabs');
                if (!container) return;

                const activeTab = container.querySelector('.lateral-tab.active');
                const activeName = activeTab ? activeTab.querySelector('.tab-text').textContent.trim() : null;
                const settingsTab = document.getElementById('lateral-tab-settings');
                
                container.innerHTML = '';
                if (settingsTab) container.appendChild(settingsTab);

                result.clients.forEach(client => {
                    const clientName = typeof client === 'object' ? client.name : client;
                    const isPinned = typeof client === 'object' ? client.pinned : false;

                    const tab = document.createElement('div');
                    tab.className = 'lateral-tab';
                    if (isPinned) tab.classList.add('pinned');
                    if (clientName === activeName) tab.classList.add('active');
                    tab.setAttribute('data-module', 'M-Biblioteca');
                    tab.setAttribute('data-pinned', isPinned);
                    
                    if (isPinned) {
                        const pinIcon = document.createElement('span');
                        pinIcon.className = 'material-symbols-rounded pin-icon';
                        pinIcon.textContent = 'push_pin';
                        tab.appendChild(pinIcon);
                    }

                    const span = document.createElement('span');
                    span.className = 'tab-text';
                    span.textContent = clientName;
                    
                    tab.appendChild(span);
                    container.appendChild(tab);
                });
                
                const clientList = result.clients.map(c => typeof c === 'object' ? c.name : c);
                if (activeName && !clientList.includes(activeName)) {
                    const firstTab = container.querySelector('.lateral-tab:not(.settings-tab)');
                    if (firstTab) firstTab.click();
                } else if (activeName) {
                    const currentActive = Array.from(container.querySelectorAll('.lateral-tab'))
                        .find(t => t.querySelector('.tab-text')?.textContent.trim() === activeName);
                    if (currentActive) lastActiveLateralTab = currentActive;
                }
                
                window.dispatchEvent(new Event('resize'));
            }
        },

        formatSize(sizeBytes) {
            if (sizeBytes >= 1e9) return (sizeBytes / 1e9).toFixed(2) + ' gb';
            if (sizeBytes >= 1e6) return (sizeBytes / 1e6).toFixed(1) + ' mb';
            if (sizeBytes >= 1e3) return Math.round(sizeBytes / 1e3) + ' kb';
            return sizeBytes + ' bytes';
        },

        showError(title, message) {
            if (window.showModal) {
                window.showModal({ 
                    title: title, 
                    message: `<span style="color: var(--warning-color);">${message}</span>`, 
                    confirmText: 'Entendido', 
                    showInput: false 
                });
            } else {
                alert(`${title}: ${message}`);
            }
        },

        // Función unificada para activar un módulo y sincronizar UI
        // source: 'init' | 'top' | 'lateral' | 'shortcut' | 'restore' | 'unknown'
        activateModule(moduleId, lateralTab = null, source = 'unknown') {
            // 1. Sincronizar Lateral Tab
            if (lateralTab) {
                document.querySelectorAll('.lateral-tab').forEach(t => t.classList.remove('active'));
                lateralTab.classList.add('active');
                if (!lateralTab.classList.contains('settings-tab')) {
                    lastActiveLateralTab = lateralTab;
                }
            } else if (lastActiveLateralTab && moduleId !== 'M-Settings') {
                // Si no se pasa tab pero tenemos una guardada y no vamos a ajustes, activarla
                document.querySelectorAll('.lateral-tab').forEach(t => t.classList.remove('active'));
                lastActiveLateralTab.classList.add('active');
            }

            // 2. Sincronizar Top Tab
            topTabs.forEach(t => {
                const isActive = t.getAttribute('data-module') === moduleId;
                t.classList.toggle('active', isActive);
                if (isActive) lastActiveTopTab = t;
            });

            // 3. Sincronizar Módulo visible
            modules.forEach(m => m.classList.toggle('active', m.id === moduleId));

            // Notificar al backend y al sistema
            if (moduleId !== 'M-Settings') {
                this.apiCall(`/update_module/${moduleId}`, null, 'GET');
            }
            document.dispatchEvent(new CustomEvent('moduleActivated', { detail: { moduleId, source } }));
        },

        attachNativeFileDrag(element, getPath, opts = {}) {
            if (!element || typeof getPath !== 'function') return;
            if (element.__archiNativeDragInstalled) return;
            element.__archiNativeDragInstalled = true;

            element.setAttribute('draggable', 'false');
            element.addEventListener('dragstart', (ev) => {
                ev.preventDefault();
            });

            const mediaNodes = element.querySelectorAll('img, video');
            mediaNodes.forEach((node) => {
                node.setAttribute('draggable', 'false');
            });

            const threshold = typeof opts.threshold === 'number' ? opts.threshold : 3;
            const downEvent = 'mousedown';
            const moveEvent = 'mousemove';
            const upEvent = 'mouseup';
            const cancelEvent = null;

            const onDown = (e) => {
                if (e.button !== 0) return;
                const startX = e.clientX;
                const startY = e.clientY;

                const onMove = (ev) => {
                    const dx = Math.abs(ev.clientX - startX);
                    const dy = Math.abs(ev.clientY - startY);
                    if (dx > threshold || dy > threshold) {
                        cleanup();
                        const path = getPath();
                        if (path && window.__TAURI__ && window.__TAURI__.core) {
                            window.__TAURI__.core.invoke('start_drag_files', { paths: [path] })
                                .catch(err => console.error('Error starting drag:', err));
                        }
                    }
                };

                const cleanup = () => {
                    document.removeEventListener(moveEvent, onMove);
                    document.removeEventListener(upEvent, cleanup);
                    if (cancelEvent) document.removeEventListener(cancelEvent, cleanup);
                };

                document.addEventListener(moveEvent, onMove);
                document.addEventListener(upEvent, cleanup);
                if (cancelEvent) document.addEventListener(cancelEvent, cleanup);
            };

            element.addEventListener(downEvent, onDown);
        },

            applyConfig(config) {
                if (!config) return;
                
                const root = document.documentElement;
                if (config.primary_color) root.style.setProperty('--primary-color', config.primary_color);
                if (config.accent_color) root.style.setProperty('--accent-color', config.accent_color);
                if (config.border_color) root.style.setProperty('--border-color', config.border_color);
                if (config.warning_color) root.style.setProperty('--warning-color', config.warning_color);
            
                if (config.lowercase_path) {
                    document.body.classList.add('lowercase-path');
                } else {
                    document.body.classList.remove('lowercase-path');
                }

                const rawMode = config.thumbnail_mode || 'fit';
                const mode = String(rawMode).toLowerCase() === 'fit' ? 'fit' : 'fill';
                this.thumbnailMode = mode;
            
                document.dispatchEvent(new CustomEvent('configApplied', { detail: config }));
            }
        };

    // Inicializar configuración y sistema de archivos (Setup inicial)
    if (window.__TAURI__) {
        (async () => {
            try {
                // Progreso inicial
                if (window.loader) window.loader.updateProgress(10);
                
                const { invoke } = window.__TAURI__.core;
                
                // Escuchar evento de fin de arrastre para recargar el grid activo
                if (window.__TAURI__.event) {
                    window.__TAURI__.event.listen('drag-finished', () => {
                        console.log('Drag finished, reloading active grid...');

                        const bibliotecaModule = document.getElementById('M-Biblioteca');
                        const recursosModule = document.getElementById('M-Recursos');

                        let moduleId = null;
                        let folder = null;

                        if (bibliotecaModule && bibliotecaModule.classList.contains('active')) {
                            const libraryGrid = document.getElementById('grid-library');
                            const gridFinder = document.getElementById('grid-work');
                            const activeGrid = (libraryGrid && libraryGrid.style.display !== 'none')
                                ? libraryGrid
                                : gridFinder;

                            if (activeGrid) {
                                folder = activeGrid.getAttribute('data-current-folder');
                                moduleId = 'M-Biblioteca';
                            }
                        } else if (recursosModule && recursosModule.classList.contains('active')) {
                            const resourcesGrid = document.getElementById('resources-grid');
                            if (resourcesGrid) {
                                folder = resourcesGrid.getAttribute('data-current-folder');
                                moduleId = 'M-Recursos';
                            }
                        }

                        if (!moduleId || !folder) return;

                        document.dispatchEvent(new CustomEvent('moduleActivated', { detail: { moduleId, path: folder } }));
                    });
                }

                await invoke('ensure_user_setup');
                console.log('Setup de usuario verificado/completado');
                
                if (window.loader) window.loader.updateProgress(40);

                // Cargar y aplicar configuración
                const config = await invoke('get_config');
                window.utils.applyConfig(config);
                
                if (window.loader) window.loader.updateProgress(60);
                
                // Una vez asegurado el setup, cargamos los clientes
                await window.utils.refreshLateralBar();
                
                if (window.loader) window.loader.updateProgress(85);

                // Determinar módulo inicial basado en configuración
                let initialModuleId = 'M-Inicio';
                let initialLateralTab = null;

                if (config.remember_module && config.current_module && config.current_module !== 'M-Settings') {
                    initialModuleId = config.current_module;
                }

                // Intentar encontrar la pestaña correspondiente si es un módulo de biblioteca
                const allRealTabs = Array.from(document.querySelectorAll('.lateral-tab:not(.settings-tab)'));
                
                // Si hay pestañas (clientes), seleccionamos la primera si no hay ninguna explícita
                if (allRealTabs.length > 0) {
                     // Si el módulo guardado es Biblioteca, o es Inicio pero queremos mostrar un cliente por defecto en la barra
                     if (config.current_module === 'M-Biblioteca' || !initialLateralTab) {
                        initialLateralTab = allRealTabs[0];
                     }
                }

                // Activar módulo inicial
                window.utils.activateModule(initialModuleId, initialLateralTab, 'init');
                
                // Finalizar loader
                if (window.loader) window.loader.hide();

            } catch (e) {
                console.error('Error en setup inicial:', e);
                // Si falla, ocultamos el loader de todas formas para mostrar errores
                if (window.loader) window.loader.hide();
            }
        })();
    } else {
        // Fallback para navegador web (sin Tauri)
        if (window.loader) window.loader.updateProgress(50);
        
        const allRealTabs = Array.from(document.querySelectorAll('.lateral-tab:not(.settings-tab)'));
        if (allRealTabs.length > 0) {
            const initialActive = allRealTabs.find(t => t.classList.contains('active')) || allRealTabs[0];
            const activeTopTab = Array.from(topTabs).find(t => t.classList.contains('active'));
            const initialModuleId = activeTopTab ? activeTopTab.getAttribute('data-module') : (initialActive.getAttribute('data-module') || 'M-Inicio');
            window.utils.activateModule(initialModuleId, initialActive, 'init');
        }
        
        if (window.loader) window.loader.hide();
    }
    window.setLastActiveLateralTab = (tab) => { lastActiveLateralTab = tab; };

    // Función para manejar la selección de pestañas laterales (vía UI)
    function handleLateralTabSelection(tab) {
        if (!tab) return;
        
        // Cerrar ajustes si están abiertos
        if (settingsTab && settingsTab.classList.contains('show') && !tab.classList.contains('settings-tab')) {
            settingsTab.classList.remove('show');
            settingsTab.classList.remove('active');
        }

        // Si es una pestaña de cliente (no es la de ajustes), mantenemos el módulo actual
        let moduleId = tab.getAttribute('data-module');
        const currentActiveTopTab = document.querySelector('.top-tab.active');
        const currentModuleId = currentActiveTopTab ? currentActiveTopTab.getAttribute('data-module') : 'M-Inicio';

        // Si la pestaña no es de ajustes, intentamos mantener el módulo actual
        if (!tab.classList.contains('settings-tab')) {
            moduleId = currentModuleId;
        }

        window.utils.activateModule(moduleId, tab, 'lateral');
    }

    // Función para cerrar ajustes y restaurar el estado previo
    window.closeSettingsAndRestore = function() {
        if (settingsTab) {
            settingsTab.classList.remove('show');
            settingsTab.classList.remove('active');
        }
        
        if (lastActiveTopTab) {
            const moduleId = lastActiveTopTab.getAttribute('data-module');
            window.utils.activateModule(moduleId, lastActiveLateralTab, 'restore');
            if (lastActiveLateralTab) {
                lastActiveLateralTab.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    };

    // Lógica para el botón de ajustes (engranaje)
    if (settingsIcon && settingsTab) {
        settingsIcon.addEventListener('click', () => {
            const isShowing = settingsTab.classList.contains('show');
            
            if (!isShowing) {
                // GUARDAR ESTADO PREVIO: Antes de entrar, guardamos qué estaba activo
                const currentActiveLateral = document.querySelector('.lateral-tab.active:not(.settings-tab)');
                if (currentActiveLateral) {
                    lastActiveLateralTab = currentActiveLateral;
                }
                const currentActiveTop = document.querySelector('.top-tab.active');
                if (currentActiveTop) {
                    lastActiveTopTab = currentActiveTop;
                }

                // ENTRADA: Mostrar ítem de ajustes
                settingsTab.classList.add('show');
                handleLateralTabSelection(settingsTab);

                // Hacer scroll hasta arriba para ver el ítem de ajustes
                settingsTab.scrollIntoView({ behavior: 'smooth', block: 'start' });

            } else {
                // SALIDA: Restaurar estado previo
                closeSettingsAndRestore();
            }
        });
    }

    // Lógica para las pestañas laterales (Event Delegation)
    const lateralTabsContainer = document.querySelector('.lateral-tabs');
    if (lateralTabsContainer) {
        lateralTabsContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.lateral-tab');
            if (!tab || tab.classList.contains('settings-tab')) return;
            handleLateralTabSelection(tab);
        });
    }

    // Lógica para las pestañas superiores (Top Bar)
    topTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetModuleId = tab.getAttribute('data-module');
            const currentActiveTop = document.querySelector('.top-tab.active');
            const currentModuleId = currentActiveTop ? currentActiveTop.getAttribute('data-module') : null;
            const isSameModule = currentModuleId === targetModuleId;

            // 1. Si estamos en ajustes, cerramos y restauramos la lateral
            if (settingsTab && settingsTab.classList.contains('show')) {
                settingsTab.classList.remove('show');
                settingsTab.classList.remove('active');
                
                // Restaurar SIEMPRE la última pestaña lateral guardada
                if (lastActiveLateralTab) {
                    lastActiveLateralTab.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }

            // 2. Sincronización adicional de la lateral si es necesario
            let targetLateralTab = lastActiveLateralTab;
            const currentLateralModule = lastActiveLateralTab ? lastActiveLateralTab.getAttribute('data-module') : null;
            if (currentLateralModule !== targetModuleId) {
                const matchingLateral = Array.from(realTabs).find(t => t.getAttribute('data-module') === targetModuleId);
                if (matchingLateral) targetLateralTab = matchingLateral;
            }

            // 3. Activar el módulo (esto sincroniza top tabs, modules y notifica)
            const source = isSameModule ? 'top_reset' : 'top';
            window.utils.activateModule(targetModuleId, targetLateralTab, source);
        });
    });

    // Seleccionar la pestaña lateral correcta al cargar - MOVIDO ARRIBA AL SETUP INICIAL
    // const allRealTabs = Array.from(document.querySelectorAll('.lateral-tab:not(.settings-tab)'));
    // if (allRealTabs.length > 0) { ... }

    // Control de degradados en el scroll de la barra lateral
    const lateralBar = document.querySelector('.lateral-bar');
    const tabsContainer = document.querySelector('.lateral-tabs');

    // Atajo de teclado para recargar la ventana (Cmd+R / Ctrl+R)
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
            if (isTextEditingElement(document.activeElement) || isTextEditingElement(e.target)) return;
            e.preventDefault();
            window.location.reload();
        }
    });

    function updateFades() {
        if (!tabsContainer || !lateralBar) return;

        const scrollTop = tabsContainer.scrollTop;
        const scrollHeight = tabsContainer.scrollHeight;
        const clientHeight = tabsContainer.clientHeight;

        // Mostrar degradado superior si no estamos arriba del todo
        if (scrollTop > 5) {
            lateralBar.classList.add('show-top-fade');
        } else {
            lateralBar.classList.remove('show-top-fade');
        }

        // Mostrar degradado inferior si no estamos abajo del todo
        // El margen de 5px es para evitar problemas de precisión en el scroll
        if (scrollTop + clientHeight < scrollHeight - 5) {
            lateralBar.classList.add('show-bottom-fade');
        } else {
            lateralBar.classList.remove('show-bottom-fade');
        }
    }

    if (tabsContainer) {
        tabsContainer.addEventListener('scroll', updateFades);
        // Ejecutar una vez al inicio para establecer el estado inicial
        updateFades();
        
        // También ejecutar al redimensionar la ventana
        window.addEventListener('resize', updateFades);
    }

    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(async () => {
            if (window.__TAURI__ && window.__TAURI__.window && window.utils && typeof window.utils.apiCall === 'function') {
                try {
                    const { getCurrentWindow } = window.__TAURI__.window;
                    const appWindow = getCurrentWindow();

                    const maximized = await appWindow.isMaximized();
                    if (maximized) return;

                    const size = await appWindow.innerSize();
                    const factor = await appWindow.scaleFactor();

                    if (!size || typeof size.width !== 'number' || typeof size.height !== 'number' || typeof factor !== 'number' || factor <= 0) {
                        return;
                    }

                    const logical = size.toLogical(factor);
                    const width = Math.round(logical.width);
                    const height = Math.round(logical.height);

                    await window.utils.apiCall('/api/save_config', {
                        resolution: { width, height }
                    }, 'POST');
                } catch (e) {
                    console.error('Error guardando resolución:', e);
                }
            }
        }, 1000);
    });

    // ==========================================================================
    // GLOBAL MODAL SYSTEM LOGIC
    // ==========================================================================
    const modal = document.getElementById('global-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalInput = document.getElementById('modal-input');
    const modalConfirm = document.getElementById('modal-confirm');
    const modalCancel = document.getElementById('modal-cancel');
    const modalToggleExtension = document.getElementById('modal-toggle-extension');

    let currentModalAction = null;
    let existingItems = [];

    window.showModal = function(options) {
        const { title, placeholder, confirmText, action, initialValue, message, showInput = true, validationValue = null, validationItems = null, showExtensionToggle = false, originalExtension = '' } = options;
        
        // Si se pasan items específicos para validar, usarlos. Si no, obtenerlos del grid visible actual.
        if (validationItems && Array.isArray(validationItems)) {
            existingItems = validationItems.map(item => item.toLowerCase());
        } else {
            const gridItems = document.querySelectorAll('.file-item .file-name');
            existingItems = Array.from(gridItems)
                .filter(item => item.offsetParent !== null)
                .map(item => item.textContent.trim().toLowerCase());
        }

        modalTitle.textContent = title || 'Confirmar';
        
        // Guardar valor de validación si existe
        modalInput.dataset.validation = validationValue || '';
        
        // Guardar extensión oculta y nombre inicial completo para validación precisa
        if (showExtensionToggle && originalExtension) {
            modalInput.dataset.hiddenExtension = originalExtension;
            // Si el valor inicial no tiene extensión pero la original existe, la reconstruimos
            const initVal = initialValue || '';
            if (!initVal.endsWith(originalExtension)) {
                 modalInput.dataset.initialFull = initVal + originalExtension;
            } else {
                 modalInput.dataset.initialFull = initVal;
            }
        } else {
            modalInput.dataset.hiddenExtension = '';
            modalInput.dataset.initialFull = initialValue || '';
        }
        
        if (validationValue) {
            modalConfirm.disabled = true;
            modalConfirm.style.opacity = '0.5';
            modalConfirm.style.pointerEvents = 'none';
        } else {
            modalConfirm.disabled = false;
            modalConfirm.style.opacity = '1';
            modalConfirm.style.pointerEvents = 'auto';
        }

        // Manejar mensaje o input
            if (message) {
                modalMessage.innerHTML = message;
                modalMessage.style.display = 'block';
            } else {
            modalMessage.style.display = 'none';
        }

        if (showInput) {
            modalInput.style.display = 'block';
            modalInput.placeholder = placeholder || 'Escribe aquí...';
            modalInput.value = initialValue || '';
            modalInput.dataset.initial = initialValue || '';
            modalInput.classList.remove('is-duplicate');
        } else {
            modalInput.style.display = 'none';
        }
        
        // Manejar Toggle de Extensión
        if (showExtensionToggle && originalExtension && modalToggleExtension) {
            modalToggleExtension.style.display = 'flex';
            
            // Función interna para manejar el click
             modalToggleExtension.onclick = (e) => {
                 e.preventDefault(); // Evitar submit si está dentro de form
                 const currentVal = modalInput.value;
                 const isActive = modalToggleExtension.classList.contains('active');
                 
                 if (isActive) {
                     // Ocultar extensión (Desactivar)
                     // Lógica inteligente: Si el usuario editó la extensión (ej: .pn), 
                     // queremos limpiar eso y volver al nombre base.
                     // Si termina con la original, la quitamos.
                     if (currentVal.toLowerCase().endsWith(originalExtension.toLowerCase())) {
                         modalInput.value = currentVal.substring(0, currentVal.length - originalExtension.length);
                     } else {
                         // Si no coincide (usuario editó), intentamos quitar lo que parece ser la extensión modificada
                         const lastDotIndex = currentVal.lastIndexOf('.');
                         if (lastDotIndex > 0) {
                             // Quitamos desde el último punto
                             modalInput.value = currentVal.substring(0, lastDotIndex);
                         }
                         // Si no hay puntos, no hacemos nada (ya es nombre base)
                     }
                     
                     modalToggleExtension.classList.remove('active');
                     modalToggleExtension.style.color = '#8b949e';
                     modalToggleExtension.style.backgroundColor = 'transparent';
                 } else {
                     // Mostrar extensión (Activar)
                     // Si no termina con la extensión original, la agregamos.
                     // Esto restaura la extensión si se había ocultado, o corrige si faltaba.
                     if (!currentVal.toLowerCase().endsWith(originalExtension.toLowerCase())) {
                         modalInput.value = currentVal + originalExtension;
                     }
                     modalToggleExtension.classList.add('active');
                     modalToggleExtension.style.color = 'var(--accent-color)';
                     modalToggleExtension.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                 }
                 modalInput.focus();
                 
                 // Disparar evento input para re-validar
                 modalInput.dispatchEvent(new Event('input'));
             };
            
            // Reset visual state inicial
            modalToggleExtension.classList.remove('active');
            modalToggleExtension.style.color = '#8b949e';
            modalToggleExtension.style.backgroundColor = 'transparent';
            
        } else if (modalToggleExtension) {
            modalToggleExtension.style.display = 'none';
            modalToggleExtension.onclick = null;
        }

        modalConfirm.textContent = confirmText || 'Confirmar';
        currentModalAction = action;

        // Estado inicial del botón confirmar
        if (showInput) {
            const initialVal = (initialValue || '').trim();
            const isDup = initialVal && existingItems.includes(initialVal.toLowerCase()) && initialVal.toLowerCase() !== (initialValue || '').toLowerCase();
            
            if (validationValue) {
                // Si es eliminación, el botón empieza deshabilitado (el usuario debe escribir el nombre)
                modalConfirm.disabled = true;
                modalConfirm.style.opacity = '0.5';
                modalConfirm.style.pointerEvents = 'none';
            } else {
                // Si es creación/renombrar, habilitar solo si hay valor y no es duplicado
                const canConfirm = initialVal && !isDup;
                modalConfirm.disabled = !canConfirm;
                modalConfirm.style.opacity = canConfirm ? '1' : '0.5';
                modalConfirm.style.pointerEvents = canConfirm ? 'auto' : 'none';
            }
        }

        modal.classList.add('show');
        
        // Foco automático
        setTimeout(() => {
            if (showInput) {
                modalInput.focus();
                if (initialValue) modalInput.select();
            } else {
                modalConfirm.focus();
            }
        }, 50);
    };

    // Validación de duplicados y nombre de seguridad en tiempo real
    modalInput.addEventListener('input', () => {
        const value = modalInput.value.trim();
        let valueToCheck = value.toLowerCase();
        const initialValue = modalInput.dataset.initial?.toLowerCase();
        const validationValue = modalInput.dataset.validation;
        
        // Si hay una extensión oculta (toggle inactivo), simularla para la validación
        const toggleBtn = document.getElementById('modal-toggle-extension');
        const hiddenExtension = modalInput.dataset.hiddenExtension || '';
        
        // Si el toggle existe, no está activo y tenemos extensión oculta, la agregamos para validar
        if (toggleBtn && toggleBtn.style.display !== 'none' && !toggleBtn.classList.contains('active') && hiddenExtension) {
            if (!valueToCheck.endsWith(hiddenExtension.toLowerCase())) {
                valueToCheck += hiddenExtension.toLowerCase();
            }
        }
        
        // 1. Validación de Duplicados
        let isDuplicate = false;
        if (valueToCheck && existingItems.includes(valueToCheck)) {
             // Recuperamos el valor inicial COMPLETO (con extensión) para comparar
             const initialFull = modalInput.dataset.initialFull?.toLowerCase() || initialValue;
             
             if (valueToCheck !== initialFull) {
                isDuplicate = true;
            }
        }

        if (isDuplicate) {
            modalInput.classList.add('is-duplicate');
        } else {
            modalInput.classList.remove('is-duplicate');
        }

        // 2. Control del botón Confirmar
        if (validationValue) {
            // Caso de eliminación (requiere coincidencia exacta con validationValue)
            if (value === validationValue) {
                modalConfirm.disabled = false;
                modalConfirm.style.opacity = '1';
                modalConfirm.style.pointerEvents = 'auto';
            } else {
                modalConfirm.disabled = true;
                modalConfirm.style.opacity = '0.5';
                modalConfirm.style.pointerEvents = 'none';
            }
        } else {
            // Caso de creación/renombrar (no debe estar vacío ni ser duplicado)
            if (value && !isDuplicate) {
                modalConfirm.disabled = false;
                modalConfirm.style.opacity = '1';
                modalConfirm.style.pointerEvents = 'auto';
            } else {
                modalConfirm.disabled = true;
                modalConfirm.style.opacity = '0.5';
                modalConfirm.style.pointerEvents = 'none';
            }
        }
    });

    function closeModal() {
        modal.classList.remove('show');
        currentModalAction = null;
    }

    modalConfirm.addEventListener('click', () => {
        const value = modalInput.value.trim();
        const showInput = modalInput.style.display !== 'none';
        
        if (showInput) {
            if (value && currentModalAction && !modalInput.classList.contains('is-duplicate')) {
                currentModalAction(value);
                closeModal();
            }
        } else {
            // Modo confirmación (sin input)
            if (currentModalAction) {
                currentModalAction();
                closeModal();
            }
        }
    });

    modalCancel.addEventListener('click', closeModal);

    // Efecto de resplandor radial siguiendo al mouse (idéntico al menú contextual)
    modal.addEventListener('mousemove', (e) => {
        const container = modal.querySelector('.modal-container');
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        container.style.setProperty('--mouse-x', `${x}px`);
        container.style.setProperty('--mouse-y', `${y}px`);
    });

    // Cerrar al hacer clic fuera del contenedor
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Atajos de teclado: Enter y Escape
    modalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            modalConfirm.click();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeModal();
        }
    });

    if (window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
        const getGrids = () => {
            const libraryGrid = document.getElementById('grid-library');
            const gridFinder = document.getElementById('grid-work');
            const resourcesGrid = document.getElementById('resources-grid');
            return { libraryGrid, gridFinder, resourcesGrid };
        };

        const getActiveGrid = ({ libraryGrid, gridFinder, resourcesGrid }) => {
            const bibliotecaModule = document.getElementById('M-Biblioteca');
            const recursosModule = document.getElementById('M-Recursos');

            if (bibliotecaModule && bibliotecaModule.classList.contains('active')) {
                if (libraryGrid && libraryGrid.style.display !== 'none') return libraryGrid;
                if (gridFinder) return gridFinder;
            }

            if (recursosModule && recursosModule.classList.contains('active')) {
                if (resourcesGrid) return resourcesGrid;
            }

            return null;
        };

        const clearDragVisual = ({ libraryGrid, gridFinder, resourcesGrid }) => {
            if (libraryGrid) {
                libraryGrid.classList.remove('drag-over');
                libraryGrid.style.removeProperty('border-color');
            }
            if (gridFinder) {
                gridFinder.classList.remove('drag-over');
                gridFinder.style.removeProperty('border-color');
            }
            if (resourcesGrid) {
                resourcesGrid.classList.remove('drag-over');
                resourcesGrid.style.removeProperty('border-color');
            }
        };

        const handleExternalDrop = async (e) => {
            const grids = getGrids();
            clearDragVisual(grids);

            let paths = null;
            if (e && e.payload) {
                if (Array.isArray(e.payload)) {
                    paths = e.payload;
                } else if (Array.isArray(e.payload.paths)) {
                    paths = e.payload.paths;
                }
            }
            
            if (!paths || paths.length === 0) return;

            const activeGrid = getActiveGrid(grids);
            if (!activeGrid) return;

            const bibliotecaModule = document.getElementById('M-Biblioteca');
            const recursosModule = document.getElementById('M-Recursos');

            let moduleId = null;
            if (bibliotecaModule && bibliotecaModule.classList.contains('active')) {
                moduleId = 'M-Biblioteca';
            } else if (recursosModule && recursosModule.classList.contains('active')) {
                moduleId = 'M-Recursos';
            }

            if (!moduleId) return;

            const folder = activeGrid.getAttribute('data-current-folder');
            if (!folder) return;

            try {
                const copyMode = isAltPressed || dropCopyMode;
                let result;
                if (moduleId === 'M-Recursos') {
                    result = await window.utils.apiCall('/api/import_drop_resources', { 
                        folder, 
                        paths,
                        copyMode
                    }, 'POST');
                } else {
                    result = await window.utils.apiCall('/api/import_drop', { 
                        folder, 
                        paths,
                        copyMode
                    }, 'POST');
                }

                if (result && result.status === 'success') {
                    document.dispatchEvent(new CustomEvent('moduleActivated', { detail: { moduleId, path: folder } }));
                } else if (result && result.status === 'error') {
                    const msg = result.error || 'No se pudo copiar los archivos';
                    if (msg.includes('Operation not permitted')) {
                        window.utils.showError(
                            'Permiso denegado al leer archivo',
                            'macOS no permite acceder a la ubicación de origen. Prueba copiar desde otra carpeta o revisa los permisos de privacidad en Preferencias del Sistema.'
                        );
                    } else {
                        window.utils.showError('Error al importar archivos', msg);
                    }
                }
            } catch (error) {
                console.error('Error en import_drop', error);
                const msg = error && error.toString ? error.toString() : String(error);
                window.utils.showError('Error al importar archivos', msg);
            }
        };

        window.__TAURI__.event.listen('tauri://drag-enter', () => {
            const grids = getGrids();
            const activeGrid = getActiveGrid(grids);
            
            if (activeGrid) {
                activeGrid.classList.add('drag-over');
                activeGrid.style.borderColor = 'var(--accent-color, #007aff)';
            }
        });

        window.__TAURI__.event.listen('tauri://drag-leave', () => {
            const grids = getGrids();
            clearDragVisual(grids);
        });

        window.__TAURI__.event.listen('tauri://drag-drop', handleExternalDrop);
        window.__TAURI__.event.listen('tauri://file-drop', handleExternalDrop);

        // Listener para cambiar de módulo desde el menú nativo
        window.__TAURI__.event.listen('switch-module', (event) => {
            const moduleId = event.payload;
            console.log('Switching to module via menu:', moduleId);
            const tab = document.querySelector(`.top-tab[data-module="${moduleId}"]`);
            if (tab) {
                tab.click();
            }
        });

        // Listener para crear cliente (Cmd+Shift+N)
        window.__TAURI__.event.listen('trigger-create-client', () => {
            console.log('Trigger create client shortcut');
            if (isTextEditingElement(document.activeElement)) return;
            if (window.contextMenuSystem) {
                window.contextMenuSystem.handleCreateClient();
            }
        });

        // Listener para crear carpeta/recurso (Cmd+N)
        window.__TAURI__.event.listen('trigger-create-folder', () => {
            console.log('Trigger create folder shortcut');
            if (isTextEditingElement(document.activeElement)) return;
            if (!window.contextMenuSystem) return;

            // Determinar contexto activo
            const activeTopTab = document.querySelector('.top-tab.active');
            if (!activeTopTab) return;
            const moduleId = activeTopTab.getAttribute('data-module');

            if (moduleId === 'M-Biblioteca') {
                // Biblioteca Logic
                const libraryGrid = document.getElementById('grid-library');
                const gridFinder = document.getElementById('grid-work');
                // Determinar cual grid está visible
                const isFinderVisible = gridFinder && gridFinder.style.display !== 'none';
                const activeGrid = isFinderVisible ? gridFinder : libraryGrid;
                
                const currentFolder = activeGrid?.getAttribute('data-current-folder');
                
                // Si estamos en raíz (biblioteca) -> create work, si estamos en subcarpeta -> create folder
                // Reutilizamos handleCreateWork que ya maneja la lógica de API
                // isResources = false, isGridFinder = isFinderVisible
                window.contextMenuSystem.handleCreateWork(currentFolder, false, isFinderVisible);

            } else if (moduleId === 'M-Recursos') {
                // Recursos Logic
                const resourcesGrid = document.getElementById('resources-grid');
                const currentFolder = resourcesGrid?.getAttribute('data-current-folder');
                
                // isResources = true
                window.contextMenuSystem.handleCreateWork(currentFolder, true, false);
            }
        });

        const forceMoveCursor = (e) => {
            e.preventDefault();
            if (!e.dataTransfer) return;
            dropCopyMode = isAltPressed || !!e.altKey;
            e.dataTransfer.dropEffect = dropCopyMode ? 'copy' : 'move';
        };

        document.addEventListener('dragenter', forceMoveCursor);
        document.addEventListener('dragover', forceMoveCursor);
    }

    window.addEventListener('keydown', (e) => {
        const isEditing = isTextEditingElement(document.activeElement) || isTextEditingElement(e.target);

        if (e.key === 'Alt' || e.key === 'AltGraph' || e.key === 'Option') {
            isAltPressed = true;
        }

        if (e.metaKey && e.key === ',') {
            if (isEditing) return;
            e.preventDefault();
            const settingsIcon = document.querySelector('.settings-icon');
            if (settingsIcon) settingsIcon.click();
            return;
        }

        // Atajos para cambiar entre módulos (1, 2, 3, 4)
        if (!isEditing) {
            const shortcuts = {
                '1': 'M-Inicio',
                '2': 'M-Recursos',
                '3': 'M-Biblioteca',
                '4': 'M-Contaduria'
            };

            const targetModuleId = shortcuts[e.key];
            if (targetModuleId) {
                e.preventDefault();
                const targetLateralTab = Array.from(document.querySelectorAll('.lateral-tab:not(.settings-tab)'))
                    .find(t => t.getAttribute('data-module') === targetModuleId);
                window.utils.activateModule(targetModuleId, targetLateralTab || null, 'shortcut');
                return;
            }
        }

        if (e.key === 'Escape') {
            // 1. Si hay un modal abierto, cerrarlo
            if (modal.classList.contains('show')) {
                e.preventDefault();
                closeModal();
                return;
            }
            if (isEditing) return;
            
            // 2. Si el módulo de configuración está activo, cerrarlo
            const settingsModule = document.getElementById('M-Settings');
            if (settingsModule && settingsModule.classList.contains('active')) {
                e.preventDefault();
                if (typeof window.closeSettingsAndRestore === 'function') {
                    window.closeSettingsAndRestore();
                }
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === 'Alt' || e.key === 'AltGraph' || e.key === 'Option') {
            isAltPressed = false;
        }
    });

    window.addEventListener('blur', () => {
        isAltPressed = false;
        dropCopyMode = false;
    });
});
