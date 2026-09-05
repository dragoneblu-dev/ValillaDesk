/**
 * EditorHistory.js
 * Mixin per Undo, Redo e Snapshot tracking con Tokenizzazione Immagini, Audio
 * e Re-Idratazione dello stato RAM di tutti i Widget complessi.
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

        // Codifica e Tokenizzazione AUDIO
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

        // Serializzazione atomica in Base64 dello stato di TUTTI i widget supportati da AppState.databases
        const widgetSelector = '.adv-widget-shell, .adv-table-wrapper, .adv-journal-wrapper, .code-wrapper, .adv-action-button-wrapper, .widget-type-columns';
        const liveWidgets = liveEditorElement.querySelectorAll(widgetSelector);
        const cloneWidgets = tempDiv.querySelectorAll(widgetSelector);

        for (let i = 0; i < liveWidgets.length; i++) {
            const liveWidget = liveWidgets[i];
            const cloneWidget = cloneWidgets[i];
            if (!cloneWidget) continue;

            const trueId = liveWidget.id.split('_cited_')[0];
            if (!trueId) continue;

            let stateObj = null;
            if (AppState.databases && AppState.databases[trueId]) {
                stateObj = JSON.parse(JSON.stringify(AppState.databases[trueId]));
            }

            // Per i blocchi codice, allinea preventivamente il testo esatto digitato
            const livePre = liveWidget.querySelector('pre.code-content');
            if (livePre) {
                let currentText = livePre.innerText;
                if (currentText.endsWith('\n\n')) currentText = currentText.slice(0, -1);
                else if (currentText.endsWith('\n') && currentText !== '\n') currentText = currentText.slice(0, -1);
                if (!stateObj) stateObj = { title: 'Codice', language: 'none', content: '' };
                stateObj.content = currentText;
            }

            if (stateObj) {
                try {
                    const b64State = btoa(unescape(encodeURIComponent(JSON.stringify(stateObj))));
                    cloneWidget.setAttribute('data-b64-state', b64State);
                } catch (e) {}
            }
        }

        return Editor.minifyHTMLForStorage(tempDiv.innerHTML);
    },

    saveSnapshot: () => {
        const editor = document.getElementById('noteContent');
        if (!editor) return;

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
                } catch (e) { 
                    console.error("[DEBUG-HISTORY] Errore iniezione marker:", e);
                }
            }
        }

        const htmlToSave = Editor._buildHistorySnapshot(editor);

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
            return;
        }

        Editor.undoStack.push(htmlToSave);
        if (Editor.undoStack.length > 200) Editor.undoStack.shift();
        Editor.redoStack = [];
        
        Editor.updateUndoRedoUI();
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

        // Re-idratazione universale in RAM per tutti i widget memorizzati in data-b64-state
        tempDiv.querySelectorAll('[data-b64-state]').forEach(wrapper => {
            const b64 = wrapper.getAttribute('data-b64-state');
            if (b64) {
                try {
                    const stateObj = JSON.parse(decodeURIComponent(escape(atob(b64))));
                    const trueId = wrapper.id.split('_cited_')[0];
                    if (!AppState.databases) AppState.databases = {};
                    AppState.databases[trueId] = stateObj; // Idrata la RAM prima del montaggio DOM
                } catch(e) { 
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

        // Re-idratazione e montaggio di tutti i widget ripristinati
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
            
            // Pulisce via solo i marcatori di history per fare un paragone del DOM
            const cleanForComparison = (html) => {
                if (!html) return '';
                return html.replace(/<span id="history-undo-marker-temp"><\/span>/gi, '')
                           .replace(/ data-undo-caret="[^"]*"/g, '');
            };

            const currentHtmlClean = cleanForComparison(Editor._buildHistorySnapshot(editor));
            const snapHtmlClean = cleanForComparison(snap);
            
            if (currentHtmlClean === snapHtmlClean && Editor.undoStack.length > 0) {
                snap = Editor.undoStack.pop();
            }

            Editor._restoreSnapshotWithCursor(snap);
            Editor.updateToolbarFormatting();
            Editor.updateUndoRedoUI();
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
        }
    }
});