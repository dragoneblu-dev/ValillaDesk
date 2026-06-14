/**
 * AdvancedTableCore.js
 * Motore di Stato, RAM Cache, Inizializzazione e Virtual Cell Engine.
 * FIX: Il nome del genitore per SYS_PROPERTIES_DB è ora identificato correttamente come "Sistema Globale".
 * FIX CENTRALE: Introdotta 'getFormatDisplayValue' e centralizzata '_resolveRelationNames'
 * per garantire una decodifica Human-Readable universale senza codice duplicato.
 * FIX LINKED VIEWS: Aggiunto 'calendarZoom' all'universalConfig per non perdere lo stato dello zoom orario.
 * FIX SANDBOX ASINCRONA: Iniettati correttamente AppState, Store e AdvancedTable nell'executor async.
 * FIX PRESTAZIONI ESTREME (Lazy Evaluation): Implementazione dei Proxy JS per '_buildTabellaContext' e '_buildRigaContext'
 * per azzerare il carico CPU su database enormi.
 * FIX ARCHITETTURA PULITA: Creata 'resolveRelationDetails' per gestire la risoluzione profonda di Formule e Rollup 
 * mantenendo l'incapsulamento del Core senza sporcare i file dell'interfaccia utente.
 * FIX TOPOLOGICAL SORT: Il calcolo delle Formule JS non è più limitato all'ordine visivo delle colonne (da sx a dx). 
 * Il motore ora risolve le dipendenze incrociate in modo ricorsivo prevenendo i paradossi.
 * FIX MACRO: Le funzioni native (SOMMA, MEDIA, ecc.) sono state blindate per accettare array, oggetti o primitivi multipli (Stile Excel).
 */

