/**
 * Context Menu System
 * Professional logic for handling application-wide context menus
 */

class ContextMenuSystem {
    constructor() {
        this.menu = document.getElementById('global-context-menu');
        this.libraryGrid = document.getElementById('grid-library');
        this.gridFinder = document.getElementById('grid-work');
        this.resourcesGrid = document.getElementById('resources-grid');
        this.lateralBar = document.querySelector('.lateral-bar');
        this.settingsModule = document.getElementById('M-Settings');
        this.currentTarget = null;
        this.currentContext = null; // 'grid', 'grid-finder', 'resources', 'lateral' or 'settings'
        this.margin = 10;

        if (!this.menu) {
            console.error('Context menu element not found');
            return;
        }

        this.init();
        
        // Expose instance to window for global access
        window.contextMenuSystem = this;
    }

    init() {
        // Global listeners
        document.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
        document.addEventListener('click', (e) => this.handleClickOutside(e));
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // Menu internal listeners
        this.menu.addEventListener('mousemove', (e) => this.updateGlowEffect(e));
        
        // Action listeners
        this.setupActions();
    }

    handleContextMenu(e) {
        // Determine context
        if (this.libraryGrid && this.libraryGrid.contains(e.target)) {
            this.currentContext = 'grid';
            this.currentTarget = e.target.closest('.file-item');
        } else if (this.gridFinder && this.gridFinder.contains(e.target)) {
            this.currentContext = 'grid-finder';
            this.currentTarget = e.target.closest('.file-item');
        } else if (this.resourcesGrid && this.resourcesGrid.contains(e.target)) {
            this.currentContext = 'resources';
            this.currentTarget = e.target.closest('.file-item');
        } else if (this.lateralBar && this.lateralBar.contains(e.target)) {
            this.currentContext = 'lateral';
            this.currentTarget = e.target.closest('.lateral-tab:not(.settings-tab)');
        } else if (this.settingsModule && this.settingsModule.contains(e.target)) {
            this.currentContext = 'settings';
            this.currentTarget = e.target.closest('.primary-color-config, .accent-color-config');
        } else {
            this.hide();
            return;
        }

        e.preventDefault();
        
        // Update menu items visibility based on context and target
        this.updateMenuItemsVisibility();
        
        // Position and show
        this.show(e.clientX, e.clientY);
    }

    updateMenuItemsVisibility() {
        const groups = this.menu.querySelectorAll('.context-menu-group');
        groups.forEach(group => {
            const groupName = group.getAttribute('data-group');
            const isGridContext = this.currentContext === 'grid' || this.currentContext === 'resources' || this.currentContext === 'grid-finder';
            
            if ((groupName === 'grid' && isGridContext) || (groupName === this.currentContext)) {
                group.style.display = 'block';
                
                // If it's the grid context (Biblioteca or Recursos), handle sub-items and labels
                if (groupName === 'grid') {
                    const isItem = !!this.currentTarget;
                    const isResources = this.currentContext === 'resources';
                    const isGridFinder = this.currentContext === 'grid-finder';
                    
                    const createItem = group.querySelector('[data-action="create-work"]');
                    const renameItem = group.querySelector('[data-action="rename"]');
                    const deleteItem = group.querySelector('[data-action="delete"]');
                    const divider = group.querySelector('.context-menu-divider');
                    
                    // Update labels based on context
                    if (createItem) {
                        if (isResources) {
                            createItem.textContent = 'Crear Recurso';
                        } else if (isGridFinder) {
                            createItem.textContent = 'Crear Carpeta';
                        } else {
                            createItem.textContent = 'Crear Trabajo';
                        }
                    }
                    
                    [renameItem, deleteItem, divider].forEach(el => {
                        if (el) el.style.display = isItem ? '' : 'none';
                    });
                }
                
                // If it's the lateral context, handle sub-items (delete-client)
                if (groupName === 'lateral') {
                    const isItem = !!this.currentTarget;
                    const renameItem = group.querySelector('[data-action="rename-client"]');
                    const pinItem = group.querySelector('[data-action="toggle-pin"]');
                    const deleteItem = group.querySelector('[data-action="delete-client"]');
                    const divider = group.querySelector('.context-menu-divider');
                    
                    [renameItem, pinItem, deleteItem, divider].forEach(el => {
                        if (el) el.style.display = isItem ? '' : 'none';
                    });

                    // Actualizar texto de Anclar/Desanclar
                    if (isItem && pinItem) {
                        const isPinned = this.currentTarget.getAttribute('data-pinned') === 'true';
                        pinItem.textContent = isPinned ? 'Desanclar' : 'Anclar';
                    }
                }

                // If it's the settings context, handle reset-color visibility
                if (groupName === 'settings') {
                    const resetItem = group.querySelector('[data-action="reset-color"]');
                    if (resetItem) {
                        resetItem.style.display = this.currentTarget ? 'flex' : 'none';
                    }
                }
            } else {
                group.style.display = 'none';
            }
        });
    }

