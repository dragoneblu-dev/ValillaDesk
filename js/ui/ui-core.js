/**
 * ui-core.js
 * Core dell'Interfaccia Utente: Handler Base dell'Editor e dell'oggetto window.UI.
 */

window.UI = {
    currentFontSize: 16,
    tooltipTimeout: null,
    _drawerCloseTimer: null,

    toggleMinimap: () => {
        if (typeof UI.Minimap !== 'undefined') {
            UI.Minimap.toggle();
        }
    },

    // --- NUOVO: Gestore Dock Destra/Sinistra per il Drawer ---
    toggleDrawerDock: () => {
        const drawer = document.getElementById('advGlobalDrawer');
        if (drawer) {
            drawer.classList.toggle('dock-right');
            const isRight = drawer.classList.contains('dock-right');
            localStorage.setItem('pronotes_drawer_dock', isRight ? 'right' : 'left');
            
            const btn = document.getElementById('advDrawerDockBtn');
            if (btn) {
                btn.innerHTML = isRight 
                    ? '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M15 18l-6-6 6-6"/></svg>' 
                    : '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M9 18l6-6-6-6"/></svg>';
            }
        }
    },

    // --- NUOVO: Gestore Ghost Mode (Modalità X-Ray) ---
    toggleDrawerGhost: () => {
        const drawer = document.getElementById('advGlobalDrawer');
        if (drawer) {
            drawer.classList.toggle('ghost-mode');
            const btn = document.getElementById('advDrawerGhostBtn');
            if (btn) {
                if (drawer.classList.contains('ghost-mode')) {
                    btn.innerHTML = typeof Icons !== 'undefined' ? Icons.eyeOff : '<s>👁</s>';
                    btn.classList.add('active');
                    btn.style.color = 'var(--accent-color)';
                } else {
                    btn.innerHTML = typeof Icons !== 'undefined' ? Icons.eye : '👁';
                    btn.classList.remove('active');
                    btn.style.color = '';
                }
            }
        }
    },

    goHome: () => {
        AppState.isSwitchingNote = true;
        if (typeof UI.updateCurrentNoteTimer !== 'undefined') clearTimeout(UI.updateCurrentNoteTimer);

        if (AppState.currentNoteId) {
            const scrollArea = document.querySelector('.editor-scroll-content');
            if (scrollArea) {
                const currentNote = Store.getNote(AppState.currentNoteId);
                if (currentNote) currentNote._lastScroll = scrollArea.scrollTop;
            }
            if (typeof Editor !== 'undefined') Editor.sanitizeContent();
            if (typeof Store !== 'undefined') Store.triggerAutoSave(true);
        }

        UI.closeDrawer();
        if (typeof UI.Menu !== 'undefined') UI.Menu.closeAll(true);
        if (typeof TableManager !== 'undefined') {
            TableManager.hideTriggers();
            TableManager.hideMenus();
        }

        AppState.currentNoteId = null;
        AppState.isEditMode = false;

        document.querySelectorAll('.node-content').forEach(el => el.classList.remove('active'));

        UI.showEditor(false);
        if (typeof UI.Minimap !== 'undefined') UI.Minimap.sync(); 
        
        setTimeout(() => {
            AppState.isSwitchingNote = false;
        }, 150);
    },

    formatDate: (isoString) => {
        if (!isoString) return "";
        const d = new Date(isoString);
        return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) +
            " " + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    },

    showStatus: (state) => {
        const el = document.getElementById('saveStatus');
        if (!el) return;

        el.className = 'status-pill';
        el.classList.remove('hidden');
        el.onclick = null;
        el.style.cursor = 'default';

        if (state === 'pending') {
            el.textContent = 'Modificato...';
            el.classList.add('status-saving');
        } else if (state === 'saving') {
            el.textContent = 'Salvataggio in corso...';
            el.classList.add('status-saving');
        } else if (state === 'saved') {
            el.textContent = 'Salvato';
            el.classList.add('status-saved');
        } else if (state === 'error') {
            el.textContent = 'Errore Salvataggio';
            el.classList.add('status-error');
        } else if (state === 'unsaved') {
            el.textContent = '⚠️ Salva File (Solo RAM)';
            el.classList.add('status-error');
            el.style.cursor = 'pointer';
            el.title = 'I dati sono salvati solo nella memoria temporanea. Clicca per salvare su disco.';
            el.onclick = () => Store.saveAs();
        }
    },

    updateFileName: (name) => { 
        const el = document.getElementById('fileNameDisplay'); 
        if (el) el.textContent = name; 
    }
};