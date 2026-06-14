/**
 * AdvancedTableCell.js
 * Genera il markup HTML di ogni singola cella del database in base al Tipo.
 * FIX UX: Se il dato fa parte di una relazione, viene passato il context sorgente (relationCtx)
 * al drawer per generare i pulsanti di "Scollegamento" anziché eliminazione distruttiva.
 * FIX MULTI-SELECT: I valori (Tag) vengono ora sempre visualizzati in ordine alfabetico crescente.
 * FIX RESOLVE SYSTEM: La risoluzione di Pagine e Relazioni per le Viste del DB di sistema ora è infallibile.
 * FIX RELAZIONI FORMULE: Utilizzo nativo e pulito dell'engine centrale 'resolveRelationDetails' senza codice duplicato.
 */

Object.assign(AdvancedTable, {
    renderCell: (tableId, row, col, val, state, isEdit) => {
        const editable = isEdit ? 'true' : 'false';
        const readonly = isEdit ? '' : 'readonly';
        const disabled = isEdit ? '' : 'disabled';
        const clickEventSelect = isEdit ? `onclick="AdvancedTable.openSelectMenu(event, '${tableId}', '${row.id}', '${col.id}')"` : '';

        const isBacklink = col.type === 'relation_backlink';
        const pointerEvent = !isEdit ? 'pointer-events: auto; cursor: pointer;' : '';
        
        const clickEventRel = (isEdit && !isBacklink) ? `onclick="event.stopPropagation(); AdvancedTable.openRelationSelector(event, '${tableId}', '${row.id}', '${col.id}')"` : '';

        const clamp = state.textClamp !== undefined ? state.textClamp : 1;
        let clampStyle = '';
        if ((col.type === 'text' || col.type === 'url') && clamp !== 'auto') {
            clampStyle = `display: -webkit-box; -webkit-line-clamp: ${clamp}; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-wrap; word-break: break-word;`;
        }

        const readOnlyTip = isBacklink ? `title="Valore calcolato in automatico. Modificabile solo dal database origine." style="cursor:help;"` : '';

        if (isBacklink && (col.backlinkDisplay === 'count' || col.backlinkDisplay === 'property')) {
            if (col.backlinkDisplay === 'count') {
                return `<div class="adv-select-container" style="justify-content:flex-end;" ${readOnlyTip}>
                            <span class="adv-select-pill default-color" style="font-family:monospace; padding:2px 8px;">${val || 0}</span>
                        </div>`;
            } else {
                return `<div class="adv-cell-text adv-cell-readonly" style="background:rgba(0,0,0,0.02); ${clampStyle}" contenteditable="false" ${readOnlyTip}>${val || ''}</div>`;
            }
        }

        if (col.type === 'button') {
            const btnLabel = (col.buttonLabel || col.name).replace(/"/g, '&quot;');
            const btnColor = col.buttonColor || 'var(--accent-color)';
            const btnIcon = col.buttonIcon || Icons.play;
            
            const btnStyle = `cursor:pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: transform 0.1s, filter 0.1s;`;
            const actionCall = `onclick="event.stopPropagation(); AdvancedTable.runCellMacro('${tableId}', '${row.id}', '${col.id}')"`;
            
            return `
                <div style="display:flex; justify-content:center; align-items:center; width:100%; height:100%; padding:2px;">
                    <button class="btn action-btn-run" style="width:100%; min-height:28px; background-color:${btnColor}; border-color:${btnColor}; color:white; padding:4px 8px; font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:flex; align-items:center; justify-content:center; gap:5px; ${btnStyle}" ${actionCall} title="Esegui Azione" onmousedown="this.style.transform='scale(0.95)'" onmouseup="this.style.transform='scale(1)'" onmouseleave="this.style.transform='scale(1)'">
                        <span style="display:inline-flex; flex-shrink:0; pointer-events:none;">${btnIcon}</span> <span style="overflow:hidden; text-overflow:ellipsis; pointer-events:none;">${btnLabel}</span>
                    </button>
                </div>
            `;
        }

        if (col.type === 'record_note') {
            const hasNote = val && val.trim() !== '';
            let noteObj = hasNote && typeof Store !== 'undefined' ? Store.getNote(val) : null;
            if (noteObj && noteObj.deletedAt) noteObj = null;
            
            const isAttached = !!noteObj;
            const noteTitle = isAttached ? (noteObj.title || 'Senza Titolo') : 'Apri Pagina';
            const btnStyle = isAttached 
                ? 'color: var(--record-color, #10b981); font-weight: bold; background: var(--record-bg, rgba(16, 185, 129, 0.1)); border-color: var(--record-color, #10b981);' 
                : 'color: var(--text-secondary); opacity: 0.7;';
            
            const action = isEdit || isAttached ? `onclick="event.stopPropagation(); AdvancedTable.openRecordNote('${tableId}', '${row.id}', '${col.id}')"` : '';

            return `<div class="adv-select-container" style="justify-content: flex-start; height: 100%;">
                        <button class="btn" style="padding: 4px 8px; font-size: 0.8rem; border: 1px solid var(--border-color); ${btnStyle} ${isAttached ? pointerEvent : ''}" ${action}>
                            <span style="display:inline-flex; align-items:center; gap:5px;">${Icons.recordPage} ${noteTitle}</span>
                        </button>
                    </div>`;
        }

        if (col.type === 'created_time') {
            return `<div class="adv-cell-text adv-cell-readonly" contenteditable="false">${AdvancedTable.formatTime(row.createdAt)}</div>`;
        } else if (col.type === 'last_edited_time') {
            return `<div class="adv-cell-text adv-cell-readonly" contenteditable="false">${AdvancedTable.formatTime(row.updatedAt)}</div>`;
        } else if (col.type === 'checkbox') {
            const checked = val === true ? 'checked' : '';
            if (isEdit) {
                return `<div class="adv-cell-checkbox"><input type="checkbox" data-row="${row.id}" data-col="${col.id}" ${checked} ${disabled}></div>`;
            } else {
                return `<div class="adv-cell-checkbox-ro">${val ? `<span style="display:inline-flex; align-items:center; gap:4px; color:var(--accent-color);">${Icons.checkSquare} Sì</span>` : `<span style="display:inline-flex; align-items:center; gap:4px; color:var(--text-secondary);">${Icons.square} No</span>`}</div>`;
            }
        } else if (col.type === 'date' || col.type === 'datetime') {
            const inputType = col.type === 'datetime' ? 'datetime-local' : 'date';

            if (col.hasEndDate) {
                let startVal = val && typeof val === 'object' ? val.start : (val || '');
                let endVal = val && typeof val === 'object' ? val.end : '';
                
                if (inputType === 'datetime-local') {
                    if (startVal && startVal.length === 10) startVal += 'T00:00';
                    if (endVal && endVal.length === 10) endVal += 'T00:00';
                }

                if (isEdit) {
                    return `
                        <div class="adv-date-ro-row" style="width:100%;">
                            <input type="${inputType}" value="${startVal}" class="adv-range-input" onblur="AdvancedTable.updateDateRange('${tableId}', '${row.id}', '${col.id}', this.value, 'start')" ${readonly}>
                            <span class="adv-date-ro-label">➔</span>
                            <input type="${inputType}" value="${endVal}" class="adv-range-input" onblur="AdvancedTable.updateDateRange('${tableId}', '${row.id}', '${col.id}', this.value, 'end')" ${readonly}>
                        </div>
                    `;
                } else {
                    let sDisp = startVal || '?';
                    let eDisp = endVal || '?';
                    if (startVal && col.type === 'datetime') sDisp = startVal.replace('T', ' ');
                    if (endVal && col.type === 'datetime') eDisp = endVal.replace('T', ' ');

                    return `<div class="adv-date-ro-container">
                                <div class="adv-date-ro-row"><span class="adv-date-ro-label">da:</span><span>${sDisp}</span></div>
                                <div class="adv-date-ro-row"><span class="adv-date-ro-label">a:</span><span>${eDisp}</span></div>
                            </div>`;
                }
            } else {
                let singleVal = val && typeof val === 'object' ? val.start : (val || '');
                if (inputType === 'datetime-local' && singleVal && singleVal.length === 10) singleVal += 'T00:00';

                if (!isEdit) {
                    let displayVal = singleVal;
                    if (displayVal && col.type === 'datetime') displayVal = displayVal.replace('T', ' ');
                    return `<div class="adv-cell-text adv-text-right">${displayVal}</div>`;
                }
                return `<div class="adv-cell-date"><input type="${inputType}" value="${singleVal}" data-row="${row.id}" data-col="${col.id}" ${readonly}></div>`;
            }
        } else if (col.type === 'time') {
            if (!isEdit) return `<div class="adv-cell-text adv-text-right">${val || ''}</div>`;
            return `<div class="adv-cell-date"><input type="time" value="${val}" data-row="${row.id}" data-col="${col.id}" ${readonly}></div>`;
        
        } else if (col.type === 'number') {
            const rawVal = val !== null && val !== undefined ? val : '';
            const formattedVal = AdvancedTable.formatDecimal(rawVal, col.decimals);
            
            if (!isEdit) {
                return `<div class="adv-cell-text adv-text-right">${formattedVal}</div>`;
            }
            
            const decAttr = col.decimals !== undefined ? col.decimals : 'default';
            return `
                <div class="adv-cell-number">
                    <input type="text" 
                           value="${formattedVal}" 
                           data-raw-value="${rawVal}" 
                           data-decimals="${decAttr}" 
                           data-row="${row.id}" 
                           data-col="${col.id}" 
                           placeholder="..." 
                           class="adv-input-right adv-number-input" 
                           onfocus="this.type='number'; this.value=this.getAttribute('data-raw-value');" 
                           onblur="this.setAttribute('data-raw-value', this.value); this.type='text'; this.value=AdvancedTable.formatDecimal(this.value, this.getAttribute('data-decimals'));" 
                           ${readonly}>
                </div>`;
                
        } else if (col.type === 'select' || col.type === 'multi-select') {
            let content = '';
            // Clonazione sicura dell'array per non sporcare il JSON
            let vals = Array.isArray(val) ? [...val] : (val ? [val] : []);
            
            // Ordinamento alfabetico solo per il Multi-Select
            if (col.type === 'multi-select' && vals.length > 0) {
                vals.sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric: true, sensitivity: 'base'}));
            }

            if (vals.length > 0) {
                vals.forEach(v => {
                    let colorClass = state.selectColors && state.selectColors[col.id] && state.selectColors[col.id][v] ? state.selectColors[col.id][v] : '';
                    content += `<span class="adv-select-pill ${colorClass}" data-opt-name="${String(v).replace(/"/g, '&quot;')}">${v}</span>`;
                });
            } else {
                content = `<span class="adv-select-empty">Vuoto</span>`;
            }
            const cellId = `adv-sel-${tableId}-${row.id}-${col.id}`;
            return `<div id="${cellId}" class="adv-select-container ${isEdit ? 'adv-select-right' : ''}" ${clickEventSelect}>${content}</div>`;
        
        } else if (col.type === 'relation' || col.type === 'relation_backlink') {
            let content = '';
            const targetDbId = col.type === 'relation' ? col.targetTableId : col.linkedTableId;
            
            // LA MODIFICA: Usiamo il core e ci godiamo i risultati pronti
            const details = AdvancedTable.resolveRelationDetails(col, val, state._renderCache || {});
            
            if (details.length > 0) {
                const ctxObjStr = `{srcTable: '${tableId}', srcRow: '${row.id}', srcCol: '${col.id}', isBacklink: ${isBacklink}}`;
                
                details.forEach(rel => {
                    if (rel.name === 'Orfano') {
                        content += `<span class="adv-select-pill hl-c10">Orfano</span>`;
                    } else {
                        content += `<span class="adv-select-pill default-color" style="margin-right:4px; margin-left: 10px; ${pointerEvent}" onclick="event.stopPropagation(); AdvancedTable.openRecordView('${targetDbId}', '${rel.id}', ${ctxObjStr})">
                                       ${UI.escapeHTML(rel.name)} 
                                       <span style="cursor:pointer; margin-left:4px; display:inline-flex; align-items:center;" title="Vedi Dettaglio">${Icons.recordView}</span>
                                    </span>`;
                    }
                });
            } else {
                content = `<span class="adv-select-empty">Vuoto</span>`;
            }

            const cellId = `adv-rel-${tableId}-${row.id}-${col.id}`;
            return `<div id="${cellId}" class="adv-relation-container" ${clickEventRel} ${readOnlyTip}>${content}</div>`;
            
        } else if (col.type === 'url') {
            if (isEdit) {
                const safeVal = (val || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                
                let targetUrl = val ? val.trim().replace(/^https?:\/\/file:\/\/\//i, 'file:///') : '';
                const hasProtocol = /^[a-zA-Z0-9+-.]+:/i.test(targetUrl);
                const isLocalPath = /^([a-zA-Z]:[\\/]|\\\\)/i.test(targetUrl);
                
                if (isLocalPath) targetUrl = 'file:///' + targetUrl.replace(/\\/g, '/');
                else if (!hasProtocol && targetUrl) targetUrl = 'https://' + targetUrl;

                const openBtnHTML = targetUrl ? `<button class="adv-icon-btn" title="Apri Link Esterno" onclick="event.stopPropagation(); window.open('${targetUrl}', '_blank')" style="flex-shrink:0; padding:2px; color:var(--text-secondary); margin-left:4px;">${Icons.globe}</button>` : '';
                
                return `<div style="display:flex; align-items:center; width:100%;">
                            <div class="adv-cell-text adv-url-edit" style="${clampStyle}" contenteditable="true" data-row="${row.id}" data-col="${col.id}" placeholder="https://... o C:\\...">${safeVal}</div>
                            ${openBtnHTML}
                        </div>`;
            } else {
                if (val) {
                    let href = val.trim().replace(/^https?:\/\/file:\/\/\//i, 'file:///');
                    let isLocal = href.match(/^[a-zA-Z]:[\\/]/) || href.startsWith('\\\\');
                    if (isLocal) {
                        href = 'file:///' + href.replace(/\\/g, '/');
                        return `<div class="adv-url-ro">
                                    <div class="adv-url-ro-text" style="${clampStyle}; ${pointerEvent}">
                                        <a href="${href}" target="_blank" style="color:var(--accent-color); text-decoration:underline;">${val}</a>
                                    </div>
                                    <button class="adv-icon-btn" style="${pointerEvent} padding:2px;" onclick="navigator.clipboard.writeText('${val.replace(/\\/g, '\\\\')}'); alert('Percorso copiato negli appunti!')" title="Copia percorso locale">${Icons.clipboard}</button>
                                </div>`;
                    } else {
                        if (!/^[a-zA-Z0-9+-.]+:/i.test(href)) href = 'https://' + href;
                        return `<div class="adv-url-ro-text" style="${clampStyle}; ${pointerEvent}"><a href="${href}" target="_blank" style="color:var(--accent-color); text-decoration:underline;">${val}</a></div>`;
                    }
                }
                return `<span class="adv-select-empty">Vuoto</span>`;
            }
        } else {
            let rawVal = val || '';
            if (!rawVal) {
                return `<div class="adv-cell-text" style="${clampStyle}" contenteditable="${editable}" data-row="${row.id}" data-col="${col.id}"></div>`;
            }

            if (clamp === 'auto') {
                const safeText = rawVal.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `<div class="adv-cell-text" contenteditable="${editable}" data-row="${row.id}" data-col="${col.id}" style="white-space: pre-wrap; word-break: break-word;">${safeText}</div>`;
            } else {
                const safeText = rawVal.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const hasMultipleLines = rawVal.trim().includes('\n');
                const estimatedMaxChars = Math.max(20, Math.floor((col.width) / 7)) * clamp;
                const isTooLong = rawVal.length > estimatedMaxChars || hasMultipleLines;

                const tooltipAttr = isTooLong ? `data-tooltip="${safeText.replace(/"/g, '&quot;').replace(/\n/g, '<br>')}"` : '';

                return `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:4px; width:100%;">
                        <div class="adv-cell-text" style="${clampStyle}" contenteditable="${editable}" data-row="${row.id}" data-col="${col.id}" ${tooltipAttr}>${safeText}</div>
                        ${isTooLong && !isEdit ? `<button class="adv-icon-btn" title="Apri Testo Completo" onclick="event.stopPropagation(); AdvancedTable.openLongTextModal('${tableId}', '${row.id}', '${col.id}')" style="flex-shrink:0; padding:2px; color:var(--text-secondary); margin-top:2px; ${pointerEvent}">${Icons.recordView}</button>` : ''}
                        ${isTooLong && isEdit ? `<button class="adv-icon-btn" title="Modifica Testo Completo" onclick="event.stopPropagation(); AdvancedTable.openLongTextModal('${tableId}', '${row.id}', '${col.id}')" style="flex-shrink:0; padding:2px; color:var(--text-secondary); margin-top:2px;">${Icons.editTbl}</button>` : ''}
                    </div>
                `;
            }
        }
    }
});