    show(x, y) {
        this.menu.style.display = 'flex';
        
        const menuRect = this.menu.getBoundingClientRect();
        
        let finalX = x;
        let finalY = y;

        if (x + menuRect.width > window.innerWidth - this.margin) {
            finalX = window.innerWidth - menuRect.width - this.margin;
        }
        if (y + menuRect.height > window.innerHeight - this.margin) {
            finalY = window.innerHeight - menuRect.height - this.margin;
        }

        finalX = Math.max(this.margin, finalX);
        finalY = Math.max(this.margin, finalY);

        this.menu.style.left = `${finalX}px`;
        this.menu.style.top = `${finalY}px`;
    }

    hide() {
        if (this.menu) {
            this.menu.style.display = 'none';
        }
        this.currentTarget = null;
        this.currentContext = null;
    }

    handleClickOutside(e) {
        if (this.menu && !this.menu.contains(e.target)) {
            this.hide();
        }
    }

    handleKeyDown(e) {
        if (e.key === 'Escape') {
            this.hide();
        }
    }

    updateGlowEffect(e) {
        const rect = this.menu.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.menu.style.setProperty('--mouse-x', `${x}px`);
        this.menu.style.setProperty('--mouse-y', `${y}px`);
    }

    setupActions() {
        const items = this.menu.querySelectorAll('.context-menu-item');
        items.forEach(item => {
            item.addEventListener('click', () => {
                const action = item.getAttribute('data-action');
                this.executeAction(action);
                this.hide();
            });
        });
    }

    async executeAction(action) {
        const isResources = this.currentContext === 'resources';
        const isGridFinder = this.currentContext === 'grid-finder';
        const parentFolder = isResources ? 
                           this.resourcesGrid?.getAttribute('data-current-folder') :
                           (isGridFinder ? this.gridFinder?.getAttribute('data-current-folder') : this.libraryGrid?.getAttribute('data-current-folder'));

        switch (action) {
            case 'create-work':
                this.handleCreateWork(parentFolder, isResources, isGridFinder);
                break;
            case 'show-in-finder':
                this.handleShowInFinder(parentFolder, isResources, isGridFinder);
                break;
            case 'rename':
                this.handleRename(parentFolder, isResources, isGridFinder);
                break;
            case 'delete':
                this.handleDelete(parentFolder, isResources, isGridFinder);
                break;
            case 'create-client':
                this.handleCreateClient();
                break;
            case 'rename-client':
                this.handleRenameClient();
                break;
            case 'toggle-pin':
                this.handleTogglePin();
                break;
            case 'delete-client':
                this.handleDeleteClient();
                break;
            case 'open-config':
                this.handleOpenConfig();
                break;
            case 'reset-color':
                this.handleResetColor();
                break;
        }
    }

    // --- Action Handlers (Settings) ---

    async handleResetColor() {
        if (!this.currentTarget) return;
        
        const isPrimary = this.currentTarget.classList.contains('primary-color-config');
        const prefix = isPrimary ? 'primary' : 'accent';
        
        // Obtener valores por defecto de la API
        const result = await window.utils.apiCall('/api/get_default_config', null, 'GET');
        if (result.status === 'success') {
            const defaultHex = isPrimary ? result.defaults.primary_color : result.defaults.accent_color;
            
            // Disparar un evento personalizado para que M-Settings lo capture y actualice
            document.dispatchEvent(new CustomEvent('resetColor', { 
                detail: { 
                    prefix: prefix, 
                    color: defaultHex 
                } 
            }));
        }
    }

    async handleOpenConfig() {
        const result = await window.utils.apiCall('/api/open_config');
        if (result.status !== 'success') {
            window.utils.showError('Error al abrir configuración', result.error);
        }
    }

    // --- Action Handlers (Grid) ---

