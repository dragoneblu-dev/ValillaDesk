/**
 * editor-keyboard-navigation.js
 * Sottomodulo di Editor.
 * Responsabilità: Navigazione complessa (Tabulazioni in elenchi e blocchi codice, 
 * Escape dalla formattazione, Indentazione).
 * FIX KEYBOARD NAVIGATION: Implementato un motore spaziale a Matrice 2D per il calcolo
 * esatto delle coordinate (X, Y) della griglia della tabella. Questo scavalca
 * definitivamente i bug di salto cursore generati da "colspan" e "rowspan".
 * FIX CARET ENGINE: Sostituito il calcolo dell'offset con le API Range native del browser 
 * per garantire coordinate perfette anche all'interno degli span generati dal syntax highlighter.
 */

Object.assign(Editor, {

    // ESTRATTORE GEOMETRICO ASSOLUTO (FIX BUG SALTI CURSORE NEI COMMENTI E NEGLI SPAN)
    // Sostituisce la versione debole che si fermava ai bordi degli Span ignorando gli offset interni
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
            console.error("🔴 [CARET-DEBUG] Errore critico nel calcolo offset cursore:", e);
            return 0;
        }
    },

    handleTableNavigation: (e) => {
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return false;
        if (e.shiftKey) return false; // Non interferire con la selezione multipla nativa

        const sel = window.getSelection();
        if (!sel.rangeCount) return false;

        let node = sel.anchorNode;
        if (node.nodeType === 3) node = node.parentNode;

        const cell = node.closest('td, th');
        if (!cell) return false;

        const row = cell.parentElement;
        const table = row.closest('table');
        if (!table) return false;

        // 1. COSTRUZIONE MATRICE 2D DELLA TABELLA (Risolve il problema dei Rowspan/Colspan)
        const grid = [];
        let maxCols = 0;
        let currGeo = null;

        for (let r = 0; r < table.rows.length; r++) {
            const tr = table.rows[r];
            if (!grid[r]) grid[r] = [];
            let x = 0;
            
            for (let c = 0; c < tr.cells.length; c++) {
                const td = tr.cells[c];
                // Salta le coordinate già occupate da celle fuse (span) in righe precedenti
                while (grid[r][x]) { x++; }
                
                const rs = parseInt(td.getAttribute('rowspan')) || 1;
                const cs = parseInt(td.getAttribute('colspan')) || 1;
                
                const geo = { cell: td, startX: x, startY: r, endX: x + cs - 1, endY: r + rs - 1 };
                
                if (td === cell) currGeo = geo;

                // Occupa lo spazio logico nella matrice 2D
                for (let yy = 0; yy < rs; yy++) {
                    if (!grid[r + yy]) grid[r + yy] = [];
                    for (let xx = 0; xx < cs; xx++) {
                        grid[r + yy][x + xx] = geo;
                    }
                }
                x += cs;
            }
            if (x > maxCols) maxCols = x;
        }

        if (!currGeo) return false;
        const maxRows = grid.length;

        // 2. CALCOLO TOLLERANZA BORDI (Micro-Navigazione Testuale)
        const range = sel.getRangeAt(0);
        let caretRect = range.getBoundingClientRect();

        // Fix per poter calcolare la posizione in celle vuote (solo <br>)
        if (caretRect.width === 0 && caretRect.height === 0) {
            const span = document.createElement('span');
            span.appendChild(document.createTextNode('\u200B'));
            range.insertNode(span);
            caretRect = span.getBoundingClientRect();
            span.remove();
        }

        const cellRect = cell.getBoundingClientRect();
        const style = window.getComputedStyle(cell);
        const pt = parseFloat(style.paddingTop) || 0;
        const pb = parseFloat(style.paddingBottom) || 0;
        const lh = parseFloat(style.lineHeight) || 20;

        const textLen = cell.textContent.length;
        const caretPos = Editor._getAbsoluteCaretPosition(cell, true);
        const isEmpty = textLen === 0 || cell.innerText.replace(/[\n\r\u200B]/g, '').trim() === '';

        // Rilevamento confini estremi: Permette di navigare testo multi-riga *prima* di scavalcare la cella
        let isAtTop = isEmpty || (caretRect.top - cellRect.top - pt) <= (lh * 0.8);
        let isAtBottom = isEmpty || (cellRect.bottom - pb - caretRect.bottom) <= (lh * 0.8);
        let isAtLeft = isEmpty || caretPos === 0;
        let isAtRight = isEmpty || caretPos === textLen;

        // 3. IDENTIFICAZIONE INTENZIONE E COORDINATE BERSAGLIO
        let targetX = currGeo.startX;
        let targetY = currGeo.startY;
        let intent = null;

        if (e.key === 'ArrowUp' && isAtTop) intent = 'up';
        if (e.key === 'ArrowDown' && isAtBottom) intent = 'down';
        if (e.key === 'ArrowLeft' && isAtLeft) intent = 'left';
        if (e.key === 'ArrowRight' && isAtRight) intent = 'right';

        // Se il cursore si trova in mezzo al testo, lasciamo gestire lo spostamento al browser nativo
        if (!intent) return false; 

        e.preventDefault(); // Da qui in poi governiamo noi: blocco totale del salto casuale nativo

        if (intent === 'up') targetY = currGeo.startY - 1;
        if (intent === 'down') targetY = currGeo.endY + 1; // Salta in fondo all'ingombro del rowspan
        if (intent === 'left') targetX = currGeo.startX - 1;
        if (intent === 'right') targetX = currGeo.endX + 1; // Salta in fondo all'ingombro del colspan

        // Logica "A Capo" (Wrap-around): Se premo destra a fine riga, vado a capo giù a sinistra.
        if (targetX < 0 && intent === 'left') {
            targetY = currGeo.startY - 1;
            targetX = maxCols - 1;
        }
        if (targetX >= maxCols && intent === 'right') {
            targetY = currGeo.endY + 1;
            targetX = 0;
        }

        // 4. ESECUZIONE SPOSTAMENTO
        let targetCell = null;
        if (targetY >= 0 && targetY < maxRows && targetX >= 0 && targetX < maxCols) {
            if (grid[targetY] && grid[targetY][targetX]) {
                targetCell = grid[targetY][targetX].cell;
            }
        }

        if (targetCell) {
            const newRange = document.createRange();
            if (targetCell.innerText.replace(/[\n\r\u200B]/g, '').trim() === '') {
                newRange.setStart(targetCell, 0);
                newRange.collapse(true);
            } else {
                newRange.selectNodeContents(targetCell);
                // Direzione cursore basata sull'approccio di arrivo
                if (intent === 'down' || intent === 'right') newRange.collapse(true); // Cursore inizia prima lettera
                else newRange.collapse(false); // Cursore dopo ultima lettera
            }
            sel.removeAllRanges();
            sel.addRange(newRange);
            targetCell.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
            return true;
        } else {
            // Fuoriuscita pulita dalla Tabella
            const wrapper = table.closest('.simple-table-wrapper, .adv-table-wrapper') || table;
            let pNode = (intent === 'up' || (intent === 'left' && targetY < 0)) ? wrapper.previousElementSibling : wrapper.nextElementSibling;
            
            if (!pNode || !['P', 'DIV', 'H1', 'H2', 'H3'].includes(pNode.tagName)) {
                pNode = document.createElement('p');
                pNode.innerHTML = '<br>';
                wrapper.parentNode.insertBefore(pNode, (intent === 'up' || (intent === 'left' && targetY < 0)) ? wrapper : wrapper.nextSibling);
            }

            const newRange = document.createRange();
            newRange.selectNodeContents(pNode);
            // Se usciamo verso il basso, il cursore va all'inizio del paragrafo, se verso l'alto va alla fine
            newRange.collapse(intent === 'down' || intent === 'right');
            sel.removeAllRanges();
            sel.addRange(newRange);
            pNode.scrollIntoView({ behavior: 'auto', block: 'nearest' });
            return true;
        }
    },

    handleTabKey: (e) => {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        let node = selection.anchorNode;
        if (node.nodeType === 3) node = node.parentNode;

        if (node.closest('td, th') || node.closest('.adv-journal-wrapper')) return;

        e.preventDefault();

        // LOGICA SPECIALE PER BLOCCHI DI CODICE
        const preNode = node.closest('pre');
        if (preNode) {
            console.log("[TAB-DEBUG] ==========================================");
            console.log("[TAB-DEBUG] 1. Pressione TAB rilevata nel blocco codice.");

            Editor.saveSnapshot();
            
            // SELEZIONE SINGOLA: Se non ho selezionato più testo e non premo Shift, 
            // sfrutto l'API nativa del browser per iniettare direttamente al cursore, senza parsing stringhe!
            if (selection.isCollapsed && !e.shiftKey) {
                console.log("[TAB-DEBUG] 2. Inserimento nativo di 4 spazi (Collapsed).");
                
                document.execCommand('insertText', false, '    ');
                
                if (typeof CodeManager !== 'undefined') {
                    // Calcolo esatto DOPO l'inserimento
                    const pos = Editor._getCodeOffset(preNode, selection.anchorNode, selection.anchorOffset);
                    console.log(`[TAB-DEBUG] 3. Ricalcolo posizione post-inserimento: ${pos}`);
                    
                    CodeManager.highlightBlock(preNode, true);
                    Editor._setCodeOffset(preNode, pos, pos);
                }
                Store.triggerAutoSave();
                console.log("[TAB-DEBUG] ==========================================");
                return;
            }
            
            // MULTILINE O SHIFT-TAB (Usa l'estrattore Range.cloneContents per allinearsi)
            const range = selection.getRangeAt(0);
            
            let startOffset = Editor._getCodeOffset(preNode, range.startContainer, range.startOffset);
            let endOffset = Editor._getCodeOffset(preNode, range.endContainer, range.endOffset);
            
            if (startOffset > endOffset) { const t = startOffset; startOffset = endOffset; endOffset = t; }

            // Usa un estrattore puro per allineare il testo alla griglia matematica del Caret Engine, ignorando i bug degli span nidificati.
            let text = '';
            const walker = document.createTreeWalker(preNode, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
            let wNode;
            while ((wNode = walker.nextNode())) {
                if (wNode.nodeType === 3) text += wNode.nodeValue;
                else if (wNode.nodeName === 'BR') text += '\n';
            }
            
            console.log(`[TAB-DEBUG] 2. Testo estratto (lunghezza: ${text.length}). startOffset: ${startOffset}`);

            let lines = text.split('\n');
            let currentPos = 0;
            let startLineIdx = -1;
            let endLineIdx = -1;

            for (let i = 0; i < lines.length; i++) {
                let lineLength = lines[i].length + 1; // +1 per il \n
                if (startLineIdx === -1 && (currentPos + lineLength > startOffset || currentPos + lines[i].length >= startOffset)) startLineIdx = i;
                if (endLineIdx === -1 && (currentPos + lineLength > endOffset || currentPos + lines[i].length >= endOffset)) endLineIdx = i;
                currentPos += lineLength;
            }

            if (startLineIdx === -1) startLineIdx = lines.length - 1;
            if (endLineIdx === -1) endLineIdx = lines.length - 1;

            let charsAddedTotal = 0;
            let charsAddedBeforeStart = 0;

            for (let i = startLineIdx; i <= endLineIdx; i++) {
                if (e.shiftKey) {
                    const match = lines[i].match(/^[ \t]{1,4}/);
                    if (match) {
                        lines[i] = lines[i].substring(match[0].length);
                        charsAddedTotal -= match[0].length;
                        if (i === startLineIdx) charsAddedBeforeStart -= match[0].length;
                    }
                } else {
                    lines[i] = '    ' + lines[i];
                    charsAddedTotal += 4;
                    if (i === startLineIdx) charsAddedBeforeStart += 4;
                }
            }

            preNode.textContent = lines.join('\n');
            if (typeof CodeManager !== 'undefined') CodeManager.highlightBlock(preNode, true);

            let newStart = Math.max(0, startOffset + charsAddedBeforeStart);
            let newEnd = Math.max(0, endOffset + charsAddedTotal);
            
            console.log(`[TAB-DEBUG] 3. Riposizionamento cursore a: ${newStart}`);
            
            Editor._setCodeOffset(preNode, newStart, newEnd);
            Store.triggerAutoSave();
            
            console.log("[TAB-DEBUG] ==========================================");
            return;
        }

        // LOGICA NORMALE PER LISTE E PARAGRAFI
        const range = selection.getRangeAt(0);
        const closestLi = node.closest('li');
        let blocks = [];
        
        if (!range.collapsed) blocks = Editor.getSelectedBlocks(range);

        if (blocks.length === 0) {
            if (closestLi) blocks.push(closestLi);
            else {
                let currentBlock = node;
                while (currentBlock && !Editor.isBlockElement(currentBlock) && currentBlock.id !== 'noteContent') {
                    currentBlock = currentBlock.parentNode;
                }
                if (currentBlock && currentBlock.id !== 'noteContent') blocks.push(currentBlock);
            }
        }
        
        if (blocks.length > 0 && (e.shiftKey || !range.collapsed || closestLi)) {
            Editor.saveSnapshot();
            
            const startId = 'tab-start-' + Date.now();
            const endId = 'tab-end-' + Date.now();

            const startMarker = document.createElement('span');
            startMarker.id = startId; startMarker.style.display = 'none';
            const endMarker = document.createElement('span');
            endMarker.id = endId; endMarker.style.display = 'none';

            if (!range.collapsed) {
                const endRange = range.cloneRange();
                endRange.collapse(false);
                endRange.insertNode(endMarker);
            }
            
            const startRange = range.cloneRange();
            startRange.collapse(true);
            startRange.insertNode(startMarker);

            blocks.sort((a,b) => (a === b) ? 0 : (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

            blocks.forEach(block => {
                if (block.tagName === 'LI') {
                    const ulNode = block.parentNode;
                    if (ulNode && ulNode.classList.contains('adv-checklist')) {
                        if (e.shiftKey) Editor.outdentChecklistLine(block);
                        else Editor.indentChecklistLine(block);
                    } else {
                        if (e.shiftKey) {
                            Editor.outdentStandardListItem(block);
                        } else {
                            const selTmp = window.getSelection();
                            const rngTmp = document.createRange();
                            rngTmp.selectNodeContents(block);
                            selTmp.removeAllRanges();
                            selTmp.addRange(rngTmp);
                            document.execCommand('indent', false, null);
                        }
                    }
                } else {
                    if (e.shiftKey) {
                        let textNode = block.firstChild;
                        while (textNode && textNode.nodeType !== 3) textNode = textNode.nextSibling;
                        if (textNode && textNode.nodeType === 3) {
                            textNode.nodeValue = textNode.nodeValue.replace(/^[\s\u00A0]{1,4}/, '');
                        }
                    } else {
                        let textNode = block.firstChild;
                        if (!textNode || textNode.nodeType !== 3) {
                            textNode = document.createTextNode('');
                            block.insertBefore(textNode, block.firstChild);
                        }
                        textNode.nodeValue = '\u00A0\u00A0\u00A0\u00A0' + textNode.nodeValue;
                    }
                }
            });

            const recoveredStart = document.getElementById(startId);
            const recoveredEnd = document.getElementById(endId);

            const newRange = document.createRange();
            if (recoveredStart) {
                newRange.setStartAfter(recoveredStart);
                if (!range.collapsed && recoveredEnd) newRange.setEndBefore(recoveredEnd);
                else newRange.collapse(true);
                
                selection.removeAllRanges();
                selection.addRange(newRange);
            }
            if (recoveredStart) recoveredStart.remove();
            if (recoveredEnd) recoveredEnd.remove();

        } else {
            document.execCommand('insertText', false, '\u00A0\u00A0\u00A0\u00A0');
        }
        Store.triggerAutoSave();
    },

    handleFormatEscape: (e) => {
        if (!AppState.isEditMode) return;
        
        // Se l'utente usa ArrowRight / ArrowDown in una zona confinata di un widget, proviamo a farlo evadere.
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            const sel = window.getSelection();
            if (!sel.isCollapsed || !sel.rangeCount) return;

            const range = sel.getRangeAt(0);
            let container = range.startContainer;
            let offset = range.startOffset;

            // Se siamo alla fine estrema del nodo testuale
            if ((container.nodeType === Node.TEXT_NODE && offset === container.length) ||
                (container.nodeType !== Node.TEXT_NODE && offset === container.childNodes.length)) {
                
                let editableArea = container.nodeType === Node.TEXT_NODE ? container.parentNode.closest('.widget-editable-area') : container.closest('.widget-editable-area');
                
                if (editableArea) {
                    // Controlla se non c'è più testo dopo di noi all'interno di questa area editabile
                    const walker = document.createTreeWalker(editableArea, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
                    walker.currentNode = container.nodeType === Node.TEXT_NODE ? container : container.childNodes[offset-1] || container;
                    
                    let isAtVeryEnd = true;
                    let nextNode;
                    while ((nextNode = walker.nextNode())) {
                        if (nextNode.nodeType === Node.TEXT_NODE && nextNode.textContent.replace(/\u200B/g, '').trim() !== '') {
                            isAtVeryEnd = false;
                            break;
                        }
                    }

                    if (isAtVeryEnd) {
                        const widgetShell = editableArea.closest('.adv-widget-shell');
                        if (widgetShell) {
                            e.preventDefault();
                            let targetP = widgetShell.nextElementSibling;
                            if (!targetP || (targetP.tagName !== 'P' && targetP.tagName !== 'DIV')) {
                                targetP = document.createElement('p');
                                targetP.innerHTML = '<br>';
                                widgetShell.parentNode.insertBefore(targetP, widgetShell.nextSibling);
                            }
                            const newRange = document.createRange();
                            newRange.setStart(targetP, 0);
                            newRange.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                            return;
                        }
                    }
                }
            }
        }

        // Logic per l'escape dai formati (Grassetto, Colori, ecc.) tramite spazio e freccia
        if (e.key === ' ' || e.key === 'ArrowRight') {
            const sel = window.getSelection();
            if (!sel.isCollapsed || !sel.rangeCount) return;

            const range = sel.getRangeAt(0);
            let container = range.startContainer;
            let offset = range.startOffset;

            if (container.nodeType === Node.TEXT_NODE) {
                if (offset < container.length) return; 
                container = container.parentNode;
            } else if (container.childNodes.length > 0 && offset < container.childNodes.length) {
                return; 
            }

            const formatTags = ['B', 'I', 'U', 'S', 'A'];
            const isFormatSpan = container.tagName === 'SPAN' && (
                container.className.includes('hl-') || 
                container.className.includes('tx-') || 
                container.className.includes('ff-') || 
                container.className.includes('fs-')
            );

            if (formatTags.includes(container.tagName) || isFormatSpan) {
                if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    const newRange = document.createRange();
                    newRange.setStartAfter(container);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    document.execCommand('bold', false, false);
                    document.execCommand('italic', false, false);
                    document.execCommand('underline', false, false);
                    Editor.updateToolbarFormatting();
                } else if (e.key === ' ') {
                    e.preventDefault();
                    const newRange = document.createRange();
                    newRange.setStartAfter(container);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    document.execCommand('removeFormat', false, null);
                    document.execCommand('insertText', false, ' ');
                    Editor.updateToolbarFormatting();
                }
            }
        }
    },

    indentChecklistLine: (liNode) => {
        const prevLi = liNode.previousElementSibling;
        if (!prevLi) return; 
        let nestedUl = prevLi.querySelector('ul.adv-checklist');
        if (!nestedUl) {
            nestedUl = document.createElement('ul');
            nestedUl.className = 'adv-checklist';
            nestedUl.style.listStyle = 'none'; nestedUl.style.paddingLeft = '20px'; nestedUl.style.margin = '5px 0'; nestedUl.style.width = '100%';
            prevLi.style.flexWrap = 'wrap'; prevLi.appendChild(nestedUl);
        }
        nestedUl.appendChild(liNode);
    },

    outdentChecklistLine: (liNode) => {
        const parentUl = liNode.parentNode;
        if (!parentUl || !parentUl.classList.contains('adv-checklist')) return;
        const grandParentLi = parentUl.closest('li');
        if (!grandParentLi) return; 
        grandParentLi.parentNode.insertBefore(liNode, grandParentLi.nextSibling);
        if (parentUl.children.length === 0) parentUl.remove();
    },

    outdentStandardListItem: (liNode) => {
        let parentList = liNode.parentNode;
        if (!parentList || !['UL', 'OL'].includes(parentList.tagName)) return;

        // 1. Check Se l'elemento è un sotto-elenco annidato
        const grandParentLi = parentList.parentElement.closest('li');
        if (grandParentLi) {
            const sel = window.getSelection();
            const rng = document.createRange();
            rng.selectNodeContents(liNode);
            sel.removeAllRanges();
            sel.addRange(rng);
            document.execCommand('outdent', false, null);
            return;
        }

        // 2. DOM HEALING: Se il browser ha erroneamente avvolto <ul> dentro un <p>, lo srotoliamo PRIMA di operare.
        let wrapper = parentList.parentNode;
        if (wrapper && wrapper.tagName === 'P') {
            const grandParent = wrapper.parentNode;
            grandParent.insertBefore(parentList, wrapper);
            if (wrapper.textContent.trim() === '' && wrapper.children.length === 0) {
                wrapper.remove();
            }
            wrapper = grandParent; // Il vero wrapper ora è il contenitore pulito
        }

        // 3. Spostiamo i figli FISICAMENTE per non distruggere i marker invisibili della selezione (CTRL+Z e Multi-Select)
        const p = document.createElement('p');
        while (liNode.firstChild) {
            p.appendChild(liNode.firstChild);
        }

        // 4. Logica di iniezione strutturale per spezzare l'elenco
        if (!liNode.previousElementSibling) {
            wrapper.insertBefore(p, parentList);
        } else if (!liNode.nextElementSibling) {
            wrapper.insertBefore(p, parentList.nextSibling);
        } else {
            const newList = document.createElement(parentList.tagName);
            if (parentList.hasAttribute('type')) newList.setAttribute('type', parentList.getAttribute('type'));
            
            while (liNode.nextSibling) {
                newList.appendChild(liNode.nextSibling);
            }
            
            wrapper.insertBefore(p, parentList.nextSibling);
            wrapper.insertBefore(newList, p.nextSibling);
        }

        liNode.remove();
        // Se la lista originale è rimasta vuota (es. l'utente aveva selezionato l'ultimo e unico elemento), la eliminiamo
        if (parentList.children.length === 0) parentList.remove();
    }
});