const AdvancedTable = {
    resizingCol: null,
    draggedColId: null,
    startX: 0,
    startWidth: 0,
    pillColors:['', 'hl-c1', 'hl-c2', 'hl-c3', 'hl-c4', 'hl-c5', 'hl-c6', 'hl-c7', 'hl-c8', 'hl-c9', 'hl-c10'],
    
    panState: null,

    // ==========================================
    // DECODIFICA UNIVERSALE DATI (Human-Readable)
    // ==========================================

    resolveRelationDetails: (colDef, rawValues, renderCache = {}) => {
        const vals = Array.isArray(rawValues) ? rawValues : (rawValues ? [rawValues] : []);
        if (vals.length === 0) return [];

        const targetDbId = colDef.type === 'relation' ? colDef.targetTableId : colDef.linkedTableId;
        if (!targetDbId) return vals.map(id => ({ id: id, name: 'Orfano' }));

        const targetState = AdvancedTable.getTableState(targetDbId);
        if (!targetState) return vals.map(id => ({ id: id, name: 'Orfano' }));

        const displayColId = colDef.type === 'relation' ? colDef.targetColId : targetState.columns[0].id;
        const displayColDef = targetState.columns.find(c => c.id === displayColId);

        // FAST-PATH: Se la colonna bersaglio non è un campo calcolato, saltiamo il pesante motore virtuale
        const isCalculatedCol = displayColDef && ['formula', 'rollup', 'relation_backlink'].includes(displayColDef.type);

        return vals.map(tId => {
            const tRow = targetState.rows.find(r => r.id === tId);
            if (!tRow) return { id: tId, name: 'Orfano' };
            
            let val;
            if (isCalculatedCol) {
                const vRow = AdvancedTable.buildVirtualRow(targetDbId, tRow, targetState, renderCache);
                val = vRow.virtualCells[displayColId];
            } else {
                val = tRow.cells[displayColId];
            }
            
            // Se la colonna target è a sua volta una "Pagina", risolve il titolo reale della nota
            if (displayColDef && displayColDef.type === 'record_note' && val) {
                const note = typeof Store !== 'undefined' ? Store.getNote(val) : null;
                return { id: tId, name: note ? (note.title || 'Senza Titolo') : 'Pagina Orfana' };
            }
            
            // Appiattimento di sicurezza nel caso di array nidificati
            if (Array.isArray(val)) val = val.join(', ');
            
            return { 
                id: tId, 
                name: val !== undefined && val !== null && val !== '' ? String(val) : 'Senza Nome' 
            };
        });
    },

    _resolveRelationNames: (colDef, rawValues, renderCache = {}) => {
        return AdvancedTable.resolveRelationDetails(colDef, rawValues, renderCache).map(rel => rel.name);
    },

    getFormatDisplayValue: (colDef, rawValue, renderCache = {}) => {
        if (!colDef) return String(rawValue || '');
        if (rawValue === undefined || rawValue === null || rawValue === '') return '';

        if (colDef.type === 'record_note') {
            const note = typeof Store !== 'undefined' ? Store.getNote(rawValue) : null;
            return note ? (note.title || 'Senza Titolo') : 'Pagina Orfana';
        }
        
        if (colDef.type === 'relation' || colDef.type === 'relation_backlink') {
            const details = AdvancedTable.resolveRelationDetails(colDef, rawValue, renderCache);
            let resolvedNames = details.map(d => d.name);
            resolvedNames.sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric: true, sensitivity: 'base'}));
            return resolvedNames.join(', ');
        }

        if (colDef.type === 'multi-select') {
            const vals = Array.isArray(rawValue) ? [...rawValue] : [rawValue];
            vals.sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric: true, sensitivity: 'base'}));
            return vals.join(', ');
        }

        if (colDef.type === 'date' || colDef.type === 'datetime') {
             if (typeof rawValue === 'object' && rawValue !== null) {
                 return (rawValue.start || '') + (rawValue.end ? ' ➔ ' + rawValue.end : '');
             }
             return String(rawValue);
        }

        if (colDef.type === 'created_time' || colDef.type === 'last_edited_time') {
             return AdvancedTable.formatTime(rawValue);
        }

        if (colDef.type === 'checkbox') {
             return rawValue ? '☑ Sì' : '☐ No';
        }

        if (Array.isArray(rawValue)) {
             return rawValue.join(', ');
        }

        if (colDef.type === 'number' || colDef.type === 'formula' || colDef.type === 'rollup') {
            const formatted = AdvancedTable.formatDecimal(rawValue, colDef.decimals);
            return formatted !== '' && formatted !== null ? String(formatted) : '';
        }

        return String(rawValue);
    },

    // ==========================================
    // GESTIONE SHADOW DATABASE (Proprietà di Pagina e Tag)
    // ==========================================
    ensureSystemPropertiesDB: () => {
        if (!AppState.databases) AppState.databases = {};
        
        if (!AppState.databases['SYS_PROPERTIES_DB']) {
            AppState.databases['SYS_PROPERTIES_DB'] = {
                title: "Proprietà e Tag di Pagina",
                isSystemDB: true,
                columns: [
                    { id: 'sys_c_note', name: 'Pagina Collegata', type: 'record_note', width: 200, hidden: false },
                    { id: 'sys_c_tags', name: 'Tag', type: 'multi-select', width: 250, hidden: false }
                ],
                rows: [],
                selectOptions: { 'sys_c_tags': [] },
                selectColors: { 'sys_c_tags': {} },
                sorts: [], 
                filters: {}, 
                automations: []
            };
        }

        const db = AppState.databases['SYS_PROPERTIES_DB'];
        
        if (AppState.notes) {
            AppState.notes.forEach(n => {
                if (!n.deletedAt && !db.rows.find(r => r.cells['sys_c_note'] === n.id)) {
                    db.rows.push({
                        id: 'sys_r_' + n.id,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        cells: { 'sys_c_note': n.id, 'sys_c_tags': [] }
                    });
                }
            });
        }
    },

    syncSystemPropertiesRow: (noteId) => {
        if (!AppState.databases || !AppState.databases['SYS_PROPERTIES_DB']) return;
        const db = AppState.databases['SYS_PROPERTIES_DB'];
        if (!db.rows.find(r => r.cells['sys_c_note'] === noteId)) {
            db.rows.push({
                id: 'sys_r_' + noteId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                cells: { 'sys_c_note': noteId, 'sys_c_tags': [] }
            });
        }
    },

    deleteSystemPropertiesRow: (noteId) => {
        if (!AppState.databases || !AppState.databases['SYS_PROPERTIES_DB']) return;
        const db = AppState.databases['SYS_PROPERTIES_DB'];
        db.rows = db.rows.filter(r => r.cells['sys_c_note'] !== noteId);
    },

    destroy: (id) => {
        if (typeof AdvancedTable.deleteTable === 'function') {
            AdvancedTable.deleteTable(id, true);
        }
    },

    closeDropdowns: (force = false) => {
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.closeAll(force);
    },

    _positionDropdown: (dropdown, anchorId) => {
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.positionAt(dropdown, anchorId);
    },

    buildContextMenu: (anchorId, items) => {
        if (typeof UI !== 'undefined' && UI.Menu) UI.Menu.buildContextMenu(anchorId, items);
    },

    // Gestione DB Virtuale in Background
    getParentNoteName: (widgetId) => {
        if (widgetId === 'SYS_PROPERTIES_DB') return "Sistema Globale";
        if (!AppState.notes) return "Workspace";
        for (let n of AppState.notes) {
            if (n.content && n.content.includes(widgetId)) {
                return n.title || 'Senza Titolo';
            }
        }
        return "Orfano";
    },

    _sanitizeState: (state) => {
        if (!state) return state;
        if (!state.rows) state.rows =[];
        if (!state.columns) state.columns = [];
        if (!state.sorts) state.sorts =[];
        if (!state.filters) state.filters = {};
        if (!state.automations) state.automations =[];
        if (!state.selectOptions) state.selectOptions = {};
        if (!state.selectColors) state.selectColors = {};
        if (!state.selectedRows) state.selectedRows = [];
        if (!state.conditionalColors) state.conditionalColors = [];
        if (state.hideFooterControls === undefined) state.hideFooterControls = false;
        return state;
    },

    _resolveSourceId: (tableId) => {
        const trueId = tableId.split('_cited_')[0];
        const state = AppState.databases ? AppState.databases[trueId] : null;
        return (state && state.isLinkedView) ? state.sourceTableId : trueId;
    },

    updateDependentViews: (sourceTableId) => {
        if (!AppState.databases) return;
        const targetTrueId = sourceTableId.split('_cited_')[0];
        
        Object.keys(AppState.databases).forEach(id => {
            const s = AppState.databases[id];
            if (s && (id === targetTrueId || s.sourceTableId === targetTrueId)) {
                
                const wrapper = document.getElementById(id);
                if (wrapper) {
                    if (s.isPivot && typeof AdvancedPivot !== 'undefined') {
                        AdvancedPivot.render(id);
                    } else {
                        AdvancedTable.renderTable(id);
                    }
                }
                
                const citations = document.querySelectorAll(`[id^="${id}_cited_"]`);
                citations.forEach(cit => {
                    if (s.isPivot && typeof AdvancedPivot !== 'undefined') {
                        AdvancedPivot.render(cit.id);
                    } else {
                        AdvancedTable.renderTable(cit.id);
                    }
                });
            }
        });
    },

    getTableState: (targetId) => {
        if (!targetId) return null;
        if (!AppState.databases) AppState.databases = {};

        const trueId = targetId.split('_cited_')[0];

        if (AppState.databases[trueId]) {
            const state = AppState.databases[trueId];
            if (state.entries) return AdvancedTable._sanitizeState(AdvancedTable._convertJournalToTableState(trueId, state));
            return AdvancedTable._sanitizeState(state);
        }
        
        const el = document.getElementById(targetId);
        if (el && el.hasAttribute('data-state')) {
            try { 
                const s = JSON.parse(el.getAttribute('data-state').replace(/&quot;/g, '"')); 
                AppState.databases[trueId] = AdvancedTable._sanitizeState(s);
                el.removeAttribute('data-state');
                if (el.classList.contains('adv-journal-wrapper') || el.getAttribute('data-widget-type') === 'journal') {
                    return AdvancedTable._sanitizeState(AdvancedTable._convertJournalToTableState(trueId, s));
                }
                return AdvancedTable._sanitizeState(s);
            } catch (e) { }
        }
        return null;
    },

    _convertJournalToTableState: (id, jState) => {
        const fakeState = {
            title: 'Diario/Log',
            isPivot: false,
            columns:[
                { id: 'j_date', name: 'Data', type: 'date' },
                { id: 'j_time', name: 'Ora', type: 'time' },
                { id: 'j_text', name: 'Testo', type: 'text' },
                { id: 'j_done', name: 'Completato', type: 'checkbox' },
                { id: 'j_end', name: 'Data Fine', type: 'datetime' }
            ],
            rows: []
        };

        (jState.entries ||[]).forEach(entry => {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = entry.content || '';
            const plainText = tempDiv.innerText || tempDiv.textContent;

            let endFormatted = '';
            if (entry.endTime) {
                const ed = new Date(entry.endTime);
                ed.setMinutes(ed.getMinutes() - ed.getTimezoneOffset());
                endFormatted = ed.toISOString().slice(0, 16);
            }

            fakeState.rows.push({
                id: entry.id,
                createdAt: entry.timestamp,
                updatedAt: entry.endTime || entry.timestamp,
                cells: {
                    'j_date': (entry.dateStr || '').replace(/\//g, '-'),
                    'j_time': entry.timeStr || '',
                    'j_text': plainText,
                    'j_done': !!entry.endTime,
                    'j_end': endFormatted
                }
            });
        });
        return fakeState;
    },

    getState: (tableId) => {
        if (!AppState.databases) AppState.databases = {};
        
        const trueId = tableId.split('_cited_')[0];
        let state = AppState.databases[trueId];

        if (!state) {
            const wrapper = document.getElementById(tableId);
            if (wrapper && wrapper.hasAttribute('data-state')) {
                try {
                    state = JSON.parse(wrapper.getAttribute('data-state').replace(/&quot;/g, '"'));
                    AppState.databases[trueId] = AdvancedTable._sanitizeState(state);
                    wrapper.removeAttribute('data-state');
                } catch (e) { 
                    state = { title: "⚠️ Dati Corrotti", isPivot: false, columns:[{ id: 'c_err', name: 'Errore', type: 'text', width: 200 }], rows:[{ id: 'r_err', cells: { 'c_err': 'Contenuto illeggibile.' } }], selectOptions: {}, selectColors: {}, sorts: [], filters: {}, automations:[], conditionalColors:[] };
                    AppState.databases[trueId] = state;
                }
            }
        }

        if (state) {
            state = AdvancedTable._sanitizeState(state);

            if (state.isLinkedView) {
                const sourceState = AppState.databases[state.sourceTableId];
                if (sourceState) {
                    state.columns = sourceState.columns;
                    state.rows = sourceState.rows;
                    state.selectOptions = sourceState.selectOptions;
                    state.selectColors = sourceState.selectColors;
                    state.automations = sourceState.automations;
                    state.conditionalColors = sourceState.conditionalColors;
                    state.sourceDeleted = false;
                } else {
                    state.sourceDeleted = true;
                    state.columns = [];
                    state.rows =[];
                }
            }
            return state;
        }

        return null;
    },

    setState: (tableId, state) => {
        if (!AppState.databases) AppState.databases = {};
        
        const trueId = tableId.split('_cited_')[0];

        const universalConfig = {
            title: state.title,
            isSystemDB: state.isSystemDB,
            isLinkedView: state.isLinkedView,
            isPivot: state.isPivot,
            sourceTableId: state.sourceTableId,
            viewType: state.viewType,
            freeWidth: state.freeWidth,
            striped: state.striped,
            textClamp: state.textClamp,
            filters: state.filters,
            savedFilters: state.savedFilters,
            sorts: state.sorts,
            viewConfig: state.viewConfig,
            boardGroupBy: state.boardGroupBy,
            calendarDateCol: state.calendarDateCol,
            calendarMode: state.calendarMode,
            calendarFocusDate: state.calendarFocusDate,
            calendarZoom: state.calendarZoom,
            timelineDateCol: state.timelineDateCol,
            timelineGroupBy: state.timelineGroupBy,
            timelineZoom: state.timelineZoom,
            groupBy: state.groupBy,
            aggregations: state.aggregations,
            chartConfig: state.chartConfig,
            selectedRows: state.selectedRows || [],
            conditionalColors: state.conditionalColors || [],
            pageSize: state.pageSize || 'all',
            currentPage: state.currentPage || 1,
            hideFooterControls: state.hideFooterControls || false
        };

        if (state.isLinkedView) {
            AppState.databases[trueId] = universalConfig;
        } else if (state.isPivot) {
            let fullState = AdvancedTable._sanitizeState(state);
            AppState.databases[trueId] = { ...fullState, ...universalConfig };
        } else {
            let fullState = AdvancedTable._sanitizeState(state);
            AppState.databases[trueId] = { ...fullState, ...universalConfig };
        }
    },
    
    startPan: (e) => {
        const tgt = e.target;
        if (tgt.closest('input, textarea, button, a, select, .adv-select-pill, .adv-add-btn, .adv-tool-btn, .adv-icon-btn, .widget-drag-handle, .widget-options-btn')) return;
        if (tgt.closest('.widget-editable-area') || tgt.closest('.adv-col-resizer') || tgt.closest('.adv-cell-text[contenteditable="true"]')) return;
        if (tgt.closest('th')) return;

        const scrollContainer = tgt.closest('.adv-scroll-container, .adv-kanban-col');
        if (!scrollContainer) return;

        const rect = scrollContainer.getBoundingClientRect();
        if (e.clientY > rect.bottom - 15 || e.clientX > rect.right - 15) return;

        if (scrollContainer.scrollWidth <= scrollContainer.clientWidth && 
            scrollContainer.scrollHeight <= scrollContainer.clientHeight) return;

        AdvancedTable.panState = { 
            el: scrollContainer, 
            startX: e.pageX, 
            startY: e.pageY,
            scrollLeft: scrollContainer.scrollLeft,
            scrollTop: scrollContainer.scrollTop
        };
        
        document.body.style.cursor = 'grabbing';
        document.addEventListener('mousemove', AdvancedTable.onPanMove);
        document.addEventListener('mouseup', AdvancedTable.onPanEnd);
    },

    onPanMove: (e) => {
        if (!AdvancedTable.panState) return;
        e.preventDefault(); 
        
        const ps = AdvancedTable.panState;
        const diffX = e.pageX - ps.startX;
        const diffY = e.pageY - ps.startY;
        
        ps.el.scrollLeft = ps.scrollLeft - diffX;
        ps.el.scrollTop = ps.scrollTop - diffY;
    },

    onPanEnd: () => {
        if (AdvancedTable.panState) {
            AdvancedTable.panState = null;
            document.removeEventListener('mousemove', AdvancedTable.onPanMove);
            document.removeEventListener('mouseup', AdvancedTable.onPanEnd);
        }
        document.body.style.cursor = ''; 
    },

    initEvents: () => {
        document.addEventListener('mousemove', AdvancedTable.handleGlobalMouseMove);
        document.addEventListener('mouseup', AdvancedTable.handleGlobalMouseUp);
        
        document.addEventListener('mouseleave', (e) => {
            if (e.clientY <= 0 || e.clientX <= 0 || (e.clientX >= window.innerWidth || e.clientY >= window.innerHeight)) {
                if (AdvancedTable.resizingCol) AdvancedTable.handleGlobalMouseUp(e);
                AdvancedTable.onPanEnd(); 
            }
        });

        document.addEventListener('mousedown', AdvancedTable.startPan);
    },

    buildVirtualRow: (tableId, row, state, renderCache = {}) => {
        let vRow = { ...row, virtualCells: { ...(row.cells || {}) } };

        (state.columns ||[]).forEach(col => {
            
            if (col.type === 'relation_backlink' && col.linkedTableId && col.linkedColId) {
                if (!renderCache.backlinks) renderCache.backlinks = {};
                if (!renderCache.backlinks[col.id]) {
                    renderCache.backlinks[col.id] = {};
                    const sourceState = AdvancedTable.getTableState(col.linkedTableId);
                    if (sourceState) {
                        sourceState.rows.forEach(srcRow => {
                            const vals = srcRow.cells[col.linkedColId];
                            if (Array.isArray(vals)) {
                                vals.forEach(v => {
                                    if (!renderCache.backlinks[col.id][v]) renderCache.backlinks[col.id][v] = [];
                                    renderCache.backlinks[col.id][v].push(srcRow);
                                });
                            }
                        });
                    }
                }

                let backlinks = renderCache.backlinks[col.id][row.id] || [];

                if (col.backlinkDisplay === 'property' && col.backlinkPropertyId) {
                    let props = backlinks.map(r => r.cells[col.backlinkPropertyId]).filter(v => v !== '' && v !== null);
                    props = props.flat(); 
                    
                    if (col.backlinkDistinct) {
                        props = [...new Set(props.map(String))];
                    }
                    
                    if (col.backlinkAggType === 'count') {
                        vRow.virtualCells[col.id] = props.length;
                    } else if (col.backlinkAggType === 'sum') {
                        const nums = props.map(v => parseFloat(v)).filter(n => !isNaN(n));
                        vRow.virtualCells[col.id] = nums.reduce((a, b) => a + b, 0);
                    } else {
                        vRow.virtualCells[col.id] = props.join(', ');
                    }
                } else if (col.backlinkDisplay === 'count') {
                    vRow.virtualCells[col.id] = backlinks.length;
                } else {
                    vRow.virtualCells[col.id] = backlinks.map(r => r.id);
                }
                return;
            }

            if (col.type === 'rollup' && col.relationColId && col.targetColId) {
                const relationVals = (row.cells || {})[col.relationColId];
                if (!relationVals || !Array.isArray(relationVals) || relationVals.length === 0) {
                    vRow.virtualCells[col.id] = '';
                    return;
                }

                const relColDef = state.columns.find(c => c.id === col.relationColId);
                if (!relColDef || !relColDef.targetTableId) return;

                if (!renderCache.rowIndexes) renderCache.rowIndexes = {};
                if (!renderCache.rowIndexes[relColDef.targetTableId]) {
                    renderCache.rowIndexes[relColDef.targetTableId] = {};
                    const ts = AdvancedTable.getTableState(relColDef.targetTableId);
                    if (ts) ts.rows.forEach(r => renderCache.rowIndexes[relColDef.targetTableId][r.id] = { state: ts, row: r });
                }

                const targetState = AdvancedTable.getTableState(relColDef.targetTableId);
                if (!targetState) return;

                const targetColDef = targetState.columns.find(c => c.id === col.targetColId);
                if (!targetColDef) return;

                let rolled = [];
                relationVals.forEach(tId => {
                    const cacheRef = renderCache.rowIndexes[relColDef.targetTableId][tId];
                    if (cacheRef) {
                        const tRow = cacheRef.row;
                        let val;
                        
                        if (targetColDef.type === 'created_time') val = AdvancedTable.formatTime(tRow.createdAt);
                        else if (targetColDef.type === 'last_edited_time') val = AdvancedTable.formatTime(tRow.updatedAt);
                        else if (targetColDef.type === 'formula' && typeof AdvancedTable.evaluateFormula === 'function') {
                            let tVirtualCells = {};
                            targetState.columns.forEach(tc => {
                                if(tc.type === 'created_time') tVirtualCells[tc.id] = AdvancedTable.formatTime(tRow.createdAt);
                                else if(tc.type === 'last_edited_time') tVirtualCells[tc.id] = AdvancedTable.formatTime(tRow.updatedAt);
                                else tVirtualCells[tc.id] = tRow.cells[tc.id];
                            });
                            try {
                                val = AdvancedTable.evaluateFormula(targetColDef.formula, {cells: tVirtualCells, createdAt: tRow.createdAt, updatedAt: tRow.updatedAt}, targetState.columns, relColDef.targetTableId, targetState.title, tVirtualCells, renderCache);
                            } catch(e) { val = ''; }
                        }
                        else val = tRow.cells[col.targetColId];

                        if (val !== undefined && val !== null && val !== '') {
                            if (typeof val === 'object' && !Array.isArray(val)) {
                                if (val.start && val.end) val = `${val.start} ➔ ${val.end}`;
                                else if (val.start) val = val.start;
                                else val = JSON.stringify(val);
                            }
                            if (Array.isArray(val)) rolled.push(...val);
                            else rolled.push(val);
                        }
                    }
                });
                
                vRow.virtualCells[col.id] = [...new Set(rolled)].join(', ');
            }
        });

        // =========================================================
        // ORDINAMENTO TOPOLOGICO FORMULE (Risoluzione Loop & Dipendenze)
        // =========================================================
        const formulaCols = (state.columns || []).filter(c => c.type === 'formula');
        if (formulaCols.length > 0) {
            const resolved = new Set();
            const resolving = new Set();

            const resolveFormula = (col) => {
                if (resolved.has(col.id)) return;
                
                // Prevenzione Paradossi / Loop Infiniti
                if (resolving.has(col.id)) {
                    vRow.virtualCells[col.id] = '⚠️ Riferimento Circolare';
                    resolved.add(col.id);
                    return;
                }
                
                resolving.add(col.id);

                // Cerca dipendenze incrociate analizzando il codice sorgente della formula
                formulaCols.forEach(otherCol => {
                    if (otherCol.id !== col.id && col.formula) {
                        const escapedName = otherCol.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(`riga\\s*\\[\\s*["']${escapedName}["']\\s*\\]|riga\\.${escapedName}\\b`);
                        if (regex.test(col.formula)) {
                            resolveFormula(otherCol);
                        }
                    }
                });

                // Valuta in sicurezza sapendo che le dipendenze a sinistra o destra sono già calcolate in vRow.virtualCells
                vRow.virtualCells[col.id] = (typeof AdvancedTable.evaluateFormula === 'function') ? 
                    AdvancedTable.evaluateFormula(col.formula, vRow, state.columns, tableId, state.title, vRow.virtualCells, renderCache) : '';
                
                resolving.delete(col.id);
                resolved.add(col.id);
            };

            formulaCols.forEach(col => resolveFormula(col));
        }

        return vRow;
    },

    formatTime: (ts) => {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    },

    formatDecimal: (val, decimals) => {
        if (decimals === undefined || decimals === 'default' || val === '' || val === null) return val;
        let numStr = String(val).replace(',', '.');
        const n = parseFloat(numStr);
        if (isNaN(n)) return val;
        return n.toFixed(parseInt(decimals, 10));
    },

    mountAll: (container = document) => {
        const wrappers = container.querySelectorAll('.adv-table-wrapper, [data-widget-type="database"], [data-widget-type="pivot"]');
        const seenIds = new Set();
        
        wrappers.forEach(wrapper => {
            if (wrapper.closest('.block-citation') && container.id === 'noteContent') return;

            wrapper.setAttribute('contenteditable', 'false');

            let currentId = wrapper.id;
            if (!currentId || seenIds.has(currentId)) {
                const newId = 'adv_tbl_' + Store.generateId();
                wrapper.id = newId;
                
                if (wrapper.hasAttribute('data-state')) {
                    try {
                        const s = JSON.parse(wrapper.getAttribute('data-state').replace(/&quot;/g, '"'));
                        if (!AppState.databases) AppState.databases = {};
                        AppState.databases[newId] = AdvancedTable._sanitizeState(s);
                        wrapper.removeAttribute('data-state');
                    } catch(e) {}
                }
                currentId = newId;
            }
            seenIds.add(currentId);

            try {
                const s = AdvancedTable.getState(currentId);
                if (s && s.isPivot && typeof AdvancedPivot !== 'undefined') AdvancedPivot.render(currentId);
                else AdvancedTable.renderTable(currentId);

                if (s && s.automations && typeof AdvancedAutomations !== 'undefined') {
                    setTimeout(() => { AdvancedAutomations.triggerOnLoad(currentId); }, 250);
                }

            } catch (e) { AdvancedTable.renderTable(currentId); }
        });
    },

    create: () => {
        if (!AppState.isEditMode) return;
        Editor.restoreSelection();
        const sel = window.getSelection();
        let node = sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null;
        if(node && node.nodeType === 3) node = node.parentNode;

        if (node && node.closest('.widget-type-columns, .simple-table-wrapper')) {
            alert("Non è permesso inserire Widget Complessi all'interno delle Colonne o delle Tabelle Semplici per prevenire la corruzione del layout.\nSposta il cursore fuori prima di inserire.");
            return;
        }

        const tableId = 'adv_tbl_' + Store.generateId();
        const now = Date.now();
        const initialState = {
            title: 'Nuovo Database',
            viewType: 'table',
            freeWidth: false,
            striped: true,
            textClamp: 1,
            automations: [],
            conditionalColors: [],
            hideFooterControls: false,
            columns:[
                { id: 'c_1', name: 'Nome', type: 'text', width: 200, hidden: false },
                { id: 'c_2', name: 'Tag', type: 'multi-select', width: 180, hidden: false },
                { id: 'c_3', name: 'Ultima Modifica', type: 'last_edited_time', width: 150, hidden: false }
            ],
            rows:[
                { id: 'r_1', createdAt: now, updatedAt: now, cells: { c_1: 'Elemento 1', c_2: [], c_3: '' } },
                { id: 'r_2', createdAt: now, updatedAt: now, cells: { c_1: '', c_2:[], c_3: '' } }
            ],
            selectOptions: { c_2:[] },
            selectColors: { c_2: {} },
            sorts: [],
            filters: {},
            selectedRows:[]
        };

        if (!AppState.databases) AppState.databases = {};
        AppState.databases[tableId] = AdvancedTable._sanitizeState(initialState);

        let wrapper;
        if (typeof WidgetManager !== 'undefined') {
            wrapper = WidgetManager.createShell('database', tableId);
        } else {
            wrapper = document.createElement('div');
            wrapper.className = 'adv-table-wrapper';
            wrapper.id = tableId;
            wrapper.contentEditable = "false";
        }

        if (typeof Editor !== 'undefined') Editor.saveSnapshot();

        let targetBlock = node ? node.closest('p, div, li, h1, h2, h3, h4, h5, h6') : null;
        const isEmptyBlock = targetBlock && targetBlock.id !== 'noteContent' && targetBlock.textContent.replace(/[\u200B\n\r]/g, '').trim() === '';

        if (isEmptyBlock) {
            targetBlock.parentNode.replaceChild(wrapper, targetBlock);
        } else {
            if (sel.rangeCount) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(wrapper);
            } else {
                document.getElementById('noteContent').appendChild(wrapper);
            }
        }

        const p = document.createElement('p'); 
        p.innerHTML = '<br>';
        wrapper.parentNode.insertBefore(p, wrapper.nextSibling);

        AdvancedTable.renderTable(tableId);
        Store.triggerAutoSave();
    }
};

