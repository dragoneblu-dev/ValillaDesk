/**
 * EditorFormat.js
 * Mixin per Formattazione Testuale, Stili Toolbar, Segnalibri, Appunti Inline e Inserimento Widget.
 * FIX REGRESSIONE: Ripristinato l'uso dello Zero-Width Space (\u200B) dopo l'inserimento di oggetti Inline.
 * FIX GOMMA: La Spugna Magica ora applica la "Deep Sanitization" draconiana su DIV e attributi alieni.
 * FIX SNIPPET: Reintegrata e corretta la logica di analisi del blocco vuoto. Ora lo snippet viene 
 * inserito all'interno del paragrafo esistente senza distruggere i tag strutturali (P, LI, DIV).
 */
Object.assign(Editor, {

    currentInlineNote: null,
    activeBookmark: null,
    _bookmarkInterval: null,

    openTextFormatMenu: (e, anchorId) => {
        if (e) e.stopPropagation();
        const executeFormat = (cmd, arg) => {
            Editor.saveSelection();
            Editor.applyTextFormat(cmd, arg);
        };

        const chk = ' <span style="color:var(--accent-color); font-weight:bold; float:right;">✓</span>';

        let activeFF = 'ff-default';
        let activeFS = 'fs-standard';

        // Estrazione dello stato corrente dalla formattazione del testo (Lettura Classi DOM)
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            let node = sel.anchorNode;
            if (node.nodeType === 3) node = node.parentNode;
            const span = node.closest('span[class*="ff-"], span[class*="fs-"]');
            if (span) {
                if (span.classList.contains('ff-serif')) activeFF = 'ff-serif';
                else if (span.classList.contains('ff-cursive')) activeFF = 'ff-cursive';
                else if (span.classList.contains('ff-easyreading')) activeFF = 'ff-easyreading';

                if (span.classList.contains('fs-small')) activeFS = 'fs-small';
                else if (span.classList.contains('fs-large')) activeFS = 'fs-large';
            }
        }

        const items = [
            { type: 'custom', html: '<div class="adv-dropdown-title" style="margin-bottom: 2px;">Font</div>' },
            { label: 'Standard (Mono)' + (activeFF === 'ff-default' ? chk : ''), onClick: () => executeFormat('ff', 'ff-default') },
            { label: 'Serif' + (activeFF === 'ff-serif' ? chk : ''), onClick: () => executeFormat('ff', 'ff-serif') },
            { label: 'Cursive' + (activeFF === 'ff-cursive' ? chk : ''), onClick: () => executeFormat('ff', 'ff-cursive') },
            { label: 'EasyReading PRO' + (activeFF === 'ff-easyreading' ? chk : ''), onClick: () => executeFormat('ff', 'ff-easyreading') },
            { type: 'divider' },
            { type: 'custom', html: '<div class="adv-dropdown-title" style="margin-bottom: 2px;">Dimensione</div>' },
            { label: 'Piccolo' + (activeFS === 'fs-small' ? chk : ''), onClick: () => executeFormat('fs', 'fs-small') },
            { label: 'Normale' + (activeFS === 'fs-standard' ? chk : ''), onClick: () => executeFormat('fs', 'fs-standard') },
            { label: 'Grande' + (activeFS === 'fs-large' ? chk : ''), onClick: () => executeFormat('fs', 'fs-large') }
        ];

        UI.Menu.buildContextMenu(anchorId, items);
    },

    openListMenu: (e, anchorId) => {
        if (e) e.stopPropagation();
        const executeInsert = (cmd, arg) => {
            Editor.saveSelection();
            Editor.insertList(cmd, arg);
        };

        const items = [
            { icon: '<span style="display:inline-block; width:20px; text-align:center; font-weight:bold;">•</span>', label: 'Elenco Puntato', shortcut: '- ', onClick: () => executeInsert('ul') },
            { icon: '<span style="display:inline-block; width:20px; text-align:center; font-weight:bold;">1.</span>', label: 'Elenco Numerato', shortcut: '1. ', onClick: () => executeInsert('ol', '1') },
            { icon: '<span style="display:inline-block; width:20px; text-align:center; font-weight:bold;">A.</span>', label: 'Elenco Lettere', onClick: () => executeInsert('ol', 'A') },
            { type: 'divider' },
            { icon: Icons.checkSquare, label: 'To-Do List', shortcut: '[] ', onClick: () => { Editor.saveSelection(); Editor.insertChecklist(); } },
            { icon: Icons.journal, label: 'Diario / Log Date', onClick: () => JournalManager.insert(true) }
        ];

        UI.Menu.buildContextMenu(anchorId, items);
    },

    openInsertMenu: (e, anchorId) => {
        if (e) e.stopPropagation();
        
        const executeInsert = (fn) => {
            Editor.saveSelection();
            fn();
        };

        const svgDivider = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><line x1="3" y1="12" x2="21" y2="12"></line></svg>`;

        const items = [
            { icon: Icons.link, label: 'Collegamento (Link)', onClick: () => executeInsert(() => LinkManager.openSelectionModal()) },
            { icon: Icons.image, label: 'Immagine', onClick: () => executeInsert(() => { document.getElementById('imgUpload').click(); }) },
            { icon: Icons.play, label: 'Traccia Audio (.mp3, .wav)', onClick: () => executeInsert(() => { document.getElementById('audioUpload').click(); }) },
            { type: 'divider' },
            { icon: svgDivider, label: 'Linea di Divisione', shortcut: '---', onClick: () => executeInsert(() => Editor.insertDivider()) },
            { type: 'divider' },
            { icon: Icons.bookmark, label: 'Segnalibro', shortcut: 'Ctrl+Shift+B', onClick: () => executeInsert(() => Editor.insertBookmark()) },
            { icon: Icons.noteInline, label: 'Appunto Inline (Nascosto)', onClick: () => executeInsert(() => Editor.insertInlineNote()) },
            { icon: Icons.clipboard, label: 'Snippet Copiabile', onClick: () => executeInsert(() => Editor.insertCopySnippet()) }
        ];

        UI.Menu.buildContextMenu(anchorId, items);
    },

    openWidgetsMenu: (e, anchorId) => {
        if (e) e.stopPropagation();
        
        const executeInsert = (fn) => {
            Editor.saveSelection();
            fn();
        };

        const items = [
            { icon: Icons.code, label: 'Blocco di Codice', onClick: () => executeInsert(() => Editor.insertCodeBlock()) },
            { icon: Icons.citation, label: 'Citazione', onClick: () => executeInsert(() => CitationManager.openModal()) },
            { icon: Icons.columns, label: 'Testo in Colonne', onClick: () => executeInsert(() => ColumnManager.insert()) },
            { type: 'divider' },
            { icon: Icons.tableSimple, label: 'Tabella', onClick: () => executeInsert(() => TableManager.openCreationModal()) },
            { icon: Icons.tableDatabase, label: 'Database', onClick: () => executeInsert(() => AdvancedTable.create()) },
            { icon: Icons.tablePivot, label: 'Vista / Pivot / Grafico', onClick: () => executeInsert(() => AdvancedPivotMenus.openCreateWizard()) },
            { type: 'divider' },
            { icon: Icons.play, label: 'Pulsante Macro', onClick: () => executeInsert(() => ButtonManager.insert()) }
        ];

        UI.Menu.buildContextMenu(anchorId, items);
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
    },

    healWidgetWrappers: () => {
        const editor = document.getElementById('noteContent');
        if (!editor) return;
        
        const formatTags = ['B', 'I', 'U', 'S', 'SPAN', 'FONT', 'MARK', 'A', 'STRONG', 'EM', 'STRIKE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
        let changed = true;
        
        while (changed) {
            changed = false;
            const widgets = editor.querySelectorAll('.adv-widget-shell');
            
            widgets.forEach(w => {
                let p = w.parentNode;
                if (p && p.id !== 'noteContent' && formatTags.includes(p.tagName.toUpperCase())) {
                    const wrapperToSplit = p;
                    const parentOfWrapper = p.parentNode;

                    const wrapperAfter = wrapperToSplit.cloneNode(false);
                    let next = w.nextSibling;
                    while(next) {
                        let sibling = next.nextSibling;
                        wrapperAfter.appendChild(next);
                        next = sibling;
                    }

                    parentOfWrapper.insertBefore(w, wrapperToSplit.nextSibling);
                    
                    if (wrapperAfter.childNodes.length > 0) {
                        parentOfWrapper.insertBefore(wrapperAfter, w.nextSibling);
                    }
                    
                    if (wrapperToSplit.childNodes.length === 0) {
                        wrapperToSplit.remove();
                    }
                    changed = true;
                }
            });
        }
    },

    exec: (cmd, val = null) => {
        Editor.saveSnapshot();
        document.execCommand(cmd, false, val);
        
        Editor.healWidgetWrappers();
        
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            let node = sel.getRangeAt(0).commonAncestorContainer;
            if (node.nodeType === 3) node = node.parentNode;
            const editableElement = node.closest('[contenteditable="true"]');
            if (editableElement) editableElement.focus();
            else document.getElementById('noteContent').focus();
        } else {
            document.getElementById('noteContent').focus();
        }

        Editor.updateToolbarFormatting();
    },

    moveBlock: (direction) => {
        if (!AppState.isEditMode) return;
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        let node = sel.anchorNode;
        let tempNode = node;
        if (tempNode.nodeType === 3) tempNode = tempNode.parentNode;

        let block = tempNode.closest('li, p, div, h1, h2, h3, h4, h5, h6, blockquote, pre');
        if (!block || block.id === 'noteContent') return;

        Editor.saveSnapshot();

        let marker = document.createElement('span');
        marker.id = 'editor-move-marker';
        const range = sel.getRangeAt(0).cloneRange();
        range.insertNode(marker);

        let moved = false;

        if (direction === -1) {
            const prev = block.previousElementSibling;
            if (prev) {
                block.parentNode.insertBefore(block, prev);
                moved = true;
            }
        } else {
            const next = block.nextElementSibling;
            if (next) {
                block.parentNode.insertBefore(block, next.nextSibling);
                moved = true;
            }
        }

        if (moved) {
            const savedMarker = document.getElementById('editor-move-marker');
            if (savedMarker) {
                const newRange = document.createRange();
                newRange.setStartBefore(savedMarker);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
                const parent = savedMarker.parentNode;
                parent.removeChild(savedMarker);
                parent.normalize();

                const scrollArea = document.querySelector('.editor-scroll-content');
                if (scrollArea) {
                    const rect = block.getBoundingClientRect();
                    const areaRect = scrollArea.getBoundingClientRect();
                    if (rect.top < areaRect.top + 40 || rect.bottom > areaRect.bottom - 40) {
                        block.scrollIntoView({ block: 'center', behavior: 'instant' });
                    }
                }
            }
            Store.triggerAutoSave();
        } else {
            const savedMarker = document.getElementById('editor-move-marker');
            if (savedMarker) {
                const parent = savedMarker.parentNode;
                parent.removeChild(savedMarker);
                parent.normalize();
            }
        }
    },

    checkContext: () => {
        if (!AppState.isEditMode) return;
        Editor.updateToolbarFormatting();
        Editor.enforceBoundaries();

        const selection = window.getSelection();
        if (selection.rangeCount === 0) {
            Editor.currentContext = null;
            return;
        }

        let node = selection.anchorNode;
        let parent = (node.nodeType === 3) ? node.parentNode : node;

        const isInsideColumn = parent.closest('.widget-type-columns') ? true : false;
        const isInsideSimpleTable = parent.closest('.simple-table-wrapper') ? true : false;
        
        const isInsideDB = WidgetManager.isProtectedBlock(parent) && !isInsideColumn && !isInsideSimpleTable;
        
        Editor.toggleAdvancedToolbar(!isInsideDB);

        let targetElement = null;
        if (parent.closest('table')) targetElement = parent.closest('table');
        else if (parent.closest('ul, ol')) targetElement = parent.closest('ul, ol');

        Editor.currentContext = targetElement;
    },

    editContextElement: () => {
        if (!Editor.currentContext) return;
        const el = Editor.currentContext;
        if (el.tagName === 'TABLE') {
            TableManager.editCurrentTable(el);
        } else if (el.tagName === 'UL' || el.tagName === 'OL') {
            if (typeof UI !== 'undefined' && UI.Menu) {
                // Simulate click on the list toolbar button
                const btn = document.getElementById('btnListMenu');
                if (btn) Editor.openListMenu(null, 'btnListMenu');
            }
        }
    },

    toggleAdvancedToolbar: (enable) => {
        const tb = document.getElementById('editorToolbar');
        if (!tb) return;
        
        // I pulsanti Undo/Redo vengono gestiti in esclusiva da Editor.updateUndoRedoUI() in history
        const buttons = tb.querySelectorAll('button:not([title*="Annulla Ultima"]):not([title*="Ripeti ("]):not([title="Maiuscolo/Minuscolo"])');
        const dropdowns = tb.querySelectorAll('.color-picker-group');

        buttons.forEach(btn => btn.disabled = !enable);
        dropdowns.forEach(grp => {
            if (!enable) grp.classList.add('disabled-tool');
            else grp.classList.remove('disabled-tool');
        });
    },

    updateToolbarFormatting: () => {
        if (!AppState.isEditMode) return;

        const toggleBtn = (id, state) => {
            const btn = document.getElementById(id);
            if (btn) {
                if (state) btn.classList.add('active-format');
                else btn.classList.remove('active-format');
            }
        };

        toggleBtn('btnFormatB', document.queryCommandState('bold'));
        toggleBtn('btnFormatI', document.queryCommandState('italic'));
        toggleBtn('btnFormatU', document.queryCommandState('underline'));
        toggleBtn('btnFormatS', document.queryCommandState('strikeThrough'));

        let isH1 = false, isH2 = false, isCustomFont = false;

        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            let node = sel.anchorNode;
            if (node.nodeType === 3) node = node.parentNode;

            const block = node.closest('h1, h2, h3, h4, h5, h6, ul, ol');
            if (block) {
                const tag = block.tagName.toLowerCase();
                if (tag === 'h2') isH1 = true;
                if (tag === 'h3') isH2 = true;
            }

            const span = node.closest('span[class*="ff-"], span[class*="fs-"]');
            if (span) isCustomFont = true;
        }

        toggleBtn('btnFormatH1', isH1);
        toggleBtn('btnFormatH2', isH2);
        toggleBtn('btnFormatTMenu', isCustomFont);
    },

    toggleHeader: (tag) => {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const parentNode = selection.getRangeAt(0).commonAncestorContainer;
        const element = (parentNode.nodeType === 3) ? parentNode.parentNode : parentNode;
        const blockElement = element.closest('h1, h2, h3, h4, h5, h6, p, div, li');

        if (!blockElement) {
            Editor.saveSnapshot();
            document.execCommand('formatBlock', false, tag);
            Editor.healWidgetWrappers();
            Editor.updateToolbarFormatting();
            return;
        }

        if (blockElement.nodeName.toLowerCase() === 'li') return;

        Editor.saveSnapshot();
        const currentTag = blockElement.nodeName.toLowerCase();
        const targetTag = tag.toLowerCase();
        if (currentTag === targetTag) document.execCommand('formatBlock', false, 'p');
        else document.execCommand('formatBlock', false, tag);
        
        Editor.healWidgetWrappers();
        Editor.updateToolbarFormatting();
    },

    toggleCase: () => {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const text = selection.toString();
        if (!text) return;
        Editor.saveSnapshot();
        let newText = (text === text.toUpperCase()) ? text.toLowerCase() : text.toUpperCase();
        document.execCommand('insertText', false, newText);
    },

    insertList: (type, style = null) => {
        Editor.restoreSelection();
        Editor.saveSnapshot();
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        let node = sel.anchorNode;
        if (node.nodeType === 3) node = node.parentNode;
        let block = node.closest('p, div');

        if (block && block.nextElementSibling && WidgetManager.isProtectedBlock(block.nextElementSibling) && block.innerText.replace(/\u200B/g, '').trim() === '') {
            const list = document.createElement(type);
            if (style && type === 'ol') list.setAttribute('type', style);
            
            const li = document.createElement('li');
            li.innerHTML = '<br>';
            list.appendChild(li);
            
            block.parentNode.replaceChild(list, block);
            
            const newRange = document.createRange();
            newRange.setStart(li, 0);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
            
            Store.triggerAutoSave();
            return;
        }

        if (type === 'ul') {
            document.execCommand('insertUnorderedList');
        } else if (type === 'ol') {
            document.execCommand('insertOrderedList');
            if (style) {
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const node = selection.anchorNode;
                    const ol = node.nodeType === 1 ? node.closest('ol') : node.parentNode.closest('ol');
                    if (ol) ol.setAttribute('type', style);
                }
            }
        }
        
        // Srotola le liste dal tag P in cui il browser (es. Chrome) le avvolge erroneamente
        const editor = document.getElementById('noteContent');
        if (editor) {
            const malformedLists = editor.querySelectorAll('p > ul, p > ol');
            malformedLists.forEach(list => {
                const pNode = list.parentNode;
                const parent = pNode.parentNode;
                parent.insertBefore(list, pNode);
                if (pNode.textContent.trim() === '' && pNode.children.length === 0) {
                    pNode.remove();
                }
            });
        }
        
        Store.triggerAutoSave();
    },

    insertChecklist: () => {
        Editor.saveSnapshot();
        Editor.restoreSelection();
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const ul = document.createElement('ul');
        ul.className = 'adv-checklist';
        
        const li = document.createElement('li');
        li.className = 'adv-checklist-item';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'adv-checklist-cb';

        const span = document.createElement('span');
        span.className = 'checklist-text';
        span.contentEditable = 'true';
        span.appendChild(document.createTextNode('\u200B'));

        li.appendChild(cb);
        li.appendChild(span);
        ul.appendChild(li);

        let node = sel.getRangeAt(0).commonAncestorContainer;
        if (node.nodeType === 3) node = node.parentNode;
        
        const parentLi = node.closest('li');
        
        if (parentLi) {
            parentLi.appendChild(ul);
        } else {
            const block = node.closest('p, div');
            if (block && block.innerText.trim() === '') {
                block.parentNode.replaceChild(ul, block);
            } else {
                if (sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(ul);
                } else {
                    document.getElementById('noteContent').appendChild(ul);
                }
            }
        }

        const newRange = document.createRange();
        newRange.selectNodeContents(span);
        newRange.collapse(false);
        sel.removeAllRanges();
        sel.addRange(newRange);
    },

    insertCodeBlock: () => {
        Editor.restoreSelection();
        const selection = window.getSelection();
        let node = selection.rangeCount > 0 ? selection.getRangeAt(0).commonAncestorContainer : null;
        if(node && node.nodeType === 3) node = node.parentNode;

        if (node && node.closest('.widget-type-columns')) {
            alert("Sposta il cursore fuori dalle colonne prima di inserire questo elemento.");
            return;
        }

        Editor.saveSnapshot();

        const id = 'adv_code_' + Store.generateId();
        
        if (!AppState.databases) AppState.databases = {};
        AppState.databases[id] = { title: 'Codice', language: 'none', content: '' };

        let wrapper;
        if (typeof WidgetManager !== 'undefined') {
            wrapper = WidgetManager.createShell('code', id, '<pre class="code-content" data-language="none" contenteditable="true"><br></pre>');
        } else {
            const htmlStr = `<div id="${id}" class="code-wrapper widget-type-code adv-widget-shell" data-widget-type="code" contenteditable="false"><pre class="code-content" contenteditable="true" data-language="none"><br></pre></div>`;
            document.execCommand('insertHTML', false, htmlStr + '<p><br></p>');
            return;
        }

        // 1. Cerca il blocco contenitore più vicino al cursore (paragrafo, div, intestazione)
        let targetBlock = node ? node.closest('p, div, li, h1, h2, h3, h4, h5, h6') : null;
        
        // 2. Verifica se il blocco trovato è "vuoto"
        const hasWidgets = targetBlock ? !!targetBlock.querySelector('.adv-widget-shell, .adv-inline-shell, img, audio, iframe') : false;
        const isEmptyBlock = targetBlock && targetBlock.id !== 'noteContent' && !hasWidgets && targetBlock.textContent.replace(/[\u200B\n\r]/g, '').trim() === '';

        if (isEmptyBlock) {
            targetBlock.parentNode.replaceChild(wrapper, targetBlock);
        } else {
            if (selection.rangeCount) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(wrapper);
            } else {
                document.getElementById('noteContent').appendChild(wrapper);
            }
        }
        
        const p = document.createElement('p'); p.innerHTML = '<br>';
        wrapper.parentNode.insertBefore(p, wrapper.nextSibling);

        Editor._ensureLastLineBreak(document.getElementById('noteContent'));

        if (typeof WidgetManager !== 'undefined') WidgetManager.mountAll();
        Store.triggerAutoSave();

        setTimeout(() => {
            const preElement = document.querySelector(`#${id} pre`);
            if (preElement) {
                preElement.focus();
                const newRange = document.createRange();
                newRange.selectNodeContents(preElement);
                newRange.collapse(false);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(newRange);
            }
        }, 50);
    },

    insertCopySnippet: () => {
        Editor.saveSnapshot();
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);

        const wrapper = document.createElement('span');
        wrapper.className = 'adv-copy-snippet adv-inline-shell';
        wrapper.setAttribute('data-widget-type', 'snippet');
        wrapper.setAttribute('contenteditable', 'false');

        const textSpan = document.createElement('span');
        textSpan.className = 'snippet-text widget-editable-area';
        textSpan.setAttribute('contenteditable', 'true');

        const btnSpan = document.createElement('span');
        btnSpan.className = 'snippet-copy-btn';
        btnSpan.setAttribute('contenteditable', 'false');
        btnSpan.setAttribute('title', 'Copia');
        btnSpan.innerHTML = typeof Icons !== 'undefined' ? Icons.clipboard : '📋';

        wrapper.appendChild(document.createTextNode('\u200B'));
        wrapper.appendChild(textSpan);
        wrapper.appendChild(btnSpan);
        wrapper.appendChild(document.createTextNode('\u200B'));

        // REINTEGRAZIONE E CORREZIONE: Controllo strutturale del blocco per prevenire il Nesting
        let targetBlock = range.startContainer.nodeType === 3 ? range.startContainer.parentNode.closest('p, div, li, h1, h2, h3, h4, h5, h6') : range.startContainer.closest('p, div, li, h1, h2, h3, h4, h5, h6');
        const hasWidgets = targetBlock ? !!targetBlock.querySelector('.adv-widget-shell, .adv-inline-shell, img, audio, iframe') : false;
        const isEmptyBlock = targetBlock && targetBlock.id !== 'noteContent' && !hasWidgets && targetBlock.textContent.replace(/[\u200B\n\r]/g, '').trim() === '';

        range.deleteContents();

        if (isEmptyBlock) {
            // FIX INLINE BLOCK NESTING: Svuotiamo il paragrafo e inseriamo lo span al suo interno
            // Mantenendo il tag P originale, l'editor non andrà in crash strutturale.
            targetBlock.innerHTML = '';
            targetBlock.appendChild(wrapper);
        } else {
            range.insertNode(wrapper);
        }

        // Cuscinetti esterni di sicurezza per permettere alla freccia ArrowDown 
        // e ArrowRight del browser di superare l'ostacolo dell'inline-flex
        const zwsBefore = document.createTextNode('\u200B');
        const zwsAfter = document.createTextNode('\u200B');
        
        wrapper.parentNode.insertBefore(zwsBefore, wrapper);
        wrapper.parentNode.insertBefore(zwsAfter, wrapper.nextSibling);

        const newRange = document.createRange();
        newRange.selectNodeContents(textSpan);
        newRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(newRange);

        Store.triggerAutoSave();
    },

    // -------------------------------------------------------------
    // MOTORE APPIATTIMENTO FONT E DIMENSIONI E GOMMA FORMATTAZIONE
    // FIX DEEP SANITIZATION: ClearFormatting ora applica la rimozione draconiana dei DIV.
    // -------------------------------------------------------------
    applyTextFormat: (prefix, className) => {
        Editor.saveSnapshot();
        Editor.restoreSelection();

        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) return;

        const editor = document.getElementById('noteContent') || document.getElementById('inlineNoteInput');
        if (!editor) return;

        // Assicuriamo che il browser inietti markup standard e non CSS inline se possibile
        document.execCommand('styleWithCSS', false, false);

        // Dizionari Matrici (Magic Strings)
        const magicFF = { 'ff-serif': 'MagicSerif', 'ff-cursive': 'MagicCursive', 'ff-easyreading': 'MagicEasy' };
        const magicFS = { 'fs-small': '1', 'fs-large': '5' };

        // 1. PREPARAZIONE DEL DOM
        // Sostituiamo le classi attualmente presenti nell'editor con attributi nativi "esca",
        // preservando però i Widget dal tocco distruttivo
        editor.querySelectorAll('*').forEach(el => {
            if (typeof ColorManager !== 'undefined' && !ColorManager._isSafeToColor(el)) return;

            if (prefix === 'ff') {
                for (let cls in magicFF) {
                    if (el.classList.contains(cls)) {
                        el.setAttribute('face', magicFF[cls]);
                        el.classList.remove(cls);
                    }
                }
            } else if (prefix === 'fs') {
                for (let cls in magicFS) {
                    if (el.classList.contains(cls)) {
                        el.setAttribute('size', magicFS[cls]);
                        el.classList.remove(cls);
                    }
                }
            }
        });

        // 2. ESECUZIONE DEL TAGLIO NATIVO DEL BROWSER (ExecCommand)
        let command = prefix === 'ff' ? 'fontName' : 'fontSize';
        let targetValue = '';
        
        if (prefix === 'ff') {
            targetValue = magicFF[className] || 'MagicRemoveFF';
        } else {
            targetValue = magicFS[className] || '3'; // 3 è la dimensione di reset (Standard)
        }

        document.execCommand(command, false, targetValue);

        // 3. RIPRISTINO CLASSI DA NATIVO
        // Andiamo a caccia delle modifiche fatte dal browser per tradurle nuovamente nel nostro CSS
        editor.querySelectorAll('*').forEach(el => {
            if (typeof ColorManager !== 'undefined' && !ColorManager._isSafeToColor(el)) return;

            if (prefix === 'ff') {
                const faceAttr = el.getAttribute('face') || '';
                const ffStyle = (el.style.fontFamily || '').replace(/['"]/g, '').trim(); 
                
                if (faceAttr === 'MagicRemoveFF' || ffStyle === 'MagicRemoveFF') {
                    el.removeAttribute('face');
                    el.style.fontFamily = '';
                } else {
                    for (let cls in magicFF) {
                        if (faceAttr === magicFF[cls] || ffStyle === magicFF[cls]) {
                            el.classList.add(cls);
                            el.removeAttribute('face');
                            el.style.fontFamily = '';
                            break;
                        }
                    }
                }
            } else if (prefix === 'fs') {
                const sizeAttr = el.getAttribute('size');
                const fsStyle = el.style.fontSize; 

                const isSmall = sizeAttr === '1' || fsStyle === 'x-small' || fsStyle === '10px';
                const isLarge = sizeAttr === '5' || fsStyle === 'x-large' || fsStyle === '24px';
                const isDefault = sizeAttr === '3' || fsStyle === 'medium' || fsStyle === '16px';

                if (isDefault) {
                    el.removeAttribute('size');
                    el.style.fontSize = '';
                } else if (isSmall) {
                    el.classList.add('fs-small');
                    el.removeAttribute('size');
                    el.style.fontSize = '';
                } else if (isLarge) {
                    el.classList.add('fs-large');
                    el.removeAttribute('size');
                    el.style.fontSize = '';
                }
            }
        });

        // 4. PULIZIA AGGRESSIVA (Rimuove gli span rimasti vuoti e unisce il testo)
        let changed = true;
        while (changed) {
            changed = false;
            editor.querySelectorAll('*').forEach(el => {
                if (typeof ColorManager !== 'undefined' && !ColorManager._isSafeToColor(el)) return;

                if (el.getAttribute('class') === '') el.removeAttribute('class');
                if (el.getAttribute('style') === '') el.removeAttribute('style');
                if (el.getAttribute('face') === '') el.removeAttribute('face');
                if (el.getAttribute('size') === '') el.removeAttribute('size');
                if (el.getAttribute('color') === '') el.removeAttribute('color');

                if (el.tagName === 'SPAN' || el.tagName === 'FONT') {
                    if (el.attributes.length === 0 || (el.tagName === 'SPAN' && el.classList.length === 0 && !el.hasAttribute('style'))) {
                        const parent = el.parentNode;
                        while (el.firstChild) parent.insertBefore(el.firstChild, el);
                        parent.removeChild(el);
                        changed = true;
                    }
                }
            });
        }
        editor.normalize(); 

        Store.triggerAutoSave();
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);
        Editor.updateToolbarFormatting();
    },

    insertBookmark: () => {
        Editor.saveSnapshot();
        const editor = document.getElementById('noteContent');
        if (!editor) return;

        // RIMOSSI I VECCHI SEGNALIBRI DAL DOM
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

    insertInlineNote: () => {
        Editor.saveSnapshot();
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);

        const wrapper = document.createElement('span');
        wrapper.className = 'inline-note-wrapper adv-inline-shell';
        wrapper.setAttribute('data-widget-type', 'inline-note');

        const marker = document.createElement('span');
        marker.className = 'inline-note-marker';
        marker.setAttribute('contenteditable', 'false');
        marker.innerHTML = Icons.noteInline;

        const dataStorage = document.createElement('span');
        dataStorage.className = 'inline-note-data';
        dataStorage.style.display = 'none';

        wrapper.appendChild(marker);
        wrapper.appendChild(dataStorage);

        range.deleteContents();
        
        // FIX INLINE BLOCK NESTING E CURSORE: Aggiungiamo i cuscinetti Zero-Width Space
        // per permettere alla freccia ArrowDown del browser di funzionare.
        const zwsBefore = document.createTextNode('\u200B');
        const zwsAfter = document.createTextNode('\u200B');
        
        range.insertNode(zwsAfter);
        range.insertNode(wrapper);
        range.insertNode(zwsBefore);

        const newRange = document.createRange();
        newRange.setStartAfter(zwsAfter);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        
        setTimeout(() => { Editor.handleInlineNoteClick(marker); }, 50);
    },

    handleInlineNoteClick: (element) => {
        if (!AppState.isEditMode) return;

        Editor.currentInlineNote = element;
        let wrapper = element.closest('.inline-note-wrapper, .adv-inline-shell');
        let dataSpan = null;
        
        if (!wrapper) {
            wrapper = document.createElement('span');
            wrapper.className = 'inline-note-wrapper adv-inline-shell';
            wrapper.setAttribute('data-widget-type', 'inline-note');
            element.parentNode.insertBefore(wrapper, element);
            wrapper.appendChild(element);
        }

        dataSpan = wrapper.querySelector('.inline-note-data');
        
        if (!dataSpan) {
            const oldText = element.getAttribute('data-tooltip') || '';
            element.removeAttribute('data-tooltip'); 
            dataSpan = document.createElement('span');
            dataSpan.className = 'inline-note-data';
            dataSpan.style.display = 'none';
            dataSpan.innerHTML = oldText;
            wrapper.appendChild(dataSpan);
        }

        const currentHTML = dataSpan.innerHTML;

        const bodyHTML = `
            <div style="background: rgba(0,0,0,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display:flex; flex-direction:column;">
                <div class="toolbar" style="margin-bottom: 10px; padding: 0; border: none; background: transparent;">
                    <button class="adv-icon-btn" onclick="document.execCommand('bold', false, null)" title="Grassetto"><b>B</b></button>
                    <button class="adv-icon-btn" onclick="document.execCommand('italic', false, null)" title="Corsivo"><i>I</i></button>
                    <button class="adv-icon-btn" onclick="document.execCommand('underline', false, null)" title="Sottolineato"><u>U</u></button>
                    <div style="width:1px; height:15px; background:var(--border-color); margin:0 5px;"></div>
                    <button class="adv-icon-btn" onclick="document.execCommand('insertUnorderedList', false, null)" title="Lista Puntata"><b>•</b></button>
                </div>
                <div id="inlineNoteInput" class="editor-content" contenteditable="true" style="outline: none; flex:1; background:var(--bg-color); border:1px solid var(--border-color); padding:10px; border-radius:4px; overflow-y:auto;">${currentHTML}</div>
            </div>
            <p style="font-size:0.75rem; color:var(--text-secondary); margin-top:10px; margin-bottom:0;">L'appunto resterà nascosto nel testo sotto forma di icona, e comparirà passandoci il mouse sopra. Utile per glossari o promemoria.</p>
        `;
        
        const footerHTML = `
            <button class="btn" onclick="UI.closeDrawer()">Annulla</button>
            <button class="btn btn-primary" onclick="Editor.saveInlineNote()">Salva Appunto</button>
        `;

        UI.openDrawer('💬 Modifica Appunto Nascosto', bodyHTML, footerHTML);

        setTimeout(() => {
            const input = document.getElementById('inlineNoteInput');
            if (input) input.focus();
        }, 50);
    },

    saveInlineNote: () => {
        const input = document.getElementById('inlineNoteInput');
        if (!input || !Editor.currentInlineNote) return;

        const newHTML = input.innerHTML;

        Editor.saveSnapshot();
        
        const wrapper = Editor.currentInlineNote.closest('.inline-note-wrapper, .adv-inline-shell');
        if (wrapper) {
            const dataSpan = wrapper.querySelector('.inline-note-data');
            if (dataSpan) dataSpan.innerHTML = newHTML;
        }

        if (typeof UI !== 'undefined' && UI.renderInlineFootnotes) {
            UI.renderInlineFootnotes();
        }

        Store.triggerAutoSave();
        UI.closeDrawer();
        Editor.currentInlineNote = null;
    },

    insertDivider: () => {
        Editor.saveSnapshot();
        Editor.restoreSelection();
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(true);

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const hr = document.createElement('hr');
        const p = document.createElement('p');
        p.innerHTML = '<br>';

        const range = sel.getRangeAt(0);
        let node = range.startContainer;
        if (node.nodeType === 3) node = node.parentNode;
        let block = node.closest('p, div, h1, h2, h3, li');
        
        if (block && block.id !== 'noteContent') {
            block.parentNode.insertBefore(hr, block.nextSibling);
            block.parentNode.insertBefore(p, hr.nextSibling);
        } else {
            range.insertNode(hr);
            hr.parentNode.insertBefore(p, hr.nextSibling);
        }

        const newRange = document.createRange();
        newRange.setStart(p, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        Store.triggerAutoSave();
    },

    clearFormatting: () => {
        Editor.saveSnapshot();
        Editor.restoreSelection();

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        let range = selection.getRangeAt(0);

        // Salviamo i riferimenti testuali iniziali per posizionare il cursore a fine operazione
        const isSafeToTouch = (node) => {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
            if (node.id === 'noteContent') return false;

            if (WidgetManager.isInsideEditableWidgetArea(node)) return true; 

            if (WidgetManager.isProtectedBlock(node) || 
                WidgetManager.isProtectedInline(node) || 
                node.closest('.internal-link, .file-link')) {
                return false;
            }
            if (node.classList && (
                node.classList.contains('internal-link') || 
                node.classList.contains('file-link') || 
                node.classList.contains('inline-note-marker') || 
                node.classList.contains('adv-bookmark-marker') || 
                node.classList.contains('adv-copy-snippet') ||
                node.classList.contains('snippet-copy-btn')
            )) {
                return false;
            }
            return true;
        };

        const allowedTags = ['B', 'I', 'U', 'S', 'A', 'P', 'SPAN', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'BR', 'IMG', 'INPUT', 'SVG', 'PATH', 'POLYLINE', 'LINE', 'RECT', 'CIRCLE'];
        const allowedPrefixes = ['hl-', 'tx-', 'bg-', 'text-', 'ff-', 'fs-'];
        const allowedClasses = ['internal-link', 'file-link', 'code-wrapper', 'code-copy-btn', 'table-striped', 'highlighted-text', 'adv-table-wrapper', 'inline-note-marker', 'inline-note-wrapper', 'inline-note-data', 'adv-checklist', 'adv-checklist-item', 'adv-checklist-cb', 'checklist-text', 'adv-journal-list', 'journal-date-node', 'journal-date-header', 'journal-toggle', 'journal-date-label', 'journal-time-list', 'journal-time-node', 'journal-time-label', 'journal-content', 'hidden-time', 'code-action-bar', 'code-action-btn', 'code-content', 'code-action-lang', 'code-action-copy', 'adv-widget-shell', 'adv-inline-shell', 'widget-type-code', 'adv-action-button-wrapper', 'simple-table-wrapper'];
        const allowedDataAttrs = ['data-widget-type', 'data-image-ref', 'data-audio-ref', 'data-note-id', 'data-anchor', 'data-ref-id', 'data-file-path', 'data-tooltip', 'data-row', 'data-col', 'data-raw-value', 'data-decimals', 'data-opt-name', 'data-date', 'data-timer-expire', 'data-ref-note', 'data-ref-type', 'data-collapsed', 'data-last-find', 'data-language'];

        let container = range.commonAncestorContainer;
        if (container.nodeType === 3) container = container.parentNode;

        let macroBlock = container.closest('table, ul, ol, blockquote, .journal-time-node');
        if (macroBlock && !WidgetManager.isProtectedBlock(macroBlock)) {
            if (macroBlock.classList.contains('journal-time-node')) container = macroBlock.querySelector('.journal-content');
            else container = macroBlock;
        } else {
            let curr = container;
            while (curr && curr.id !== 'noteContent' && curr.tagName) {
                if (!allowedTags.includes(curr.tagName.toUpperCase())) container = curr;
                curr = curr.parentNode;
            }
        }

        const elementsToClean = [];
        const forceCleanAll = container.id === 'noteContent' || container.tagName === 'TABLE';

        // 1. Estraiamo tutti i nodi toccati dal Range PRIMA di svuotarlo
        if (isSafeToTouch(container) || container.id === 'noteContent') {
            const isIntersecting = (node) => {
                if (forceCleanAll) return true;
                const nodeRange = document.createRange();
                try {
                    nodeRange.selectNode(node);
                    return range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
                           range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0;
                } catch(e) { return false; }
            };
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, null, false);
            
            if (container.id !== 'noteContent' && isIntersecting(container)) {
                elementsToClean.push(container);
            }
            
            let currentNode;
            while ((currentNode = walker.nextNode())) {
                if (currentNode.id === 'noteContent') continue; 
                if (isIntersecting(currentNode)) {
                    elementsToClean.push(currentNode);
                }
            }
        }

        // 2. Togliamo la selezione del browser PRIMA di alterare fisicamente il DOM
        selection.removeAllRanges();

        // 3. Funzione di processamento (eseguita Bottom-Up)
        const processElement = (el) => {
            if (!document.body.contains(el)) return null; // Salta i nodi che abbiamo già eliminato nei cicli precedenti
            
            // LA MAGIA: Se il nodo fa parte di un widget o è un contenitore di sistema, lo saltiamo del tutto
            const isInternalWidget = el.closest('.adv-widget-shell, .simple-table-wrapper, .adv-inline-shell');

            if (!isSafeToTouch(el)) return el;

            let currentEl = el;
            let tag = currentEl.tagName.toUpperCase();

            // CONVERSIONE DIV IN P: Solo se proviene dal testo normale, srotola l'impalcatura
            if (!isInternalWidget && (tag === 'DIV' || tag === 'HEADER' || tag === 'FOOTER' || tag === 'ASIDE')) {
                const p = document.createElement('p');
                if (currentEl.className) p.className = currentEl.className;
                if (currentEl.style.cssText) p.style.cssText = currentEl.style.cssText;
                
                while (currentEl.firstChild) p.appendChild(currentEl.firstChild);
                currentEl.parentNode.replaceChild(p, currentEl);
                
                if (container === currentEl) container = p; 
                currentEl = p;
                tag = 'P';
            }

            if (!allowedTags.includes(tag)) {
                const frag = document.createDocumentFragment();
                while (currentEl.firstChild) frag.appendChild(currentEl.firstChild);
                currentEl.parentNode.replaceChild(frag, currentEl);
                return null;
            }

            // RIMUOVIAMO GLI ATTRIBUTI ALIENI
            const attrs = Array.from(currentEl.attributes);
            attrs.forEach(attr => {
                if (tag === 'SVG' && ['viewBox', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'].includes(attr.name)) return;
                if (['PATH', 'POLYLINE', 'LINE', 'RECT', 'CIRCLE'].includes(tag) && ['d', 'points', 'x1', 'y1', 'x2', 'y2', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry'].includes(attr.name)) return;
                if (attr.name === 'href' && tag === 'A') return;
                if (attr.name === 'src' && tag === 'IMG') return;
                if (attr.name === 'type' && ['UL', 'OL', 'INPUT'].includes(tag)) return;
                if (attr.name === 'contenteditable') return;
                if (attr.name === 'id' && isInternalWidget) return;

                if (attr.name === 'class') {
                    const classes = attr.value.split(/\s+/).filter(cls => allowedClasses.includes(cls) || allowedPrefixes.some(p => cls.startsWith(p)));
                    if (classes.length > 0) currentEl.setAttribute('class', classes.join(' '));
                    else currentEl.removeAttribute('class');
                } else if (attr.name === 'style') {
                    if (currentEl.classList.contains('inline-note-data') && attr.value.includes('none')) {
                        currentEl.setAttribute('style', 'display: none;'); 
                    } else if (isInternalWidget) {
                        return; // Non toccare gli stili dei widget! (es. larghezza colonne)
                    } else {
                        currentEl.removeAttribute('style'); // Nuke totale per testo normale
                    }
                } else if (attr.name.startsWith('data-')) {
                    if (allowedDataAttrs.includes(attr.name)) return;
                    currentEl.removeAttribute(attr.name);
                } else {
                    currentEl.removeAttribute(attr.name);
                }
            });

            // GOMMA SROTOLAMENTO: Rimuove i contenitori vuoti
            if ((tag === 'FONT' || tag === 'SPAN') && !isInternalWidget) {
                if (currentEl.attributes.length === 0) {
                    const parent = currentEl.parentNode;
                    while (currentEl.firstChild) parent.insertBefore(currentEl.firstChild, currentEl);
                    parent.removeChild(currentEl);
                    return null;
                }
            }
            
            return currentEl;
        };

        // 4. Eseguiamo la pulizia sulla matrice pre-calcolata in ordine inverso
        elementsToClean.reverse().forEach(el => processElement(el));

        // 5. Rimettiamo una selezione generica sul contenitore pulito
        try {
            const newRange = document.createRange();
            newRange.selectNodeContents(container);
            selection.removeAllRanges();
            selection.addRange(newRange);
        } catch(e) {}

        Editor.healWidgetWrappers();
        Store.triggerAutoSave();
        Editor.updateToolbarFormatting();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(Editor.initBookmarkCron, 1000);
});