/**
 * ui-layout.js
 * Modulo dedicato alla gestione dei Layout Visivi (Temi, Drawer laterale, Preferenze).
 * FIX TOC: Agganciato il motore ScrollSpy all'evento di scorrimento del documento.
 * FEATURE DRAWER HISTORY: Sistema a Stack per tornare indietro tra i pannelli laterali nidificati.
 * FIX INFINITE LOOP: Corretta l'estrazione fisica dei nodi dal DOM nello Stack.
 * FEAT UX DRAWER: Iniezione controlli avanzati X-Ray e Docking per non oscurare l'editor.
 */

Object.assign(UI, {
    _drawerStack: [],

    openDrawer: (titleHTML, bodyHTML, footerHTML, skipStack = false) => {
        clearTimeout(UI._drawerCloseTimer);

        if (!UI._drawerStack) UI._drawerStack = [];

        const drawer = document.getElementById('advGlobalDrawer');
        const title = document.getElementById('advDrawerTitle');
        const body = document.getElementById('advDrawerBody');
        const footer = document.getElementById('advDrawerFooter');

        if (drawer && title && body && footer) {
            
            // Creiamo un div temporaneo per estrarre il testo puro dai titoli, usato per i controlli logici
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = titleHTML;
            const newTitleText = tempDiv.innerText.trim();
            const currentTitleText = title.innerText.trim();

            // Euristica 1: Se il titolo testuale è identico, il pannello si sta solo auto-aggiornando
            const isSamePanel = currentTitleText === newTitleText;

            // Euristica 2: Riconoscimento intelligente del tasto "Annulla" personalizzato dei moduli
            let isManualBack = false;
            if (UI._drawerStack.length > 0) {
                const prevStackTitleText = UI._drawerStack[UI._drawerStack.length - 1].titleText;
                if (newTitleText === prevStackTitleText) {
                    isManualBack = true;
                    UI._drawerStack.pop(); 
                }
            }

            // Salvataggio nello stack dei Nodi Fisici (Preserva eventi e scroll)
            if (drawer.classList.contains('open') && !skipStack && !isSamePanel && !isManualBack) {
                const bodyChildren = [];
                // Rimuove fisicamente il nodo dal DOM dopo averlo salvato in RAM
                while (body.firstChild) { 
                    bodyChildren.push(body.firstChild);
                    body.removeChild(body.firstChild);
                }
                
                const footerChildren = [];
                while (footer.firstChild) { 
                    footerChildren.push(footer.firstChild);
                    footer.removeChild(footer.firstChild);
                }

                UI._drawerStack.push({
                    titleHTML: title.innerHTML,
                    titleText: currentTitleText,
                    bodyNodes: bodyChildren,
                    footerNodes: footerChildren,
                    scrollTop: body.scrollTop
                });
            } else if (!drawer.classList.contains('open')) {
                UI._drawerStack = [];
            }

            title.innerHTML = titleHTML;
            body.innerHTML = bodyHTML;
            footer.innerHTML = footerHTML || '';
            footer.style.display = footerHTML ? 'flex' : 'none';

            // --- INIEZIONE CONTROLLI AVANZATI DRAWER (DOCK & GHOST) ---
            let headerContainer = title.parentElement;
            let controlsGroup = document.getElementById('advDrawerControls');
            
            if (!controlsGroup) {
                controlsGroup = document.createElement('div');
                controlsGroup.id = 'advDrawerControls';
                controlsGroup.style.display = 'flex';
                controlsGroup.style.alignItems = 'center';
                controlsGroup.style.gap = '8px';

                // Tasto Ghost Mode (Occhio)
                const ghostBtn = document.createElement('button');
                ghostBtn.id = 'advDrawerGhostBtn';
                ghostBtn.className = 'adv-icon-btn';
                ghostBtn.innerHTML = typeof Icons !== 'undefined' ? Icons.eye : '👁';
                ghostBtn.title = 'Modalità X-Ray (Scompare temporaneamente)';
                ghostBtn.onclick = UI.toggleDrawerGhost;

                // Tasto Spostamento Laterale (Dock)
                const dockBtn = document.createElement('button');
                dockBtn.id = 'advDrawerDockBtn';
                dockBtn.className = 'adv-icon-btn';
                const isDockRight = localStorage.getItem('pronotes_drawer_dock') === 'right';
                if (isDockRight) drawer.classList.add('dock-right');
                
                dockBtn.innerHTML = isDockRight 
                    ? '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M15 18l-6-6 6-6"/></svg>' 
                    : '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M9 18l6-6-6-6"/></svg>';
                dockBtn.title = 'Sposta il pannello a Destra/Sinistra';
                dockBtn.onclick = UI.toggleDrawerDock;

                // Spostiamo il tasto di chiusura nativo dentro il gruppo per mantenerli allineati
                const closeBtn = headerContainer.querySelector('.close-modal-btn:not(#advDrawerBackBtn)');
                
                controlsGroup.appendChild(ghostBtn);
                controlsGroup.appendChild(dockBtn);
                
                if (closeBtn) {
                    const sep = document.createElement('div');
                    sep.style.width = '1px'; sep.style.height = '16px'; sep.style.background = 'var(--border-color)';
                    sep.style.margin = '0 5px';
                    controlsGroup.appendChild(sep);
                    controlsGroup.appendChild(closeBtn);
                }
                
                headerContainer.appendChild(controlsGroup);
            }

            // Gestione automatica visibilità e iniezione della Freccia "Back"
            let backBtn = document.getElementById('advDrawerBackBtn');
            if (UI._drawerStack.length > 0) {
                if (!backBtn) {
                    backBtn = document.createElement('button');
                    backBtn.id = 'advDrawerBackBtn';
                    backBtn.className = 'close-modal-btn';
                    backBtn.innerHTML = typeof Icons !== 'undefined' ? Icons.arrowLeft : '←';
                    backBtn.title = 'Torna Indietro';
                    backBtn.style.marginRight = '8px';
                    backBtn.style.padding = '2px 6px';
                    backBtn.style.display = 'inline-flex';
                    backBtn.style.alignItems = 'center';
                    backBtn.onclick = UI.goBackDrawer;
                    
                    // Inserisce prima del titolo
                    headerContainer.insertBefore(backBtn, title);
                }
                backBtn.style.display = 'inline-flex';
            } else {
                if (backBtn) backBtn.style.display = 'none';
            }

            // Se il drawer in precedenza era in ghost mode, forza lo sblocco per mostrare i nuovi dati
            if (drawer.classList.contains('ghost-mode')) {
                UI.toggleDrawerGhost();
            }

            drawer.style.boxShadow = '5px 0 15px rgba(0, 0, 0, 0.1)';
            drawer.classList.add('open');
        }
    },

    goBackDrawer: () => {
        if (!UI._drawerStack || UI._drawerStack.length === 0) return;

        const prevState = UI._drawerStack.pop();

        const title = document.getElementById('advDrawerTitle');
        const body = document.getElementById('advDrawerBody');
        const footer = document.getElementById('advDrawerFooter');

        title.innerHTML = prevState.titleHTML;
        body.innerHTML = '';
        prevState.bodyNodes.forEach(n => body.appendChild(n));
        body.scrollTop = Math.max(0, prevState.scrollTop);

        footer.innerHTML = '';
        prevState.footerNodes.forEach(n => footer.appendChild(n));
        footer.style.display = prevState.footerNodes.length > 0 ? 'flex' : 'none';

        const backBtn = document.getElementById('advDrawerBackBtn');
        if (backBtn) {
            backBtn.style.display = UI._drawerStack.length > 0 ? 'inline-flex' : 'none';
        }

        const drawer = document.getElementById('advGlobalDrawer');
        if (drawer && drawer.classList.contains('ghost-mode')) {
            UI.toggleDrawerGhost();
        }

        // Segnale globale inviato all'applicazione per permettere ai sottomoduli di rinfrescare dati stantii
        document.dispatchEvent(new CustomEvent('drawer-restored', { detail: { titleText: prevState.titleText } }));
    },

    closeDrawer: () => {
        const drawer = document.getElementById('advGlobalDrawer');
        if (drawer) {
            drawer.classList.remove('open');
            UI._drawerStack = []; 
            const backBtn = document.getElementById('advDrawerBackBtn');
            if (backBtn) backBtn.style.display = 'none';
            
            // Assicurati che alla chiusura venga disattivato il ghost mode per non trovare sorprese la volta successiva
            if (drawer.classList.contains('ghost-mode')) {
                UI.toggleDrawerGhost();
            }

            if (typeof UI.Menu !== 'undefined') UI.Menu.closeAll(true); 
            UI._drawerCloseTimer = setTimeout(() => {
                document.getElementById('advDrawerBody').innerHTML = '';
                document.getElementById('advDrawerFooter').innerHTML = '';
                drawer.style.boxShadow = '5px 0 15px rgba(0, 0, 0, 0.1)';
            }, 300);
        }
    },

    toggleMainMenu: () => {
        const menu = document.getElementById('mainMenuDropdown');
        if (menu) {
            // FIX UX: JIT Calculation per il Badge Cestino
            const trashCount = AppState.notes ? AppState.notes.filter(n => n.deletedAt).length : 0;
            const menuItems = Array.from(menu.querySelectorAll('.menu-item'));
            const trashItem = menuItems.find(el => el.innerHTML.includes('Cestino'));
            
            if (trashItem) {
                let badge = trashItem.querySelector('.menu-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'menu-badge';
                    badge.style.cssText = 'background:var(--danger-color); color:white; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:10px; margin-left:auto;';
                    // Assicuriamo che l'elemento diventi un flex container corretto per posizionare il badge a destra
                    trashItem.style.display = 'flex';
                    trashItem.style.alignItems = 'center';
                    trashItem.appendChild(badge);
                }
                if (trashCount > 0) {
                    badge.innerText = trashCount;
                    badge.style.display = 'inline-block';
                } else {
                    badge.style.display = 'none';
                }
            }

            menu.classList.toggle('hidden');
        }
    },

    toggleContinuousEdit: () => {
        AppState.continuousEditMode = !AppState.continuousEditMode;

        const icon = document.getElementById('continuousEditIcon');
        if (icon) {
            icon.innerHTML = AppState.continuousEditMode ? Icons.checkSquare : Icons.square;
            icon.style.color = AppState.continuousEditMode ? 'var(--accent-color)' : '';
        }

        if (AppState.continuousEditMode && AppState.currentNoteId) {
            UI.toggleEditMode(true);
        }

        // Salvataggio permanente nelle preferenze del browser
        localStorage.setItem('pronotes_continuous', AppState.continuousEditMode);
    },

    toggleWordWrap: () => {
        AppState.noWrapMode = !AppState.noWrapMode;
        const editor = document.getElementById('noteContent');

        const icon = document.getElementById('wordWrapIcon');
        if (icon) {
            icon.innerHTML = AppState.noWrapMode ? Icons.checkSquare : Icons.square;
            icon.style.color = AppState.noWrapMode ? 'var(--accent-color)' : '';
        }

        if (editor) {
            if (AppState.noWrapMode) editor.classList.add('no-wrap');
            else editor.classList.remove('no-wrap');
        }

        localStorage.setItem('pronotes_nowrap', AppState.noWrapMode);
    },

    togglePageWidth: () => {
        const docRoot = document.documentElement;
        const currentWidth = docRoot.style.getPropertyValue('--page-max-width');
        
        let isFullWidth = currentWidth === '100%';
        let newWidth = isFullWidth ? '900px' : '100%';
        
        docRoot.style.setProperty('--page-max-width', newWidth);
        localStorage.setItem('pronotes_pagewidth', newWidth);
        
        const icon = document.getElementById('pageWidthIcon');
        const text = document.getElementById('pageWidthBtn');
        if (icon) {
            icon.innerHTML = !isFullWidth ? Icons.widthFull : Icons.widthFit;
        }
        if (text) {
            text.innerText = !isFullWidth ? 'Larghezza: Intera' : 'Larghezza: Standard';
        }
    },

    changeFontSize: (delta) => {
        UI.currentFontSize += delta;
        if (UI.currentFontSize < 10) UI.currentFontSize = 10;
        if (UI.currentFontSize > 32) UI.currentFontSize = 32;
        document.documentElement.style.setProperty('--reading-font-size', UI.currentFontSize + 'px');
        localStorage.setItem('pronotes_fontsize', UI.currentFontSize);
        if (typeof UI.Minimap !== 'undefined') UI.Minimap.sync(); 
    },

    setTheme: (themeName) => {
        const body = document.body;
        body.removeAttribute('data-theme');

        if (themeName !== 'light') {
            body.setAttribute('data-theme', themeName);
        }
        localStorage.setItem('theme', themeName);

        const chkLight = document.getElementById('theme-light-check');
        const chkWhite = document.getElementById('theme-white-check');
        const chkDark = document.getElementById('theme-dark-check');
        const chkNotionDark = document.getElementById('theme-notion-dark-check');
        const chkPastel = document.getElementById('theme-pastel-check');

        if (chkLight) chkLight.textContent = themeName === 'light' ? '✓' : '';
        if (chkWhite) chkWhite.textContent = themeName === 'white' ? '✓' : '';
        if (chkDark) chkDark.textContent = themeName === 'dark' ? '✓' : '';
        if (chkNotionDark) chkNotionDark.textContent = themeName === 'notion-dark' ? '✓' : '';
        if (chkPastel) chkPastel.textContent = themeName === 'pastel' ? '✓' : '';
    },

    // Toggle Sidebar. Attivo quando visibile.
    toggleSidebar: () => { 
        const sb = document.getElementById('sidebar'); 
        const btn = document.getElementById('sidebarToggleBtn'); 
        if (sb) {
            const isCollapsed = sb.classList.toggle('collapsed'); 
            if (btn) {
                if (isCollapsed) btn.classList.remove('active');
                else btn.classList.add('active');
            }
        }
    },

    showEditor: (show) => {
        const emptyState = document.getElementById('emptyState');
        const editorWrapper = document.getElementById('editorWrapper');
        const onboardingView = document.getElementById('onboardingView');
        const readModeView = document.getElementById('readModeView');
        const homeDocView = document.getElementById('homeDocumentView');
        const contextActions = document.getElementById('noteContextActions');

        const aliveNotes = AppState.notes.filter(n => !n.deletedAt);

        if (show) {
            if (emptyState) emptyState.classList.add('hidden');
            if (emptyState) emptyState.classList.remove('onboarding-state');
            if (emptyState) emptyState.classList.remove('home-dashboard-state');
            if (editorWrapper) editorWrapper.classList.remove('hidden');
            if (contextActions) contextActions.classList.remove('hidden');
        } else {
            if (editorWrapper) editorWrapper.classList.add('hidden');
            if (emptyState) emptyState.classList.remove('hidden');
            if (contextActions) contextActions.classList.add('hidden');

            if (aliveNotes.length === 0) {
                if (emptyState) emptyState.classList.add('onboarding-state');
                if (emptyState) emptyState.classList.remove('home-dashboard-state');
                if (onboardingView) onboardingView.classList.remove('hidden');
                if (readModeView) readModeView.classList.add('hidden');
                if (homeDocView) homeDocView.classList.add('hidden');
            } else {
                if (emptyState) emptyState.classList.remove('onboarding-state');
                if (emptyState) emptyState.classList.add('home-dashboard-state');
                if (onboardingView) onboardingView.classList.add('hidden');
                if (readModeView) readModeView.classList.add('hidden');
                if (homeDocView) homeDocView.classList.remove('hidden');
                if (typeof CitationManager !== 'undefined') {
                    CitationManager.renderHomeCitations();
                    if (typeof WidgetManager !== 'undefined') setTimeout(() => WidgetManager.mountAll(), 100);
                }
            }
        }
    },

    closeEditor: () => { 
        AppState.currentNoteId = null; 
        UI.showEditor(false); 
    },

    toggleEditMode: (forceState = null) => {
        if (!AppState.currentNoteId) return;

        const newState = forceState !== null ? forceState : !AppState.isEditMode;
        
        if (AppState.isEditMode && !newState && !AppState.isSwitchingNote) {
            if (typeof Editor !== 'undefined') Editor.sanitizeContent();
        }
        
        AppState.isEditMode = newState;

        const titleInput = document.getElementById('noteTitle');
        const contentDiv = document.getElementById('noteContent');
        const toolbar = document.getElementById('editorToolbar');
        const toggleBtn = document.getElementById('editToggleBtn');
        const editorWrapper = document.getElementById('editorWrapper');

        if (!titleInput || !contentDiv || !toolbar || !toggleBtn) return;

        if (typeof Editor !== 'undefined') Editor._ensureLastLineBreak(contentDiv);

        if (AppState.isEditMode) {
            if (editorWrapper) editorWrapper.classList.remove('read-mode');

            if (typeof Editor !== 'undefined') Editor.cleanHighlightsBeforeSave();

            titleInput.removeAttribute('readonly');
            contentDiv.setAttribute('contenteditable', 'true');
            
            contentDiv.querySelectorAll('.checklist-text, .journal-content, .adv-cell-text, pre.code-content, .snippet-text, .widget-editable-area').forEach(el => el.setAttribute('contenteditable', 'true'));
            contentDiv.querySelectorAll('.adv-checklist input[type="checkbox"]').forEach(el => el.removeAttribute('disabled'));

            toolbar.classList.remove('hidden');
            toggleBtn.innerHTML = `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.checkCircle} Salva</span>`;
            toggleBtn.classList.add('btn-editing');

            if (typeof Editor !== 'undefined' && Editor.updateToolbarFormatting) {
                Editor.updateToolbarFormatting();
            }
        } else {
            if (editorWrapper) editorWrapper.classList.add('read-mode');

            titleInput.setAttribute('readonly', 'true');
            contentDiv.setAttribute('contenteditable', 'false');
            
            contentDiv.querySelectorAll('[contenteditable="true"]').forEach(el => el.setAttribute('contenteditable', 'false'));
            contentDiv.querySelectorAll('.adv-checklist input[type="checkbox"]').forEach(el => el.setAttribute('disabled', 'true'));

            toolbar.classList.add('hidden');
            toggleBtn.innerHTML = `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.edit} Modifica</span>`;
            toggleBtn.classList.remove('btn-editing');

            if (typeof TableManager !== 'undefined') {
                TableManager.hideMenus();
                TableManager.hideTriggers();
            }
            if (typeof UI.Menu !== 'undefined') UI.Menu.closeAll();
        }

        if (typeof WidgetManager !== 'undefined') {
            WidgetManager.mountAll(document.getElementById('noteContent'));
        }

        if (!AppState.isSwitchingNote) {
            const isManualSaveEvent = !AppState.isEditMode && forceState === null;
            if (typeof Store !== 'undefined') Store.triggerAutoSave(true, isManualSaveEvent); 
        }

        if (typeof TemplateManager !== 'undefined') {
            TemplateManager.toggleEmptyOverlay();
        }
        
        setTimeout(() => {
            if (AppState.showMinimap && typeof UI.Minimap !== 'undefined') UI.Minimap.sync();
        }, 100);
    },

    loadPreferences: () => {
        const savedSize = localStorage.getItem('pronotes_fontsize');
        if (savedSize) {
            UI.currentFontSize = parseInt(savedSize);
            document.documentElement.style.setProperty('--reading-font-size', UI.currentFontSize + 'px');
        }

        const savedNoWrap = localStorage.getItem('pronotes_nowrap');
        if (savedNoWrap === 'true') {
            AppState.noWrapMode = true;
            const editor = document.getElementById('noteContent');
            if (editor) editor.classList.add('no-wrap');

            const icon = document.getElementById('wordWrapIcon');
            if (icon) {
                icon.innerHTML = Icons.checkSquare;
                icon.style.color = 'var(--accent-color)';
            }
        }
        
        // Recupero l'impostazione dell'Edit Continuo dal Local Storage
        const savedContinuous = localStorage.getItem('pronotes_continuous');
        if (savedContinuous === 'true') {
            AppState.continuousEditMode = true;
            const icon = document.getElementById('continuousEditIcon');
            if (icon) {
                icon.innerHTML = Icons.checkSquare;
                icon.style.color = 'var(--accent-color)';
            }
        }

        const savedPageWidth = localStorage.getItem('pronotes_pagewidth');
        if (savedPageWidth) {
            document.documentElement.style.setProperty('--page-max-width', savedPageWidth);
            const icon = document.getElementById('pageWidthIcon');
            const text = document.getElementById('pageWidthBtn');
            if (icon) icon.innerHTML = savedPageWidth === '100%' ? Icons.widthFull : Icons.widthFit;
            if (text) text.innerText = savedPageWidth === '100%' ? 'Larghezza: Intera' : 'Larghezza: Standard';
        }

        const savedMinimap = localStorage.getItem('pronotes_minimap');
        if (savedMinimap === 'true' && typeof UI.Minimap !== 'undefined') {
            UI.Minimap.toggle();
        }

        if (typeof UI.Minimap !== 'undefined') {
            UI.Minimap.initDrag();
        }

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (AppState.showMinimap && typeof UI.Minimap !== 'undefined') UI.Minimap.sync();
            }, 150);
        });

        const savedTheme = localStorage.getItem('theme') || 'light';
        UI.setTheme(savedTheme);

        document.addEventListener('mousedown', (e) => {
            if (e.target.closest('.toolbar') || e.target.closest('.color-dropdown') || e.target.closest('.list-options-dropdown') || e.target.closest('.adv-dropdown')) {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
                e.preventDefault();
                if (typeof Editor !== 'undefined') Editor.saveSelection();
            }
        });

        document.addEventListener('click', (e) => {
            const menu = document.getElementById('mainMenuDropdown');
            const btn = e.target.closest('.main-menu-btn');
            if (menu && !menu.classList.contains('hidden') && !btn && !menu.contains(e.target)) {
                menu.classList.add('hidden');
            }

            const drawer = document.getElementById('advGlobalDrawer');
            if (drawer && drawer.classList.contains('open') &&
                !e.target.closest('.adv-drawer') && !e.target.closest('.adv-icon-btn') &&
                !e.target.closest('.adv-dropdown') && !e.target.closest('.adv-dropdown-item') &&
                !e.target.closest('.inline-note-marker') && !e.target.closest('.btn-color-swatch') &&
                !e.target.closest('.toolbar button')) {

                const footer = document.getElementById('advDrawerFooter');
                const hasSaveBtn = footer && footer.style.display !== 'none' && footer.querySelector('.btn-primary');

                if (hasSaveBtn) {
                    drawer.style.boxShadow = 'inset 0 0 0 2px var(--danger-color), 0 0 20px rgba(239, 68, 68, 0.4)';
                    setTimeout(() => drawer.style.boxShadow = '5px 0 15px rgba(0, 0, 0, 0.1)', 300);
                    return;
                }
                UI.closeDrawer();
            }

            if (!e.target.closest('.color-picker-group') && !e.target.closest('.adv-dropdown') && !e.target.closest('.list-options-dropdown')) {
                if (typeof UI.Menu !== 'undefined') UI.Menu.closeAll(false);
            }
        }, true);

        // ASCOLTATORE SCROLL PRINCIPALE (Aggancio per TOC e Minimappa)
        const editorScrollArea = document.getElementById('editorScrollContent');
        if (editorScrollArea) {
            editorScrollArea.addEventListener('scroll', () => {
                if (AppState.currentNoteId && !AppState.isSwitchingNote) {
                    const currentNote = Store.getNote(AppState.currentNoteId);
                    if (currentNote) currentNote._lastScroll = editorScrollArea.scrollTop;
                }
                if (typeof UI.Minimap !== 'undefined') UI.Minimap.updateViewport();
                if (typeof UI.updateTOCScrollSpy === 'function') UI.updateTOCScrollSpy();
            });
        }

        UI.initCustomTooltips();
        UI.showEditor(false);
        if (typeof UI.Alarm !== 'undefined') UI.Alarm.init(); 
    },

    initCustomTooltips: () => {
        const tooltipEl = document.getElementById('advCustomTooltip');
        if (!tooltipEl) return;

        let activeTarget = null;
        let observer = null;

        const hideTooltip = () => {
            tooltipEl.style.opacity = '0';
            activeTarget = null;
            if (observer) { observer.disconnect(); observer = null; }
        };

        document.addEventListener('mouseover', (e) => {
            let target = null;
            let htmlText = '';
            
            if (e.target.closest('.inline-note-marker')) {
                target = e.target.closest('.inline-note-marker');
                const wrapper = target.closest('.inline-note-wrapper');
                if (wrapper) {
                    const dataSpan = wrapper.querySelector('.inline-note-data');
                    if (dataSpan) htmlText = dataSpan.innerHTML;
                }
                if (!htmlText) htmlText = target.getAttribute('data-tooltip') || '';
            } 
            else if (e.target.closest('a')) {
                target = e.target.closest('a');
                
                if (target.hasAttribute('title')) {
                    target.removeAttribute('title');
                }
                
                const userNote = target.getAttribute('data-link-note') || '';
                let pathInfo = target.getAttribute('href') || '';
                
                if (target.classList.contains('file-link')) {
                    pathInfo = target.getAttribute('data-file-path') || '';
                } else if (target.classList.contains('internal-link')) {
                    pathInfo = 'Nota Interna (Workspace)';
                } else {
                    pathInfo = pathInfo.replace(/^https?:\/\/file:\/\/\//i, 'file:///');
                }

                let displayPathInfo = pathInfo;
                if (displayPathInfo && displayPathInfo.length > 50) {
                    const half = 22;
                    displayPathInfo = displayPathInfo.substring(0, half) + '...' + displayPathInfo.substring(displayPathInfo.length - half);
                }

                if (userNote) {
                    htmlText = `<b>Note:</b> ${userNote}<br><span style="opacity:0.6; font-size:0.75rem; margin-top:4px; display:block;">[ Path: ${displayPathInfo} ]</span>`;
                } else if (displayPathInfo && displayPathInfo !== '#' && displayPathInfo !== 'Nota Interna (Workspace)') {
                    htmlText = `<span style="font-size:0.85rem; word-break: break-all;">${displayPathInfo}</span>`;
                }
            } 
            else if (e.target.closest('[data-tooltip]')) {
                target = e.target.closest('[data-tooltip]');
                htmlText = target.getAttribute('data-tooltip') || '';
            }

            if (!target || !htmlText) {
                clearTimeout(UI.tooltipTimeout);
                hideTooltip();
                return;
            }

            activeTarget = target;

            if (observer) observer.disconnect();
            observer = new MutationObserver(() => {
                if (!document.body.contains(activeTarget)) hideTooltip();
            });
            observer.observe(document.body, { childList: true, subtree: true });

            UI.tooltipTimeout = setTimeout(() => {
                if (!document.body.contains(target)) return;

                tooltipEl.innerHTML = htmlText; 
                const rect = target.getBoundingClientRect();

                let topPos = rect.top - tooltipEl.offsetHeight - 10;
                let leftPos = rect.left + (rect.width / 2) - (tooltipEl.offsetWidth / 2);

                if (topPos < 0) topPos = rect.bottom + 10;
                if (leftPos < 10) leftPos = 10;
                if (leftPos + tooltipEl.offsetWidth > window.innerWidth - 10) leftPos = window.innerWidth - tooltipEl.offsetWidth - 10;

                tooltipEl.style.top = topPos + 'px';
                tooltipEl.style.left = leftPos + 'px';
                tooltipEl.style.opacity = '1';
            }, 300);
        });

        document.addEventListener('mouseout', (e) => {
            if (e.target.closest('[data-tooltip]') || e.target.closest('.inline-note-marker') || e.target.closest('a')) {
                clearTimeout(UI.tooltipTimeout);
                hideTooltip();
            }
        });
    }
});