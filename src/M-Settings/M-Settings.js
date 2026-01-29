// M-Settings: Professional Logic with HSL Color Picker
document.addEventListener('DOMContentLoaded', () => {
    // Función para convertir HSL a Hex para guardar en config.json
    const hslToHex = (h, s, l) => {
        l /= 100;
        const a = s * Math.min(l, 1 - l) / 100;
        const f = n => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    };

    // Función para convertir Hex a HSL para inicializar los sliders
    const hexToHsl = (hex) => {
        let r = parseInt(hex.slice(1, 3), 16) / 255;
        let g = parseInt(hex.slice(3, 5), 16) / 255;
        let b = parseInt(hex.slice(5, 7), 16) / 255;

        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0; // achromatic
        } else {
            let d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
    };

    const saveConfig = async (newConfig) => {
        try {
            const result = await window.utils.apiCall('/api/save_config', newConfig, 'POST');
            if (result.status !== 'success') {
                console.error('Error saving config:', result.error);
            }
        } catch (error) {
            console.error('Error in saveConfig:', error);
        }
    };

    const setupColorPicker = (prefix, cssVar) => {
        const hueSlider = document.getElementById(`${prefix}-hue`);
        const saturationSlider = document.getElementById(`${prefix}-saturation`);
        const lightnessSlider = document.getElementById(`${prefix}-lightness`);
        const colorPreview = document.getElementById(`${prefix}-color-preview`);

        if (!hueSlider || !saturationSlider || !lightnessSlider || !colorPreview) return;

        const setSteps = (slider, units) => {
            const min = Number(slider.min);
            const max = Number(slider.max);
            const range = max - min;
            if (!Number.isFinite(range) || range <= 0) return;

            const safeUnits = Math.max(1, Number(units) || 1);
            const step = range / safeUnits;
            const decimals = step < 1 ? 4 : 0;
            slider.step = String(Number(step.toFixed(decimals)));

            const current = Number(slider.value);
            if (Number.isFinite(current)) {
                const snapped = min + Math.round((current - min) / step) * step;
                const clamped = Math.min(max, Math.max(min, snapped));
                slider.value = String(Number(clamped.toFixed(decimals)));
            }
        };

        const targetSteps = 360;
        setSteps(hueSlider, targetSteps);
        setSteps(saturationSlider, targetSteps);
        setSteps(lightnessSlider, targetSteps);

        const updateSaturationBackground = () => {
            const h = Number(hueSlider.value);
            const l = Number(lightnessSlider.value);
            const gradientLightness = Math.max(50, l);
            const start = `hsl(${h}, 0%, ${gradientLightness}%)`;
            const end = `hsl(${h}, 100%, ${gradientLightness}%)`;
            saturationSlider.style.background = `linear-gradient(to right, ${start}, ${end})`;
        };

        const updateColor = (save = false) => {
            const h = Number(hueSlider.value);
            const s = Number(saturationSlider.value);
            const l = Number(lightnessSlider.value);
            
            const color = `hsl(${h}, ${s}%, ${l}%)`;
            const hexColor = hslToHex(h, s, l);
            
            // Aplicar visualmente en tiempo real
            document.documentElement.style.setProperty(`--${cssVar}`, hexColor);
            colorPreview.style.backgroundColor = color;
            updateSaturationBackground();

            if (save) {
                const configKey = cssVar.replace(/-/g, '_');
                saveConfig({ [configKey]: hexColor });
            }
        };

        // Inicializar sliders con el color actual de las variables CSS
        const currentColor = getComputedStyle(document.documentElement)
            .getPropertyValue(`--${cssVar}`).trim();
        
        if (currentColor) {
            const [h, s, l] = hexToHsl(currentColor);
            hueSlider.value = h;
            saturationSlider.value = s;
            lightnessSlider.value = l;
            colorPreview.style.backgroundColor = `hsl(${h}, ${s}%, ${l}%)`;
            updateSaturationBackground();
        }

        // Events for real-time update
        [hueSlider, saturationSlider, lightnessSlider].forEach(slider => {
            slider.addEventListener('input', () => updateColor(false));
            slider.addEventListener('change', () => updateColor(true));
        });
    };

    // Configurar ambos selectores
    setupColorPicker('primary', 'primary-color');
    setupColorPicker('accent', 'accent-color');

    const wireResetColorButton = (buttonId, prefix) => {
        const btn = document.getElementById(buttonId);
        if (!btn) return;

        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            try {
                const result = await window.utils.apiCall('/api/get_default_config', null, 'GET');
                if (result.status !== 'success') return;

                const defaults = result.defaults;
                if (!defaults) return;

                const color = prefix === 'primary' ? defaults.primary_color : defaults.accent_color;
                if (!color) return;

                document.dispatchEvent(new CustomEvent('resetColor', {
                    detail: { prefix, color }
                }));
            } catch {
                return;
            }
        });
    };

    wireResetColorButton('primary-reset-color-btn', 'primary');
    wireResetColorButton('accent-reset-color-btn', 'accent');

    // Función auxiliar para actualizar sliders desde CSS (usada al cargar config externa)
    const updateSlidersFromCSS = (prefix, cssVar) => {
        const hueSlider = document.getElementById(`${prefix}-hue`);
        const saturationSlider = document.getElementById(`${prefix}-saturation`);
        const lightnessSlider = document.getElementById(`${prefix}-lightness`);
        const colorPreview = document.getElementById(`${prefix}-color-preview`);
        
        if (!hueSlider || !saturationSlider || !lightnessSlider || !colorPreview) return;

        const currentColor = getComputedStyle(document.documentElement)
            .getPropertyValue(`--${cssVar}`).trim();
        
        if (currentColor) {
            const [h, s, l] = hexToHsl(currentColor);
            hueSlider.value = h;
            saturationSlider.value = s;
            lightnessSlider.value = l;
            colorPreview.style.backgroundColor = `hsl(${h}, ${s}%, ${l}%)`;
            const gradientLightness = Math.max(50, l);
            const start = `hsl(${h}, 0%, ${gradientLightness}%)`;
            const end = `hsl(${h}, 100%, ${gradientLightness}%)`;
            saturationSlider.style.background = `linear-gradient(to right, ${start}, ${end})`;
        }
    };

    // --- Lógica de Preferencias de Sistema ---
    const setupToggle = (toggleId, configKey, callback) => {
        const toggle = document.getElementById(toggleId);
        if (toggle) {
            toggle.addEventListener('change', (e) => {
                saveConfig({ [configKey]: e.target.checked });
                if (callback) callback(e.target.checked);
            });

            // Click en el contenedor padre para mejorar UX
            const container = toggle.closest('.system-preference-config');
            if (container) {
                container.addEventListener('click', (e) => {
                     if (e.target !== toggle && !toggle.contains(e.target)) {
                        toggle.checked = !toggle.checked;
                        toggle.dispatchEvent(new Event('change'));
                    }
                });
            }
        }
    };

    setupToggle('remember-module-toggle', 'remember_module');

    const lowercaseToggle = document.getElementById('lowercase-path-toggle');
    if (lowercaseToggle) {
        lowercaseToggle.addEventListener('change', (e) => {
            const checked = e.target.checked;
            const effectiveLowercase = !checked;
            saveConfig({ lowercase_path: effectiveLowercase });
            if (effectiveLowercase) {
                document.body.classList.add('lowercase-path');
            } else {
                document.body.classList.remove('lowercase-path');
            }
        });

        const container = lowercaseToggle.closest('.system-preference-config');
        if (container) {
            container.addEventListener('click', (e) => {
                if (e.target !== lowercaseToggle && !lowercaseToggle.contains(e.target)) {
                    lowercaseToggle.checked = !lowercaseToggle.checked;
                    lowercaseToggle.dispatchEvent(new Event('change'));
                }
            });
        }
    }

    // Listener para restablecer color desde el menú contextual
    document.addEventListener('resetColor', (e) => {
        const { prefix, color } = e.detail;
        const hueSlider = document.getElementById(`${prefix}-hue`);
        const saturationSlider = document.getElementById(`${prefix}-saturation`);
        const lightnessSlider = document.getElementById(`${prefix}-lightness`);
        const colorPreview = document.getElementById(`${prefix}-color-preview`);
        const cssVar = prefix === 'primary' ? 'primary-color' : 'accent-color';

        if (hueSlider && saturationSlider && lightnessSlider && colorPreview) {
            const [h, s, l] = hexToHsl(color);
            hueSlider.value = h;
            saturationSlider.value = s;
            lightnessSlider.value = l;
            
            // Aplicar visualmente
            document.documentElement.style.setProperty(`--${cssVar}`, color);
            colorPreview.style.backgroundColor = `hsl(${h}, ${s}%, ${l}%)`;
            const gradientLightness = Math.max(50, l);
            const start = `hsl(${h}, 0%, ${gradientLightness}%)`;
            const end = `hsl(${h}, 100%, ${gradientLightness}%)`;
            saturationSlider.style.background = `linear-gradient(to right, ${start}, ${end})`;
            
            // Guardar en config
            const configKey = cssVar.replace(/-/g, '_');
            saveConfig({ [configKey]: color });
        }
    });

    // --- Lógica de Caché ---
    let refreshCacheInfo = null;
    const setupCacheActions = () => {
        const generateBtn = document.getElementById('generate-cache-btn');
        const openBtn = document.getElementById('open-cache-btn');
        const clearBtn = document.getElementById('clear-cache-btn');
        const statusDiv = document.getElementById('cache-status');
        const itemsCountEl = document.getElementById('cache-items-count');
        const missingCountEl = document.getElementById('cache-missing-count');
        const totalSizeEl = document.getElementById('cache-total-size');

        const showStatus = (msg, isError = false) => {
            if (statusDiv) {
                statusDiv.textContent = msg;
                statusDiv.style.color = isError ? 'var(--warning-color)' : '#8b949e';
                statusDiv.style.display = 'block';
                if (!isError) {
                    setTimeout(() => {
                        statusDiv.style.display = 'none';
                    }, 5000);
                }
            }
        };

        const updateCacheInfo = async () => {
            if (!window.__TAURI__ || !window.__TAURI__.core) return;

            try {
                const stats = await window.__TAURI__.core.invoke('get_cache_stats');

                if (itemsCountEl && typeof stats.file_count === 'number') {
                    const count = stats.file_count;
                    itemsCountEl.textContent = `${count} ${count === 1 ? 'archivo' : 'archivos'}`;
                }

                if (missingCountEl && typeof stats.missing_count === 'number') {
                    const count = stats.missing_count;
                    missingCountEl.textContent = `${count} ${count === 1 ? 'archivo' : 'archivos'}`;
                }

                if (totalSizeEl && typeof stats.total_size === 'number') {
                    const size = stats.total_size;
                    if (window.utils && typeof window.utils.formatSize === 'function') {
                        totalSizeEl.textContent = window.utils.formatSize(size);
                    } else {
                        const k = 1024;
                        const sizes = ['B', 'KB', 'MB', 'GB'];
                        if (!size || size === 0) {
                            totalSizeEl.textContent = '0 B';
                        } else {
                            const i = Math.floor(Math.log(size) / Math.log(k));
                            const value = parseFloat((size / Math.pow(k, i)).toFixed(1));
                            totalSizeEl.textContent = `${value} ${sizes[i]}`;
                        }
                    }
                }
            } catch (error) {
                if (itemsCountEl) itemsCountEl.textContent = '—';
                if (missingCountEl) missingCountEl.textContent = '—';
                if (totalSizeEl) totalSizeEl.textContent = '—';
            }
        };

        refreshCacheInfo = updateCacheInfo;

        if (generateBtn) {
            generateBtn.addEventListener('click', async () => {
                const cancelHandler = async () => {
                    if (window.loader) window.loader.disableCancelButton();
                    if (window.__TAURI__ && window.__TAURI__.core) {
                        try {
                            await window.__TAURI__.core.invoke('cancel_cache_generation');
                            // El loader se cerrará cuando el backend retorne del comando generate_missing_thumbnails
                        } catch (e) {
                            console.error('Error cancelando:', e);
                        }
                    }
                };

                if (window.loader) {
                    window.loader.show();
                    window.loader.updateStatus('Iniciando...', 0, 100);
                    window.loader.showCancelButton(cancelHandler);
                }

                let unlisten;
                if (window.__TAURI__ && window.__TAURI__.event) {
                    unlisten = await window.__TAURI__.event.listen('cache-progress', (event) => {
                        const { current, total, status } = event.payload;
                        if (window.loader) {
                            // Usar el status del evento si está disponible
                            const statusText = status === "Cancelado" ? "Cancelando..." : "Generando caché";
                            window.loader.updateStatus(statusText, current, total);
                        }
                    });
                }

                try {
                    const result = await window.__TAURI__.core.invoke('generate_missing_thumbnails');
                    
                    if (window.loader) {
                        window.loader.hide();
                    }
                    
                    showStatus(result);
                    updateCacheInfo();
                } catch (error) {
                    if (window.loader) {
                        window.loader.hide();
                    }
                    showStatus(`Error: ${error}`, true);
                } finally {
                    if (unlisten) unlisten();
                }
            });
        }

        if (openBtn) {
            openBtn.addEventListener('click', async () => {
                try {
                    await window.__TAURI__.core.invoke('open_cache_folder');
                } catch (error) {
                    showStatus(`Error: ${error}`, true);
                }
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
                showStatus('Limpiando cache...');
                try {
                    await window.__TAURI__.core.invoke('clear_all_cache');
                    showStatus('Cache limpiado exitosamente');
                    updateCacheInfo();
                } catch (error) {
                    showStatus(`Error: ${error}`, true);
                }
            });
        }

        updateCacheInfo();
    };
    setupCacheActions();

    // --- Lógica de navegación del menú lateral ---
    const menuItems = document.querySelectorAll('.settings-menu-item');
    const sections = document.querySelectorAll('.settings-section-content');
    const cacheInfoPanel = document.getElementById('cache-info-panel');

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetSection = item.getAttribute('data-section');
            
            // Actualizar estado del menú
            menuItems.forEach(mi => mi.classList.remove('active'));
            item.classList.add('active');

            // Mostrar la sección correspondiente
            sections.forEach(section => {
                if (section.id === `settings-section-${targetSection}`) {
                    section.style.display = 'block';
                    // Pequeño delay para la transición visual si fuera necesaria
                    setTimeout(() => section.classList.add('active'), 10);
                } else {
                    section.classList.remove('active');
                    section.style.display = 'none';
                }
            });

            if (cacheInfoPanel) {
                if (targetSection === 'cache') {
                    cacheInfoPanel.style.display = 'flex';
                    setTimeout(() => cacheInfoPanel.classList.add('active'), 10);
                    if (typeof refreshCacheInfo === 'function') refreshCacheInfo();
                } else {
                    cacheInfoPanel.classList.remove('active');
                    cacheInfoPanel.style.display = 'none';
                }
            }
        });
    });

    // Listener para cuando el módulo se activa
    document.addEventListener('moduleActivated', (e) => {
        if (e.detail.moduleId === 'M-Settings') {
            // Refrescar valores visuales por si cambiaron externamente
            updateSlidersFromCSS('primary', 'primary-color');
            updateSlidersFromCSS('accent', 'accent-color');
            if (typeof refreshCacheInfo === 'function') refreshCacheInfo();
        }
    });

    // Listener para cuando se aplica una configuración externa (inicio o reset)
    document.addEventListener('configApplied', (e) => {
        const config = e.detail;
        
        // Actualizar sliders
        updateSlidersFromCSS('primary', 'primary-color');
        updateSlidersFromCSS('accent', 'accent-color');

        // Actualizar toggles
        const rememberToggle = document.getElementById('remember-module-toggle');
        if (rememberToggle && config.remember_module !== undefined) {
            rememberToggle.checked = config.remember_module;
        }

        const lowercaseToggle = document.getElementById('lowercase-path-toggle');
        if (lowercaseToggle && config.lowercase_path !== undefined) {
            lowercaseToggle.checked = !config.lowercase_path;
        }
    });
});
