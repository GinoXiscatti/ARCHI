// Lógica para el módulo Recursos
console.log('Recursos module loaded');

document.addEventListener('DOMContentLoaded', () => {
    const resourcesGrid = document.getElementById('resources-grid');
    
    // Historial de navegación
    let historyStack = [];
    let currentHistoryIndex = -1;

    async function loadResources(folderName, updateHistory = true) {
        if (!resourcesGrid) return;
        
        // Gestión del historial
        if (updateHistory) {
            if (currentHistoryIndex === -1 || historyStack[currentHistoryIndex] !== folderName) {
                historyStack = historyStack.slice(0, currentHistoryIndex + 1);
                historyStack.push(folderName);
                currentHistoryIndex++;
            }
        }
        
        // Guardar posición de scroll si estamos refrescando la misma carpeta
        const previousFolder = resourcesGrid.getAttribute('data-current-folder');
        let previousScroll = 0;
        if (previousFolder === folderName) {
            previousScroll = resourcesGrid.scrollTop;
        }

        resourcesGrid.setAttribute('data-current-folder', folderName);
        resourcesGrid.innerHTML = '';
        
        // Actualizar ruta en la path-bar (específica de Recursos)
        const moduleContainer = document.getElementById('M-Recursos');
        const pathText = moduleContainer ? moduleContainer.querySelector('.path-text') : null;
        
        if (pathText) {
            const parts = folderName.split('/');
            const separator = '<span class="path-separator">/</span>';
            
            // Si hay subcarpetas, mostramos /Carpeta... (ocultando el nombre del cliente que es la raíz)
            if (parts.length > 1) {
                const pathHtml = parts.slice(1).map(part => `${separator}${part}`).join('');
                pathText.innerHTML = pathHtml;
            } else {
                // Si es raíz, solo mostramos /
                pathText.innerHTML = separator;
            }
        }
        
        const data = await window.utils.apiCall(`/api/files_resources/${encodeURIComponent(folderName)}`, null, 'GET');
        
        // Actualizar contador de elementos
        const itemCountText = document.getElementById('resources-path-item-count');
        if (itemCountText) {
            const count = data.files ? data.files.length : 0;
            itemCountText.textContent = `${count} ${count === 1 ? 'ELEMENTO' : 'ELEMENTOS'}`;
        }
        
        if (data.status === 'error' || data.error) {
            resourcesGrid.innerHTML = `<div style="padding: 20px; color: var(--warning-color);">Error: ${data.error || 'No se pudo cargar'}</div>`;
            return;
        }
        
        if (!data.files || data.files.length === 0) {
            resourcesGrid.classList.add('is-empty');
            resourcesGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📂</div>
                    <div class="empty-text">todo vacío por aquí</div>
                </div>
            `;
            return;
        }
        
        resourcesGrid.classList.remove('is-empty');
        
        // Ordenar: Carpetas primero, luego archivos. Alfabéticamente.
        data.files.sort((a, b) => {
            if (a.is_dir === b.is_dir) {
                return a.name.localeCompare(b.name);
            }
            return a.is_dir ? -1 : 1;
        });

        data.files.forEach(file => {
            const item = createGridItem(file, folderName);
            resourcesGrid.appendChild(item);
        });

        // Restaurar posición de scroll si corresponde
        if (previousFolder === folderName && previousScroll > 0) {
            requestAnimationFrame(() => {
                resourcesGrid.scrollTop = previousScroll;
            });
        }
    }

    function createGridItem(file, folderName) {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.setAttribute('data-name', file.name);
        item.setAttribute('data-size', file.size || 0);
        
        const iconHtml = window.utils.generateThumbnailHtml(file);
        
        item.innerHTML = `
            <div class="file-thumbnail-container">
                ${iconHtml}
            </div>
            <div class="file-info-container">
                <div class="file-top-group">
                    <span class="file-type-label">${file.is_dir ? 'Tipo' : 'Archivo'}</span>
                    <span class="file-name">${file.name}</span>
                </div>
                <span class="file-count-label">${file.is_dir ? (file.item_count || 0) + ' elementos' : formatSize(file.size)}</span>
            </div>
        `;

        // Enriquecer miniatura (async)
        window.utils.enrichThumbnail(item, file);
        
        // Navegación al hacer clic
        item.addEventListener('click', (e) => {
            if (e.button !== 0) return;
            
            if (file.is_dir) {
                const newPath = `${folderName}/${file.name}`;
                loadResources(newPath);
            } else {
                // Abrir archivo
                window.utils.apiCall('/api/open_in_finder', { 
                    folder: folderName, 
                    item: file.name,
                    subfolder: 'Recursos' 
                });
            }
        });

        return item;
    }

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Escuchar cuando se activa el módulo de recursos
    document.addEventListener('moduleActivated', (e) => {
        if (e.detail.moduleId !== 'M-Recursos') return;

        // 1) Refresh explícito desde el menú contextual (mantener comportamiento actual)
        if (e.detail.path) {
            loadResources(e.detail.path);
            return;
        }

        const source = e.detail.source || 'unknown';

        // 2) Cambios de cliente (lateral), carga inicial o reset manual del módulo (click en la misma pestaña superior)
        if (source === 'lateral' || source === 'init' || source === 'top_reset') {
            const activeLateralTab = document.querySelector('.lateral-tab.active');
            if (activeLateralTab) {
                const folderName = activeLateralTab.querySelector('.tab-text').textContent;
                loadResources(folderName);
            }
            return;
        }

        // 3) Cambio de módulo (top bar, atajo, restore):
        //    si ya hay carpeta cargada, NO tocar nada (persistencia total)
        const currentFolder = resourcesGrid.getAttribute('data-current-folder');
        if (currentFolder) return;

        // Si aún no hay estado (primera vez), cargar desde la pestaña lateral activa
        const activeLateralTab = document.querySelector('.lateral-tab.active');
        if (activeLateralTab) {
            const folderName = activeLateralTab.querySelector('.tab-text').textContent;
            loadResources(folderName);
        }
    });

    // Cargar inicial si aplica
    const recursosTab = document.querySelector('.top-tab[data-module="M-Recursos"]');
    const activeLateralTab = document.querySelector('.lateral-tab.active');
    if (recursosTab && recursosTab.classList.contains('active') && activeLateralTab) {
        const folderName = activeLateralTab.querySelector('.tab-text').textContent;
        loadResources(folderName);
    }

    // Navegación por teclado
    document.addEventListener('keydown', async (e) => {
        // Verificar si el módulo Recursos está activo
        const recursosModule = document.getElementById('M-Recursos');
        if (!recursosModule || !recursosModule.classList.contains('active')) return;

        const currentPath = resourcesGrid.getAttribute('data-current-folder');
        if (!currentPath) return;

        const parts = currentPath.split('/');
        
        // Flecha Derecha: Ir adelante en historial
        if (e.key === 'ArrowRight') {
            if (currentHistoryIndex < historyStack.length - 1) {
                e.preventDefault();
                currentHistoryIndex++;
                loadResources(historyStack[currentHistoryIndex], false);
            }
            return;
        }

        // Si estamos en raíz (length 1), no hay navegación de subcarpetas hacia arriba
        if (parts.length < 2) return;

        // Flecha Izquierda: Subir un nivel
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const parentPath = parts.slice(0, -1).join('/');
            
            // Smart Back
            if (currentHistoryIndex > 0 && historyStack[currentHistoryIndex - 1] === parentPath) {
                currentHistoryIndex--;
                loadResources(parentPath, false);
            } else {
                loadResources(parentPath, true);
            }
        }
        
        // Flecha Arriba/Abajo: Navegar entre carpetas hermanas
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            
            const currentFolderName = parts[parts.length - 1];
            const parentPath = parts.slice(0, -1).join('/');
            
            try {
                const parentData = await window.utils.apiCall(`/api/files_resources/${encodeURIComponent(parentPath)}`, null, 'GET');
                
                if (parentData.status === 'error' || !parentData.files) return;

                let siblings = parentData.files.filter(f => f.is_dir);
                siblings.sort((a, b) => a.name.localeCompare(b.name));
                
                const currentIndex = siblings.findIndex(f => f.name === currentFolderName);
                
                if (currentIndex === -1) return;

                let nextIndex;
                if (e.key === 'ArrowUp') {
                    nextIndex = currentIndex - 1;
                } else {
                    nextIndex = currentIndex + 1;
                }

                if (nextIndex >= 0 && nextIndex < siblings.length) {
                    const nextFolder = siblings[nextIndex];
                    const nextPath = `${parentPath}/${nextFolder.name}`;
                    loadResources(nextPath);
                }

            } catch (error) {
                console.error('Error en navegación por teclado (Recursos):', error);
            }
        }
    });
});
