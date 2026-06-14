/**
 * ui-notes.js
 * Modulo dedicato al lifecycle della Singola Nota.
 * FIX NAVIGAZIONE: Aggiunto metodo goUpOneLevel per risalire l'alberatura (Padre o Database sorgente).
 * FEATURE MODPACK: Aggiunta opzione per esportare la nota attiva direttamente come Modpack autoinstallante.
 * FIX PREFERITI E SEGNALIBRI: Stella Gialla se preferito, Foglio Arancione se Segnalibro, Stella Arancione se entrambi.
 */

Object.assign(UI, {
    updateCurrentNoteTimer: null,
    _lastHighlightedWidget: null,

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

    addNote: (parentId = null) => {
        AppState.isSwitchingNote = true;

        if (AppState.currentNoteId) {
            clearTimeout(UI.updateCurrentNoteTimer);
            const scrollArea = document.querySelector('.editor-scroll-content');
            const currentNote = Store.getNote(AppState.currentNoteId);
            
            if (currentNote) {
                if (scrollArea) currentNote._lastScroll = scrollArea.scrollTop;
                
                const editorEl = document.getElementById('noteContent');
                if (editorEl && typeof Editor !== 'undefined') {
                    currentNote.content = Editor.minifyHTMLForStorage(editorEl.innerHTML);
                    currentNote.updatedAt = new Date().toISOString();
                }
            }
            if (typeof Editor !== 'undefined') Editor.clearHistory();
            if (typeof Store !== 'undefined') {
                Store.executePhysicalGarbageCollection();
                Store.triggerAutoSave(false);
            }
        }

        if (AppState.searchFilter) {
            AppState.searchFilter = "";
            const searchInput = document.getElementById('searchInput');
            const searchClear = document.getElementById('searchClearBtn');
            if (searchInput) searchInput.value = "";
            if (searchClear) searchClear.classList.add('hidden');
        }

        const sb = document.getElementById('sidebar');
        if (sb && sb.classList.contains('collapsed')) {
            UI.toggleSidebar(); 
        }

        const now = new Date().toISOString();
        const newNoteId = Store.generateId();
        const newNote = {
            id: newNoteId, 
            parentId: parentId, 
            title: "",
            content: "<p><br></p>",
            isMarked: false, 
            expanded: true, 
            createdAt: now, 
            updatedAt: now
        };
        
        AppState.notes.push(newNote);
        if (parentId) { 
            const p = Store.getNote(parentId); 
            if (p) p.expanded = true; 
        }

        if (typeof AdvancedTable !== 'undefined') {
            AdvancedTable.syncSystemPropertiesRow(newNoteId);
        }

        if (typeof UI.renderTree !== 'undefined') UI.renderTree();
        
        UI.selectNote(newNote.id);
        
        UI.toggleEditMode(true);
        setTimeout(() => {
            const titleInput = document.getElementById('noteTitle');
            if (titleInput) {
                titleInput.focus();
            }
            if (typeof TemplateManager !== 'undefined') TemplateManager.toggleEmptyOverlay();
        }, 100);
        
        if (typeof Store !== 'undefined') Store.triggerAutoSave(true);
    },

    selectNote: (id, anchorText = null, refId = null) => {
        AppState.isSwitchingNote = true;
        
        if (AppState.currentNoteId && AppState.currentNoteId !== id) {
            clearTimeout(UI.updateCurrentNoteTimer);
            const scrollArea = document.querySelector('.editor-scroll-content');
            const currentNote = Store.getNote(AppState.currentNoteId);
            
            if (currentNote) {
                if (scrollArea) currentNote._lastScroll = scrollArea.scrollTop;
                
                const editorEl = document.getElementById('noteContent');
                if (editorEl && typeof Editor !== 'undefined') {
                    currentNote.content = Editor.minifyHTMLForStorage(editorEl.innerHTML);
                    currentNote.updatedAt = new Date().toISOString();
                }
            }
            
            // GARBAGE COLLECTION: Azzera la memoria RAM e scansiona il disco!
            if (typeof Editor !== 'undefined') Editor.clearHistory();
            if (typeof Store !== 'undefined') {
                Store.executePhysicalGarbageCollection();
                Store.triggerAutoSave(false);
            }
        }

        if (typeof TableManager !== 'undefined') {
            TableManager.hideTriggers();
            TableManager.hideMenus();
            TableManager.activeCell = null;
            TableManager.currentTable = null;
        }

        UI.closeDrawer();
        if (typeof UI.Menu !== 'undefined') UI.Menu.closeAll(true);

        const rowSelector = document.getElementById('adv-global-row-selector');
        if (rowSelector) rowSelector.classList.remove('visible');

        const contextBtn = document.getElementById('btnContextEdit');
        const openBtn = document.getElementById('btnContextOpenLink');
        if (contextBtn) contextBtn.style.display = 'none';
        if (openBtn) openBtn.style.display = 'none';

        if (typeof Editor !== 'undefined') {
            Editor.clearHistory();
        }

        if (!AppState.continuousEditMode) {
            AppState.isEditMode = false;
        }

        AppState.currentNoteId = id;
        const note = Store.getNote(id);
        if (!note) { AppState.isSwitchingNote = false; return; }

        // NAVIGAZIONE LINK: Apriamo forzatamente l'albero per rivelare la nota di destinazione
        let currParentId = note.parentId;
        while(currParentId) {
            let pNote = Store.getNote(currParentId);
            if(pNote) {
                pNote.expanded = true;
                currParentId = pNote.parentId;
            } else {
                break;
            }
        }

        note._oldTitle = note.title;
        note._oldContent = note.content;

        // Renderizza l'albero PRIMA di applicare l'highlight visivo
        if (typeof UI.renderTree !== 'undefined') UI.renderTree();
        UI.showEditor(true);

        const titleInput = document.getElementById('noteTitle');
        if (titleInput) {
            titleInput.value = note.title || "";
            
            titleInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!AppState.isEditMode) return;
                    
                    const editorEl = document.getElementById('noteContent');
                    if (editorEl) {
                        editorEl.focus();
                        try {
                            const sel = window.getSelection();
                            const range = document.createRange();
                            
                            if (editorEl.firstChild) {
                                range.setStart(editorEl.firstChild, 0);
                            } else {
                                range.setStart(editorEl, 0);
                            }
                            
                            range.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(range);
                        } catch (err) {}
                    }
                }
            };
        }

        const dateEl = document.getElementById('noteLastUpdate');
        if (dateEl) {
            if (note.updatedAt) {
                dateEl.textContent = UI.formatDate(note.updatedAt);
                dateEl.setAttribute('title', "Modificato il: " + UI.formatDate(note.updatedAt));
                dateEl.style.cursor = 'help';
            } else {
                dateEl.textContent = "";
                dateEl.removeAttribute('title');
                dateEl.style.cursor = 'default';
            }
        }

        let openRecordBtn = document.getElementById('openRecordBtn');
        if (!openRecordBtn) {
            const btnNoteProps = document.getElementById('btnNoteProperties');
            if (btnNoteProps) {
                openRecordBtn = document.createElement('button');
                openRecordBtn.id = 'openRecordBtn';
                openRecordBtn.className = 'icon-btn';
                openRecordBtn.innerHTML = typeof Icons !== 'undefined' ? Icons.tableDatabase : '📊';
                btnNoteProps.parentNode.insertBefore(openRecordBtn, btnNoteProps);
            }
        }

        if (openRecordBtn) {
            if (note.isRecordNote && note.linkedTableId && note.linkedRowId) {
                openRecordBtn.style.display = 'flex';
                openRecordBtn.title = "Visualizza questo Record nel Database";
                openRecordBtn.onclick = () => {
                    if (typeof AdvancedTable !== 'undefined') {
                        AdvancedTable.openRecordView(note.linkedTableId, note.linkedRowId);
                    }
                };
            } else {
                openRecordBtn.style.display = 'none';
            }
        }

        const btnNoteProps = document.getElementById('btnNoteProperties');
        if (btnNoteProps) {
            btnNoteProps.onclick = () => {
                if (typeof AdvancedTable !== 'undefined') {
                    AdvancedTable.openRecordView('SYS_PROPERTIES_DB', 'sys_r_' + id);
                }
            };
        }
        
        UI.checkAndUpdatePropertiesIcon(id);

        const contentEl = document.getElementById('noteContent');
        if (contentEl) {
            contentEl.innerHTML = note.content || "<p><br></p>";
            if (typeof Editor !== 'undefined' && Editor.hydrateMedia) {
                Editor.hydrateMedia(contentEl);
            }

            if (AppState.noWrapMode) contentEl.classList.add('no-wrap');
            else contentEl.classList.remove('no-wrap');

            UI.toggleEditMode(AppState.continuousEditMode ? true : false);

            if (typeof CitationManager !== 'undefined') CitationManager.renderLiveCitations();

            if (AppState.searchFilter && AppState.searchFilter.length > 0) {
                if (typeof Editor !== 'undefined') Editor.applyHighlight(contentEl, AppState.searchFilter);
            }

            if (typeof Editor !== 'undefined' && Editor.saveSnapshot) Editor.saveSnapshot();
        }

        UI.renderInlineFootnotes();
        UI.updateBreadcrumb(note);
        UI.updateMarkBtn(note.isMarked);
        
        if (typeof UI.highlightTreeNode !== 'undefined') UI.highlightTreeNode(id);

        if (refId) {
            setTimeout(() => {
                const targetEl = document.getElementById(refId);
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetEl.style.transition = 'box-shadow 0.6s ease';
                    targetEl.style.boxShadow = '0 0 0 4px var(--marked-border), 0 0 30px var(--marked-border)';
                    setTimeout(() => {
                        targetEl.style.boxShadow = '';
                        setTimeout(() => targetEl.style.transition = '', 600);
                    }, 800);
                }
                setTimeout(() => { AppState.isSwitchingNote = false; UI.updateTOCScrollSpy(); }, 150);
            }, 150);
        } else if (anchorText) {
            setTimeout(() => {
                if (typeof UI.scrollToHeader !== 'undefined') UI.scrollToHeader(anchorText);
                setTimeout(() => { AppState.isSwitchingNote = false; UI.updateTOCScrollSpy(); }, 100);
            }, 150);
        } else if (AppState.searchFilter && AppState.searchFilter.length > 0) {
            AppState._totalHighlights = contentEl.querySelectorAll('mark.search-highlight').length;
            const searchCounter = document.getElementById('searchCounter');
            
            if (searchCounter) {
                if (AppState._totalHighlights > 0) {
                    if (AppState._currentHighlightIndex === -1) AppState._currentHighlightIndex = AppState._totalHighlights - 1;
                    else if (AppState._currentHighlightIndex >= AppState._totalHighlights) AppState._currentHighlightIndex = 0;
                    
                    searchCounter.innerText = `${AppState._currentHighlightIndex + 1}/${AppState._totalHighlights}/${AppState._globalHighlights}`;
                    
                    const marks = contentEl.querySelectorAll('mark.search-highlight');
                    const targetMark = marks[AppState._currentHighlightIndex];
                    if (targetMark) {
                        targetMark.classList.add('active-highlight');
                        targetMark.style.backgroundColor = 'var(--marked-border)';
                        
                        let curr = targetMark;
                        while (curr && curr.id !== 'noteContent') {
                            if (curr.classList && curr.classList.contains('collapsed')) curr.classList.remove('collapsed');
                            curr = curr.parentNode;
                        }
                        setTimeout(() => targetMark.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                    }
                } else {
                    searchCounter.innerText = `0/0/${AppState._globalHighlights}`;
                }
            }
            setTimeout(() => { AppState.isSwitchingNote = false; UI.updateTOCScrollSpy(); }, 300);
        } else if (AppState.showBookmarksInTree) {
            setTimeout(() => {
                const bookmark = contentEl.querySelector('.adv-bookmark-marker');
                if (bookmark) {
                    bookmark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const icon = bookmark.querySelector('.bookmark-icon');
                    if (icon) {
                        icon.style.transition = 'transform 0.6s, color 0.6s';
                        icon.style.transform = 'scale(1.8)';
                        icon.style.color = 'var(--danger-color)';
                        setTimeout(() => { 
                        	icon.style.transform = 'none'; 
                        	icon.style.color = ''; 
                        }, 800);
                    }
                }
                setTimeout(() => { AppState.isSwitchingNote = false; UI.updateTOCScrollSpy(); }, 100);
            }, 150);
        } else {
            setTimeout(() => {
                const scrollArea = document.querySelector('.editor-scroll-content');
                if (scrollArea) {
                    if (note._lastScroll !== undefined) 
                    	scrollArea.scrollTop = note._lastScroll;
                    else 
                    	scrollArea.scrollTop = 0;
                }
                setTimeout(() => { AppState.isSwitchingNote = false; UI.updateTOCScrollSpy(); }, 100);
            }, 150);
        }

        setTimeout(() => {
            if (AppState.showMinimap && typeof UI.Minimap !== 'undefined') UI.Minimap.sync();
        }, 150);

        setTimeout(() => {
            if (typeof TemplateManager !== 'undefined') TemplateManager.toggleEmptyOverlay();
        }, 160);
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
            
            const editorEl = document.getElementById('noteContent');
            if (editorEl && typeof Editor !== 'undefined') {
                const currentNote = Store.getNote(AppState.currentNoteId);
                if (currentNote) {
                    currentNote.content = Editor.minifyHTMLForStorage(editorEl.innerHTML);
                    currentNote.updatedAt = new Date().toISOString();
                }
                Editor.clearHistory();
            }
            if (typeof Store !== 'undefined') {
                Store.executePhysicalGarbageCollection();
                Store.triggerAutoSave(true);
            }
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

    updateCurrentNote: () => {
        if (!AppState.currentNoteId) return;

        const note = Store.getNote(AppState.currentNoteId);
        const titleInput = document.getElementById('noteTitle');
        if (titleInput) note.title = titleInput.value;

        const treeTitleContainer = document.querySelector(`.node-wrapper[data-id="${AppState.currentNoteId}"] > .node-content .node-title`);
        if (treeTitleContainer) {
            let customIcon = Icons.file;
            let iconColorStr = '';
            const hasBookmark = note.content && note.content.includes('adv-bookmark-marker');

            if (note.isRecordNote) {
                customIcon = Icons.recordPage;
                iconColorStr = 'color:var(--record-color);';
            } else {
                if (note.isMarked && hasBookmark) {
                    customIcon = Icons.starFilled;
                    iconColorStr = 'color:var(--tx-c4);'; 
                } else if (note.isMarked) {
                    customIcon = Icons.starFilled;
                    iconColorStr = 'color:var(--marked-border);'; 
                } else if (hasBookmark) {
                    iconColorStr = 'color:var(--tx-c4);'; 
                }
            }

            treeTitleContainer.innerHTML = `<span style="opacity:0.8; ${iconColorStr}">${customIcon}</span> <span>${note.title || 'Senza Titolo'}</span>`;
        }

        UI.updateBreadcrumb(note);

        clearTimeout(UI.updateCurrentNoteTimer);
        UI.updateCurrentNoteTimer = setTimeout(() => {
            note.updatedAt = new Date().toISOString();
            const dateEl = document.getElementById('noteLastUpdate');
            if (dateEl) {
                dateEl.textContent = UI.formatDate(note.updatedAt);
                dateEl.setAttribute('title', "Modificato il: " + UI.formatDate(note.updatedAt));
            }

            // Aggiorna l'updatedAt del record nel database se è una pagina dedicata
            if (note.isRecordNote && note.linkedTableId && note.linkedRowId) {
                if (typeof AdvancedTable !== 'undefined') {
                    AdvancedTable.touchRecordUpdate(note.linkedTableId, note.linkedRowId);
                }
            }

            if (note.isRecordNote && note.linkedTableId && typeof AdvancedAutomations !== 'undefined') {
                if (note.title !== note._oldTitle) {
                    AdvancedAutomations.triggerFromNoteChange(note.linkedTableId, note.linkedRowId, 'TITLE', note._oldTitle, note.title);
                    note._oldTitle = note.title;
                }
            }

            if (typeof Store !== 'undefined') Store.triggerAutoSave();
        }, 500);
    },

    deleteCurrentNote: () => {
        if (!AppState.currentNoteId) return; 
        
        const note = Store.getNote(AppState.currentNoteId);

        if (!confirm("Spostare questa nota e tutte le sue sotto-note nel cestino?")) return;
        
        const parentIdToReturn = note.parentId;

        if (note && note.isRecordNote && note.linkedTableId && note.linkedRowId && typeof AdvancedTable !== 'undefined') {
            let dbState = AdvancedTable.getState(note.linkedTableId);
            if (dbState && dbState.rows) {
                const row = dbState.rows.find(r => r.id === note.linkedRowId);
                if (row) {
                    dbState.columns.filter(c => c.type === 'record_note').forEach(c => {
                        if (row.cells[c.id] === note.id) row.cells[c.id] = '';
                    });
                    AdvancedTable.setState(note.linkedTableId, dbState);
                }
            }
        }

        const now = Date.now();
        const traverse = (id) => { 
            const n = Store.getNote(id);
            if (n) {
                n.deletedAt = now;
                if (typeof AdvancedTable !== 'undefined') AdvancedTable.deleteSystemPropertiesRow(id);
                AppState.notes.filter(child => child.parentId === id).forEach(child => traverse(child.id));
            }
        };
        traverse(AppState.currentNoteId);
        
        if (typeof UI.renderTree !== 'undefined') UI.renderTree(); 
        if (typeof Store !== 'undefined') Store.triggerAutoSave();
        UI.showToast("Nota spostata nel cestino.", "warning");

        if (parentIdToReturn && Store.getNote(parentIdToReturn) && !Store.getNote(parentIdToReturn).deletedAt) {
            UI.selectNote(parentIdToReturn);
        } else {
            UI.goHome(); // Fallback sicuro alla home invocando la GC
        }
    },

    handleEditorInput: () => {
        if (!AppState.currentNoteId) return;
        const note = Store.getNote(AppState.currentNoteId);
        const contentEl = document.getElementById('noteContent');
        
        if (contentEl) note.content = Editor.minifyHTMLForStorage(contentEl.innerHTML);
        note.updatedAt = new Date().toISOString();
        
        const dateEl = document.getElementById('noteLastUpdate');
        if (dateEl) {
            dateEl.textContent = UI.formatDate(note.updatedAt);
            dateEl.setAttribute('title', "Modificato il: " + UI.formatDate(note.updatedAt));
        }

        if (typeof TemplateManager !== 'undefined') TemplateManager.toggleEmptyOverlay();

        clearTimeout(UI.updateCurrentNoteTimer);
        UI.updateCurrentNoteTimer = setTimeout(() => {
            if (typeof UI.renderTree !== 'undefined') UI.renderTree();
            UI.renderInlineFootnotes();
            if (typeof CitationManager !== 'undefined') CitationManager.renderLiveCitations();

            // Aggiorna l'updatedAt del record nel database se è una pagina dedicata
            if (note.isRecordNote && note.linkedTableId && note.linkedRowId) {
                if (typeof AdvancedTable !== 'undefined') {
                    AdvancedTable.touchRecordUpdate(note.linkedTableId, note.linkedRowId);
                }
            }

            if (note.isRecordNote && note.linkedTableId && typeof AdvancedAutomations !== 'undefined') {
                if (note.content !== note._oldContent) {
                    const oldPlain = UI.extractSearchableText(note._oldContent);
                    const newPlain = UI.extractSearchableText(note.content);
                    AdvancedAutomations.triggerFromNoteChange(note.linkedTableId, note.linkedRowId, 'CONTENT', oldPlain, newPlain);
                    note._oldContent = note.content;
                }
            }

            if (AppState.showMinimap && typeof UI.Minimap !== 'undefined') {
                UI.Minimap.sync();
            }

            UI.updateTOCScrollSpy();

        }, 500);

        if (typeof Store !== 'undefined') Store.triggerAutoSave();
    },

    jumpToWidget: (widgetId) => {
        if (!AppState.notes) return;

        let targetNoteId = null;
        let targetNoteInstance = null;
        
        for (let i = 0; i < AppState.notes.length; i++) {
            const note = AppState.notes[i];
            if (!note.content) continue;
            
            if (note.content.includes(`id="${widgetId}"`) || note.content.includes(`id='${widgetId}'`) || note.content.includes(`id="${widgetId}_cited_`)) {
                targetNoteId = note.id;
                targetNoteInstance = note;
                break;
            }
        }

        const handleResolution = () => {
            const trueId = widgetId.split('_cited_')[0];
            if (trueId === 'SYS_PROPERTIES_DB') {
                alert("Questa è la struttura di base delle Proprietà e Tag delle Note.\nNon è un database visibile, ma agisce dietro le quinte.\n\nPer modificare i Tag di una nota, apri le proprietà direttamente dalla barra degli strumenti in cima all'editor.");
                return;
            }

            let el = document.getElementById(widgetId) || document.querySelector(`[id^="${widgetId}_cited_"]`);
            
            if (el && (el.classList.contains('adv-widget-shell') || el.classList.contains('adv-table-wrapper') || el.classList.contains('simple-table-wrapper'))) {
                
                if (UI._lastHighlightedWidget && document.body.contains(UI._lastHighlightedWidget)) {
                    UI._lastHighlightedWidget.style.boxShadow = '';
                    UI._lastHighlightedWidget.style.transition = '';
                }

                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                el.style.transition = 'box-shadow 0.6s ease';
                el.style.boxShadow = '0 0 0 4px var(--marked-border), 0 0 30px var(--marked-border)';
                UI._lastHighlightedWidget = el;

                setTimeout(() => {
                    if (el === UI._lastHighlightedWidget) {
                        el.style.boxShadow = '';
                        setTimeout(() => el.style.transition = '', 600);
                        UI._lastHighlightedWidget = null;
                    }
                }, 800);
                
                return;
            }

            const orphanState = AppState.databases ? AppState.databases[widgetId] : null;
            
            if (orphanState) {
                const targetInjectionNoteId = targetNoteId || AppState.currentNoteId;
                if (!targetInjectionNoteId) {
                    if (typeof UI.showToast !== 'undefined') UI.showToast("Crea una nota vuota, poi clicca di nuovo per poter recuperare l'elemento.", "warning");
                    return;
                }

                let type = 'database';
                if (widgetId.includes('adv_journal_')) type = 'journal';
                else if (widgetId.includes('adv_code_')) type = 'code';
                else if (widgetId.includes('adv_btnbar_')) type = 'buttonbar';
                else if (orphanState.isPivot) type = 'pivot';

                let shellNode = null;
                if (typeof WidgetManager !== 'undefined') {
                    shellNode = WidgetManager.createShell(type, widgetId);
                } else {
                    shellNode = document.createElement('div');
                    shellNode.id = widgetId;
                    shellNode.className = 'adv-widget-shell adv-table-wrapper';
                    shellNode.setAttribute('data-widget-type', type);
                }

                const targetNoteToCure = Store.getNote(targetInjectionNoteId);
                
                if (targetNoteToCure.content) {
                    const regex = new RegExp(widgetId, 'g');
                    targetNoteToCure.content = targetNoteToCure.content.replace(regex, `${widgetId}_broken`);
                }

                targetNoteToCure.content = (targetNoteToCure.content || '') + '<p><br></p>' + shellNode.outerHTML + '<p><br></p>';
                targetNoteToCure.updatedAt = new Date().toISOString();

                if (targetInjectionNoteId === AppState.currentNoteId) {
                    const editorEl = document.getElementById('noteContent');
                    if (editorEl) {
                        editorEl.innerHTML = targetNoteToCure.content;
                        if (typeof WidgetManager !== 'undefined') WidgetManager.mountAll(editorEl);
                        
                        setTimeout(() => {
                            const newEl = document.getElementById(widgetId);
                            if (newEl) newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 100);
                    }
                }

                Store.triggerAutoSave();
                if (typeof UI.showToast !== 'undefined') UI.showToast(`Elemento corrotto "${orphanState.title || type}" recuperato in fondo alla nota.`, "success");
                
            } else {
                if (targetNoteInstance) {
                    const regex = new RegExp(widgetId, 'g');
                    targetNoteInstance.content = targetNoteInstance.content.replace(regex, `zombie_purged_${Date.now()}`);
                    targetNoteInstance.updatedAt = new Date().toISOString();
                    
                    if (AppState.databases && AppState.databases[widgetId]) delete AppState.databases[widgetId];
                    
                    Store.triggerAutoSave();
                    
                    if (typeof UI.showToast !== 'undefined') UI.showToast("L'elemento selezionato non esiste più ed è stato eliminato in modo definitivo dal file.", "info");
                    UI.renderTree(); 
                } else {
                    if (typeof UI.showToast !== 'undefined') UI.showToast("L'elemento selezionato non esiste più.", "error");
                }
            }
        };

        if (targetNoteId && AppState.currentNoteId !== targetNoteId) {
            UI.selectNote(targetNoteId);
            setTimeout(handleResolution, 250); 
        } else if (targetNoteId) {
            handleResolution();
        } else {
            handleResolution();
        }
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

    renderInlineFootnotes: () => {
        let area = document.getElementById('inline-footnotes-area');
        if (!area) {
            area = document.createElement('div');
            area.id = 'inline-footnotes-area';
            
            area.style.maxWidth = 'var(--page-max-width)';
            area.style.marginLeft = 'auto';
            area.style.marginRight = 'auto';
            area.style.width = '100%';
            area.style.boxSizing = 'border-box';

            const editorWrapper = document.querySelector('.editor-scroll-content');
            if (editorWrapper) {
                editorWrapper.appendChild(area);
            }
        }

        const editor = document.getElementById('noteContent');
        if (!editor) return;

        const markers = editor.querySelectorAll('.inline-note-marker');
        if (markers.length === 0) {
            area.innerHTML = '';
            return;
        }

        let html = `<div style="margin-top: 40px; padding-top: 20px; border-top: 1px dashed var(--border-color); font-size: 0.85rem; color: var(--text-secondary);">`;
        html += `<div style="font-weight: bold; margin-bottom: 10px; text-transform: uppercase;">Note a Piè di Pagina</div>`;

        markers.forEach((marker, index) => {
            let htmlContent = '';
            const wrapper = marker.closest('.inline-note-wrapper');
            if (wrapper) {
                const dataSpan = wrapper.querySelector('.inline-note-data');
                if (dataSpan) htmlContent = dataSpan.innerHTML;
            }
            if (!htmlContent) {
                htmlContent = marker.getAttribute('data-tooltip') || '';
                htmlContent = htmlContent.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            }

            html += `<div style="margin-bottom: 8px; display: flex; gap: 10px; align-items: flex-start;">
                        <span style="color: var(--accent-color); cursor: pointer; font-weight: bold;" onclick="UI.scrollToInlineNote(${index})">[${index + 1}]</span>
                        <div style="flex:1;">${htmlContent}</div>
                     </div>`;
        });
        html += `</div>`;
        area.innerHTML = html;
    },

    scrollToInlineNote: (index) => {
        const editor = document.getElementById('noteContent');
        if (!editor) return;
        const markers = editor.querySelectorAll('.inline-note-marker');
        if (markers[index]) {
            markers[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
            const icon = markers[index].querySelector('svg') || markers[index];
            icon.style.transition = 'transform 0.6s, color 0.6s';
            icon.style.transform = 'scale(1.8)';
            icon.style.color = 'var(--danger-color)';
            setTimeout(() => {
                icon.style.transform = 'none';
                icon.style.color = 'currentColor';
            }, 1500); 
        }
    },

    // -------------------------------------------------------------
    // MOTORE PANNELLO INFO NOTA E AUDITING
    // -------------------------------------------------------------
    openNoteInfoPanel: () => {
        if (!AppState.currentNoteId) return;
        const note = Store.getNote(AppState.currentNoteId);
        if (!note) return;

        const safeTitle = (note.title || 'Senza Titolo').replace(/</g, '&lt;');

        // 1. Calcolo Statistiche Testo
        const plainText = UI.extractSearchableText(note.content || '').trim();
        const wordCount = plainText ? plainText.split(/\s+/).filter(w => w.length > 0).length : 0;
        const readTime = Math.max(1, Math.ceil(wordCount / 200)); 

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = note.content || '';
        const chapterCount = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
        const widgetCount = tempDiv.querySelectorAll('.adv-widget-shell').length;

        // 2. Calcolo Backlinks (Chi mi cita / punta a me)
        const backlinks = [];
        const noteIdStr = `data-note-id="${note.id}"`;
        const refNoteStr = `data-ref-note="${note.id}"`;

        AppState.notes.forEach(n => {
            if (n.deletedAt || n.id === note.id) return;
            if (n.content && (n.content.includes(noteIdStr) || n.content.includes(refNoteStr))) {
                backlinks.push(n);
            }
        });

        // 3. Calcolo Outlinks (Chi sto citando / puntando io)
        const outlinks = new Set();
        tempDiv.querySelectorAll('a.internal-link').forEach(link => {
            const tgtId = link.getAttribute('data-note-id');
            if (tgtId && tgtId !== note.id) outlinks.add(tgtId);
        });
        tempDiv.querySelectorAll('.block-citation').forEach(cit => {
            const tgtId = cit.getAttribute('data-ref-note');
            if (tgtId && tgtId !== note.id) outlinks.add(tgtId);
        });

        // 4. Calcolo Auditing Sotto-note (Matrice)
        const children = Store.getChildren(note.id);
        let subNotesHtml = '';

        if (children.length > 0) {
            const propsDb = AppState.databases && AppState.databases['SYS_PROPERTIES_DB'];
            const colsToRender = propsDb ? propsDb.columns.filter(c => c.id !== 'sys_c_note' && !c.hidden) : [];

            let thHtml = `<th style="text-align:left; color:var(--text-secondary); font-weight:600; padding:8px; border-bottom:1px solid var(--border-color); background:rgba(0,0,0,0.02);">Titolo Nota</th>`;
            colsToRender.forEach(c => {
                thHtml += `<th style="text-align:left; color:var(--text-secondary); font-weight:600; padding:8px; border-bottom:1px solid var(--border-color); background:rgba(0,0,0,0.02);">${c.name.replace(/</g, '&lt;')}</th>`;
            });

            let trHtml = '';
            children.forEach(child => {
                const childSafeTitle = (child.title || 'Senza Titolo').replace(/</g, '&lt;');
                let rowPropsHtml = '';

                if (propsDb) {
                    const sysRow = propsDb.rows.find(r => r.cells['sys_c_note'] === child.id);
                    colsToRender.forEach(c => {
                        let displayVal = '-';
                        if (sysRow) {
                            let rawVal = sysRow.cells[c.id];
                            
                            // Usiamo l'engine centralizzato per generare le pillole colorate!
                            if (['select', 'multi-select'].includes(c.type)) {
                                const vals = Array.isArray(rawVal) ? rawVal : (rawVal ? [rawVal] : []);
                                if (vals.length > 0) {
                                    displayVal = '';
                                    vals.forEach(v => {
                                        const colorClass = propsDb.selectColors && propsDb.selectColors[c.id] && propsDb.selectColors[c.id][v] ? propsDb.selectColors[c.id][v] : 'default-color';
                                        displayVal += `<span class="adv-select-pill ${colorClass}" style="margin-right:4px;">${v.replace(/</g, '&lt;')}</span>`;
                                    });
                                }
                            } else if (c.type === 'checkbox') {
                                displayVal = rawVal ? `<span style="color:var(--accent-color); font-weight:bold;">Sì</span>` : `<span style="color:var(--text-secondary);">No</span>`;
                            } else {
                                displayVal = AdvancedTable.getFormatDisplayValue(c, rawVal);
                                if (!displayVal) displayVal = '-';
                            }
                        }
                        rowPropsHtml += `<td style="padding:8px; border-bottom:1px solid var(--border-color); font-size:0.85rem;">${displayVal}</td>`;
                    });
                }

                trHtml += `
                    <tr style="cursor:pointer; transition:background 0.2s;" onmouseenter="this.style.background='var(--item-hover)'" onmouseleave="this.style.background=''" onclick="UI.selectNote('${child.id}')">
                        <td style="padding:8px; border-bottom:1px solid var(--border-color); font-weight:bold; color:var(--text-primary); font-size:0.9rem;">
                            <span style="opacity:0.5; margin-right:5px; font-weight:normal;">${Icons.file}</span>${childSafeTitle}
                        </td>
                        ${rowPropsHtml}
                    </tr>
                `;
            });

            subNotesHtml = `
                <div class="adv-scroll-container" style="max-height: 400px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-color); margin-top: 10px;">
                    <table style="width:100%; border-collapse:collapse; text-align:left;">
                        <thead style="position:sticky; top:0; z-index:10; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <tr>${thHtml}</tr>
                        </thead>
                        <tbody>
                            ${trHtml}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            subNotesHtml = `<div style="font-size:0.85rem; color:var(--text-secondary); font-style:italic;">Questa nota non contiene sotto-note.</div>`;
        }

        // COSTRUZIONE HTML DRAWER
        let bodyHTML = `
            <div style="display:flex; flex-direction:column; gap:20px; padding-bottom: 20px;">
                
                <!-- Statistiche -->
                <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:10px;">
                    <div style="background:var(--item-hover); border:1px solid var(--border-color); padding:15px; border-radius:8px; text-align:center;">
                        <div style="font-size:1.5rem; font-weight:bold; color:var(--text-primary);">${wordCount}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; margin-top:5px;">Parole</div>
                    </div>
                    <div style="background:var(--item-hover); border:1px solid var(--border-color); padding:15px; border-radius:8px; text-align:center;">
                        <div style="font-size:1.5rem; font-weight:bold; color:var(--text-primary);">${readTime}m</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; margin-top:5px;">Tempo Lettura</div>
                    </div>
                    <div style="background:var(--item-hover); border:1px solid var(--border-color); padding:15px; border-radius:8px; text-align:center;">
                        <div style="font-size:1.5rem; font-weight:bold; color:var(--text-primary);">${chapterCount}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; margin-top:5px;">Capitoli</div>
                    </div>
                    <div style="background:var(--item-hover); border:1px solid var(--border-color); padding:15px; border-radius:8px; text-align:center;">
                        <div style="font-size:1.5rem; font-weight:bold; color:var(--text-primary);">${widgetCount}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; margin-top:5px;">Widget</div>
                    </div>
                </div>

                <!-- Backlinks -->
                <div>
                    <h4 style="margin:0 0 10px 0; color:var(--accent-color); font-size:0.95rem; border-bottom:1px solid var(--border-color); padding-bottom:5px; display:flex; align-items:center; gap:6px;">
                        ${Icons.link} Menzioni in Entrata (Backlinks)
                    </h4>
                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:10px;">Queste note contengono un link o citano questa pagina:</div>
        `;

        if (backlinks.length > 0) {
            bodyHTML += `<div style="display:flex; flex-direction:column; gap:6px;">`;
            backlinks.forEach(bl => {
                const blTitle = (bl.title || 'Senza Titolo').replace(/</g, '&lt;');
                bodyHTML += `
                    <div style="display:flex; align-items:center; gap:8px; padding:8px 10px; background:var(--bg-color); border:1px solid var(--border-color); border-radius:6px; cursor:pointer; transition:background 0.2s;" onmouseenter="this.style.background='var(--item-hover)'" onmouseleave="this.style.background='var(--bg-color)'" onclick="UI.selectNote('${bl.id}')">
                        <span style="color:var(--accent-color);">${Icons.arrowLeft}</span>
                        <span style="font-weight:bold; color:var(--text-primary); font-size:0.9rem;">${blTitle}</span>
                    </div>
                `;
            });
            bodyHTML += `</div>`;
        } else {
            bodyHTML += `<div style="font-size:0.85rem; color:var(--text-secondary); font-style:italic;">Nessuna nota punta a questa pagina.</div>`;
        }

        bodyHTML += `</div>`;

        // Outlinks
        bodyHTML += `
                <div>
                    <h4 style="margin:0 0 10px 0; color:var(--tx-c4); font-size:0.95rem; border-bottom:1px solid var(--border-color); padding-bottom:5px; display:flex; align-items:center; gap:6px;">
                        ${Icons.arrowRightUp} Menzioni in Uscita (Outlinks)
                    </h4>
                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:10px;">Questa pagina contiene link o cita le seguenti note:</div>
        `;

        if (outlinks.size > 0) {
            bodyHTML += `<div style="display:flex; flex-direction:column; gap:6px;">`;
            outlinks.forEach(outId => {
                const outNote = Store.getNote(outId);
                if (outNote && !outNote.deletedAt) {
                    const outTitle = (outNote.title || 'Senza Titolo').replace(/</g, '&lt;');
                    bodyHTML += `
                        <div style="display:flex; align-items:center; gap:8px; padding:8px 10px; background:var(--bg-color); border:1px dashed var(--border-color); border-radius:6px; cursor:pointer; transition:background 0.2s;" onmouseenter="this.style.background='var(--item-hover)'" onmouseleave="this.style.background='var(--bg-color)'" onclick="UI.selectNote('${outNote.id}')">
                            <span style="color:var(--tx-c4);">${Icons.link}</span>
                            <span style="font-weight:bold; color:var(--text-primary); font-size:0.9rem;">${outTitle}</span>
                        </div>
                    `;
                }
            });
            bodyHTML += `</div>`;
        } else {
            bodyHTML += `<div style="font-size:0.85rem; color:var(--text-secondary); font-style:italic;">Questa pagina non punta verso altre note interne.</div>`;
        }

        bodyHTML += `</div>`;

        // Auditing Sotto-note
        bodyHTML += `
                <div>
                    <h4 style="margin:0 0 10px 0; color:var(--text-primary); font-size:0.95rem; border-bottom:1px solid var(--border-color); padding-bottom:5px; display:flex; align-items:center; gap:6px;">
                        ${Icons.treeNode} Analisi Proprietà Sotto-note
                    </h4>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">Verifica a colpo d'occhio che le note figlie siano taggate correttamente:</div>
                    ${subNotesHtml}
                </div>
            </div>
        `;

        UI.openDrawer(`<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.info} Info: ${safeTitle}</span>`, bodyHTML, null);
    },

    // -------------------------------------------------------------
    // MOTORE TOC SCROLL SPY
    // -------------------------------------------------------------
    updateTOCScrollSpy: () => {
        if (AppState.isSwitchingNote) return;
        const editor = document.getElementById('noteContent');
        const scrollArea = document.querySelector('.editor-scroll-content');
        if (!editor || !scrollArea) return;

        const headers = Array.from(editor.querySelectorAll('h2, h3'));
        const tocNodes = document.querySelectorAll('.dynamic-toc-container .toc-node');
        
        if (headers.length === 0 || tocNodes.length === 0) return;

        let activeHeader = null;
        const areaRect = scrollArea.getBoundingClientRect();
        
        // Linea di innesco posizionata al 20% dello schermo (Rende l'aggancio più naturale e anticipato)
        const triggerLine = areaRect.top + (areaRect.height * 0.2); 

        // Scorriamo all'indietro: Il primo header (partendo dal basso) che ha superato la linea di innesco
        // verso l'alto, è quello attualmente in lettura.
        for (let i = headers.length - 1; i >= 0; i--) {
            const rect = headers[i].getBoundingClientRect();
            if (rect.top <= triggerLine) {
                activeHeader = headers[i];
                break;
            }
        }

        // Se nessun header ha superato la linea ma stiamo leggendo l'inizio, non evidenziamo nulla (o il primo)
        tocNodes.forEach(node => {
            node.style.color = '';
            node.style.fontWeight = '';
        });

        if (activeHeader) {
            const activeText = activeHeader.innerText.trim();
            for (let node of tocNodes) {
                const titleSpan = node.querySelector('span:not(.toc-icon)');
                if (titleSpan && titleSpan.innerText === activeText) {
                    node.style.color = 'var(--accent-color)';
                    node.style.fontWeight = 'bold';
                    
                    // Se l'albero è molto lungo, facciamo scorrere morbidamente la sidebar
                    // affinché il capitolo evidenziato sia sempre visibile
                    const treeContainer = document.getElementById('treeContainer');
                    if (treeContainer) {
                        const nodeRect = node.getBoundingClientRect();
                        const treeRect = treeContainer.getBoundingClientRect();
                        if (nodeRect.top < treeRect.top || nodeRect.bottom > treeRect.bottom) {
                            node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                    }
                    break;
                }
            }
        }
    }
});