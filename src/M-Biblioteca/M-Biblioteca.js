// Lógica para el módulo Biblioteca
console.log('Biblioteca module loaded');

document.addEventListener('DOMContentLoaded', () => {
    const workGrid = document.getElementById('grid-library');
    const gridFinder = document.getElementById('grid-work');
    const libraryFinderRow = document.querySelector('.grid-work-row');
    const finderNote = document.querySelector('.note-work');

    // --- Estado ---

    // Historial de navegación
    let historyStack = [];
    let currentHistoryIndex = -1;

    let noteEditor = null;
    let noteCurrentFolder = null;
    let noteSaveTimeout = null;
    let noteLoadSeq = 0;
    let noteLastSaved = '';
    let noteMenuListenerAttached = false;
    let noteDirtyIndicator = null;
    let finderNoteExpandedWidth = 200;
    let finderNoteCollapsed = false;
    let gridFinderToggleButton = null;
    let gridFinderToggleArrow = null;

    function sanitizeHtml(html) {
        const template = document.createElement('template');
        template.innerHTML = html;

        template.content.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach(el => el.remove());

        const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
        let node = walker.currentNode;
        while (node) {
            const el = node;
            Array.from(el.attributes || []).forEach(attr => {
                const name = attr.name.toLowerCase();
                const value = String(attr.value || '');
                if (name.startsWith('on')) {
                    el.removeAttribute(attr.name);
                    return;
                }
                if (name === 'href' || name === 'src') {
                    const v = value.trim().toLowerCase();
                    if (v.startsWith('javascript:')) {
                        el.removeAttribute(attr.name);
                    }
                }
            });
            node = walker.nextNode();
        }

        return template.innerHTML;
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function markdownToHtml(markdown) {
        const md = String(markdown || '').replace(/\r\n/g, '\n');

        const safeTokens = new Map([
            ['<u>', '__SAFE_U_OPEN__'],
            ['</u>', '__SAFE_U_CLOSE__'],
            ['<br>', '__SAFE_BR__'],
            ['<br/>', '__SAFE_BR__'],
            ['<br />', '__SAFE_BR__']
        ]);

        const applySafeTokens = (s) => {
            let out = s;
            for (const [k, v] of safeTokens.entries()) out = out.split(k).join(v);
            return out;
        };

        const restoreSafeTokens = (s) => {
            let out = s;
            for (const [k, v] of safeTokens.entries()) out = out.split(v).join(k);
            return out;
        };

        const renderInline = (raw) => {
            let text = applySafeTokens(raw);
            text = escapeHtml(text);
            text = restoreSafeTokens(text);

            text = text.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
            text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
            text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
                const href = String(url || '').trim();
                return `<a href="${escapeHtml(href)}">${label}</a>`;
            });

            return text;
        };

        const lines = md.split('\n');
        let html = '';
        let inCode = false;
        let codeBuffer = [];
        let listMode = null;
        let olIndex = 1;

        const closeList = () => {
            if (!listMode) return;
            html += listMode === 'ul' ? '</ul>' : '</ol>';
            listMode = null;
            olIndex = 1;
        };

        for (const line of lines) {
            const trimmed = line.trimEnd();

            if (inCode) {
                if (trimmed.startsWith('```')) {
                    html += `<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`;
                    inCode = false;
                    codeBuffer = [];
                } else {
                    codeBuffer.push(line);
                }
                continue;
            }

            if (trimmed.startsWith('```')) {
                closeList();
                inCode = true;
                codeBuffer = [];
                continue;
            }

            const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
            if (heading) {
                closeList();
                const level = heading[1].length;
                const content = renderInline(heading[2] || '');
                html += `<h${level}>${content}</h${level}>`;
                continue;
            }

            const ulItem = trimmed.match(/^[-*]\s+(.*)$/);
            if (ulItem) {
                if (listMode && listMode !== 'ul') closeList();
                if (!listMode) {
                    listMode = 'ul';
                    html += '<ul>';
                }
                html += `<li>${renderInline(ulItem[1] || '')}</li>`;
                continue;
            }

            const olItem = trimmed.match(/^(\d+)\.\s+(.*)$/);
            if (olItem) {
                if (listMode && listMode !== 'ol') closeList();
                if (!listMode) {
                    listMode = 'ol';
                    olIndex = 1;
                    html += '<ol>';
                }
                const content = renderInline(olItem[2] || '');
                html += `<li value="${olIndex}">${content}</li>`;
                olIndex += 1;
                continue;
            }

            if (trimmed.trim() === '') {
                closeList();
                html += '<div><br></div>';
                continue;
            }

            closeList();
            html += `<div>${renderInline(trimmed)}</div>`;
        }

        if (inCode) {
            html += `<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`;
        }

        closeList();
        return html;
    }

    function htmlToMarkdown(rootEl) {
        const root = rootEl;
        if (!root) return '';

        const normalizeText = (s) => String(s || '').replace(/\u200B/g, '');

        const nodeToMd = (node) => {
            if (!node) return '';
            if (node.nodeType === Node.TEXT_NODE) {
                return normalizeText(node.nodeValue);
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return '';

            const el = node;
            const tag = el.tagName.toLowerCase();

            const children = () => Array.from(el.childNodes).map(nodeToMd).join('');

            if (tag === 'br') return '\n';

            if (tag === 'pre') {
                const codeEl = el.querySelector('code');
                const text = normalizeText(codeEl ? codeEl.textContent : el.textContent);
                return `\n\`\`\`\n${text.replace(/\n$/, '')}\n\`\`\`\n`;
            }

            if (tag === 'code') {
                const text = normalizeText(el.textContent).replace(/\n/g, ' ');
                return `\`${text}\``;
            }

            if (tag === 'strong' || tag === 'b') {
                const text = children();
                if (!text.includes('\n')) return `**${text}**`;
                return text
                    .split('\n')
                    .map(line => (line.trim() === '' ? line : `**${line}**`))
                    .join('\n');
            }

            if (tag === 'em' || tag === 'i') {
                const text = children();
                if (!text.includes('\n')) return `*${text}*`;
                return text
                    .split('\n')
                    .map(line => (line.trim() === '' ? line : `*${line}*`))
                    .join('\n');
            }
            if (tag === 'u') return `<u>${children()}</u>`;

            if (tag === 'a') {
                const href = el.getAttribute('href') || '';
                return `[${children()}](${href})`;
            }

            if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
                const level = Number(tag.slice(1)) || 1;
                return `\n${'#'.repeat(level)} ${children().trim()}\n`;
            }

            if (tag === 'li') return children().trim();

            if (tag === 'ul') {
                const items = Array.from(el.children)
                    .filter(c => c.tagName && c.tagName.toLowerCase() === 'li')
                    .map(li => `- ${nodeToMd(li)}`)
                    .join('\n');
                return `\n${items}\n`;
            }

            if (tag === 'ol') {
                const items = Array.from(el.children)
                    .filter(c => c.tagName && c.tagName.toLowerCase() === 'li')
                    .map((li, idx) => `${idx + 1}. ${nodeToMd(li)}`)
                    .join('\n');
                return `\n${items}\n`;
            }

            if (tag === 'div' || tag === 'p') {
                const text = children();
                const isBlank = text.trim() === '' && el.querySelector('br');
                return isBlank ? '\n' : `${text}\n`;
            }

            return children();
        };

        const md = Array.from(root.childNodes).map(nodeToMd).join('');
        return md
            .replace(/[ \t]+\n/g, '\n')
            .trimEnd();
    }

    function execNoteEditorCommand(command, value = null) {
        if (!noteEditor) return false;

        const activeEl = document.activeElement;
        const sel = typeof window.getSelection === 'function' ? window.getSelection() : null;
        const selNode = sel && sel.anchorNode
            ? (sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement)
            : null;

        const selectionInside = (activeEl === noteEditor) || (selNode && noteEditor.contains(selNode));
        if (!selectionInside) return false;

        if (typeof document.execCommand === 'function') {
            noteEditor.focus();
            document.execCommand(command, false, value);
            return true;
        }

        return false;
    }

    function pastePlainIntoNoteEditor() {
        if (!noteEditor) return;

        const activeEl = document.activeElement;
        const sel = typeof window.getSelection === 'function' ? window.getSelection() : null;
        const selNode = sel && sel.anchorNode
            ? (sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement)
            : null;
        const selectionInside = (activeEl === noteEditor) || (selNode && noteEditor.contains(selNode));
        if (!selectionInside) return;

        if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') return;

        navigator.clipboard.readText()
            .then((text) => {
                if (typeof text !== 'string') return;

                let plain = String(text);
                plain = plain.replace(/[\u0000-\u001F\u007F]/g, '');
                const escapedForMarkdown = plain.replace(/[*`\[\]]/g, '\\$&');

                const ok = execNoteEditorCommand('insertText', escapedForMarkdown);
                if (!ok) {
                    execNoteEditorCommand(
                        'insertHTML',
                        escapeHtml(escapedForMarkdown).replace(/\n/g, '<br>')
                    );
                }
            })
            .catch(() => {
            });
    }

    function setNoteDirty(isDirty) {
        if (noteDirtyIndicator) {
            noteDirtyIndicator.style.opacity = isDirty ? '1' : '0';
        }
    }

    function clampFinderNoteWidth(width) {
        let w = Number(width);
        if (!Number.isFinite(w)) w = 200;
        if (w < 100) w = 100;
        if (w > 400) w = 400;
        return w;
    }

    function syncGridFinderToggleIcon() {
        if (!gridFinderToggleArrow) return;
        gridFinderToggleArrow.textContent = finderNoteCollapsed ? '❯' : '❮';
    }

    function setFinderNoteCollapsed(collapsed, options = {}) {
        if (!finderNote) return;
        finderNoteCollapsed = !!collapsed;

        if (finderNoteCollapsed) {
            const currentWidth = finderNote.offsetWidth || parseInt(finderNote.style.width || '', 10);
            if (Number.isFinite(currentWidth) && currentWidth > 0) {
                finderNoteExpandedWidth = clampFinderNoteWidth(currentWidth);
            }
            finderNote.classList.add('is-collapsed');
            finderNote.style.width = '0px';
        } else {
            finderNote.classList.remove('is-collapsed');
            finderNoteExpandedWidth = clampFinderNoteWidth(finderNoteExpandedWidth);
            finderNote.style.width = finderNoteExpandedWidth + 'px';
        }

        syncGridFinderToggleIcon();

        if (options.persist && window.utils && typeof window.utils.apiCall === 'function') {
            window.utils.apiCall('/api/save_config', {
                finder_note_open: !finderNoteCollapsed
            }, 'POST').catch(() => {});
        }
    }

    function ensureGridFinderToggle() {
        if (!gridFinder) return;
        if (gridFinderToggleButton && gridFinder.contains(gridFinderToggleButton)) {
            syncGridFinderToggleIcon();
            return;
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'finder-note-toggle';
        btn.setAttribute('aria-label', 'Alternar FinderNote');

        const arrow = document.createElement('span');
        arrow.className = 'finder-note-toggle-arrow';
        btn.appendChild(arrow);

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            setFinderNoteCollapsed(!finderNoteCollapsed, { persist: true });
        });

        gridFinder.appendChild(btn);
        gridFinderToggleButton = btn;
        gridFinderToggleArrow = arrow;
        syncGridFinderToggleIcon();
    }

    function ensureNoteEditor() {
        if (!finderNote || noteEditor) return;

        finderNote.innerHTML = '';

        const editor = document.createElement('div');
        editor.className = 'finder-note-editor';
        editor.contentEditable = 'true';
        editor.setAttribute('role', 'textbox');
        editor.setAttribute('aria-multiline', 'true');
        editor.spellcheck = true;
        finderNote.appendChild(editor);

        const dirtyIndicator = document.createElement('div');
        dirtyIndicator.className = 'finder-note-dirty-indicator';
        finderNote.appendChild(dirtyIndicator);

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'finder-note-resize-handle';
        finderNote.appendChild(resizeHandle);

        noteEditor = editor;
        noteDirtyIndicator = dirtyIndicator;
        setNoteDirty(false);
        setFinderNoteCollapsed(finderNoteCollapsed);

        if (
            !noteMenuListenerAttached &&
            window.__TAURI__ &&
            window.__TAURI__.event &&
            typeof window.__TAURI__.event.listen === 'function'
        ) {
            noteMenuListenerAttached = true;
            window.__TAURI__.event.listen('finder-note-command', (event) => {
                const cmd = event && event.payload;
                if (cmd === 'pastePlain') {
                    pastePlainIntoNoteEditor();
                } else if (cmd === 'bold') {
                    execNoteEditorCommand('bold');
                } else if (cmd === 'italic') {
                    execNoteEditorCommand('italic');
                } else if (cmd === 'underline') {
                    execNoteEditorCommand('underline');
                } else if (cmd === 'insertUnorderedList') {
                    execNoteEditorCommand('insertUnorderedList');
                } else if (cmd === 'insertOrderedList') {
                    execNoteEditorCommand('insertOrderedList');
                }
            });
        }

        editor.addEventListener('keydown', (e) => {
            const mod = e.metaKey || e.ctrlKey;
            if (!mod) return;

            if (mod && e.shiftKey && !e.altKey && (e.key === 'v' || e.key === 'V')) {
                if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
                    e.preventDefault();
                    e.stopPropagation();
                    pastePlainIntoNoteEditor();
                }
                return;
            }

            if (mod && !e.shiftKey && !e.altKey && (e.key === 'b' || e.key === 'B')) {
                e.preventDefault();
                e.stopPropagation();
                execNoteEditorCommand('bold');
                return;
            }

            if (mod && !e.shiftKey && !e.altKey && (e.key === 'i' || e.key === 'I')) {
                e.preventDefault();
                e.stopPropagation();
                execNoteEditorCommand('italic');
                return;
            }

            if (mod && !e.shiftKey && !e.altKey && (e.key === 'u' || e.key === 'U')) {
                e.preventDefault();
                e.stopPropagation();
                execNoteEditorCommand('underline');
                return;
            }

            if (mod && !e.shiftKey && !e.altKey && (e.key === 'l' || e.key === 'L')) {
                e.preventDefault();
                e.stopPropagation();
                execNoteEditorCommand('insertUnorderedList');
                return;
            }

            if (mod && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                e.stopPropagation();
                execNoteEditorCommand('insertOrderedList');
                return;
            }
        });

        editor.addEventListener('input', () => {
            if (!noteCurrentFolder || !window.utils || typeof window.utils.apiCall !== 'function') return;

            if (noteSaveTimeout) clearTimeout(noteSaveTimeout);
            const content = htmlToMarkdown(noteEditor);
            setNoteDirty(content !== noteLastSaved);

            noteSaveTimeout = setTimeout(async () => {
                if (!noteCurrentFolder) return;
                if (content === noteLastSaved) return;

                const folder = noteCurrentFolder;
                const result = await window.utils.apiCall(
                    `/api/work_note/${encodeURIComponent(folder)}`,
                    { content },
                    'POST'
                );

                if (result && result.status === 'success') {
                    noteLastSaved = content;
                    setNoteDirty(false);
                }
            }, 300);
        });
    }

    function clearWorkNote() {
        noteCurrentFolder = null;
        noteLoadSeq++;
        if (noteSaveTimeout) clearTimeout(noteSaveTimeout);
        if (noteEditor) {
            noteEditor.innerHTML = '';
        }
        noteLastSaved = '';
        setNoteDirty(false);
    }

    async function loadWorkNote(folderName) {
        ensureNoteEditor();
        if (!noteEditor || !window.utils || typeof window.utils.apiCall !== 'function') return;

        noteCurrentFolder = folderName;
        if (noteSaveTimeout) clearTimeout(noteSaveTimeout);

        const seq = ++noteLoadSeq;
        noteEditor.innerHTML = '';

        const result = await window.utils.apiCall(
            `/api/work_note/${encodeURIComponent(folderName)}`,
            null,
            'GET'
        );

        if (seq !== noteLoadSeq) return;

        const content = result && result.status === 'success' && typeof result.content === 'string'
            ? result.content
            : '';

        const html = markdownToHtml(content);
        noteEditor.innerHTML = sanitizeHtml(html);

        noteLastSaved = content;
        setNoteDirty(false);
    }

    async function initFinderNoteWidth() {
        ensureNoteEditor();
        if (!finderNote || !window.utils || typeof window.utils.apiCall !== 'function') return;

        try {
            const result = await window.utils.apiCall('/api/config', null, 'GET');
            if (result && result.status === 'success' && result.config) {
                let width = result.config.finder_note_width;
                const isOpen = result.config.finder_note_open;
                if (typeof width !== 'number' || Number.isNaN(width)) {
                    width = 200;
                }
                width = clampFinderNoteWidth(width);
                finderNoteExpandedWidth = width;
                finderNote.style.width = width + 'px';
                if (typeof isOpen === 'boolean') {
                    setFinderNoteCollapsed(!isOpen);
                } else {
                    setFinderNoteCollapsed(false);
                }
            } else {
                finderNote.style.width = '200px';
                finderNoteExpandedWidth = 200;
                setFinderNoteCollapsed(false);
            }
        } catch (_) {
            finderNote.style.width = '200px';
            finderNoteExpandedWidth = 200;
            setFinderNoteCollapsed(false);
        }
    }

    function setupFinderNoteResize() {
        ensureNoteEditor();
        if (!finderNote) return;

        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        let lastWidth = 200;

        const resizeHandle = finderNote.querySelector('.finder-note-resize-handle');
        if (!resizeHandle) return;

        const onMouseDown = (e) => {
            if (e.button !== 0) return;
            isResizing = true;
            startX = e.clientX;
            startWidth = finderNote.offsetWidth;
            lastWidth = startWidth;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (!isResizing) return;
            const delta = e.clientX - startX;
            let newWidth = startWidth + delta;
            if (newWidth < 100) newWidth = 100;
            if (newWidth > 400) newWidth = 400;
            finderNote.style.width = newWidth + 'px';
            lastWidth = newWidth;
            finderNoteExpandedWidth = newWidth;
        };

        const onMouseUp = async () => {
            if (!isResizing) return;
            isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            if (!window.utils || typeof window.utils.apiCall !== 'function') return;
            try {
                await window.utils.apiCall('/api/save_config', {
                    finder_note_width: lastWidth,
                    finder_note_open: !finderNoteCollapsed
                }, 'POST');
            } catch (_) {
            }
        };

        resizeHandle.addEventListener('mousedown', onMouseDown);
    }

    initFinderNoteWidth();
    setupFinderNoteResize();
    ensureGridFinderToggle();

    async function loadFiles(folderName, updateHistory = true) {
        if (!workGrid || !gridFinder) return;

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

        const activeGrid = isRoot ? workGrid : gridFinder;
        
        // Guardar posición de scroll si estamos refrescando la misma carpeta
        const previousFolder = activeGrid.getAttribute('data-current-folder');
        let previousScroll = 0;
        if (previousFolder === folderName) {
            previousScroll = activeGrid.scrollTop;
        }

        // Configurar visibilidad
        if (isRoot) {
            workGrid.style.display = 'flex';
            gridFinder.style.display = 'none';
            if (libraryFinderRow) libraryFinderRow.style.display = 'none';
            clearWorkNote();
            if (finderNote) {
                finderNote.style.display = 'none';
            }
            if (gridFinderToggleButton) {
                gridFinderToggleButton.style.display = 'none';
            }
        } else {
            workGrid.style.display = 'none';
            gridFinder.style.display = 'grid';
            if (libraryFinderRow) libraryFinderRow.style.display = 'flex';
        }

        activeGrid.setAttribute('data-current-folder', folderName);
        activeGrid.innerHTML = '';
        if (activeGrid === gridFinder) {
            ensureGridFinderToggle();
        }
        
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

        const files = Array.isArray(data.files) ? data.files : [];

        // Nota siempre asociada a la carpeta de trabajo raíz (Cliente/Trabajo),
        // aunque naveguemos dentro de subcarpetas en el grid-finder.
        if (!isRoot && finderNote) {
            const partsForNote = folderName.split('/');
            if (partsForNote.length >= 2) {
                const noteFolder = `${partsForNote[0]}/${partsForNote[1]}`;
                finderNote.style.display = 'flex';
                if (gridFinderToggleButton) {
                    gridFinderToggleButton.style.display = '';
                }
                loadWorkNote(noteFolder);
            }
        }

        if (files.length === 0) {
            activeGrid.classList.add('is-empty');
            activeGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📂</div>
                    <div class="empty-text">todo vacío por aquí</div>
                </div>
            `;
            if (activeGrid === gridFinder) {
                ensureGridFinderToggle();
            }
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
        item.setAttribute('data-is-dir', file.is_dir);
        
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
            loadFiles(e.detail.path, false);
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
        const activeGrid = workGrid.style.display !== 'none' ? workGrid : gridFinder;
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
        const activeGrid = workGrid.style.display !== 'none' ? workGrid : gridFinder;
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

        const activeEl = document.activeElement;
        const isEditingText = !!activeEl && (
            activeEl.isContentEditable ||
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName) ||
            (noteEditor && noteEditor.contains(activeEl))
        );
        if (isEditingText) return;

        // Obtener el path actual del grid visible
        const activeGrid = workGrid.style.display !== 'none' ? workGrid : gridFinder;
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
