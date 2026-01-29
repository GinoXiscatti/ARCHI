// Sistema de Loader Global
window.loader = {
    startTime: Date.now(),
    minTime: 300, // ms mínimo de pantalla de carga
    
    updateProgress(percent) {
        const bar = document.querySelector('.loader-progress-bar');
        if (bar) bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    },

    updateStatus(text, current, total) {
        const textEl = document.querySelector('.loader-status-text');
        if (textEl) {
            textEl.style.opacity = '1';
            if (current !== undefined && total !== undefined) {
                textEl.textContent = `${text} ${current}/${total}`;
                this.updateProgress((current / total) * 100);
            } else {
                textEl.textContent = text;
            }
        }
    },

    showCancelButton(onClick) {
        const btn = document.getElementById('loader-cancel-btn');
        if (btn) {
            btn.style.display = 'block';
            btn.disabled = false;
            btn.onclick = onClick;
        }
    },

    hideCancelButton() {
        const btn = document.getElementById('loader-cancel-btn');
        if (btn) {
            btn.style.display = 'none';
            btn.disabled = false;
            btn.onclick = null;
        }
    },

    disableCancelButton() {
        const btn = document.getElementById('loader-cancel-btn');
        if (btn) {
            btn.disabled = true;
        }
    },
    
    show() {
        let loader = document.getElementById('loader-screen');
        if (!loader) {
            this.init();
            loader = document.getElementById('loader-screen');
        }
        
        if (loader) {
            loader.style.display = 'flex';
            loader.classList.remove('fade-out');
            loader.classList.add('fade-in');
            
            this.updateProgress(0);
            const textEl = document.querySelector('.loader-status-text');
            if (textEl) textEl.style.opacity = '0';
            
            this.hideCancelButton(); // Reset cancel button state
        }
    },
    
    hide() {
        const loader = document.getElementById('loader-screen');
        if (!loader) return;
        
        this.updateProgress(100);

        const elapsed = Date.now() - this.startTime;
        const remaining = Math.max(0, this.minTime - elapsed);
        
        setTimeout(() => {
            setTimeout(() => {
                loader.classList.remove('fade-in');
                loader.classList.add('fade-out');
                setTimeout(() => {
                    loader.style.display = 'none';
                    this.hideCancelButton();
                }, 300);
            }, 200);
        }, remaining);
    },

    init() {
        const loader = document.getElementById('loader-screen');
        if (loader) {
            const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#1a1a1a';
            
            // Función para posiciones orgánicas
            const getRandomPos = (min, max) => Math.floor(Math.random() * (max - min)) + min;
            
            const x1 = getRandomPos(5, 40);
            const y1 = getRandomPos(5, 40);
            const x2 = getRandomPos(60, 95);
            const y2 = getRandomPos(60, 95);
            
            const size1 = getRandomPos(45, 65);
            const size2 = getRandomPos(50, 70);

            // Usamos una mezcla de colores más suave y añadimos un degradado base para suavizar la transición al negro
            loader.style.background = `
                radial-gradient(circle at ${x1}% ${y1}%, ${primaryColor} 0%, transparent ${size1}%),
                radial-gradient(circle at ${x2}% ${y2}%, ${primaryColor} 0%, transparent ${size2}%),
                radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0%, #000000 100%),
                #000000
            `;
        }
    }
};

// Inicializar estilos del loader al cargar recursos básicos
window.addEventListener('DOMContentLoaded', () => {
    window.loader.init();
});
