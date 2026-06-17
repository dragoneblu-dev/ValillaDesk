/**
 * EditorCore.js
 * Inizializzazione editor e core engine (Caret, Boundaries e Sanificazione JSON).
 * FIX HYDRATION: Re-idratazione immediata post-salvataggio.
 * FIX FOCUS INPUT: Aggiunta esenzione in handleSmartClickEscape per preservare il focus delle search bar.
 * FIX CARET ENGINE: Introdotto _getTextAndCaret globale per la mappatura perfetta cursore/testo.
 * FIX GARBAGE COLLECTOR: Ora scansiona rigorosamente anche i Template (inclusi i widget nidificati)
 * per impedire l'eliminazione fisica di immagini e audio validi dal disco.
 * FIX ZWS POLLUTION: Implementato Garbage Collector in tempo reale in sanitizeContent per estirpare 
 * gli Zero-Width Space (\u200B) orfani dal DOM, pur proteggendo quelli necessari all'infrastruttura Widget.
 * FIX DRAG & DROP: Inseriti .adv-board-card e gli eventi calendario nella Whitelist di handleSmartClickEscape
 * per impedire che il preventDefault() sul mousedown blocchi la sequenza di Drag HTML5 nativa.
 */

const Editor = {
    savedRange: null,
    currentContext: null,
    selectedWidget: null,

    audioCache: {}, 
    imageCache: {},

    hydrateMedia: (container) => {
        container.querySelectorAll('img[data-image-ref]').forEach(img => {
            const ref = img.getAttribute('data-image-ref');
            if (ref && Editor.imageCache[ref]) {
                img.setAttribute('src', Editor.imageCache[ref]);
            }
        });
        container.querySelectorAll('audio[data-audio-ref]').forEach(aud => {
            const ref = aud.getAttribute('data-audio-ref');
            if (ref && Editor.audioCache[ref]) {
                aud.setAttribute('src', Editor.audioCache[ref]);
            }
        });
    },

    clearWidgetSelection: () => {
        if (Editor.selectedWidget) {
            Editor.selectedWidget.classList.remove('adv-widget-selected');
            Editor.selectedWidget = null;
        }
        document.querySelectorAll('.adv-widget-selected').forEach(el => el.classList.remove('adv-widget-selected'));
    },

    handleImageUpload: async (input) => {
        if (!input.files || !input.files[0]) return;
        
        if (!AppState.assetsHandle) {
            alert("Devi prima creare un Workspace per poter allegare file fisici.");
            input.value = '';
            return;
        }

        Editor.saveSnapshot();
        const file = input.files[0];
        
        if (typeof UI !== 'undefined') UI.showToast("Salvataggio immagine su disco in corso...", "info");
        
        const fileName = await Store.saveAsset(file, 'img');
        
        if (fileName) {
            const blobUrl = Editor.imageCache[fileName];
            
            Editor.restoreSelection();
            document.execCommand('insertHTML', false, `<img src="${blobUrl}" data-image-ref="${fileName}"><p><br></p>`);
            Store.triggerAutoSave();
        }
        
        input.value = '';
    },

    enforceBoundaries: () => {
        const editor = document.getElementById('noteContent');
        if (!editor) return;

        const protectedBlocks = editor.querySelectorAll(WidgetManager.blockSelector + ', ' + WidgetManager.inlineSelector);
        protectedBlocks.forEach(el => {
            if (el.getAttribute('contenteditable') !== 'false') {
                el.setAttribute('contenteditable', 'false');
            }
        });
        Editor._ensureLastLineBreak(editor);
    },
    
    _ensureLastLineBreak: (editorEl) => {
        if (!editorEl) return;
        const lastChild = editorEl.lastElementChild;
        if (lastChild && WidgetManager.isProtectedBlock(lastChild)) {
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            editorEl.appendChild(p);
        }
    },

    handleSmartClickEscape: (e) => {
        if (!AppState.isEditMode) return;
        
        // FIX FOCUS: Non impedire MAI il click nativo su campi di input o textarea (Es. Barra di ricerca Diario)
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const shell = e.target.closest('.adv-widget-shell, .adv-inline-shell');
        if (!shell) return;

        Editor.clearWidgetSelection();

        if (typeof WidgetManager !== 'undefined' && WidgetManager.isInsideEditableWidgetArea(e.target)) {
            return;
        }

        // LA SOLUZIONE: Aggiunti .adv-board-card e i blocchi del calendario alla Whitelist.
        // Se il click avviene su questi elementi (anche nelle loro parti non testuali), 
        // l'editor ignora il click, permettendo al browser di continuare e innescare il dragstart.
        if (e.target.closest('th, td, .widget-drag-handle, .widget-options-btn, .adv-tool-btn, .adv-add-btn, .adv-icon-btn, .adv-table-header, .btn, .action-btn-run, .adv-btn-icon-trigger, .snippet-copy-btn, .inline-note-marker, .adv-board-card, .adv-cal-event-std, .adv-cal-event-abs')) {
            console.log("🟢 [SMART-ESCAPE] Click ignorato per consentire interazione nativa (Drag/Click).");
            return;
        }

        const rect = shell.getBoundingClientRect();
        const isInline = shell.classList.contains('adv-inline-shell');
        
        const isBottomOrRightHalf = isInline 
            ? e.clientX > rect.left + (rect.width / 2) 
            : e.clientY > rect.top + (rect.height / 2);

        let targetNode = isBottomOrRightHalf ? shell.nextSibling : shell.previousSibling;
        
        // Per "evadere" dal widget se c'è un nodo testo vicino ci posizioniamo il cursore, altrimenti la selezione nativa
        // del browser farà il suo corso senza corrompere il documento.
        if (targetNode && targetNode.nodeType === 3) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.setStart(targetNode, isBottomOrRightHalf ? 0 : targetNode.length);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            e.preventDefault();
            e.stopPropagation();
        } else if (targetNode && targetNode.nodeType === 1 && !WidgetManager.isProtectedBlock(targetNode)) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(targetNode);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            e.preventDefault();
            e.stopPropagation();
        }
    },

    saveSelection: () => {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) Editor.savedRange = sel.getRangeAt(0);
    },

    restoreSelection: () => {
        if (Editor.savedRange) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(Editor.savedRange);
            let node = Editor.savedRange.commonAncestorContainer;
            if (node.nodeType === 3) node = node.parentNode;
            const editableElement = node.closest('[contenteditable="true"]');
            if (editableElement) editableElement.focus();
            else document.getElementById('noteContent')?.focus();
        } else {
            document.getElementById('noteContent')?.focus();
        }
    },

    _getAbsoluteCaretPosition: (el, isStart) => {
        const sel = window.getSelection();
        if (!sel.rangeCount) return 0;
        const range = sel.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(el);
        preCaretRange.setEnd(isStart ? range.startContainer : range.endContainer, isStart ? range.startOffset : range.endOffset);
        return preCaretRange.toString().length;
    },

    _setAbsoluteCaretPosition: (el, start, end) => {
        let startNode = null, endNode = null;
        let startChar = 0, endChar = 0, charCount = 0;

        const traverseNodes = (node) => {
            if (node.nodeType === 3) {
                let nextCharCount = charCount + node.length;
                if (!startNode && start >= charCount && start <= nextCharCount) {
                    startNode = node; startChar = start - charCount;
                }
                if (!endNode && end >= charCount && end <= nextCharCount) {
                    endNode = node; endChar = end - charCount;
                }
                charCount = nextCharCount;
            } else {
                for (let i = 0; i < node.childNodes.length; i++) {
                    traverseNodes(node.childNodes[i]);
                    if (startNode && endNode) return;
                }
            }
        };

        traverseNodes(el);

        if (startNode && endNode) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.setStart(startNode, startChar);
            range.setEnd(endNode, endChar);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    },

    _getCodeOffset: (preNode, targetContainer, targetOffset) => {
        let pos = 0;
        
        if (targetContainer === preNode) {
            for (let i = 0; i < targetOffset; i++) {
                const child = preNode.childNodes[i];
                if (child.nodeName === 'BR') pos += 1;
                else if (child.nodeType === 3) pos += child.nodeValue.length;
                else pos += child.textContent.length;
            }
            return pos;
        }

        const walker = document.createTreeWalker(preNode, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node === targetContainer) {
                if (node.nodeType === 3) {
                    pos += targetOffset;
                }
                return pos;
            }
            if (node.nodeType === 3) {
                pos += node.nodeValue.length;
            } else if (node.nodeName === 'BR') {
                pos += 1;
            }
        }
        return pos;
    },

    _setCodeOffset: (preNode, startOffset, endOffset) => {
        let startNode = null, endNode = null;
        let startChar = 0, endChar = 0, currentPos = 0;
        let lastTextNode = null;
        
        const walker = document.createTreeWalker(preNode, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
        let node;

        while ((node = walker.nextNode())) {
            if (node.nodeType !== 3 && node.nodeName !== 'BR') continue;

            let nodeLen = node.nodeType === 3 ? node.nodeValue.length : 1;
            if (node.nodeType === 3) lastTextNode = node;

            if (!startNode && currentPos + nodeLen >= startOffset) {
                startNode = node;
                startChar = startOffset - currentPos;
            }
            
            if (!endNode && currentPos + nodeLen >= endOffset) {
                endNode = node;
                endChar = endOffset - currentPos;
            }

            currentPos += nodeLen;

            if (startNode && endNode) break;
        }

        if (!startNode && lastTextNode) { 
            startNode = lastTextNode; 
            startChar = lastTextNode.nodeValue.length; 
        }
        if (!endNode && lastTextNode) { 
            endNode = lastTextNode; 
            endChar = lastTextNode.nodeValue.length; 
        }
        
        if (!startNode) { startNode = preNode; startChar = 0; }
        if (!endNode) { endNode = preNode; endChar = 0; }

        try {
            const sel = window.getSelection();
            const range = document.createRange();

            const applyEdge = (isStart, tgtNode, tgtChar) => {
                if (tgtNode.nodeType === 3) {
                    if (isStart) range.setStart(tgtNode, tgtChar);
                    else range.setEnd(tgtNode, tgtChar);
                } else if (tgtNode.nodeName === 'BR') {
                    const parent = tgtNode.parentNode;
                    const childIndex = Array.from(parent.childNodes).indexOf(tgtNode);
                    const finalIndex = tgtChar === 0 ? childIndex : childIndex + 1;
                    if (isStart) range.setStart(parent, finalIndex);
                    else range.setEnd(parent, finalIndex);
                } else {
                    const finalIndex = Math.min(tgtChar, tgtNode.childNodes.length);
                    if (isStart) range.setStart(tgtNode, finalIndex);
                    else range.setEnd(tgtNode, finalIndex);
                }
            };

            applyEdge(true, startNode, startChar);
            applyEdge(false, endNode, endChar);

            sel.removeAllRanges();
            sel.addRange(range);
        } catch (e) {
            console.error("[Caret Engine Error] Impossibile posizionare il cursore nel codice: ", e);
        }
    },

    cleanOrphanedCaches: () => {
        const activeDbIds = new Set();
        const activeImageIds = new Set();
        const activeAudioIds = new Set(); 

        const extractIds = (htmlString) => {
            if (!htmlString) return;
            const dbRegex = /id=["'](adv_tbl_[^"']+|adv_journal_[^"']+|adv_code_[^"']+|adv_btnbar_[^"']+|adv_pivot_[^"']+|adv_link_[^"']+|adv_cols_[^"']+|adv_audio_[^"']+|adv_vid_[^"']+)["']/g;
            let match;
            while ((match = dbRegex.exec(htmlString)) !== null) activeDbIds.add(match[1].split('_cited_')[0]);

            const imgRegex = /data-image-ref=["']([^"']+)["']/g;
            while ((match = imgRegex.exec(htmlString)) !== null) activeImageIds.add(match[1]);

            const audRegex = /data-audio-ref=["']([^"']+)["']/g;
            while ((match = audRegex.exec(htmlString)) !== null) activeAudioIds.add(match[1]);
        };

        // 1. Scansiona Editor Visibile e Note
        const editor = document.getElementById('noteContent');
        if (editor) extractIds(editor.innerHTML);
        AppState.notes.forEach(note => extractIds(note.content));
        
        // 2. Scansiona Stack di Undo/Redo
        if (Editor.undoStack) Editor.undoStack.forEach(extractIds);
        if (Editor.redoStack) Editor.redoStack.forEach(extractIds);

        // 3. Scansiona Template (Anche i Widget nidificati internamente!)
        if (AppState.templates) {
            AppState.templates.forEach(tpl => {
                extractIds(tpl.content);
                if (tpl.widgets) {
                    Object.values(tpl.widgets).forEach(state => {
                        if (state.rows) {
                            state.rows.forEach(row => {
                                if (row.cells) {
                                    Object.values(row.cells).forEach(cellVal => {
                                        if (typeof cellVal === 'string' && (cellVal.includes('data-image-ref') || cellVal.includes('data-audio-ref'))) {
                                            extractIds(cellVal); 
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }

        // 4. Scansiona il contenuto nativo dei Database in RAM
        if (AppState.databases) {
            Object.values(AppState.databases).forEach(state => {
                if (state.rows) {
                    state.rows.forEach(row => {
                        if (row.cells) {
                            Object.values(row.cells).forEach(cellVal => {
                                if (typeof cellVal === 'string' && (cellVal.includes('data-image-ref') || cellVal.includes('data-audio-ref'))) {
                                    extractIds(cellVal); 
                                }
                            });
                        }
                    });
                }
            });
        }

        // 5. Purga DB Orfani
        if (AppState.databases) {
            Object.keys(AppState.databases).forEach(id => {
                if (id === 'SYS_PROPERTIES_DB') return; 
                if (!activeDbIds.has(id)) delete AppState.databases[id];
            });
        }
        
        // 6. Purga Immagini Orfane in RAM
        if (Editor.imageCache) {
            Object.keys(Editor.imageCache).forEach(id => {
                if (!activeImageIds.has(id)) {
                    URL.revokeObjectURL(Editor.imageCache[id]);
                    delete Editor.imageCache[id];
                }
            });
        }
        
        // 7. Purga Audio Orfani in RAM
        if (Editor.audioCache) {
            Object.keys(Editor.audioCache).forEach(id => {
                if (!activeAudioIds.has(id)) {
                    URL.revokeObjectURL(Editor.audioCache[id]);
                    delete Editor.audioCache[id];
                }
            });
        }
    },

    minifyHTMLForStorage: (htmlString) => {
        if (!htmlString) return "";
        const temp = document.createElement('div');
        temp.innerHTML = htmlString;

        // Rimozione fonti dinamiche e iframes per prevenire Network Errors e CORS in background
        temp.querySelectorAll('iframe').forEach(ifr => {
            const src = ifr.getAttribute('src');
            if (src) {
                ifr.setAttribute('data-src', src);
                ifr.removeAttribute('src');
            }
        });
        
        temp.querySelectorAll('img[data-image-ref]').forEach(img => img.removeAttribute('src'));
        temp.querySelectorAll('audio[data-audio-ref]').forEach(aud => aud.removeAttribute('src'));

        temp.querySelectorAll('.adv-widget-shell').forEach(shell => {
            const type = shell.getAttribute('data-widget-type');
            
            // I video non vengono minificati (non avendo database, per mostrare l'iframe servono i dati crudi del body)
            if (['database', 'pivot', 'journal', 'buttonbar', 'code'].includes(type)) {
                shell.innerHTML = '';
            } 
            else if (type === 'citation') {
                const body = shell.querySelector('.citation-body');
                if (body) body.innerHTML = ''; 
            }
        });

        temp.querySelectorAll('#editor-undo-marker, .adv-multi-cursor, #tab-start-marker, #tab-end-marker').forEach(g => {
            const parent = g.parentNode;
            while (g.firstChild) parent.insertBefore(g.firstChild, g);
            parent.removeChild(g);
        });

        return temp.innerHTML;
    },

    _normalizeEmptyBlocks: (rootNode) => {
        const blockTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI'];
        const elements = Array.from(rootNode.querySelectorAll(blockTags.join(',')));

        elements.forEach(el => {
            if (WidgetManager.isTotallyProtected(el) || el.closest('.inline-note-wrapper')) {
                return;
            }

            const tag = el.tagName;
            const innerHTML = el.innerHTML;
            const cleanText = el.innerText.replace(/\u200B/g, '').trim();

            // Protegge iframe e audio dalle cancellazioni del normalizzatore
            if (innerHTML === '' && cleanText === '') {
                if (!el.querySelector('img') && !el.querySelector('audio') && !el.querySelector('iframe')) {
                    el.innerHTML = '<br>';
                }
                return;
            }

            if (tag === 'DIV' && (innerHTML === '<br>' || innerHTML.trim() === '<br>')) {
                const p = document.createElement('p');
                p.innerHTML = '<br>';
                
                if (el.hasAttribute('class')) p.className = el.className;
                if (el.hasAttribute('style')) p.style.cssText = el.style.cssText;
                
                el.parentNode.replaceChild(p, el);
            }
        });
    },

    getCleanHTML: () => {
        if (typeof CodeManager !== 'undefined' && typeof CodeManager.forceSyncAll === 'function') {
            CodeManager.forceSyncAll();
        }

        const editor = document.getElementById('noteContent');
        if (!editor) return "";
        const clone = editor.cloneNode(true);

        clone.querySelectorAll(WidgetManager.blockSelector).forEach(el => {
            el.style.boxShadow = ''; el.style.transition = '';
            el.classList.remove('adv-widget-selected');
            if (el.getAttribute('style') === '') el.removeAttribute('style');
        });

        clone.querySelectorAll('h1, h2, h3, .adv-bookmark-marker svg').forEach(el => {
            el.style.backgroundColor = ''; el.style.transition = ''; el.style.transform = ''; el.style.color = '';
            if (el.getAttribute('style') === '') el.removeAttribute('style');
        });

        const svgCopy = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        clone.querySelectorAll('.code-action-copy, .code-copy-btn').forEach(btn => {
            if (btn.innerHTML.includes("Copiato") || btn.innerHTML.includes("✓")) btn.innerHTML = svgCopy;
        });
        
        clone.normalize();
        Editor._normalizeEmptyBlocks(clone);
        return Editor.minifyHTMLForStorage(clone.innerHTML);
    },

    sanitizeContent: () => {
        if (typeof CodeManager !== 'undefined' && typeof CodeManager.forceSyncAll === 'function') {
            CodeManager.forceSyncAll();
        }

        const editor = document.getElementById('noteContent');
        if (!editor) return;
        
        Editor.cleanHighlightsBeforeSave();
        Editor._ensureLastLineBreak(editor);
        Editor.clearWidgetSelection();

        editor.querySelectorAll('input, textarea, select').forEach(el => {
            if (el.hasAttribute('id') && !el.id.startsWith('adv_') && !el.id.startsWith('j-search-')) {
                el.removeAttribute('id');
            }
            if (el.hasAttribute('name')) {
                el.removeAttribute('name');
            }
        });

        editor.querySelectorAll(WidgetManager.blockSelector).forEach(el => {
            el.setAttribute('contenteditable', 'false');
            el.style.boxShadow = ''; el.style.transition = '';
            el.classList.remove('adv-widget-selected');
            if (el.getAttribute('style') === '') el.removeAttribute('style');
        });
        
        editor.querySelectorAll('.code-content, .inline-note-marker').forEach(el => el.setAttribute('contenteditable', 'false'));

        editor.querySelectorAll('h1, h2, h3, .adv-bookmark-marker svg').forEach(el => {
            el.style.backgroundColor = ''; el.style.transition = ''; el.style.transform = ''; el.style.color = '';
            if (el.getAttribute('style') === '') el.removeAttribute('style');
        });

        const ghosts = editor.querySelectorAll('#editor-undo-marker, .adv-multi-cursor, #tab-start-marker, #tab-end-marker');
        ghosts.forEach(g => {
            const parent = g.parentNode;
            while (g.firstChild) parent.insertBefore(g.firstChild, g);
            parent.removeChild(g);
        });

        const svgCopy = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        editor.querySelectorAll('.code-action-copy, .code-copy-btn, .adv-tool-btn').forEach(btn => {
            if (btn.innerHTML.includes("Copiato") || btn.innerHTML.includes("✓")) {
                btn.innerHTML = svgCopy + (btn.innerText.includes('Copia') ? ' Copia' : '');
            }
        });

        // -------------------------------------------------------------
        // FIX ZWS POLLUTION: Garbage Collector in tempo reale per rimuovere
        // gli Zero-Width Space (\u200B) non più necessari dopo l'eliminazione dei Link.
        // -------------------------------------------------------------
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
        let node;
        const nodesToRemove = [];
        
        while ((node = walker.nextNode())) {
            if (node.nodeValue.includes('\u200B')) {
                // Se il nodo contiene testo nomale mischiato allo ZWS (es. typing sporco), pulisce solo lo ZWS
                if (node.nodeValue !== '\u200B') {
                    node.nodeValue = node.nodeValue.replace(/\u200B/g, '');
                } else {
                    // Se il nodo è ESATTAMENTE un \u200B, controlla se è essenziale per la struttura.
                    const prev = node.previousSibling;
                    const next = node.nextSibling;
                    const parent = node.parentNode;
                    
                    const isNeeded = (prev && (prev.tagName === 'A' || (prev.classList && prev.classList.contains('adv-inline-shell')))) ||
                                     (next && (next.tagName === 'A' || (next.classList && next.classList.contains('adv-inline-shell')))) ||
                                     (parent && (parent.classList && (parent.classList.contains('checklist-text') || parent.classList.contains('snippet-text'))));
                    
                    if (!isNeeded) {
                        nodesToRemove.push(node);
                    }
                }
            }
            if (node.nodeValue.includes('\u00A0\u00A0')) node.nodeValue = node.nodeValue.replace(/\u00A0{2,}/g, ' ');
        }
        
        // Purgiamo i nodi orfani
        nodesToRemove.forEach(n => n.remove());

        editor.normalize();
        Editor._normalizeEmptyBlocks(editor);

        // Reidrata immediatamente dopo la pulizia 
        // per riaccendere l'immagine (o iframe) nell'editor senza dover ricaricare la pagina
        Editor.hydrateMedia(editor);

        if (AppState.currentNoteId) {
            const note = Store.getNote(AppState.currentNoteId);
            if (note) {
                note.content = Editor.minifyHTMLForStorage(editor.innerHTML);
            }
        }
        
        Store.triggerAutoSave();
    },

    applyHighlight: (elementOrHtml, term) => {
        if (!term) return elementOrHtml;
        const isString = typeof elementOrHtml === 'string';
        const root = isString ? document.createElement('div') : elementOrHtml;
        if (isString) root.innerHTML = elementOrHtml;

        const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${safeTerm})`, 'gi');

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        const nodesToReplace = [];

        let n;
        while (n = walker.nextNode()) {
            const parentTag = n.parentNode ? n.parentNode.tagName.toUpperCase() : '';
            if (parentTag !== 'SCRIPT' && parentTag !== 'STYLE' && parentTag !== 'MARK' && !WidgetManager.isTotallyProtected(n.parentNode)) {
                if (n.nodeValue.match(regex)) nodesToReplace.push(n);
            }
        }

        nodesToReplace.forEach(textNode => {
            const fragment = document.createDocumentFragment();
            const parts = textNode.nodeValue.split(regex);
            parts.forEach(part => {
                if (part.toLowerCase() === term.toLowerCase()) {
                    const mark = document.createElement('mark');
                    mark.className = 'search-highlight';
                    mark.textContent = part;
                    fragment.appendChild(mark);
                } else if (part.length > 0) {
                    fragment.appendChild(document.createTextNode(part));
                }
            });
            textNode.parentNode.replaceChild(fragment, textNode);
        });

        return isString ? root.innerHTML : root;
    },

    cleanHighlightsBeforeSave: () => {
        const editor = document.getElementById('noteContent');
        if (editor) {
            let changed = true;
            while(changed) {
                changed = false;
                const marks = editor.querySelectorAll('mark.search-highlight');
                if (marks.length > 0) {
                    marks.forEach(m => {
                        const parent = m.parentNode;
                        while (m.firstChild) parent.insertBefore(m.firstChild, m);
                        parent.removeChild(m);
                    });
                    changed = true;
                }
            }
            editor.normalize();
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
    }
};