AdvancedTable._formulaWrappers = `
    const PADRE = (id) => { const n = AppState.notes.find(x => x.id === id); return n ? n.parentId : null; };
    const FIGLI = (id) => AppState.notes.filter(n => n.parentId === id && !n.deletedAt).map(n => n.id);
    const PROPRIETA = (id, campo) => { const db = AppState.databases['SYS_PROPERTIES_DB']; if(!db) return ""; const row = db.rows.find(r => r.cells['sys_c_note'] === id); if(!row) return ""; const col = db.columns.find(c => c.name === campo); if(!col) return ""; return row.cells[col.id]; };
    const NOTA_CORRENTE = () => riga["_sys_note_id"] || null;
    
    const SE = (condizione, se_vero, se_falso) => condizione ? se_vero : se_falso;
    
    // Aggiornate per accettare sia un Array interno (Aggregatori) sia N-Argomenti separati (Excel Mode)
    const SOMMA = (...args) => { 
        if(args.length === 0) return 0; 
        if(Array.isArray(args[0])) { 
            const arr = args[0], col = args[1]; 
            return arr.reduce((s, r) => s + (Number(typeof r === 'object' && r !== null && col ? r[col] : r) || 0), 0); 
        } 
        return args.reduce((s, val) => s + (Number(val) || 0), 0); 
    };
    
    const MEDIA = (...args) => { 
        if(args.length === 0) return 0; 
        if(Array.isArray(args[0])) { 
            const arr = args[0], col = args[1]; 
            const v = arr.filter(r => { const val = typeof r === 'object' && r !== null && col ? r[col] : r; return val!==''&&!isNaN(val); }); 
            return v.length ? v.reduce((s,r) => s + Number(typeof r === 'object' && r !== null && col ? r[col] : r), 0) / v.length : 0; 
        } 
        const nums = args.map(n => Number(n)).filter(n => !isNaN(n));
        return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
    };
    
    const CERCA = (array, col_ric, val_ric, col_rit) => { 
        if(!Array.isArray(array)) return ""; 
        const res = array.find(r => typeof r === 'object' && r !== null ? r[col_ric] === val_ric : r === val_ric); 
        return res ? (typeof res === 'object' ? res[col_rit] : res) : ""; 
    };
    
    const CONTA = (array, colonna, valore) => { 
        if(!array) return 0; 
        if(!Array.isArray(array)) return array === valore ? 1 : 0; 
        return array.filter(r => (typeof r === 'object' && r !== null && colonna ? r[colonna] : r) === valore).length; 
    };
    
    const UNISCI = (...args) => { 
        if(args.length === 0) return ""; 
        if(Array.isArray(args[0])) { 
            const arr = args[0], col = args[1], sep = args[2] || ", "; 
            return arr.map(r => typeof r === 'object' && r !== null && col ? r[col] : r).filter(v=>v).join(sep); 
        } 
        return args.filter(v => v !== undefined && v !== null).join(""); 
    };
    
    const _PD = (d) => { if(!d) return null; if(typeof d === 'object' && d.start) return new Date(d.start); const dt = new Date(d); return isNaN(dt.getTime()) ? null : dt; };
    const _FMT = (d) => { if(!d) return ""; const loc = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)); return loc.toISOString().slice(0, 16); };
    
    const OGGI = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().split('T')[0]; };
    const ADESSO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
    
    const DATA_DIFF = (data_fine, data_inizio, unita="giorni") => {
        const d2 = _PD(data_fine), d1 = _PD(data_inizio); 
        if(!d2 || !d1) return "";
        const u = String(unita).toLowerCase();
        
        if(u.startsWith('giorn') || !u) {
            const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
            const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
            return Math.floor((utc2 - utc1) / 86400000);
        }
        if(u.startsWith('mes')) return (d2.getFullYear()-d1.getFullYear())*12 + d2.getMonth()-d1.getMonth();
        if(u.startsWith('ann')) return d2.getFullYear()-d1.getFullYear();
        
        const ms = d2.getTime() - d1.getTime();
        if(u.startsWith('sec')) return Math.floor(ms/1000); 
        if(u.startsWith('min')) return Math.floor(ms/60000);
        if(u.startsWith('or')) return Math.floor(ms/3600000); 
        return 0;
    };
    
    const DATA_AGGIUNGI = (data, qta, unita="giorni") => {
        const dt = _PD(data); if(!dt) return ""; const u = String(unita).toLowerCase();
        if(u.startsWith('sec')) dt.setSeconds(dt.getSeconds() + qta);
        else if(u.startsWith('min')) dt.setMinutes(dt.getMinutes() + qta);
        else if(u.startsWith('or')) dt.setHours(dt.getHours() + qta);
        else if(u.startsWith('giorn')) dt.setDate(dt.getDate() + qta);
        else if(u.startsWith('mes')) dt.setMonth(dt.getMonth() + qta);
        else if(u.startsWith('ann')) dt.setFullYear(dt.getFullYear() + qta);
        return _FMT(dt);
    };
    const ANNO = (d) => { const dt=_PD(d); return dt?dt.getFullYear():""; };
    const MESE = (d) => { const dt=_PD(d); return dt?dt.getMonth()+1:""; };
    const GIORNO = (d) => { const dt=_PD(d); return dt?dt.getDate():""; };
    const ORA = (d) => { const dt=_PD(d); return dt?dt.getHours():""; };
    const MINUTO = (d) => { const dt=_PD(d); return dt?dt.getMinutes():""; };
    const GIORNO_SETTIMANA = (d) => { const dt=_PD(d); if(!dt) return ""; const day = dt.getDay(); return day === 0 ? 7 : day; };

    // ALIAS CASE-INSENSITIVE PER LE FORMULE
    const padre = PADRE, Padre = PADRE;
    const figli = FIGLI, Figli = FIGLI;
    const proprieta = PROPRIETA, Proprieta = PROPRIETA;
    const nota_corrente = NOTA_CORRENTE, Nota_corrente = NOTA_CORRENTE;
    const se = SE, Se = SE;
    const somma = SOMMA, Somma = SOMMA;
    const media = MEDIA, Media = MEDIA;
    const cerca = CERCA, Cerca = CERCA;
    const conta = CONTA, Conta = CONTA;
    const unisci = UNISCI, Unisci = UNISCI;
    const oggi = OGGI, Oggi = OGGI;
    const adesso = ADESSO, Adesso = ADESSO;
    const data_diff = DATA_DIFF, Data_diff = DATA_DIFF, Data_Diff = DATA_DIFF;
    const data_aggiungi = DATA_AGGIUNGI, Data_aggiungi = DATA_AGGIUNGI, Data_Aggiungi = DATA_AGGIUNGI;
    const anno = ANNO, Anno = ANNO;
    const mese = MESE, Mese = MESE;
    const giorno = GIORNO, Giorno = GIORNO;
    const ora = ORA, Ora = ORA;
    const minuto = MINUTO, Minuto = MINUTO;
    const giorno_settimana = GIORNO_SETTIMANA, Giorno_settimana = GIORNO_SETTIMANA, Giorno_Settimana = GIORNO_SETTIMANA;
`;


