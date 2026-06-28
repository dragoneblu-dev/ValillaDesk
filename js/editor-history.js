/**
 * EditorHistory.js
 * Mixin per Undo, Redo e Snapshot tracking con Tokenizzazione Immagini e Audio.
 */
Object.assign(Editor, {
    undoStack: [],
    redoStack: [],
    isTyping: false,
    typingTimer: null,

    imageCache: {},
    audioCache: {}, 

    updateUndoRedoUI: () => {
        const undoBtn = document.querySelector('#editorToolbar button[title*="Annulla Ultima Modifica"]');
        const redoBtn = document.querySelector('#editorToolbar button[title*="Ripeti ("]');
        
        if (undoBtn) {
            if (Editor.undoStack.length === 0) {
                undoBtn.disabled = true;
                undoBtn.style.opacity = '0.3';
                undoBtn.style.cursor = 'default';
            } else {
                undoBtn.disabled = false;
                undoBtn.style.opacity = '1';
                undoBtn.style.cursor = 'pointer';
            }
        }
        
        if (redoBtn) {
            if (Editor.redoStack.length === 0) {
                redoBtn.disabled = true;
                redoBtn.style.opacity = '0.3';
                redoBtn.style.cursor = 'default';
            } else {
                redoBtn.disabled = false;
                redoBtn.style.opacity = '1';
                redoBtn.style.cursor = 'pointer';
            }
        }
    },

    clearHistory: () => {
        Editor.undoStack = [];
        Editor.redoStack = [];
        Editor.isTyping = false;
        clearTimeout(Editor.typingTimer);
        Editor.updateUndoRedoUI();
    },

    // MOTORE CARET ASSOLUTO (Infallibile)
    _getCodeOffset: (preNode, targetContainer, targetOffset) => {
        try {
            // Seleziona tutto dall'inizio del blocco PRE fino al cursore esatto
            const range = document.createRange();
            range.setStart(preNode, 0);
            range.setEnd(targetContainer, targetOffset);
            
            // Estrae una copia del DOM contenente solo la parte prima del cursore
            const frag = range.cloneContents();
            let pos = 0;
            
            // Conta in modo matematico tutti i caratteri e le andate a capo presenti
            const walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
            let node;
            while ((node = walker.nextNode())) {
                if (node.nodeType === 3) pos += node.nodeValue.length;
                else if (node.nodeName === 'BR') pos += 1;
            }
            return pos;
        } catch (e) {
            return 0;
        }
    },

    _setCodeOffset: (preNode, startOffset, endOffset) => {
        let startNode = null, endNode = null;
        let startChar = 0, endChar = 0, currentPos = 0;
        let lastNode = null;

        const walker = document.createTreeWalker(preNode, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
        let node;

        while ((node = walker.nextNode())) {
            if (node.nodeType !== 3 && node.nodeName !== 'BR') continue;

            let nodeLen = node.nodeType === 3 ? node.nodeValue.length : 1;

            if (!startNode && currentPos + nodeLen >= startOffset) {
                startNode = node;
                startChar = startOffset - currentPos;
            }
            if (!endNode && currentPos + nodeLen >= endOffset) {
                endNode = node;
                endChar = endOffset - currentPos;
            }

            lastNode = node;
            currentPos += nodeLen;

            if (startNode && endNode) break;
        }

        if (!startNode && lastNode) { 
            startNode = lastNode; 
            startChar = lastNode.nodeType === 3 ? lastNode.nodeValue.length : 1; 
        }
        if (!endNode && lastNode) { 
            endNode = lastNode; 
            endChar = lastNode.nodeType === 3 ? lastNode.nodeValue.length : 1; 
        }

        if (!startNode) {
            startNode = preNode; startChar = 0;
            endNode = preNode; endChar = 0;
        }

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
            //console.error("[UNDO-DEBUG] Errore in setCodeOffset:", e);
        }
    },

    registerTypingStart: (key) => {
        const wordBoundaries = [' ', '.', ',', ';', ':', '!', '?', 'Enter', 'Tab'];

        if (wordBoundaries.includes(key)) {
            Editor.saveSnapshot();
            Editor.isTyping = false;
        } else {
            if (!Editor.isTyping) {
                Editor.saveSnapshot();
                Editor.isTyping = true;
            }
            clearTimeout(Editor.typingTimer);
            Editor.typingTimer = setTimeout(() => {
                Editor.saveSnapshot();
                Editor.isTyping = false;
            }, 600); 
        }
    },

    _resolveOrphanedAsset: (assetId, tag, attrName) => {
        if (!AppState.notes) return null;
        
        const mime = tag === 'img' ? 'image' : 'audio';

        for (let i = 0; i < AppState.notes.length; i++) {
            const content = AppState.notes[i].content;
            if (!content) continue;
            
            const tokenIndex = content.indexOf(assetId);
            if (tokenIndex !== -1) {
                const regex = new RegExp(`<${tag}[^>]*src=(['"])(data:${mime}\\/[^'"]+)\\1[^>]*${attrName}=['"]${assetId}['"]`, 'i');
                const match = content.match(regex);
                if (match) return match[2];

                const regexFallback = new RegExp(`<${tag}[^>]*src=(['"])(data:${mime}\\/[^'"]+)\\1`, 'gi');
                let fallbackMatch;
                while ((fallbackMatch = regexFallback.exec(content)) !== null) {
                    if (fallbackMatch[2].length > 100) return fallbackMatch[2];
                }
            }
        }
        return null;
    },

    // Funzione centralizzata per l'estrazione sicura del DOM per l'History
    _buildHistorySnapshot: (liveEditorElement) => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = liveEditorElement.innerHTML;

        tempDiv.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src');
            
            if (!src || src.trim() === '') {
                const imgId = img.getAttribute('data-image-ref');
                if (imgId && !Editor.imageCache[imgId]) {
                    const recoveredBase64 = Editor._resolveOrphanedAsset(imgId, 'img', 'data-image-ref');
                    if (recoveredBase64) {
                        Editor.imageCache[imgId] = recoveredBase64;
                    }
                }
                return; 
            }

            if (src && src.startsWith('data:image')) {
                let imgId = Object.keys(Editor.imageCache).find(key => Editor.imageCache[key] === src);

                if (!imgId) {
                    imgId = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                    Editor.imageCache[imgId] = src;
                }

                img.setAttribute('data-image-ref', imgId);
                img.removeAttribute('src');
            }
        });

        // NOVITA: Codifica e Tokenizzazione AUDIO
        tempDiv.querySelectorAll('audio').forEach(aud => {
            const src = aud.getAttribute('src');
            
            if (!src || src.trim() === '') {
                const audId = aud.getAttribute('data-audio-ref');
                if (audId && !Editor.audioCache[audId]) {
                    const recoveredBase64 = Editor._resolveOrphanedAsset(audId, 'audio', 'data-audio-ref');
                    if (recoveredBase64) {
                        Editor.audioCache[audId] = recoveredBase64;
                    }
                }
                return; 
            }

            if (src && src.startsWith('data:audio')) {
                let audId = Object.keys(Editor.audioCache).find(key => Editor.audioCache[key] === src);

                if (!audId) {
                    audId = 'aud_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                    Editor.audioCache[audId] = src;
                }

                aud.setAttribute('data-audio-ref', audId);
                aud.removeAttribute('src');
            }
        });

        // Inietta lo stato testuale ESATTO in RAM dei blocchi codice per permettere all'History di tracciare la digitazione millimetrica
        const liveWrappers = liveEditorElement.querySelectorAll('.code-wrapper, [data-widget-type="code"]');
        const cloneWrappers = tempDiv.querySelectorAll('.code-wrapper, [data-widget-type="code"]');

        for (let i = 0; i < liveWrappers.length; i++) {
            const livePre = liveWrappers[i].querySelector('pre.code-content');
            let currentText = '';
            if (livePre) {
                currentText = livePre.innerText;
                if (currentText.endsWith('\n\n')) currentText = currentText.slice(0, -1);
                else if (currentText.endsWith('\n') && currentText !== '\n') currentText = currentText.slice(0, -1);
            }

            const trueId = liveWrappers[i].id.split('_cited_')[0];
            let stateObj = (AppState.databases && AppState.databases[trueId]) 
                ? JSON.parse(JSON.stringify(AppState.databases[trueId])) 
                : { title: 'Codice', language: 'none', content: '' };
            
            stateObj.content = currentText; // Forza il testo reale!

            // Base64 salva la vita contro il minificatore!
            const b64State = btoa(unescape(encodeURIComponent(JSON.stringify(stateObj))));
            cloneWrappers[i].setAttribute('data-b64-state', b64State);
        }

        return Editor.minifyHTMLForStorage(tempDiv.innerHTML);
    },

    saveSnapshot: () => {
        const editor = document.getElementById('noteContent');
        if (!editor) return;

        //console.groupCollapsed('🟡 [DEBUG-HISTORY] Creazione Snapshot');

        let markerInserted = false;
        let codeBlockCaret = false;
        let activeCodeBlockWrapper = null;

        const sel = window.getSelection();
        if (sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
            const node = sel.anchorNode;
            
            const preNode = node.nodeType === 3 ? node.parentNode.closest('.code-content') : (node.closest ? node.closest('.code-content') : null);
            
            if (preNode) {
                const range = sel.getRangeAt(0);
                const pos = Editor._getCodeOffset(preNode, range.startContainer, range.startOffset);
                // FIX CARET: Posiziona l'attributo data-undo-caret sul guscio (wrapper) per salvarlo dalla minificazione!
                activeCodeBlockWrapper = preNode.closest('.code-wrapper, [data-widget-type="code"]');
                if (activeCodeBlockWrapper) {
                    activeCodeBlockWrapper.setAttribute('data-undo-caret', pos);
                    codeBlockCaret = true;
                }
            } else {
                try {
                    const range = sel.getRangeAt(0).cloneRange();
                    
                    // FIX SNIPPET HISTORY: Assicura l'iniezione nel text span per evitare corruzione
                    const widgetTextSpan = range.startContainer.nodeType === 3 ? range.startContainer.parentNode.closest('.snippet-text, .inline-note-data') : range.startContainer.closest('.snippet-text, .inline-note-data');
                    
                    const marker = document.createElement('span');
                    marker.id = 'history-undo-marker-temp';
                    
                    if (widgetTextSpan) {
                        //console.log("[DEBUG-HISTORY] Iniezione marker in area ristretta:", widgetTextSpan);
                    }
                        range.insertNode(marker);
                        markerInserted = true;
                } catch (e) { 
                    console.error("[DEBUG-HISTORY] Errore iniezione marker:", e);
                }
            }
        }

        const htmlToSave = Editor._buildHistorySnapshot(editor);
        //console.log("[DEBUG-HISTORY] HTML che finisce nello Stack:", htmlToSave);

        if (markerInserted) {
            const marker = document.getElementById('history-undo-marker-temp');
            if (marker) {
                const parent = marker.parentNode;
                parent.removeChild(marker);
                parent.normalize();
            }
        }
        
        if (codeBlockCaret && activeCodeBlockWrapper) {
            activeCodeBlockWrapper.removeAttribute('data-undo-caret');
        }

        if (Editor.undoStack.length > 0 && Editor.undoStack[Editor.undoStack.length - 1] === htmlToSave) {
            //console.log("[DEBUG-HISTORY] Snapshot ignorato: identico al precedente.");
            //console.groupEnd();
            return;
        }

        Editor.undoStack.push(htmlToSave);
        if (Editor.undoStack.length > 200) Editor.undoStack.shift();
        Editor.redoStack = [];
        
        Editor.updateUndoRedoUI();
        //console.groupEnd();
    },

    _restoreSnapshotWithCursor: (htmlData) => {
        const editor = document.getElementById('noteContent');
        const scrollArea = document.querySelector('.editor-scroll-content');
        
        const currentScrollTop = scrollArea ? scrollArea.scrollTop : 0;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlData;

        tempDiv.querySelectorAll('img[data-image-ref]').forEach(img => {
            const imgId = img.getAttribute('data-image-ref');
            if (Editor.imageCache[imgId]) {
                img.setAttribute('src', Editor.imageCache[imgId]);
            } else {
                const recovered = Editor._resolveOrphanedAsset(imgId, 'img', 'data-image-ref');
                if (recovered) {
                    Editor.imageCache[imgId] = recovered;
                    img.setAttribute('src', recovered);
                }
            }
        });

        // Decodifica e Re-Iniezione AUDIO
        tempDiv.querySelectorAll('audio[data-audio-ref]').forEach(aud => {
            const audId = aud.getAttribute('data-audio-ref');
            if (Editor.audioCache[audId]) {
                aud.setAttribute('src', Editor.audioCache[audId]);
            } else {
                const recovered = Editor._resolveOrphanedAsset(audId, 'audio', 'data-audio-ref');
                if (recovered) {
                    Editor.audioCache[audId] = recovered;
                    aud.setAttribute('src', recovered);
                }
            }
        });

        // Decodifica stato Base64 dei Blocchi Codice per popolare la RAM _PRIMA_ del mount
        tempDiv.querySelectorAll('.code-wrapper[data-b64-state], [data-widget-type="code"][data-b64-state]').forEach(wrapper => {
            const b64 = wrapper.getAttribute('data-b64-state');
            if (b64) {
                try {
                    const stateObj = JSON.parse(decodeURIComponent(escape(atob(b64))));
                    const trueId = wrapper.id.split('_cited_')[0];
                    if (!AppState.databases) AppState.databases = {};
                    AppState.databases[trueId] = stateObj; // Idrata la RAM
                } catch(e) { 
                    //console.error("[HISTORY-DEBUG] Errore decodifica Base64 state:", e); 
                }
                wrapper.removeAttribute('data-b64-state');
            }
        });

        editor.innerHTML = tempDiv.innerHTML;

        let codeWidgetId = null;
        let codeCaretPos = null;
        let hasNormalMarker = false;

        const marker = document.getElementById('history-undo-marker-temp');
        if (marker) {
            hasNormalMarker = true;
        } else {
            const wrapperWithCaret = editor.querySelector('.code-wrapper[data-undo-caret], [data-widget-type="code"][data-undo-caret]');
            if (wrapperWithCaret) {
                codeCaretPos = parseInt(wrapperWithCaret.getAttribute('data-undo-caret'), 10);
                codeWidgetId = wrapperWithCaret.id;
                wrapperWithCaret.removeAttribute('data-undo-caret');
            }
        }

        // Questo comando rigonfierà (Re-Hydration) tutti i widget partendo dai gusci vuoti!
        if (typeof WidgetManager !== 'undefined') WidgetManager.mountAll(editor);

        if (scrollArea) {
            scrollArea.scrollTop = currentScrollTop;
            setTimeout(() => { if (scrollArea) scrollArea.scrollTop = currentScrollTop; }, 0);
        }

        // Riposizionamento Cursor a riavvio completato
        if (codeWidgetId && codeCaretPos !== null) {
            const wrapper = document.getElementById(codeWidgetId);
            if (wrapper) {
                const freshPre = wrapper.querySelector('pre.code-content');
                if (freshPre) {
                    freshPre.focus({ preventScroll: true }); 
                    Editor._setCodeOffset(freshPre, codeCaretPos, codeCaretPos);
                }
            }
        } else if (hasNormalMarker) {
            const freshMarker = document.getElementById('history-undo-marker-temp');
            if (freshMarker) {
                try {
                    const sel = window.getSelection();
                    const range = document.createRange();
                    range.setStartBefore(freshMarker);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                } catch (e) { }

                const parent = freshMarker.parentNode;
                parent.removeChild(freshMarker);
                parent.normalize();
                
                const sel = window.getSelection();
                if (sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
                    let focusNode = sel.anchorNode;
                    if (focusNode && focusNode.nodeType === 3) focusNode = focusNode.parentNode;
                    if (focusNode && focusNode.focus && focusNode.id !== 'noteContent') {
                        focusNode.focus({ preventScroll: true }); 
                    }
                }
            } else {
                editor.focus({ preventScroll: true });
            }
        } else {
            editor.focus({ preventScroll: true });
        }

        if (typeof UI !== 'undefined' && UI.handleEditorInput) UI.handleEditorInput();
    },

    undo: () => {
        Editor.isTyping = false;
        clearTimeout(Editor.typingTimer);
        
        if (typeof CodeManager !== 'undefined' && CodeManager._typingTimer) {
             clearTimeout(CodeManager._typingTimer);
        }

        if (Editor.undoStack.length > 0) {
            const editor = document.getElementById('noteContent');
            //console.groupCollapsed('🟡 [DEBUG-HISTORY] Esecuzione UNDO');

            let markerInserted = false;
            let codeBlockCaret = false;
            let activeCodeBlockWrapper = null;

            const sel = window.getSelection();
            if (sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
                const node = sel.anchorNode;
                const preNode = node.nodeType === 3 ? node.parentNode.closest('.code-content') : (node.closest ? node.closest('.code-content') : null);
                
                if (preNode) {
                    const range = sel.getRangeAt(0);
                    const pos = Editor._getCodeOffset(preNode, range.startContainer, range.startOffset);
                    activeCodeBlockWrapper = preNode.closest('.code-wrapper, [data-widget-type="code"]');
                    if (activeCodeBlockWrapper) {
                        activeCodeBlockWrapper.setAttribute('data-undo-caret', pos);
                        codeBlockCaret = true;
                    }
                } else {
                    try {
                        const range = sel.getRangeAt(0).cloneRange();
                        const marker = document.createElement('span');
                        marker.id = 'history-undo-marker-temp';
                        range.insertNode(marker);
                        markerInserted = true;
                    } catch (e) { }
                }
            }

            const htmlToSaveForRedo = Editor._buildHistorySnapshot(editor);
            Editor.redoStack.push(htmlToSaveForRedo);

            if (markerInserted) {
                const marker = document.getElementById('history-undo-marker-temp');
                if (marker) {
                    const parent = marker.parentNode;
                    parent.removeChild(marker);
                    parent.normalize();
                }
            }
            if (codeBlockCaret && activeCodeBlockWrapper) {
                activeCodeBlockWrapper.removeAttribute('data-undo-caret');
            }

            let snap = Editor.undoStack.pop();
            //console.log("[DEBUG-HISTORY] Snapshot Estratto da Ripristinare:", snap);
            
            // FUNZIONE HELPER: Pulisce via solo i marcatori di history per fare un paragone onesto del DOM nudo
            const cleanForComparison = (html) => {
                if (!html) return '';
                return html.replace(/<span id="history-undo-marker-temp"><\/span>/gi, '')
                           .replace(/ data-undo-caret="[^"]*"/g, '');
            };

            const currentHtmlClean = cleanForComparison(Editor._buildHistorySnapshot(editor));
            const snapHtmlClean = cleanForComparison(snap);
            
            if (currentHtmlClean === snapHtmlClean && Editor.undoStack.length > 0) {
                //console.log("[DEBUG-HISTORY] Pop secondario perché il top dello stack coincide con il dom attuale.");
                snap = Editor.undoStack.pop();
            }

            Editor._restoreSnapshotWithCursor(snap);
            Editor.updateToolbarFormatting();
            Editor.updateUndoRedoUI();
            //console.groupEnd();
        } else {
            //console.log(`🟥 [DEBUG-HISTORY] UNDO fallito: stack vuoto.`);
        }
    },

    redo: () => {
        Editor.isTyping = false;
        clearTimeout(Editor.typingTimer);
        
        if (typeof CodeManager !== 'undefined' && CodeManager._typingTimer) {
             clearTimeout(CodeManager._typingTimer);
        }

        if (Editor.redoStack.length > 0) {
            const editor = document.getElementById('noteContent');
            //console.groupCollapsed('🟡 [DEBUG-HISTORY] Esecuzione REDO');

            let markerInserted = false;
            let codeBlockCaret = false;
            let activeCodeBlockWrapper = null;

            const sel = window.getSelection();
            if (sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
                const node = sel.anchorNode;
                const preNode = node.nodeType === 3 ? node.parentNode.closest('.code-content') : (node.closest ? node.closest('.code-content') : null);
                
                if (preNode) {
                    const range = sel.getRangeAt(0);
                    const pos = Editor._getCodeOffset(preNode, range.startContainer, range.startOffset);
                    activeCodeBlockWrapper = preNode.closest('.code-wrapper, [data-widget-type="code"]');
                    if (activeCodeBlockWrapper) {
                        activeCodeBlockWrapper.setAttribute('data-undo-caret', pos);
                        codeBlockCaret = true;
                    }
                } else {
                    try {
                        const range = sel.getRangeAt(0).cloneRange();
                        const marker = document.createElement('span');
                        marker.id = 'history-undo-marker-temp';
                        range.insertNode(marker);
                        markerInserted = true;
                    } catch (e) { }
                }
            }

            const htmlToSaveForUndo = Editor._buildHistorySnapshot(editor);
            Editor.undoStack.push(htmlToSaveForUndo);

            if (markerInserted) {
                const marker = document.getElementById('history-undo-marker-temp');
                if (marker) {
                    const parent = marker.parentNode;
                    parent.removeChild(marker);
                    parent.normalize();
                }
            }
            if (codeBlockCaret && activeCodeBlockWrapper) {
                activeCodeBlockWrapper.removeAttribute('data-undo-caret');
            }

            const snap = Editor.redoStack.pop();
            Editor._restoreSnapshotWithCursor(snap);
            Editor.updateToolbarFormatting();
            Editor.updateUndoRedoUI();
            //console.groupEnd();
        } else {
            //console.log(`🟥 [DEBUG-HISTORY] REDO fallito: stack vuoto.`);
        }
    }
});