/**
 * editor-bookmarks.js
 * Sottomodulo di Editor.
 * Inserimento e manipolazione dei segnalibri nel testo, 
 * inclusa la gestione del cronjob globale in background per la notifica dei timer scaduti.
 */

Object.assign(Editor, {
    activeBookmark: null,
    _bookmarkInterval: null,

    insertBookmark: () => {
        Editor.saveSnapshot();
        const editor = document.getElementById('noteContent');
        if (!editor) return;

        const existingBookmarks = editor.querySelectorAll('.adv-bookmark-marker');
        existingBookmarks.forEach(el => el.remove());

        const marker = document.createElement('span');
        marker.className = 'adv-bookmark-marker adv-inline-shell';
        marker.setAttribute('contenteditable', 'false');
        marker.id = 'bkm_' + Store.generateId();

        const now = new Date();
        const dateStr = now.toLocaleDateString('it-IT') + ' ' + now.toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'});

        marker.innerHTML = `<span class="bookmark-icon">${Icons.bookmark}</span>`;
        marker.setAttribute('data-date', dateStr);

        Editor.restoreSelection();
        const sel = window.getSelection();

        if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(marker);
            
            const spaceNode = document.createTextNode('\u200B');
            marker.parentNode.insertBefore(spaceNode, marker.nextSibling);
            
            const newRange = document.createRange();
            newRange.setStartAfter(spaceNode);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
        } else {
            editor.appendChild(marker);
        }

        Store.triggerAutoSave();
        if (typeof UI !== 'undefined' && UI.renderTree) UI.renderTree(); 

        Editor.initBookmarkCron();
    },

    addBookmarkTimer: (id) => {
        const marker = document.getElementById(id);
        if (!marker) return;
        
        let currentExpire = parseInt(marker.getAttribute('data-timer-expire')) || 0;
        const now = Date.now();
        
        // Aggiunge 15 minuti (900.000 ms)
        if (currentExpire > now) {
            currentExpire += 900000;
        } else {
            currentExpire = now + 900000;
        }
        
        marker.setAttribute('data-timer-expire', currentExpire.toString());
        Store.triggerAutoSave();
        Editor.updateBookmarkMenuDisplay(marker);
        Editor.initBookmarkCron();
    },

    clearBookmarkTimer: (id) => {
        const marker = document.getElementById(id);
        if (!marker) return;
        marker.removeAttribute('data-timer-expire');
        Store.triggerAutoSave();
        Editor.updateBookmarkMenuDisplay(marker);
    },

    updateBookmarkMenuDisplay: (marker) => {
        const popover = document.getElementById('adv-bookmark-popover');
        if (!popover || Editor.activeBookmark !== marker) return;
        
        const displaySpan = document.getElementById('bkm-timer-display');
        const clearBtn = document.getElementById('bkm-timer-clear');
        
        const expire = parseInt(marker.getAttribute('data-timer-expire')) || 0;
        const now = Date.now();
        
        if (expire > now) {
            const diffSec = Math.round((expire - now) / 1000);
            const mins = Math.floor(diffSec / 60);
            const secs = diffSec % 60;
            if (displaySpan) displaySpan.innerHTML = `&nbsp;[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}]`;
            if (clearBtn) clearBtn.style.display = 'inline-flex';
        } else {
            if (displaySpan) displaySpan.innerHTML = '';
            if (clearBtn) clearBtn.style.display = 'none';
        }
    },

    showBookmarkMenu: (marker) => {
        Editor.hideBookmarkMenu();
        Editor.activeBookmark = marker;
        const dateStr = marker.getAttribute('data-date') || 'Data sconosciuta';
        
        if (!marker.id) {
            marker.id = 'bkm_' + Store.generateId();
            Store.triggerAutoSave();
        }

        const popover = document.createElement('div');
        popover.id = 'adv-bookmark-popover';
        popover.className = 'adv-floating-popover';
        
        popover.innerHTML = `
            <button class="adv-icon-btn" style="padding: 2px 6px; margin: 0; color:var(--text-primary); font-size:0.75rem; font-weight:bold;" onclick="Editor.addBookmarkTimer('${marker.id}')" title="Aggiungi 15 Minuti">
                <span style="display:inline-flex; align-items:center; gap:4px; color:var(--accent-color);">${Icons.time}</span>
                <span id="bkm-timer-display" style="font-family:monospace;"></span>
            </button>
            <button id="bkm-timer-clear" class="adv-icon-btn danger" style="padding: 2px 4px; margin: 0; display:none;" onclick="Editor.clearBookmarkTimer('${marker.id}')" title="Azzera Timer">${Icons.close}</button>
            
            <div style="width:1px; height:16px; background:var(--border-color); margin: 0 4px;"></div>
            <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: bold; margin: 0 6px; white-space: nowrap;">Piazzato il: ${dateStr}</span>
            <div style="width:1px; height:16px; background:var(--border-color); margin: 0 2px;"></div>
            <button class="adv-icon-btn danger" style="padding: 2px 4px; margin: 0;" onclick="Editor.deleteBookmark()" title="Rimuovi segnalibro">${Icons.trash}</button>
        `;
        
        document.body.appendChild(popover);
        Editor.updateBookmarkMenuDisplay(marker);

        const rect = marker.getBoundingClientRect();
        let top = rect.bottom + window.scrollY + 5;
        let left = rect.left + window.scrollX - (popover.offsetWidth / 2) + (rect.width / 2);

        if (left < 10) left = 10;
        if (left + popover.offsetWidth > window.innerWidth - 10) left = window.innerWidth - popover.offsetWidth - 10;
        if (top + popover.offsetHeight > window.innerHeight + window.scrollY) top = rect.top + window.scrollY - popover.offsetHeight - 5;

        popover.style.top = top + 'px';
        popover.style.left = left + 'px';

        popover.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
        popover.addEventListener('click', e => e.stopPropagation());
    },

    hideBookmarkMenu: () => {
        const existing = document.getElementById('adv-bookmark-popover');
        if (existing) existing.remove();
        Editor.activeBookmark = null;
    },

    deleteBookmark: () => {
        if (Editor.activeBookmark) {
            Editor.saveSnapshot();
            Editor.activeBookmark.remove();
            Store.triggerAutoSave();
            if (typeof UI !== 'undefined' && UI.renderTree) UI.renderTree();
        }
        Editor.hideBookmarkMenu();
    },

    initBookmarkCron: () => {
        if (!Editor._bookmarkInterval) {
            Editor._bookmarkInterval = setInterval(() => {
                const now = Date.now();
                let needsSave = false;

                // 1. Controllo nel DOM Visibile (Nota Corrente)
                const visibleMarkers = document.querySelectorAll('.adv-bookmark-marker[data-timer-expire]');
                visibleMarkers.forEach(m => {
                    const exp = parseInt(m.getAttribute('data-timer-expire'));
                    if (now >= exp) {
                        m.removeAttribute('data-timer-expire');
                        needsSave = true;
                        
                        if (typeof UI !== 'undefined' && UI.Alarm) {
                            UI.Alarm.trigger("⏱️ Timer Scaduto! (Nota attuale)");
                        }
                        
                        if (Editor.activeBookmark === m) {
                            Editor.updateBookmarkMenuDisplay(m);
                        }
                    } else if (Editor.activeBookmark === m) {
                        Editor.updateBookmarkMenuDisplay(m);
                    }
                });

                // 2. Controllo Globale in Background (su AppState.notes)
                if (AppState.notes) {
                    AppState.notes.forEach(note => {
                        if (!note.content) return;
                        
                        // Cerca tutti i segnalibri con un timer nella stringa HTML
                        const regex = /<span[^>]*class=["'][^"']*adv-bookmark-marker[^"']*["'][^>]*data-timer-expire=["'](\d+)["'][^>]*>/gi;
                        let match;
                        let noteModified = false;
                        
                        while ((match = regex.exec(note.content)) !== null) {
                            const expTime = parseInt(match[1]);
                            if (now >= expTime) {
                                // Rimuoviamo l'attributo scaduto direttamente dalla stringa
                                const originalTag = match[0];
                                const cleanedTag = originalTag.replace(/data-timer-expire=["']\d+["']/, '');
                                note.content = note.content.replace(originalTag, cleanedTag);
                                noteModified = true;
                                needsSave = true;

                                // Lanciamo l'allarme globale passando l'ID della nota
                                if (typeof UI !== 'undefined' && UI.Alarm && note.id !== AppState.currentNoteId) {
                                    const safeTitle = (note.title || 'Senza Titolo').replace(/'/g, "\\'");
                                    
                                    // Aggiungiamo un link per saltare alla nota
                                    const actionHtml = `
                                        <div style="margin-top: 5px;">
                                            <button class="btn" style="padding: 4px 8px; font-size: 0.8rem; border-color: var(--border-color); color: var(--text-primary);" onclick="UI.Alarm.stop(this.closest('.toast-msg').id); UI.selectNote('${note.id}')">
                                                <span style="display:inline-flex; align-items:center; gap:5px;">${Icons.arrowRightUp} Apri Nota: ${safeTitle}</span>
                                            </button>
                                        </div>
                                    `;
                                    UI.Alarm.trigger(`⏱️ Timer Scaduto in background!<br>${actionHtml}`);
                                }
                            }
                        }
                        if (noteModified) note.updatedAt = new Date().toISOString();
                    });
                }

                if (needsSave && typeof Store !== 'undefined') {
                    Store.triggerAutoSave();
                }

            }, 1000);
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(Editor.initBookmarkCron, 1000);
});