AdvancedTable.evaluateFormula = (formulaStr, row, columns, tableId, stateTitle, virtualCells = null, renderCache = null, origineContext = null) => {
    if (!formulaStr) return '';
    try {
        const riga = AdvancedTable._buildRigaContext(row, columns, virtualCells, renderCache || {});
        const tabella = AdvancedTable._buildTabellaContext(renderCache);
        const righe = tabella[stateTitle] || []; 
        const origine = origineContext || {};

        const fullCode = `'use strict';\n${AdvancedTable._formulaWrappers}\nreturn ${formulaStr};`;

        let executor = AdvancedTable._compiledFormulas.get(formulaStr);
        if (!executor) {
            executor = new Function('riga', 'tabella', 'righe', 'origine', 'window', 'document', 'localStorage', 'fetch', 'AppState', 'Store', 'Editor', 'AdvancedTable', 'UI', fullCode);
            AdvancedTable._compiledFormulas.set(formulaStr, executor);
        }
        
        const result = executor.call(null, riga, tabella, righe, origine, undefined, undefined, undefined, undefined, AppState, Store, undefined, AdvancedTable, undefined);

        if (result === undefined || result === null) return '';
        if (typeof result === 'object') return JSON.stringify(result);
        if (Number.isNaN(result)) return 'NaN';
        return String(result);
    } catch (e) {
        console.error("🔴 [FORMULA ERROR] Valutazione sincrona fallita:", e, "\nFormula:", formulaStr);
        return `<span style="color:var(--danger-color)" title="${e.message.replace(/"/g, "'")}">${Icons.alertTriangle} Err</span>`;
    }
};

