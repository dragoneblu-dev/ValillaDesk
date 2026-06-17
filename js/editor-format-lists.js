/**
 * editor-format-lists.js
 * Sottomodulo di Editor.
 * Gestione strutturale delle Liste e delle Checklist (Indent/Outdent).
 */

Object.assign(Editor, {

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

        let wrapper = parentList.parentNode;
        if (wrapper && wrapper.tagName === 'P') {
            const grandParent = wrapper.parentNode;
            grandParent.insertBefore(parentList, wrapper);
            if (wrapper.textContent.trim() === '' && wrapper.children.length === 0) {
                wrapper.remove();
            }
            wrapper = grandParent; 
        }

        const p = document.createElement('p');
        while (liNode.firstChild) {
            p.appendChild(liNode.firstChild);
        }

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
        if (parentList.children.length === 0) parentList.remove();
    }
});