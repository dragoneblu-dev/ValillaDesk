/**
 * ui-notes-utils.js
 * Sottomodulo di UI.
 * Funzioni di supporto, formattazione, Breadcrumb e segnalibri della Nota (Utilities).
 */

Object.assign(UI, {

    checkAndUpdatePropertiesIcon: (noteId) => {
        const btn = document.getElementById('btnNoteProperties');
        if (!btn) return;
        
        const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];
        let hasProps = false;
        
        if (propsDb && propsDb.rows) {
            const sysRow = propsDb.rows.find(r => r.cells['sys_c_note'] === noteId);
            if (sysRow) {
                for (const col of propsDb.columns) {
                    if (col.id === 'sys_c_note') continue;
                    const val = sysRow.cells[col.id];
                    
                    if (val === true) { hasProps = true; break; }
                    if (Array.isArray(val) && val.length > 0) { hasProps = true; break; }
                    if (typeof val === 'string' && val.trim() !== '') { hasProps = true; break; }
                    if (typeof val === 'number') { hasProps = true; break; }
                    if (typeof val === 'object' && val !== null && val.start) { hasProps = true; break; }
                }
            }
        }
        
        if (hasProps) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    },

    goUpOneLevel: () => {
        if (!AppState.currentNoteId) return;
        const note = Store.getNote(AppState.currentNoteId);
        if (!note) return;

        if (note.isRecordNote && note.linkedTableId) {
            UI.jumpToWidget(note.linkedTableId);
            return;
        }

        if (note.parentId) {
            UI.selectNote(note.parentId);
            return;
        }

        UI.goHome();
    },

    openNoteOptionsMenu: (e, anchorId) => {
        if(e) e.stopPropagation();
        const items = [
            { icon: Icons.save, label: 'Salva come Template Locale', onClick: () => TemplateManager.saveCurrentNoteAsTemplate() },
            { icon: Icons.tableSimple, label: 'Gestisci Template...', onClick: () => TemplateManager.openManager() },
            { type: 'divider' },
            { icon: Icons.download, label: 'Esporta come Modulo (Modpack)', onClick: () => PackageManager.exportNoteAsModpack(AppState.currentNoteId) },
            { type: 'divider' },
            { icon: Icons.trash, label: 'Sposta nel Cestino', danger: true, onClick: () => UI.deleteCurrentNote() }
        ];
        UI.Menu.buildContextMenu(anchorId, items);
    },

    toggleMark: () => {
        if (!AppState.currentNoteId) return;
        const note = Store.getNote(AppState.currentNoteId);
        note.isMarked = !note.isMarked;
        
        UI.updateMarkBtn(note.isMarked);
        if (typeof UI.renderTree !== 'undefined') UI.renderTree();
        if (typeof Store !== 'undefined') Store.triggerAutoSave();
    },

    updateMarkBtn: (active) => {
        const btn = document.getElementById('markBtn');
        if (!btn) return;
        btn.innerHTML = active ? Icons.starFilled : Icons.starEmpty;
        if (active) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    },

    updateBreadcrumb: (note) => {
        const bc = document.getElementById('breadcrumb');
        if (!bc) return;
        let path = []; let curr = note;
        while (curr) { path.unshift(curr); curr = Store.getNote(curr.parentId); }
        bc.innerHTML = path.map((n, i) => {
            const isLast = i === path.length - 1;
            const safeTitle = n.title || 'Senza Titolo';
            return `<span style="cursor:pointer; color:var(--text-secondary); ${isLast ? 'font-weight:bold; color:var(--text-primary);' : ''}" onclick="UI.selectNote('${n.id}')">${safeTitle}</span>`;
        }).join('<span style="opacity:0.5;"> / </span>');
    },

    highlightTreeNode: (id) => {
        document.querySelectorAll('.node-content').forEach(el => el.classList.remove('active'));
        const el = document.querySelector(`.node-wrapper[data-id="${id}"] > .node-content`);
        if (el) el.classList.add('active');
    },

    scrollToHeader: (anchorText) => {
        const editor = document.getElementById('noteContent');
        if (!editor) return;
        const headers = editor.querySelectorAll('h2, h3');
        for (let h of headers) {
            if (h.innerText.trim() === anchorText) {
                h.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                h.style.transition = 'box-shadow 0.6s ease';
                h.style.boxShadow = '0 0 0 4px var(--marked-border), 0 0 30px var(--marked-border)';
                
                setTimeout(() => {
                    h.style.boxShadow = '';
                    setTimeout(() => h.style.transition = '', 600);
                }, 800);
                break;
            }
        }
    }
});