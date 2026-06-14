/**
 * EditorMultiCursor.js
 * Modulo dedicato alla gestione dei cursori multipli (Stile VS Code Ctrl+D).
 * Estende l'oggetto Editor.
 * FIX: Risolto warning "addRange: range isn't in document" controllando la presenza del nodo.
 */

Object.assign(Editor, {
    multiSelectActive: false,
    multiSelectTerm: '',
    _multiCursorObserver: null,

    initMultiCursor: (editorEl) => {
        Editor._multiCursorObserver = new MutationObserver((mutations) => {
            if (!Editor.multiSelectActive) return;
            
            for(let mut of mutations) {
                if (mut.type === 'characterData' || mut.type === 'childList') {
                    const master = document.querySelector('.adv-multi-cursor.master');
                    if (!master) continue;
                    
                    if (master.contains(mut.target)) {
                        const newText = master.innerText;
                        document.querySelectorAll('.adv-multi-cursor:not(.master)').forEach(el => {
                            if(el.innerText !== newText) el.innerText = newText;
                        });
                    }
                }
            }
        });
        
        Editor._multiCursorObserver.observe(editorEl, { childList: true, characterData: true, subtree: true });
    },

    triggerMultiCursor: () => {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const editor = document.getElementById('noteContent');
        if (!editor || !editor.contains(sel.anchorNode)) return;

        const isCodeBlock = !!sel.anchorNode.parentNode?.closest?.('.code-content');
        if (WidgetManager.isProtectedBlock(sel.anchorNode) && !isCodeBlock) {
            UI.showToast("Multi-cursore non supportato nei Widget complessi.", "warning");
            return;
        }

        if (!Editor.multiSelectActive) {
            if (sel.isCollapsed) {
                sel.modify("move", "backward", "word");
                sel.modify("extend", "forward", "word");
            }
            
            Editor.multiSelectTerm = sel.toString();
            
            if (!Editor.multiSelectTerm.trim()) {
                sel.collapseToEnd();
                return;
            }

            Editor.saveSnapshot();
            
            const range = sel.getRangeAt(0);
            const mark = document.createElement('mark');
            mark.className = 'adv-multi-cursor master';
            mark.textContent = Editor.multiSelectTerm;
            range.deleteContents();
            range.insertNode(mark);
            
            Editor.multiSelectActive = true;
            
            const newRange = document.createRange();
            newRange.selectNodeContents(mark);
            sel.removeAllRanges();
            sel.addRange(newRange);
        }

        const term = Editor.multiSelectTerm;
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
        
        let foundNode = null;
        let foundOffset = -1;
        
        const allMarks = document.querySelectorAll('.adv-multi-cursor');
        const lastElement = allMarks[allMarks.length - 1];
        
        walker.currentNode = lastElement || editor;
        
        while (walker.nextNode()) {
            const txt = walker.currentNode;
            const parent = txt.parentNode;
            
            const isProtected = WidgetManager.isProtectedBlock(parent);
            const isInCode = !!parent?.closest?.('.code-content');
            
            if (isProtected && !isInCode) continue;
            if (parent.classList && parent.classList.contains('adv-multi-cursor')) continue;
            
            const idx = txt.nodeValue.indexOf(term);
            if (idx !== -1) {
                foundNode = txt;
                foundOffset = idx;
                break;
            }
        }

        if (!foundNode) {
            walker.currentNode = editor;
            while (walker.nextNode()) {
                const txt = walker.currentNode;
                const parent = txt.parentNode;
                
                const isProtected = WidgetManager.isProtectedBlock(parent);
                const isInCode = !!parent?.closest?.('.code-content');
                
                if (isProtected && !isInCode) continue;
                if (parent.classList && parent.classList.contains('adv-multi-cursor')) continue;
                
                const idx = txt.nodeValue.indexOf(term);
                if (idx !== -1) {
                    let alreadySelected = false;
                    for(let i=0; i<sel.rangeCount; i++) {
                        const r = sel.getRangeAt(i);
                        if(r.startContainer === txt && r.startOffset === idx) {
                            alreadySelected = true; break;
                        }
                    }
                    if(!alreadySelected) {
                        foundNode = txt;
                        foundOffset = idx;
                        break;
                    }
                }
            }
        }

        if (foundNode) {
            const range = document.createRange();
            range.setStart(foundNode, foundOffset);
            range.setEnd(foundNode, foundOffset + term.length);
            
            const mark = document.createElement('mark');
            mark.className = 'adv-multi-cursor';
            mark.textContent = term;
            range.deleteContents();
            range.insertNode(mark);
            
            mark.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            
            const masterMark = document.querySelector('.adv-multi-cursor.master');
            if (masterMark) {
                const selRange = document.createRange();
                selRange.selectNodeContents(masterMark);
                selRange.collapse(false);
                sel.removeAllRanges();
                sel.addRange(selRange);
            }
        } else {
            UI.showToast("Nessun'altra occorrenza trovata.", "info");
        }
    },

    clearMultiCursor: () => {
        if (!Editor.multiSelectActive) return;
        
        Editor.multiSelectActive = false;
        Editor.multiSelectTerm = '';
        
        const editor = document.getElementById('noteContent');
        if (!editor) return;

        const cursors = editor.querySelectorAll('.adv-multi-cursor');
        
        let finalNodeToFocus = null;
        let offsetToFocus = 0;
        
        const master = document.querySelector('.adv-multi-cursor.master');
        if (master) {
            const sel = window.getSelection();
            if (sel.rangeCount > 0 && master.contains(sel.anchorNode)) {
                offsetToFocus = sel.focusOffset;
                finalNodeToFocus = master.firstChild; 
            }
        }

        if (cursors.length > 0) {
            cursors.forEach(c => {
                const parent = c.parentNode;
                while (c.firstChild) parent.insertBefore(c.firstChild, c);
                parent.removeChild(c);
            });
            editor.normalize();
            Store.triggerAutoSave();
        }
        
        // Assicurati che il nodo esista ancora nel documento prima di selezionarlo
        if (finalNodeToFocus && document.body.contains(finalNodeToFocus)) {
            try {
                const sel = window.getSelection();
                const rng = document.createRange();
                rng.setStart(finalNodeToFocus, offsetToFocus);
                rng.collapse(true);
                sel.removeAllRanges();
                sel.addRange(rng);
            } catch(e) {}
        }
    }
});