    handleCreateWork(parentFolder, isResources = false, isGridFinder = false) {
        if (!parentFolder || !window.showModal) return;
        window.showModal({
            title: isResources ? 'Crear Nuevo Recurso' : (isGridFinder ? 'Crear Nueva Carpeta' : 'Crear Nuevo Trabajo'),
            placeholder: isResources ? 'Nombre del recurso...' : (isGridFinder ? 'Nombre de la carpeta...' : 'Nombre del trabajo...'),
            confirmText: 'Confirmar',
            action: async (name) => {
                const endpoint = isResources ? '/api/create_resource' : '/api/create_folder';
                const result = await window.utils.apiCall(endpoint, { parent: parentFolder, name: name.trim() });
                if (result.status === 'success') this.refreshGrid(isResources, isGridFinder);
                else window.utils.showError('Error al crear', result.error);
            }
        });
    }

    handleRename(parentFolder, isResources = false, isGridFinder = false) {
        if (!parentFolder || !this.currentTarget || !window.showModal) return;
        const oldName = this.currentTarget.getAttribute('data-name');
        const isDir = this.currentTarget.getAttribute('data-is-dir') === 'true';
        
        // Lógica para separar extensión
        let nameToEdit = oldName;
        let extension = '';
        
        // Solo separamos extensión si NO es directorio y tiene un punto que no sea el primero
        if (!isDir) {
            const lastDotIndex = oldName.lastIndexOf('.');
            if (lastDotIndex > 0) {
                nameToEdit = oldName.substring(0, lastDotIndex);
                extension = oldName.substring(lastDotIndex);
            }
        }

        window.showModal({
            title: isResources ? 'Renombrar Recurso' : (isGridFinder ? 'Renombrar Carpeta' : 'Renombrar Trabajo'),
            initialValue: nameToEdit,
            confirmText: 'Confirmar',
            showExtensionToggle: !isDir && !!extension, // Solo mostrar toggle si es archivo y tiene extensión
            originalExtension: extension,
            action: async (newNameBase) => {
                let finalNewName = newNameBase.trim();
                
                // Reconstruir nombre con extensión si existía
                if (extension && !isDir) {
                     const toggleBtn = document.getElementById('modal-toggle-extension');
                     // Si el botón existe y está activo, el usuario tiene control total (puede cambiar ext)
                     const isToggleActive = toggleBtn && toggleBtn.classList.contains('active');
                     
                     if (!isToggleActive) {
                         // Modo "Extensión Oculta": El usuario editó solo el nombre.
                         // Forzamos la extensión original al final.
                         if (!finalNewName.toLowerCase().endsWith(extension.toLowerCase())) {
                             finalNewName += extension;
                         }
                     }
                     // Si isToggleActive es true, finalNewName ya contiene lo que el usuario quiere (con o sin ext modificada)
                }
                
                if (finalNewName === oldName) return;

                const endpoint = isResources ? '/api/rename_resource' : '/api/rename_folder';
                const result = await window.utils.apiCall(endpoint, { parent: parentFolder, old_name: oldName, new_name: finalNewName });
                if (result.status === 'success') this.refreshGrid(isResources, isGridFinder);
                else window.utils.showError('Error al renombrar', result.error);
            }
        });
    }

    handleDelete(parentFolder, isResources = false, isGridFinder = false) {
        if (!parentFolder || !this.currentTarget || !window.showModal) return;
        const name = this.currentTarget.getAttribute('data-name');
        const itemCountLabel = this.currentTarget.querySelector('.file-count-label')?.textContent.trim() || '0 elementos';
        const weightLabel = window.utils.formatSize(parseInt(this.currentTarget.getAttribute('data-size')) || 0);

        window.showModal({
            title: isResources ? 'Eliminar Recurso' : (isGridFinder ? 'Eliminar Carpeta' : 'Eliminar Trabajo'),
            message: `¿Seguro que quieres eliminar "${name}"?<br><span style="opacity: 0.6; font-size: 0.9em;">Contiene ${itemCountLabel}${!isResources ? ' - ' + weightLabel : ''}</span>`,
            confirmText: 'Confirmar',
            showInput: false,
            action: async () => {
                const endpoint = isResources ? '/api/delete_resource' : '/api/delete_folder';
                const result = await window.utils.apiCall(endpoint, { parent: parentFolder, name: name });
                if (result.status === 'success') this.refreshGrid(isResources, isGridFinder);
                else window.utils.showError('Error al eliminar', result.error);
            }
        });
    }