AdvancedTable.executeAsyncScript = async (scriptStr, row, columns, tableId, stateTitle, virtualCells = null, origineContext = null) => {
    if (!scriptStr) return '';
    try {
        const riga = AdvancedTable._buildRigaContext(row, columns, virtualCells);
        const tabella = AdvancedTable._buildTabellaContext(null); 
        const righe = tabella[stateTitle] || []; 
        const origine = origineContext || {};

        const fullCode = `'use strict';\n${AdvancedTable._formulaWrappers}\nreturn ${scriptStr};`;

        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const executor = new AsyncFunction('riga', 'tabella', 'righe', 'origine', 'window', 'document', 'localStorage', 'fetch', 'AppState', 'Store', 'Editor', 'AdvancedTable', 'UI', fullCode);
        
        // FIX SANDBOX ASYNC: AppState e le API Globali vengono correttamente iniettate!
        const result = await executor.call(null, riga, tabella, righe, origine, undefined, undefined, undefined, undefined, AppState, Store, undefined, AdvancedTable, undefined);

        if (result === undefined || result === null) return '';
        if (typeof result === 'object') return JSON.stringify(result);
        if (Number.isNaN(result)) return 'NaN';
        return String(result);
    } catch (e) {
        console.error("🔴 [FORMULA ERROR] Valutazione asincrona (Macro/Automazione) fallita:", e, "\nScript:", scriptStr);
        return `<span style="color:var(--danger-color)" title="${e.message.replace(/"/g, "'")}">${Icons.alertTriangle} Async Err</span>`;
    }
};

