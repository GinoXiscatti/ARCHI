// Lógica para el módulo Biblioteca
console.log('Biblioteca module loaded');

document.addEventListener('DOMContentLoaded', () => {
    const libraryGrid = document.getElementById('library-grid');
    const gridFinder = document.getElementById('grid-finder');

    // --- Estado ---

    // Historial de navegación
    let historyStack = [];
    let currentHistoryIndex = -1;

    async function loadFiles(folderName, updateHistory = true) {
        if (!libraryGrid || !gridFinder) return;

        // Gestión del historial
        if (updateHistory) {
            // Si estamos navegando a una nueva ruta, cortamos el historial futuro
            if (currentHistoryIndex === -1 || historyStack[currentHistoryIndex] !== folderName) {
                historyStack = historyStack.slice(0, currentHistoryIndex + 1);
                historyStack.push(folderName);
                currentHistoryIndex++;
            }
        }
        
        // Detectar si es raíz (Cliente) o subcarpeta
        const isRoot = !folderName.includes('/');

        const activeGrid = isRoot ? libraryGrid : gridFinder;
        
        // Guardar posición de scroll si estamos refrescando la misma carpeta
        const previousFolder = activeGrid.getAttribute('data-current-folder');
        let previousScroll = 0;
        if (previousFolder === folderName) {
            previousScroll = activeGrid.scrollTop;
        }

        // Configurar visibilidad
        if (isRoot) {
            libraryGrid.style.display = 'flex';
            gridFinder.style.display = 'none';
        } else {
            libraryGrid.style.display = 'none';
            gridFinder.style.display = 'grid';
        }

        activeGrid.setAttribute('data-current-folder', folderName);
        activeGrid.innerHTML = '';
        
        // Actualizar ruta en la path-bar
        const moduleContainer = document.getElementById('M-Biblioteca');
        const pathText = moduleContainer ? moduleContainer.querySelector('.path-text') : null;
        
        if (pathText) {
            const parts = folderName.split('/');
            // Si hay subcarpetas (ej: Cliente/Subcarpeta), mostrar /Subcarpeta
            // Si es raíz (ej: Cliente), mostrar /
            const separator = '<span class="path-separator">/</span>';
            if (parts.length > 1) {
                // Reconstruir path visual con separadores
                const pathHtml = parts.slice(1).map(part => `${separator}${part}`).join('');
                pathText.innerHTML = pathHtml;
            } else {
                pathText.innerHTML = separator;
            }
        }
        
        const data = await window.utils.apiCall(`/api/files/${encodeURIComponent(folderName)}`, null, 'GET');
        
        // Actualizar contador de elementos
        const itemCountText = document.getElementById('path-item-count');
        if (itemCountText) {
            const count = data.files ? data.files.length : 0;
            itemCountText.textContent = `${count} ${count === 1 ? 'ELEMENTO' : 'ELEMENTOS'}`;
        }

        if (data.status === 'error' || data.error) {
            activeGrid.innerHTML = `<div style="padding: 20px; color: var(--warning-color);">Error: ${data.error || 'No se pudo cargar'}</div>`;
            return;
        }
        
        if (data.files.length === 0) {
            activeGrid.classList.add('is-empty');
            activeGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📂</div>
                    <div class="empty-text">todo vacío por aquí</div>
                </div>
            `;
            return;
        }
        
        // Si hay archivos, quitamos la clase is-empty
        activeGrid.classList.remove('is-empty');

        if (isRoot) {
            renderRootView(data.files, activeGrid, folderName);
        } else {
            renderFinderView(data.files, activeGrid, folderName);
        }
        
        // Restaurar posición de scroll si corresponde
        if (previousFolder === folderName && previousScroll > 0) {
            // Usar requestAnimationFrame para asegurar que el DOM esté listo
            requestAnimationFrame(() => {
                activeGrid.scrollTop = previousScroll;
            });
        }
    }

    function renderRootView(files, container, folderName) {
        // Agrupar archivos por Año y Mes
        const groups = {};
        files.forEach(file => {
            // Usar la fecha prioritaria (json o creación) enviada por el backend
            const date = new Date(file.date * 1000);
            const year = date.getFullYear();
            const month = date.getMonth(); // 0-11
            const groupKey = `${year}-${month.toString().padStart(2, '0')}`;
            
            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(file);
        });

        // Ordenar las llaves de los grupos (meses) de más reciente a más antiguo
        const sortedGroupKeys = Object.keys(groups).sort().reverse();

        sortedGroupKeys.forEach(key => {
            const [year, month] = key.split('-');
            const monthNames = [
                'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
            ];
            const monthLabelText = `${monthNames[parseInt(month)]} ${year}`;

            const monthRow = document.createElement('div');
            monthRow.className = 'month-row';
            
            // Contenedor principal para el contenido (Días + Grid)
            const monthContent = document.createElement('div');
            monthContent.className = 'month-content';

            // 2. Contenedor de Días - APARTE Y FUERA DEL RECTÁNGULO
            const daysRow = document.createElement('div');
            daysRow.className = 'days-row';

            // Contenedor para alinear la etiqueta con el grid sin contar los días
            const gridWrapper = document.createElement('div');
            gridWrapper.className = 'grid-wrapper';

            // 1. Etiqueta lateral vertical (Mes Año) - Ahora dentro del wrapper para centrado
            const monthLabel = document.createElement('div');
            monthLabel.className = 'month-label';
            monthLabel.textContent = monthLabelText;
            gridWrapper.appendChild(monthLabel);

            // 3. Contenedor para el grid de archivos (RECTÁNGULO CON BORDE)
            const filesGrid = document.createElement('div');
            filesGrid.className = 'month-files-grid';
            
            // Ordenar los archivos dentro del mes: del más antiguo (izquierda) al más nuevo (derecha)
            groups[key].sort((a, b) => a.date - b.date);

            groups[key].forEach(file => {
                const date = new Date(file.date * 1000);
                const day = date.getDate();

                // Indicador de día para la fila de días
                const dayIndicator = document.createElement('div');
                dayIndicator.className = 'day-indicator';
                if (!file.has_metadata) {
                    dayIndicator.classList.add('no-metadata');
                }
                dayIndicator.textContent = day;
                daysRow.appendChild(dayIndicator);

                // Elemento del archivo para el grid
                const item = createGridItem(file, folderName);
                filesGrid.appendChild(item);
            });
            
            gridWrapper.appendChild(filesGrid);
            monthContent.appendChild(daysRow);
            monthContent.appendChild(gridWrapper);
            monthRow.appendChild(monthContent);
            container.appendChild(monthRow);
        });
    }

    function renderFinderView(files, container, folderName) {
        // Ordenar: Carpetas primero, luego archivos. Alfabéticamente.
        files.sort((a, b) => {
            if (a.is_dir === b.is_dir) {
                return a.name.localeCompare(b.name);
            }
            return a.is_dir ? -1 : 1;
        });

        files.forEach(file => {
            const item = createGridItem(file, folderName);
            container.appendChild(item);
        });
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
        
        if (file.path) {
            window.utils.attachNativeFileDrag(item, () => file.path);
        }

        // Navegación al hacer clic
        item.addEventListener('click', (e) => {
            if (e.button !== 0) return;
            
            if (file.is_dir) {
                const newPath = `${folderName}/${file.name}`;
                loadFiles(newPath);
            } else {
                // Abrir archivo
                window.utils.apiCall('/api/open_in_finder', { 
                    folder: folderName, 
                    item: file.name,
                    subfolder: 'Biblioteca' 
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

    // Escuchar cuando se activa el módulo de biblioteca
    document.addEventListener('moduleActivated', (e) => {
        if (e.detail.moduleId !== 'M-Biblioteca') return;

        // 1) Refresh explícito desde el menú contextual (usa path actual)
        if (e.detail.path) {
            loadFiles(e.detail.path);
            return;
        }

        const source = e.detail.source || 'unknown';

        // 2) Cambios de cliente (lateral), carga inicial o reset manual del módulo
        //    (click de nuevo en la misma pestaña superior)
        if (source === 'lateral' || source === 'init' || source === 'top_reset') {
            const activeLateralTab = document.querySelector('.lateral-tab.active');
            if (activeLateralTab) {
                const folderName = activeLateralTab.querySelector('.tab-text').textContent;
                loadFiles(folderName);
            }
            return;
        }

        // 3) Cambio de módulo (top bar, atajo, restore): si ya hay carpeta cargada, no tocar
        const activeGrid = libraryGrid.style.display !== 'none' ? libraryGrid : gridFinder;
        const currentFolder = activeGrid.getAttribute('data-current-folder');
        if (currentFolder) return;

        // Si aún no hay estado, cargar desde pestaña lateral activa
        const activeLateralTab = document.querySelector('.lateral-tab.active');
        if (activeLateralTab) {
            const folderName = activeLateralTab.querySelector('.tab-text').textContent;
            loadFiles(folderName);
        }
    });

    // Evento para recargar biblioteca desde fuera (Drag & Drop, etc)
    document.addEventListener('reloadLibrary', (e) => {
        const activeGrid = libraryGrid.style.display !== 'none' ? libraryGrid : gridFinder;
        const currentPath = activeGrid.getAttribute('data-current-folder');
        if (currentPath) {
            loadFiles(currentPath, false);
        }
    });

    // Cargar carpeta inicial si ya hay una seleccionada y el módulo está activo
    const bibliotecaTab = document.querySelector('.top-tab[data-module="M-Biblioteca"]');
    const activeLateralTab = document.querySelector('.lateral-tab.active');
    if (bibliotecaTab && bibliotecaTab.classList.contains('active') && activeLateralTab) {
        const folderName = activeLateralTab.querySelector('.tab-text').textContent;
        loadFiles(folderName);
    }

    // Navegación por teclado
    document.addEventListener('keydown', async (e) => {
        // Verificar si el módulo Biblioteca está activo
        const bibliotecaModule = document.getElementById('M-Biblioteca');
        if (!bibliotecaModule || !bibliotecaModule.classList.contains('active')) return;

        // Obtener el path actual del grid visible
        const activeGrid = libraryGrid.style.display !== 'none' ? libraryGrid : gridFinder;
        const currentPath = activeGrid.getAttribute('data-current-folder');
        
        if (!currentPath) return;

        const parts = currentPath.split('/');
        
        // Flecha Derecha: Ir adelante en historial (como Finder)
        if (e.key === 'ArrowRight') {
            if (currentHistoryIndex < historyStack.length - 1) {
                e.preventDefault();
                currentHistoryIndex++;
                loadFiles(historyStack[currentHistoryIndex], false);
            }
            return;
        }

        // Si estamos en raíz (length 1), no hay navegación de subcarpetas (por ahora)
        if (parts.length < 2) return;

        // Flecha Izquierda: Subir un nivel
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const parentPath = parts.slice(0, -1).join('/');
            
            // Verificar si el anterior en historial es el padre (Smart Back)
            if (currentHistoryIndex > 0 && historyStack[currentHistoryIndex - 1] === parentPath) {
                currentHistoryIndex--;
                loadFiles(parentPath, false);
            } else {
                loadFiles(parentPath, true);
            }
        }
        
        // Flecha Arriba/Abajo: Navegar entre carpetas hermanas
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            
            const currentFolderName = parts[parts.length - 1];
            const parentPath = parts.slice(0, -1).join('/');
            
            try {
                // Obtener archivos del padre para encontrar hermanos
                const parentData = await window.utils.apiCall(`/api/files/${encodeURIComponent(parentPath)}`, null, 'GET');
                
                if (parentData.status === 'error' || !parentData.files) return;

                let siblingFolders = parentData.files.filter(f => f.is_dir);

                // Detectar si el padre es raíz (Cliente) o subcarpeta
                // Si parentPath no tiene '/', es la raíz del cliente -> Ordenar por Fecha (como renderRootView)
                if (!parentPath.includes('/')) {
                    const groups = {};
                    siblingFolders.forEach(file => {
                        const date = new Date(file.date * 1000);
                        const key = `${date.getFullYear()}-${date.getMonth().toString().padStart(2, '0')}`;
                        if (!groups[key]) groups[key] = [];
                        groups[key].push(file);
                    });

                    // Ordenar grupos (meses) de más reciente a más antiguo
                    const sortedKeys = Object.keys(groups).sort().reverse();
                    
                    // Aplanar lista respetando el orden visual:
                    // 1. Meses más recientes primero
                    // 2. Dentro del mes, más antiguos primero (izquierda a derecha)
                    siblingFolders = [];
                    sortedKeys.forEach(key => {
                        groups[key].sort((a, b) => a.date - b.date);
                        siblingFolders.push(...groups[key]);
                    });
                } else {
                    // Si es subcarpeta (Finder Grid) -> Orden alfabético
                    siblingFolders.sort((a, b) => a.name.localeCompare(b.name));
                }
                
                const currentIndex = siblingFolders.findIndex(f => f.name === currentFolderName);
                
                if (currentIndex === -1) return;

                let nextIndex;
                if (e.key === 'ArrowUp') {
                    // Anterior
                    nextIndex = currentIndex - 1;
                } else {
                    // Siguiente
                    nextIndex = currentIndex + 1;
                }

                // Verificar límites
                if (nextIndex >= 0 && nextIndex < siblingFolders.length) {
                    const nextFolder = siblingFolders[nextIndex];
                    const nextPath = `${parentPath}/${nextFolder.name}`;
                    loadFiles(nextPath);
                }

            } catch (error) {
                console.error('Error en navegación por teclado:', error);
            }
        }
    });
});