    async handleShowInFinder(parentFolder, isResources = false, isGridFinder = false) {
        if (!parentFolder) return;
        const itemName = this.currentTarget ? this.currentTarget.getAttribute('data-name') : null;
        const subfolder = isResources ? 'Recursos' : 'Biblioteca';
        await window.utils.apiCall('/api/open_in_finder', { folder: parentFolder, item: itemName, subfolder: subfolder });
    }

    // --- Action Handlers (Lateral) ---

    handleCreateClient() {
        if (!window.showModal) return;

        // Obtener nombres de clientes existentes desde la barra lateral
        const clientTabs = document.querySelectorAll('.lateral-tab:not(.settings-tab) .tab-text');
        const existingClients = Array.from(clientTabs).map(t => t.textContent.trim());

        window.showModal({
            title: 'Crear Nuevo Cliente',
            placeholder: 'Nombre del cliente...',
            confirmText: 'Confirmar',
            validationItems: existingClients,
            action: async (name) => {
                const result = await window.utils.apiCall('/api/create_client', { name: name.trim() });
                if (result.status === 'success') window.utils.refreshLateralBar();
                else window.utils.showError('Error al crear cliente', result.error);
            }
        });
    }

    handleRenameClient() {
        if (!this.currentTarget || !window.showModal) return;
        const oldName = this.currentTarget.querySelector('.tab-text').textContent.trim();
        
        // Obtener otros clientes para validación (excluyendo el actual)
        const clientTabs = document.querySelectorAll('.lateral-tab:not(.settings-tab) .tab-text');
        const otherClients = Array.from(clientTabs)
            .map(t => t.textContent.trim())
            .filter(name => name.toLowerCase() !== oldName.toLowerCase());

        window.showModal({
            title: 'Renombrar Cliente',
            initialValue: oldName,
            confirmText: 'Confirmar',
            validationItems: otherClients,
            action: async (newName) => {
                if (newName.trim() === oldName) return;
                const result = await window.utils.apiCall('/api/rename_client', { 
                    old_name: oldName, 
                    new_name: newName.trim() 
                });
                if (result.status === 'success') window.utils.refreshLateralBar();
                else window.utils.showError('Error al renombrar cliente', result.error);
            }
        });
    }

    async handleTogglePin() {
        if (!this.currentTarget) return;
        const clientName = this.currentTarget.querySelector('.tab-text').textContent.trim();
        const currentPinned = this.currentTarget.getAttribute('data-pinned') === 'true';
        
        const result = await window.utils.apiCall('/api/toggle_pin_client', { 
            name: clientName, 
            pin: !currentPinned 
        });
        
        if (result.status === 'success') {
            window.utils.refreshLateralBar();
        } else {
            window.utils.showError('Error al cambiar anclado', result.error);
        }
    }

    handleDeleteClient() {
        if (!this.currentTarget || !window.showModal) return;
        const name = this.currentTarget.querySelector('.tab-text').textContent.trim();
        window.showModal({
            title: 'Eliminar Cliente',
            message: `¿Seguro que quieres eliminar al cliente "${name}"?<br><br><span style="font-size: 0.85em; color: var(--warning-color);">Escribe el nombre del cliente para confirmar:</span>`,
            confirmText: 'Confirmar',
            showInput: true,
            placeholder: name,
            validationValue: name,
            action: async () => {
                const result = await window.utils.apiCall('/api/delete_client', { name: name });
                if (result.status === 'success') window.utils.refreshLateralBar();
                else window.utils.showError('Error al eliminar cliente', result.error);
            }
        });
    }

    // --- Helpers ---

    refreshGrid(isResources = false, isGridFinder = false) {
        const moduleId = isResources ? 'M-Recursos' : 'M-Biblioteca';
        let detail = { moduleId: moduleId };
        
        let currentFolder = null;

        if (isResources) {
            currentFolder = this.resourcesGrid?.getAttribute('data-current-folder');
        } else {
            // If we are in grid-finder (or even grid), we might want to refresh the current folder.
            currentFolder = isGridFinder ? 
                this.gridFinder?.getAttribute('data-current-folder') : 
                this.libraryGrid?.getAttribute('data-current-folder');
        }
        
        if (currentFolder) {
            detail.path = currentFolder;
        }
        
        document.dispatchEvent(new CustomEvent('moduleActivated', { detail: detail }));
    }
}

// Initialize the system
document.addEventListener('DOMContentLoaded', () => {
    window.contextMenuSystem = new ContextMenuSystem();
});