AdvancedTable._getLocalISO = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
};

AdvancedTable._buildTabellaContext = (renderCache = null) => {
    if (renderCache && renderCache.tabellaContext) {
        return renderCache.tabellaContext;
    }

    const proxy = new Proxy({}, {
        get: function(target, prop) {
            if (prop in target) return target[prop];

            let foundState = null;
            let foundId = null;
            
            if (AppState.databases) {
                for (const id in AppState.databases) {
                    const s = AppState.databases[id];
                    if (s && !s.isPivot && s.title === prop) {
                        foundState = s;
                        foundId = id;
                        break;
                    }
                }
            }

            if (!foundState) return [];

            const mappedRows = (foundState.rows || []).map(row => {
                return new Proxy({}, {
                    get: function(rowTarget, colName) {
                        if (colName in rowTarget) return rowTarget[colName];

                        const c = (foundState.columns || []).find(col => col.name === colName);
                        if (!c) return undefined;

                        let val;
                        if (c.type === 'created_time') {
                            val = AdvancedTable._getLocalISO(row.createdAt);
                        } else if (c.type === 'last_edited_time') {
                            val = AdvancedTable._getLocalISO(row.updatedAt);
                        } else if (c.type === 'relation' || c.type === 'relation_backlink') {
                            const details = AdvancedTable.resolveRelationDetails(c, (row.cells || {})[c.id], renderCache || {});
                            val = details.map(d => d.name);
                        } else {
                            val = (row.cells || {})[c.id];
                        }

                        rowTarget[colName] = val;
                        return val;
                    }
                });
            });

            target[prop] = mappedRows;
            return mappedRows;
        }
    });

    if (renderCache) renderCache.tabellaContext = proxy;
    return proxy;
};

AdvancedTable._buildRigaContext = (row, columns, virtualCells = null, renderCache = {}) => {
    const rigaContext = {};
    
    let recordNoteId = null; 
    if (row.cells && row.cells['sys_c_note']) {
        rigaContext["_sys_note_id"] = row.cells['sys_c_note']; 
    } else {
        const rnCol = (columns || []).find(c => c.type === 'record_note');
        if (rnCol) {
            recordNoteId = virtualCells ? virtualCells[rnCol.id] : (row.cells || {})[rnCol.id];
        }
        rigaContext["_sys_note_id"] = recordNoteId || null; 
    }
    
    return new Proxy(rigaContext, {
        get: function(target, propName) {
            if (propName in target) return target[propName];

            const c = (columns || []).find(col => col.name === propName);
            if (!c) return undefined;

            let cellVal = virtualCells ? virtualCells[c.id] : (row.cells || {})[c.id];
            let val;

            if (c.type === 'created_time') {
                val = AdvancedTable._getLocalISO(row.createdAt);
            } else if (c.type === 'last_edited_time') {
                val = AdvancedTable._getLocalISO(row.updatedAt);
            } else if (c.type === 'relation' || c.type === 'relation_backlink') {
                const details = AdvancedTable.resolveRelationDetails(c, cellVal, renderCache);
                val = details.map(d => d.name);
            } else if (c.type !== 'formula') {
                val = cellVal;
            } else if (virtualCells && virtualCells[c.id] !== undefined) {
                val = virtualCells[c.id];
            }

            target[propName] = val;
            return val;
        }
    });
};

document.addEventListener('DOMContentLoaded', AdvancedTable.initEvents);