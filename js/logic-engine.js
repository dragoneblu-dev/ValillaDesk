/**
 * logic-engine.js
 * Motore Logico Unificato per Automazioni e Pulsanti (Macro).
 * FIX: Aggiunti operatori "Contiene" e "Non Contiene".
 * FIX: Implementata la logica di valutazione per "SYS_JS_FORMULA" nelle clausole WHERE.
 * FEAT LOGGING: Aggiunto log console per i messaggi di errore durante le Preview delle formule.
 * FIX ENGINE: L'esecuzione della Formula JS è stata portata in cima allo stack (Priorità 1) 
 * in 'calculateNewValue'. Questo permette l'uso di script JS universali anche per aggiornare 
 * tipi complessi come Date, Range di Date, Relazioni e Multi-Select in modo chirurgico.
 * FIX DATE RANGE: Aggiunte le azioni "set_start_formula" e "set_end_formula" per iniettare
 * i risultati JS senza sovrascrivere l'intero oggetto {start, end}. Inserito auto-check per i Range incrociati.
 * FIX UI FORMULA: L'altezza della Textarea delle formule (sia azioni che condizioni) è stata triplicata
 * per una comoda lettura e scrittura dei blocchi di codice.
 * REFACTOR: Centralizzato il motore di esecuzione massiva (executeMacroBlocks) eliminando la 
 * duplicazione tra Pulsanti Macro e Colonne Pulsante.
 * FIX MACRO: Le funzioni native in _formulaWrappers ora gestiscono perfettamente le variabili intercettate.
 */

// UTILITY GLOBALE PER XSS (Scudo Iniezioni HTML)
if (typeof UI !== 'undefined' && !UI.escapeHTML) {
    UI.escapeHTML = (str) => {
        if (str === null || str === undefined) return '';
        return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };
}

const LogicEngine = {

    // ==========================================
    // 1. GENERATORE PROMPT IA (Centralizzato)
    // ==========================================
    getAIPrompt: (dbState) => {
        if (!dbState) return "";

        let colsInfo = [];
        (dbState.columns || []).forEach(c => {
            let info = `- "${c.name}" (Tipo: ${c.type})`;
            if (c.type === 'relation' && c.targetTableId) {
                if (typeof AdvancedTable !== 'undefined') {
                    const tState = AdvancedTable.getTableState(c.targetTableId);
                    if (tState && tState.columns) {
                        info += ` -> Collegato al DB "${tState.title}". Colonne: ${tState.columns.map(tc => `"${tc.name}"`).join(', ')}`;
                    }
                }
            }
            colsInfo.push(info);
        });

        return `Agisci come un programmatore Javascript esperto e aiutami a scrivere una formula per un Database in stile Notion.

IL CONTESTO DEL SISTEMA:
Variabili predefinite:
1. \`riga\`: Oggetto riga corrente. Accesso: riga["Nome Campo"].
2. \`righe\`: Array con tutti i record del DB corrente.
3. \`tabella\`: Oggetto con tutti i DB. Accesso: tabella["Nome Altro DB"] (restituisce array di oggetti).

Funzioni personalizzate disponibili:
- NOTA_CORRENTE() -> restituisce l'ID della nota corrente
- PADRE(id_nota) -> restituisce l'ID del genitore di quella nota
- FIGLI(id_nota) -> restituisce un array di ID note
- PROPRIETA(id_nota, "Nome Campo") -> estrae un valore da una specifica nota
- SE(condizione, se_vero, se_falso)
- SOMMA(valore1, valore2) OPPURE SOMMA(tabella["DB"], "Nome Colonna")
- MEDIA(valore1, valore2) OPPURE MEDIA(tabella["DB"], "Nome Colonna")
- CERCA(array_tabella_dest, "ColRicerca", valore, "ColRitorno")
- CONTA(array, "Colonna", "Valore")
- UNISCI(testo1, testo2) OPPURE UNISCI(tabella["DB"], "Nome Colonna", separatore)
- OGGI() -> restituisce YYYY-MM-DD
- ADESSO() -> restituisce YYYY-MM-DDTHH:mm
- DATA_DIFF(data_fine, data_inizio, "giorni/ore/minuti/mesi/anni") -> restituisce numero
- DATA_AGGIUNGI(data, quantita, "giorni/ore/minuti/mesi/anni") -> restituisce data YYYY-MM-DDTHH:mm
- ANNO(data), MESE(data), GIORNO(data), ORA(data), MINUTO(data) -> restituiscono un numero
- GIORNO_SETTIMANA(data) -> restituisce il giorno della settimana in numero (1 = Lunedì, 7 = Domenica)

REGOLE DI SCRITTURA (SINGOLA ESPRESSIONE vs BLOCCHI COMPLESSI):
Il motore esegue il codice in modo rigoroso, accodandolo a un comando "return".
- Se la logica è semplice, scrivi solo una singola espressione (es: \`riga["A"] + 1\`).
- Se ti servono variabili multiple, cicli (for/while), logiche if/else complesse o funzioni ricorsive, DEVI OBBLIGATORIAMENTE incapsulare tutto in una IIFE (Immediately Invoked Function Expression) che ritorni il valore finale.
Esempio di IIFE:
(() => { 
    let base = Number(riga["Valore"]); 
    if (base > 10) return "Alto"; 
    return "Basso"; 
})()

REGOLA FONDAMENTALE SUI NOMI (CASE-SENSITIVE):
Le chiavi per accedere a righe e tabelle sono rigorosamente Case-Sensitive! I nomi delle colonne (es: riga["Stato"]) e i nomi dei database (es: tabella["Clienti"]) devono rispettare esattamente le MAIUSCOLE, minuscole e gli spazi vuoti presenti nell'elenco fornito sotto.

STRUTTURE DATI SPECIALI (ATTENZIONE!):
- "date", "datetime", "time": Sono OGGETTI { "start": "YYYY-MM-DDTHH:mm", "end": "..." }. Usa sempre \`riga["Data"]?.start\`.
- "multi-select", "relation", "rollup": Sono ARRAY di stringhe ["A", "B"].
- "checkbox": Sono BOOLEANI (true/false).
NON USARE UNISCI() o SOMMA() in modalità Array su campi complessi estratti da altri DB. Usa i metodi JS nativi (.filter, .map, .join).

IL MIO DATABASE SORGENTE:
Nome: "${dbState.title}"
Campi:
${colsInfo.join('\n')}

LA MIA RICHIESTA:
[Scrivi qui cosa vuoi ottenere]`;
    },

    copyAutomationAIPrompt: (e, tableId, btnId) => {
        if (e) e.preventDefault();
        
        if (!tableId) {
            alert("Devi prima selezionare un database per generare il prompt.");
            return;
        }

        const state = AdvancedTable.getState(tableId);
        if (!state) return;

        let colsInfo = [];
        (state.columns || []).forEach(c => {
            let info = `- "${c.name}" (Tipo: ${c.type})`;
            if (c.type === 'relation' && c.targetTableId) {
                const tState = AdvancedTable.getTableState(c.targetTableId);
                if (tState && tState.columns) {
                    info += ` -> Collegato al Database "${tState.title}". Colonne di quel DB: ${tState.columns.map(tc => `"${tc.name}"`).join(', ')}`;
                }
            }
            colsInfo.push(info);
        });

        const isColButton = btnId.includes('colbtn');

        const prompt = `Agisci come un programmatore Javascript esperto e aiutami a scrivere una formula per un'Automazione/Pulsante.

IL CONTESTO DEL SISTEMA:
Il codice che mi fornirai verrà eseguito come azione per una singola cella. Non creare funzioni isolate se non necessarie.
Variabili speciali disponibili:
1. \`riga\`: Rappresenta i dati della riga bersaglio (Destinazione) che è sotto elaborazione (es: riga["Nome Campo"]).
2. \`righe\`: Array con tutti i record del DB bersaglio.
3. \`tabella\`: Un oggetto con tutti i DB. Accesso: tabella["Nome Altro DB"] restituisce l'array dei suoi record.
${isColButton ? `4. \`origine\`: POICHE' QUESTO E' UN PULSANTE DENTRO LA TABELLA, questa variabile rappresenta i dati della riga ESATTA in cui l'utente ha fatto click! (es: origine["Costo"]). Usala per trasferire i dati da questa riga a quella di destinazione.` : ''}

Funzioni personalizzate disponibili:
- NOTA_CORRENTE() -> restituisce l'ID della nota corrente
- PADRE(id_nota) -> restituisce l'ID del genitore di quella nota
- FIGLI(id_nota) -> restituisce un array di ID note
- PROPRIETA(id_nota, "Nome Campo") -> estrae un valore da una specifica nota
- SE(condizione, se_vero, se_falso)
- SOMMA(valore1, valore2) OPPURE SOMMA(tabella["DB"], "Nome Colonna")
- MEDIA(valore1, valore2) OPPURE MEDIA(tabella["DB"], "Nome Colonna")
- CERCA(array_tabella_dest, "ColRicerca", valore, "ColRitorno")
- CONTA(array, "Colonna", "Valore")
- UNISCI(testo1, testo2) OPPURE UNISCI(tabella["DB"], "Nome Colonna", separatore)
- OGGI() -> restituisce YYYY-MM-DD
- ADESSO() -> restituisce YYYY-MM-DDTHH:mm
- DATA_DIFF(data_fine, data_inizio, "giorni/ore/minuti/mesi/anni") -> restituisce numero
- DATA_AGGIUNGI(data, quantita, "giorni/ore/minuti/mesi/anni") -> restituisce data YYYY-MM-DDTHH:mm
- ANNO(data), MESE(data), GIORNO(data), ORA(data), MINUTO(data) -> restituiscono un numero
- GIORNO_SETTIMANA(data) -> restituisce il giorno della settimana in numero (1 = Lunedì, 7 = Domenica)

REGOLE DI SCRITTURA (SINGOLA ESPRESSIONE vs BLOCCHI COMPLESSI):
Il motore esegue il codice in modo rigoroso, accodandolo a un comando "return".
- Se la logica è semplice, scrivi solo una singola espressione (es: \`riga["A"] + 1\`).
- Se ti servono variabili multiple, cicli (for/while), logiche se complesse, DEVI OBBLIGATORIAMENTE incapsulare tutto in una IIFE (Immediately Invoked Function Expression).
Esempio di IIFE:
(() => { 
    let base = Number(riga["Valore"]); 
    if (base > 10) return "Alto"; 
    return "Basso"; 
})()

REGOLA FONDAMENTALE SUI NOMI (CASE-SENSITIVE):
Le chiavi per accedere a righe e tabelle sono rigorosamente Case-Sensitive! I nomi delle colonne (es: riga["Stato"]) e i nomi dei database (es: tabella["Clienti"]) devono rispettare esattamente le MAIUSCOLE, minuscole e gli spazi vuoti presenti nell'elenco fornito sotto.

ATTENZIONE ALLE STRUTTURE DATI:
- I tipi "date", "datetime" e "time" sono OGGETTI: { "start": "YYYY-MM-DDTHH:mm", "end": "YYYY-MM-DDTHH:mm" }. Quando leggi una data usa sempre \`riga["NomeData"]?.start\`
- I tipi "multi-select", "relation" o "rollup" multipli sono ARRAY di stringhe: ["Valore 1", "Valore 2"].
- I tipi "checkbox" sono BOOLEANI: true / false.

IL MIO DATABASE ATTUALE DI BERSAGLIO (TARGET):
Nome: "${state.title}"
Campi disponibili nell'oggetto \`riga\` per questo contesto:
${colsInfo.join('\n')}

LA MIA RICHIESTA:
[Scrivi qui cosa deve calcolare la formula]`;

        navigator.clipboard.writeText(prompt).then(() => {
            const btn = document.getElementById(btnId);
            if (btn) {
                const originalHTML = btn.innerHTML;
                btn.innerHTML = `<span style="display:inline-flex; align-items:center; gap:5px;">${Icons.checkCircle} Copiato!</span>`;
                btn.classList.add('btn-primary');
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    btn.classList.remove('btn-primary');
                }, 2000);
            }
        }).catch(err => {
            console.error("Errore copia prompt: ", err);
            alert("Impossibile copiare negli appunti.");
        });
    },

    // ==========================================
    // 2. MOTORE VALUTAZIONE CONDIZIONI (WHERE)
    // ==========================================
    evaluateCondition: (operator, targetVal, currentVal, oldVal, colDef, dateShiftOpts = { mode: 'exact', shift: 0 }, rowContext = null, stateContext = null) => {
        
        if (colDef && colDef.id === 'SYS_JS_FORMULA') {
            if (!targetVal || !rowContext || !stateContext) return false;
            let formula = targetVal.trim();
            if (formula.startsWith('=')) formula = formula.substring(1);
            
            try {
                let vCells = rowContext.virtualCells;
                if (!vCells && typeof AdvancedTable !== 'undefined') {
                    const vRow = AdvancedTable.buildVirtualRow(stateContext.id || '', rowContext, stateContext);
                    vCells = vRow.virtualCells;
                }
                const result = AdvancedTable.evaluateFormula(formula, rowContext, stateContext.columns, stateContext.id || '', stateContext.title || '', vCells);
                return result === true || result === 'true';
            } catch(e) {
                return false;
            }
        }

        if (!colDef) return false;

        let strVal = String(currentVal === undefined || currentVal === null ? '' : currentVal).trim().toLowerCase();
        let oldStrVal = String(oldVal === undefined || oldVal === null ? '' : oldVal).trim().toLowerCase();
        let tgtValLower = String(targetVal === undefined || targetVal === null ? '' : targetVal).trim().toLowerCase();

        if (['number', 'formula', 'rollup'].includes(colDef.type)) {
            const cNum = parseFloat(currentVal);
            const tNum = parseFloat(targetVal);
            const oNum = parseFloat(oldVal);

            if (operator === 'changed') {
                return (isNaN(cNum) ? null : cNum) !== (isNaN(oNum) ? null : oNum);
            }

            if (!isNaN(cNum) && !isNaN(tNum)) {
                if (operator === '>') return cNum > tNum;
                if (operator === '<') return cNum < tNum;
                if (operator === '>=') return cNum >= tNum;
                if (operator === '<=') return cNum <= tNum;
                if (operator === '=') return cNum === tNum;
                if (operator === '!=') return cNum !== tNum;
            }
        }

        if (['date', 'datetime', 'created_time', 'last_edited_time'].includes(colDef.type)) {
            let cellStart = null;
            let cellEnd = null;

            if (colDef.type === 'created_time') cellStart = new Date(currentVal).getTime();
            else if (colDef.type === 'last_edited_time') cellStart = new Date(currentVal).getTime();
            else if (typeof currentVal === 'object' && currentVal !== null) {
                cellStart = currentVal.start ? new Date(currentVal.start).getTime() : NaN;
                cellEnd = currentVal.end ? new Date(currentVal.end).getTime() : NaN;
            } else {
                cellStart = new Date(currentVal).getTime();
            }

            let oldStart = null;
            if (typeof oldVal === 'object' && oldVal !== null) oldStart = oldVal.start ? new Date(oldVal.start).getTime() : NaN;
            else oldStart = new Date(oldVal).getTime();

            if (operator === 'empty') return isNaN(cellStart);
            if (operator === 'not_empty') return !isNaN(cellStart);
            if (operator === 'changed') {
                const c1 = isNaN(cellStart) ? null : cellStart;
                const o1 = isNaN(oldStart) ? null : oldStart;
                return c1 !== o1;
            }

            let targetDateObj;
            if (dateShiftOpts && dateShiftOpts.mode === 'today') {
                targetDateObj = new Date();
                targetDateObj.setHours(0,0,0,0);
            } else {
                targetDateObj = new Date(targetVal);
            }

            if (dateShiftOpts && dateShiftOpts.shift) {
                targetDateObj.setDate(targetDateObj.getDate() + parseInt(dateShiftOpts.shift));
            }

            const tTarget = targetDateObj.getTime();

            if (!isNaN(tTarget)) {
                let dayTarget = tTarget;
                let dayStart = cellStart;
                let dayEnd = cellEnd;
                
                if (colDef.type === 'date') {
                    dayTarget = new Date(tTarget).setHours(0, 0, 0, 0);
                    dayStart = isNaN(cellStart) ? null : new Date(cellStart).setHours(0, 0, 0, 0);
                    dayEnd = isNaN(cellEnd) ? null : new Date(cellEnd).setHours(0, 0, 0, 0);
                }

                if (colDef.hasEndDate && dayEnd !== null) {
                    if (operator === 'range_inside') return dayTarget >= dayStart && dayTarget <= dayEnd;
                    if (operator === 'range_outside') return dayTarget < dayStart || dayTarget > dayEnd;
                    if (operator === 'range_start_eq') return dayStart === dayTarget;
                    if (operator === 'range_end_eq') return dayEnd === dayTarget;
                } else if (dayStart !== null) {
                    if (operator === '=') return dayStart === dayTarget;
                    if (operator === '!=') return dayStart !== dayTarget;
                    if (operator === '>') return dayStart > dayTarget;
                    if (operator === '<') return dayStart < dayTarget;
                    if (operator === '>=') return dayStart >= dayTarget;
                    if (operator === '<=') return dayStart <= dayTarget;
                }
            }
            return false;
        }

        if (['multi-select', 'relation'].includes(colDef.type)) {
            let arr = Array.isArray(currentVal) ? currentVal : (currentVal ? [currentVal] : []);
            let oldArr = Array.isArray(oldVal) ? oldVal : (oldVal ? [oldVal] : []);
            
            let contains = arr.includes(targetVal) || arr.some(v => String(v).toLowerCase() === tgtValLower);

            if (operator === '=') return contains;
            if (operator === '!=') return !contains;
            if (operator === 'empty') return arr.length === 0;
            if (operator === 'not_empty') return arr.length > 0;
            
            if (operator === 'changed') {
                const cJson = JSON.stringify([...arr].sort());
                const oJson = JSON.stringify([...oldArr].sort());
                return cJson !== oJson;
            }
            if (operator === 'relation_added') return !oldArr.includes(targetVal) && arr.includes(targetVal);
            if (operator === 'relation_removed') return oldArr.includes(targetVal) && !arr.includes(targetVal);
            return false;
        }

        if (colDef.type === 'checkbox') {
            let isChecked = currentVal === true || strVal === 'true' || strVal === 'sì';
            let wasChecked = oldVal === true || oldStrVal === 'true' || oldStrVal === 'sì';
            let targetBool = tgtValLower === 'true';
            
            if (operator === '=') return isChecked === targetBool;
            if (operator === '!=') return isChecked !== targetBool;
            if (operator === 'changed') return isChecked !== wasChecked;
            if (operator === 'changed_to') return (wasChecked !== targetBool) && (isChecked === targetBool);
            if (operator === 'changed_from') return (wasChecked === targetBool) && (isChecked !== targetBool);
            return false;
        }

        // Operatori testuali Generici (anche i nuovi Contiene / Non contiene)
        if (operator === 'empty') return strVal === '';
        if (operator === 'not_empty') return strVal !== '';
        if (operator === '=') return strVal === tgtValLower;
        if (operator === '!=') return strVal !== tgtValLower;
        if (operator === 'contains') return strVal.includes(tgtValLower);
        if (operator === 'not_contains') return !strVal.includes(tgtValLower);
        if (operator === 'changed') return strVal !== oldStrVal;
        if (operator === 'changed_to') return (oldStrVal !== tgtValLower) && (strVal === tgtValLower);
        if (operator === 'changed_from') return (oldStrVal === tgtValLower) && (strVal !== tgtValLower);
        
        return strVal.includes(tgtValLower); 
    },

    // ==========================================
    // 3. MOTORE CALCOLO VALORI (SET)
    // ==========================================
    calculateNewValue: async (actType, val1, val2, currentVal, colDef, rowContext, targetState, sourceRowOrOrigineContext = null) => {
        
        if (actType === 'set_from_source_col') {
            if (sourceRowOrOrigineContext && sourceRowOrOrigineContext.cells && sourceRowOrOrigineContext.cells[val1] !== undefined) {
                return sourceRowOrOrigineContext.cells[val1];
            }
            return '';
        }

        if (actType === 'set_empty') {
            if (['multi-select', 'relation'].includes(colDef.type)) return [];
            if (colDef.type === 'checkbox') return false;
            if (['date', 'datetime'].includes(colDef.type) && colDef.hasEndDate) return { start: '', end: '' };
            return '';
        }

        // 1. ESECUZIONE FORMULA JS (Priorità Assoluta sull'estrazione del dato)
        let formulaResult = null;
        let isFormulaExec = false;

        const isActFormula = actType === 'set_formula' || actType === 'set_start_formula' || actType === 'set_end_formula';
        const isImplicitFormula = actType.includes('fixed') && typeof val1 === 'string' && val1.startsWith('=');

        if (isActFormula || isImplicitFormula) {
            const formula = isActFormula ? val1 : val1.substring(1).trim();
            let mockRow = rowContext || { id: 'mock', cells: {}, virtualCells: {} };
            
            formulaResult = await AdvancedTable.executeAsyncScript(
                formula, 
                mockRow, 
                targetState.columns, 
                targetState.id || '', 
                targetState.title, 
                mockRow.virtualCells || mockRow.cells, 
                sourceRowOrOrigineContext
            );
            isFormulaExec = true;
        }

        // 2. GESTIONE DATE (Può estrarre il dato dalla formula appena calcolata)
        if (['date', 'datetime'].includes(colDef.type)) {
            const isDateTime = colDef.type === 'datetime';
            let dateObj = (typeof currentVal === 'object' && currentVal !== null) ? { ...currentVal } : { start: currentVal || '', end: '' };
            
            const genDateStr = (baseDate) => {
                const d = new Date(baseDate);
                d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                return isDateTime ? d.toISOString().slice(0, 16) : d.toISOString().split('T')[0];
            };

            const doMath = (isoStart, amountStr, unit, isSub) => {
                if (!isoStart) return isoStart;
                const d = new Date(isoStart);
                if (isNaN(d.getTime())) return isoStart;
                const amt = (parseFloat(amountStr) || 1) * (isSub ? -1 : 1);
                if (unit === 'hours') d.setHours(d.getHours() + amt);
                else if (unit === 'weeks') d.setDate(d.getDate() + (amt * 7));
                else if (unit === 'months') d.setMonth(d.getMonth() + amt);
                else d.setDate(d.getDate() + amt);
                return isDateTime ? d.toISOString().slice(0, 16) : d.toISOString().split('T')[0];
            };

            const now = new Date();

            // Applica Formula Risultato
            if (actType === 'set_start_formula') {
                dateObj.start = formulaResult;
                if (colDef.hasEndDate && dateObj.start && dateObj.end) {
                    if (new Date(dateObj.start).getTime() > new Date(dateObj.end).getTime()) {
                        dateObj.end = dateObj.start;
                    }
                }
                return colDef.hasEndDate ? dateObj : dateObj.start;
            }
            if (actType === 'set_end_formula') {
                dateObj.end = formulaResult;
                if (colDef.hasEndDate && dateObj.start && dateObj.end) {
                    if (new Date(dateObj.end).getTime() < new Date(dateObj.start).getTime()) {
                        dateObj.start = dateObj.end;
                    }
                }
                return colDef.hasEndDate ? dateObj : dateObj.start;
            }
            if (actType === 'set_formula') {
                // Fallback: se usano la "formula generica" su una data e restituiscono un oggetto JSON
                try {
                    const parsed = JSON.parse(formulaResult);
                    if (parsed && (parsed.start !== undefined || parsed.end !== undefined)) return parsed;
                } catch(e) {}
                dateObj.start = formulaResult;
                return colDef.hasEndDate ? dateObj : dateObj.start;
            }

            // Operatori Statici Date
            if (actType === 'set_today') {
                const td = now.toISOString().split('T')[0];
                if (colDef.hasEndDate) dateObj.start = td; else return td;
            } 
            else if (actType === 'set_datetime') {
                const ns = genDateStr(now);
                if (colDef.hasEndDate) dateObj.start = ns; else return ns;
            }
            else if (actType === 'set_start_today') dateObj.start = now.toISOString().split('T')[0];
            else if (actType === 'set_end_today') dateObj.end = now.toISOString().split('T')[0];
            else if (actType === 'set_start_now') dateObj.start = genDateStr(now);
            else if (actType === 'set_end_now') dateObj.end = genDateStr(now);
            else if (actType === 'math_date_add') {
                if (colDef.hasEndDate) dateObj.start = doMath(dateObj.start, val1, val2, false);
                else return doMath(dateObj.start, val1, val2, false);
            }
            else if (actType === 'math_date_sub') {
                if (colDef.hasEndDate) dateObj.start = doMath(dateObj.start, val1, val2, true);
                else return doMath(dateObj.start, val1, val2, true);
            }
            else if (actType === 'math_start_add') dateObj.start = doMath(dateObj.start, val1, val2, false);
            else if (actType === 'math_start_sub') dateObj.start = doMath(dateObj.start, val1, val2, true);
            else if (actType === 'math_end_add') dateObj.end = doMath(dateObj.end, val1, val2, false);
            else if (actType === 'math_end_sub') dateObj.end = doMath(dateObj.end, val1, val2, true);
            else if (actType === 'set_fixed') {
                if (colDef.hasEndDate) dateObj.start = isFormulaExec ? formulaResult : val1; 
                else return isFormulaExec ? formulaResult : val1;
            }
            else if (actType === 'set_start_fixed') dateObj.start = isFormulaExec ? formulaResult : val1;
            else if (actType === 'set_end_fixed') dateObj.end = isFormulaExec ? formulaResult : val1;

            return colDef.hasEndDate ? dateObj : dateObj.start;
        }

        // 3. RITORNO DIRETTO DELLA FORMULA PER GLI ALTRI TIPI
        if (isFormulaExec && actType === 'set_formula') {
            return formulaResult;
        }

        // 4. RESTO DELLE AZIONI STANDARD
        if (['multi-select', 'relation'].includes(colDef.type)) {
            let arr = Array.isArray(currentVal) ? [...currentVal] : [];
            const cleanVal1 = isFormulaExec ? String(formulaResult).trim() : String(val1).trim();
            if (actType === 'set_fixed') return cleanVal1 ? [cleanVal1] : [];
            if (actType === 'add_fixed') { if (cleanVal1 && !arr.includes(cleanVal1)) arr.push(cleanVal1); return arr; }
            if (actType === 'remove_fixed') return arr.filter(v => String(v) !== cleanVal1);
            return arr;
        }

        if (actType === 'set_true') return true;
        if (actType === 'set_false') return false;
        
        if (actType === 'set_time') {
            const d = new Date();
            return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        }
        
        if (actType === 'math_add') return (parseFloat(currentVal) || 0) + (parseFloat(val1) || 0);
        if (actType === 'math_sub') return (parseFloat(currentVal) || 0) - (parseFloat(val1) || 0);

        if (actType === 'set_fixed') {
            if (colDef.type === 'number') return parseFloat(val1) || 0;
            return val1;
        }

        return currentVal;
    },

    // ==========================================
    // 4. ESECUZIONE MASSIVA MACRO (DRY CORE)
    // ==========================================
    executeMacroBlocks: async (actionBlocks, defaultTargetDbId, sourceRow, isTestMode) => {
        let totalRowsAffected = 0;
        let emailsSent = 0;
        const updatedDbIds = new Set();
        let errorsLog = [];

        // CONTESTO DI ORIGINE (Dati della riga che scatena il pulsante)
        let origineContext = {};
        if (sourceRow) {
            const sourceState = AdvancedTable.getTableState(defaultTargetDbId);
            if (sourceState) origineContext = AdvancedTable._buildRigaContext(sourceRow, sourceState.columns);
        }

        for (const blk of actionBlocks) {
            let targetDbId = blk.targetDbId;
            if (!targetDbId || targetDbId === 'THIS_ROW') {
                targetDbId = defaultTargetDbId;
            }
            if (!targetDbId || !blk.actions || blk.actions.length === 0) continue;
            
            const targetState = AdvancedTable.getTableState(targetDbId);
            if (!targetState) continue;

            const isThisRowMode = blk.targetDbId === 'THIS_ROW';

            // 1. MAILTO (Email)
            if (blk.actionType === 'email') {
                let usesRigaContext = false;
                blk.actions.forEach(a => {
                    if (a.type && a.type.includes('formula') && a.value && (a.value.includes('riga[') || a.value.includes('riga.'))) {
                        usesRigaContext = true;
                    }
                });

                let matchingRows = [];
                if (isThisRowMode && sourceRow) {
                    matchingRows.push(sourceRow);
                } else {
                    for (const r of targetState.rows) {
                        let isMatch = true;
                        if (blk.filters && blk.filters.length > 0) {
                            isMatch = blk.filters.every(f => {
                                const colDef = targetState.columns.find(c => c.id === f.colId);
                                return LogicEngine.evaluateCondition(f.operator, f.value, r.cells[f.colId], null, colDef);
                            });
                        }
                        if (isMatch) matchingRows.push(r);
                    }
                }

                let rowToUse = null;

                if (usesRigaContext) {
                    if (matchingRows.length === 0) {
                        errorsLog.push(`Generazione Email annullata: La formula usa i dati di un record (riga), ma i filtri impostati non hanno trovato alcuna riga corrispondente nel database.`);
                        continue;
                    }
                    if (matchingRows.length > 1) {
                        errorsLog.push(`Generazione Email bloccata per sicurezza: La formula richiede i dati di UN record specifico, ma i filtri restituiscono ${matchingRows.length} righe. Assicurati che i filtri isolino ESATTAMENTE UNA riga per poter inviare la mail ed evitare lo spam.`);
                        continue;
                    }
                    rowToUse = matchingRows[0];
                } else {
                    rowToUse = matchingRows.length > 0 ? matchingRows[0] : { id: 'mock', cells: {}, virtualCells: {} };
                }

                try {
                    const toAct = blk.actions.find(a => a.colId === 'EMAIL_TO');
                    const ccAct = blk.actions.find(a => a.colId === 'EMAIL_CC'); 
                    const subAct = blk.actions.find(a => a.colId === 'EMAIL_SUBJECT');
                    const bodyAct = blk.actions.find(a => a.colId === 'EMAIL_BODY');

                    const dummyCol = { type: 'text' };
                    const toVal = await LogicEngine.calculateNewValue(toAct.type, toAct.value, toAct.value2, '', dummyCol, rowToUse, targetState, origineContext);
                    const ccVal = ccAct ? await LogicEngine.calculateNewValue(ccAct.type, ccAct.value, ccAct.value2, '', dummyCol, rowToUse, targetState, origineContext) : '';
                    const subVal = await LogicEngine.calculateNewValue(subAct.type, subAct.value, subAct.value2, '', dummyCol, rowToUse, targetState, origineContext);
                    const bodyVal = await LogicEngine.calculateNewValue(bodyAct.type, bodyAct.value, bodyAct.value2, '', dummyCol, rowToUse, targetState, origineContext);

                    let mailto = `mailto:${toVal}?subject=${encodeURIComponent(subVal)}&body=${encodeURIComponent(bodyVal)}`;
                    if (ccVal) mailto += `&cc=${encodeURIComponent(ccVal)}`;
                    
                    const link = document.createElement('a');
                    link.href = mailto;
                    link.target = '_blank';
                    link.click();
                    emailsSent++;
                } catch (err) {
                    errorsLog.push(`Generazione Email Fallita: ${err.message || String(err)}`);
                }
            }
            // 2. INSERIMENTO NUOVA RIGA
            else if (blk.actionType === 'insert') {
                const now = Date.now();
                const newRow = { id: 'r' + Store.generateId(), createdAt: now, updatedAt: now, cells: {} };
                
                targetState.columns.forEach(c => {
                    if (c.type === 'checkbox') newRow.cells[c.id] = false;
                    else if (['multi-select', 'relation'].includes(c.type)) newRow.cells[c.id] = [];
                    else if (['date', 'datetime'].includes(c.type)) newRow.cells[c.id] = c.hasEndDate ? {start:'', end:''} : '';
                    else newRow.cells[c.id] = '';
                });

                try {
                    for (const act of blk.actions) {
                        const targetColDef = targetState.columns.find(c => c.id === act.colId);
                        if (!targetColDef) continue;

                        let finalVal = await LogicEngine.calculateNewValue(act.type, act.value, act.value2, newRow.cells[act.colId], targetColDef, newRow, targetState, origineContext);
                        
                        if (['select', 'multi-select'].includes(targetColDef.type)) {
                            const valArray = Array.isArray(finalVal) ? finalVal : (finalVal ? [finalVal] : []);
                            valArray.forEach(strVal => {
                                if (String(strVal).trim() !== '') {
                                    let opts = targetState.selectOptions[act.colId] || [];
                                    if (!opts.includes(strVal)) targetState.selectOptions[act.colId] = [...opts, strVal];
                                }
                            });
                        }
                        newRow.cells[act.colId] = finalVal;
                    }

                    targetState.rows.push(newRow);
                    totalRowsAffected++;
                    updatedDbIds.add(targetDbId);

                    if (typeof AdvancedAutomations !== 'undefined') {
                        AdvancedAutomations.evaluate(targetDbId, newRow.id, true);
                        AdvancedAutomations.triggerCrossDB(targetDbId);
                    }
                } catch(err) {
                    errorsLog.push(`Creazione Riga [DB: ${targetState.title}]: ${err.message || String(err)}`);
                }
            }
            // 3. INSERIMENTO DA SELECT (Copia massiva da altro DB)
            else if (blk.actionType === 'insert_select') {
                if (!blk.sourceDbId) {
                    errorsLog.push(`Azione "Copia Righe": Database Sorgente non configurato.`);
                    continue;
                }
                const sourceDbState = AdvancedTable.getTableState(blk.sourceDbId);
                if (!sourceDbState) continue;

                const filteredSourceRows = sourceDbState.rows.filter(r => {
                    if (!blk.filters || blk.filters.length === 0) return true;
                    return blk.filters.every(f => {
                        const colDef = sourceDbState.columns.find(c => c.id === f.colId);
                        return LogicEngine.evaluateCondition(f.operator, f.value, r.cells[f.colId], null, colDef);
                    });
                });

                for (const sRow of filteredSourceRows) {
                    const now = Date.now();
                    const newRow = { id: 'r' + Store.generateId(), createdAt: now, updatedAt: now, cells: {} };
                    
                    targetState.columns.forEach(c => {
                        if (c.type === 'checkbox') newRow.cells[c.id] = false;
                        else if (['multi-select', 'relation'].includes(c.type)) newRow.cells[c.id] = [];
                        else if (['date', 'datetime'].includes(c.type)) newRow.cells[c.id] = c.hasEndDate ? {start:'', end:''} : '';
                        else newRow.cells[c.id] = '';
                    });

                    // Modifichiamo il contesto di origine, la riga sorgente di questo ciclo "diventa" l'origine
                    const dynamicOrigineContext = AdvancedTable._buildRigaContext(sRow, sourceDbState.columns);

                    try {
                        for (const act of blk.actions) {
                            const targetColDef = targetState.columns.find(c => c.id === act.colId);
                            if (!targetColDef) continue;

                            let finalVal = await LogicEngine.calculateNewValue(act.type, act.value, act.value2, newRow.cells[act.colId], targetColDef, newRow, targetState, dynamicOrigineContext);
                            
                            if (['select', 'multi-select'].includes(targetColDef.type)) {
                                const arr = Array.isArray(finalVal) ? finalVal : (finalVal ? [finalVal] : []);
                                arr.forEach(strVal => {
                                    if (String(strVal).trim() !== '') {
                                        let opts = targetState.selectOptions[act.colId] || [];
                                        if (!opts.includes(strVal)) targetState.selectOptions[act.colId] = [...opts, strVal];
                                    }
                                });
                            }
                            newRow.cells[act.colId] = finalVal;
                        }

                        targetState.rows.push(newRow);
                        totalRowsAffected++;
                        updatedDbIds.add(targetDbId);

                        if (typeof AdvancedAutomations !== 'undefined') {
                            AdvancedAutomations.evaluate(targetDbId, newRow.id, true);
                            AdvancedAutomations.triggerCrossDB(targetDbId);
                        }
                    } catch(err) {
                        errorsLog.push(`Creazione Multipla [Riga Sorgente: ${sRow.id}]: ${err.message || String(err)}`);
                    }
                }
            }
            // 4. UPDATE RECORD ESISTENTI
            else {
                let localAffected = 0;
                let rowsToProcess = [];

                if (isThisRowMode && sourceRow) {
                    rowsToProcess.push(sourceRow);
                } else {
                    for (const r of targetState.rows) {
                        let isMatch = true;
                        if (blk.filters && blk.filters.length > 0) {
                            isMatch = blk.filters.every(f => {
                                const colDef = targetState.columns.find(c => c.id === f.colId);
                                return LogicEngine.evaluateCondition(f.operator, f.value, r.cells[f.colId], null, colDef);
                            });
                        }
                        if (isMatch) rowsToProcess.push(r);
                    }
                }

                for (const r of rowsToProcess) {
                    let recordChanged = false;
                    try {
                        for (const act of blk.actions) {
                            const targetColDef = targetState.columns.find(c => c.id === act.colId);
                            if (!targetColDef) continue;

                            let currentVal = r.cells[act.colId];
                            let newVal = await LogicEngine.calculateNewValue(act.type, act.value, act.value2, currentVal, targetColDef, r, targetState, origineContext);

                            if (['select', 'multi-select'].includes(targetColDef.type)) {
                                const valArray = Array.isArray(newVal) ? newVal : (newVal ? [newVal] : []);
                                valArray.forEach(strVal => {
                                    if (String(strVal).trim() !== '') {
                                        let opts = targetState.selectOptions[act.colId] || [];
                                        if (!opts.includes(strVal)) targetState.selectOptions[act.colId] = [...opts, strVal];
                                    }
                                });
                            }

                            if (JSON.stringify(currentVal) !== JSON.stringify(newVal)) {
                                r.cells[act.colId] = newVal;
                                recordChanged = true;
                            }
                        }

                        if (recordChanged) {
                            r.updatedAt = Date.now();
                            localAffected++;
                            if (typeof AdvancedAutomations !== 'undefined') {
                                AdvancedAutomations.evaluate(targetDbId, r.id, false);
                                AdvancedAutomations.triggerCrossDB(targetDbId);
                            }
                        }
                    } catch(err) {
                        const titleCol = targetState.columns[0];
                        const rowTitle = titleCol ? r.cells[titleCol.id] : r.id;
                        errorsLog.push(`Aggiornamento Riga "<b>${UI.escapeHTML(String(rowTitle).substring(0,30))}</b>" [DB: ${UI.escapeHTML(targetState.title)}]: ${err.message || String(err)}`);
                    }
                }
                
                if (localAffected > 0) {
                    totalRowsAffected += localAffected;
                    updatedDbIds.add(targetDbId);
                }
            }
        }

        return { totalRowsAffected, emailsSent, updatedDbIds, errorsLog };
    },

    // ==========================================
    // 5. GENERATORE PREVIEW LIVE
    // ==========================================
    updateFormulaLivePreview: async (previewElId, formula, targetState, filters = [], sourceState = null) => {
        const el = document.getElementById(previewElId);
        if (!el) return;

        if (!formula || formula.trim() === '') {
            el.innerHTML = '<span style="color:var(--text-secondary); font-style:italic;">Nessuna formula JS inserita...</span>';
            return;
        }

        el.innerHTML = `<span style="color:var(--text-secondary);">${Icons.hourglass || '⏳'} Calcolo in corso...</span>`;

        try {
            let mockRow = { id: 'mock', cells: {}, virtualCells: {} };
            let foundRealRow = false;

            if (targetState && targetState.rows && targetState.rows.length > 0) {
                if (filters && filters.length > 0) {
                    for (const r of targetState.rows) {
                        let isMatch = true;
                        for (const f of filters) {
                            if (f.colId && !f.colId.startsWith('SYS_')) {
                                let colDef = targetState.columns.find(c => c.id === f.colId);
                                if (f.colId === 'SYS_JS_FORMULA') colDef = { id: 'SYS_JS_FORMULA', type: 'special' };
                                
                                if (!LogicEngine.evaluateCondition(f.operator, f.value, r.cells[f.colId], null, colDef, null, r, targetState)) {
                                    isMatch = false;
                                    break;
                                }
                            }
                        }
                        if (isMatch) {
                            mockRow = r;
                            foundRealRow = true;
                            break;
                        }
                    }
                    if (!foundRealRow) {
                        mockRow = targetState.rows[0]; 
                    }
                } else {
                    mockRow = targetState.rows[0];
                    foundRealRow = true;
                }
            }

            let mockOrigine = { "Dato Esempio": "Test Preview" }; 
            
            if (sourceState && sourceState.rows && sourceState.rows.length > 0) {
                mockOrigine = AdvancedTable._buildRigaContext(sourceState.rows[0], sourceState.columns);
            }
            
            if (sourceState && targetState && sourceState.id === targetState.id) {
                mockOrigine = AdvancedTable._buildRigaContext(mockRow, targetState.columns);
            }

            let cleanFormula = formula;
            if (cleanFormula.startsWith('=')) cleanFormula = cleanFormula.substring(1);

            const result = await AdvancedTable.executeAsyncScript(
                cleanFormula, 
                mockRow, 
                targetState ? targetState.columns : [], 
                targetState ? targetState.id : '', 
                targetState ? targetState.title : 'Database', 
                mockRow.virtualCells || mockRow.cells,
                mockOrigine
            );

            let rowContextMsg = '';
            if (foundRealRow) {
                const titleColId = targetState.columns[0]?.id;
                const rowTitle = titleColId && mockRow.cells[titleColId] ? mockRow.cells[titleColId] : 'Senza Titolo';
                rowContextMsg = `(Test effettuato sul record: "<b>${UI.escapeHTML(rowTitle)}</b>")`;
            } else if (targetState && targetState.rows.length > 0) {
                 rowContextMsg = `(⚠️ I filtri non restituiscono nulla. Test su prima riga)`;
            } else {
                rowContextMsg = `(Database attualmente vuoto)`;
            }

            if (String(result).includes('Async Err') || String(result).includes('Err')) {
                 el.innerHTML = `<span style="color:var(--danger-color);"><b>Errore di Sintassi:</b> Controlla il codice Javascript.</span>`;
            } else {
                 let stringResult = typeof result === 'object' ? JSON.stringify(result) : String(result);
                 el.innerHTML = `<span style="color:var(--text-secondary);">Risultato:</span> <span style="background:var(--bg-color); color:var(--text-primary); font-weight:bold; padding:2px 6px; border-radius:4px; border:1px solid var(--border-color); word-break: break-all;">${UI.escapeHTML(stringResult)}</span> <div style="font-size:0.7rem; color:var(--text-secondary); margin-top:4px;">${rowContextMsg}</div>`;
            }

        } catch (e) {
            console.error(`🔴 [LIVE PREVIEW ERROR] Fallimento durante il test della Formula: ${formula}`, e);
            el.innerHTML = `<span style="color:var(--danger-color);"><b>Errore:</b> ${e.message}</span>`;
        }
    },

    // ==========================================
    // 6. GENERATORI UI (Tendine Dinamiche)
    // ==========================================
    getConditionOperatorsHTML: (colDef, selectedOp, isTriggerMode) => {
        if (colDef && colDef.id === 'SYS_JS_FORMULA') {
            return `<option value="formula" selected>Valuta Risultato (True/False)</option>`;
        }

        let html = `
            <option value="=" ${selectedOp === '=' ? 'selected' : ''}>=</option>
            <option value="!=" ${selectedOp === '!=' ? 'selected' : ''}>Diverso da (!=)</option>
            <option value="contains" ${selectedOp === 'contains' ? 'selected' : ''}>Contiene Testo</option>
            <option value="not_contains" ${selectedOp === 'not_contains' ? 'selected' : ''}>Non Contiene</option>
            <option value="empty" ${selectedOp === 'empty' ? 'selected' : ''}>È vuoto</option>
            <option value="not_empty" ${selectedOp === 'not_empty' ? 'selected' : ''}>Non è vuoto</option>
        `;

        if (!colDef) return html;

        if (isTriggerMode) {
            html += `<option value="changed" ${selectedOp === 'changed' ? 'selected' : ''}>È cambiato (Scatta)</option>`;
            if (['checkbox', 'text', 'select', 'url'].includes(colDef.type)) {
                html += `
                    <option value="changed_to" ${selectedOp === 'changed_to' ? 'selected' : ''}>È diventato...</option>
                    <option value="changed_from" ${selectedOp === 'changed_from' ? 'selected' : ''}>Era... ed è cambiato</option>
                `;
            }
            if (['relation', 'multi-select'].includes(colDef.type)) {
                html += `
                    <option value="relation_added" ${selectedOp === 'relation_added' ? 'selected' : ''}>È stato aggiunto...</option>
                    <option value="relation_removed" ${selectedOp === 'relation_removed' ? 'selected' : ''}>È stato rimosso...</option>
                `;
            }
        }

        if (['number', 'formula', 'rollup'].includes(colDef.type)) {
            html += `
                <option value=">=" ${selectedOp === '>=' ? 'selected' : ''}>>=</option>
                <option value="<=" ${selectedOp === '<=' ? 'selected' : ''}><=</option>
                <option value=">" ${selectedOp === '>' ? 'selected' : ''}>></option>
                <option value="<" ${selectedOp === '<' ? 'selected' : ''}><</option>
            `;
        }

        if (['date', 'datetime'].includes(colDef.type)) {
            if (colDef.hasEndDate) {
                html += `
                    <option value="range_inside" ${selectedOp === 'range_inside' ? 'selected' : ''}>Comprende il...</option>
                    <option value="range_outside" ${selectedOp === 'range_outside' ? 'selected' : ''}>È fuori dal...</option>
                    <option value="range_start_eq" ${selectedOp === 'range_start_eq' ? 'selected' : ''}>L'Inizio è il...</option>
                    <option value="range_end_eq" ${selectedOp === 'range_end_eq' ? 'selected' : ''}>La Fine è il...</option>
                `;
            } else {
                html += `
                    <option value=">=" ${selectedOp === '>=' ? 'selected' : ''}>Dal (Compreso)</option>
                    <option value="<=" ${selectedOp === '<=' ? 'selected' : ''}>Fino al (Compreso)</option>
                    <option value=">" ${selectedOp === '>' ? 'selected' : ''}>Dopo il</option>
                    <option value="<" ${selectedOp === '<' ? 'selected' : ''}>Prima del</option>
                `;
            }
        }

        return html;
    },

    getActionTypesHTML: (colDef, selectedType, mode) => {
        if (!colDef) return `<option value="set_fixed">Seleziona colonna...</option>`;

        let html = '';
        const isUpdate = mode === 'automation' || mode === 'button_update';

        if (colDef.type === 'checkbox') {
            html += `
                <option value="set_true" ${selectedType === 'set_true' ? 'selected' : ''}>Spunta (Sì)</option>
                <option value="set_false" ${selectedType === 'set_false' ? 'selected' : ''}>Rimuovi Spunta (No)</option>
                <option value="set_formula" ${selectedType === 'set_formula' ? 'selected' : ''}>Formula JS...</option>
            `;
        } else if (colDef.type === 'number') {
            html += `
                <option value="set_fixed" ${selectedType === 'set_fixed' ? 'selected' : ''}>Valore Fisso</option>
                <option value="set_formula" ${selectedType === 'set_formula' ? 'selected' : ''}>Formula JS...</option>
            `;
            if (isUpdate) {
                html += `
                    <option value="math_add" ${selectedType === 'math_add' ? 'selected' : ''}>Aggiungi (+)</option>
                    <option value="math_sub" ${selectedType === 'math_sub' ? 'selected' : ''}>Sottrai (-)</option>
                `;
            }
        } else if (colDef.type === 'select') {
            html += `
                <option value="set_fixed" ${selectedType === 'set_fixed' ? 'selected' : ''}>Imposta a...</option>
                <option value="set_formula" ${selectedType === 'set_formula' ? 'selected' : ''}>Formula JS...</option>
            `;
        } else if (['multi-select', 'relation'].includes(colDef.type)) {
            html += `
                <option value="set_fixed" ${selectedType === 'set_fixed' ? 'selected' : ''}>Sovrascrivi con...</option>
                <option value="add_fixed" ${selectedType === 'add_fixed' ? 'selected' : ''}>Aggiungi all'elenco...</option>
                <option value="set_formula" ${selectedType === 'set_formula' ? 'selected' : ''}>Formula JS...</option>
            `;
            if (isUpdate) {
                html += `<option value="remove_fixed" ${selectedType === 'remove_fixed' ? 'selected' : ''}>Rimuovi dall'elenco...</option>`;
            }
        } else if (['date', 'datetime'].includes(colDef.type)) {
            if (colDef.hasEndDate) {
                html += `
                    <optgroup label="Data di Inizio">
                        <option value="set_start_today" ${selectedType === 'set_start_today' ? 'selected' : ''}>Inizio a Oggi</option>
                        <option value="set_start_now" ${selectedType === 'set_start_now' ? 'selected' : ''}>Inizio ad Adesso (Ora)</option>
                        <option value="set_start_fixed" ${selectedType === 'set_start_fixed' ? 'selected' : ''}>Inizio Fisso...</option>
                        <option value="set_start_formula" ${selectedType === 'set_start_formula' ? 'selected' : ''}>Inizio: Formula JS...</option>
                `;
                if (isUpdate) {
                    html += `
                        <option value="math_start_add" ${selectedType === 'math_start_add' ? 'selected' : ''}>Inizio: Aggiungi (+)</option>
                        <option value="math_start_sub" ${selectedType === 'math_start_sub' ? 'selected' : ''}>Inizio: Sottrai (-)</option>
                    `;
                }
                html += `</optgroup><optgroup label="Data di Fine">
                        <option value="set_end_today" ${selectedType === 'set_end_today' ? 'selected' : ''}>Fine a Oggi</option>
                        <option value="set_end_now" ${selectedType === 'set_end_now' ? 'selected' : ''}>Fine ad Adesso (Ora)</option>
                        <option value="set_end_fixed" ${selectedType === 'set_end_fixed' ? 'selected' : ''}>Fine Fissa...</option>
                        <option value="set_end_formula" ${selectedType === 'set_end_formula' ? 'selected' : ''}>Fine: Formula JS...</option>
                `;
                if (isUpdate) {
                    html += `
                        <option value="math_end_add" ${selectedType === 'math_end_add' ? 'selected' : ''}>Fine: Aggiungi (+)</option>
                        <option value="math_end_sub" ${selectedType === 'math_end_sub' ? 'selected' : ''}>Fine: Sottrai (-)</option>
                    `;
                }
                html += `</optgroup><optgroup label="Avanzate">
                        <option value="set_formula" ${selectedType === 'set_formula' ? 'selected' : ''}>Formula JS (Sovrascrive tutto)...</option>
                </optgroup>`;
            } else {
                html += `
                    <option value="set_today" ${selectedType === 'set_today' ? 'selected' : ''}>Solo Data di Oggi</option>
                    <option value="set_datetime" ${selectedType === 'set_datetime' ? 'selected' : ''}>Data e Ora di Adesso</option>
                    <option value="set_fixed" ${selectedType === 'set_fixed' ? 'selected' : ''}>Data fissa...</option>
                    <option value="set_formula" ${selectedType === 'set_formula' ? 'selected' : ''}>Formula JS...</option>
                `;
                if (isUpdate) {
                    html += `
                        <option value="math_date_add" ${selectedType === 'math_date_add' ? 'selected' : ''}>Aggiungi Tempo (+)</option>
                        <option value="math_date_sub" ${selectedType === 'math_date_sub' ? 'selected' : ''}>Sottrai Tempo (-)</option>
                    `;
                }
            }
        } else if (colDef.type === 'time') {
            html += `
                <option value="set_time" ${selectedType === 'set_time' ? 'selected' : ''}>Ora Corrente</option>
                <option value="set_fixed" ${selectedType === 'set_fixed' ? 'selected' : ''}>Orario Fisso...</option>
            `;
        } else {
            html += `
                <option value="set_fixed" ${selectedType === 'set_fixed' ? 'selected' : ''}>Testo Fisso</option>
                <option value="set_formula" ${selectedType === 'set_formula' ? 'selected' : ''}>Formula JS...</option>
            `;
        }

        if (mode === 'button_select') {
            html += `<option value="set_from_source_col" ${selectedType === 'set_from_source_col' ? 'selected' : ''}>[Copia] Valore da Colonna Origine...</option>`;
        }

        if (mode !== 'email') {
            html += `<option value="set_empty" ${selectedType === 'set_empty' ? 'selected' : ''}>Svuota Cella</option>`;
        }
        
        return html;
    },

    getActionInputHTML: (colDef, actType, val1, val2, targetState, onchangeCallback, extraData = null) => {
        if (!colDef) return `<input type="text" class="modern-input action-val" disabled style="width:100%; margin:0; opacity:0.5;">`;
        if (actType === 'set_empty' || actType === 'set_true' || actType === 'set_false') {
            return `<input type="hidden" class="modern-input action-val" value=""><input type="hidden" class="modern-input action-val2" value="">`;
        }

        if (actType === 'set_from_source_col') {
            let optsHTML = '<option value="">-- Seleziona Colonna Origine --</option>';
            if (extraData && extraData.sourceDbId) {
                const srcState = typeof AdvancedTable !== 'undefined' ? AdvancedTable.getTableState(extraData.sourceDbId) : null;
                if (srcState) {
                    srcState.columns.forEach(c => {
                        let sel = c.id === val1 ? 'selected' : '';
                        optsHTML += `<option value="${c.id}" ${sel}>${c.name} (${c.type})</option>`;
                    });
                }
            }
            return `<select class="modern-input action-val" style="width:100%; box-sizing:border-box; margin:0; font-weight:bold;" onchange="${onchangeCallback}('value', this.value)">${optsHTML}</select>`;
        }

        const safeVal1 = UI.escapeHTML(val1 || '');

        if (actType && actType.includes('formula')) {
            let ph = "Es: riga['Nome'].toUpperCase()";
            const inputIdAttr = (extraData && extraData.inputId) ? `id="${extraData.inputId}"` : '';
            
            if (extraData && extraData.isEmailBody) {
                return `<textarea ${inputIdAttr} class="modern-input action-val live-formula-input" style="width:100%; box-sizing:border-box; margin:0; font-family:monospace; color:var(--accent-color); min-height:80px; resize:vertical;" placeholder="'Gentile ' + riga['Nome Cliente'] + ',\\nQuesta è una mail multi-riga!\\n\\n' + riga['Dettagli']" oninput="${onchangeCallback}('value', this.value)">${safeVal1}</textarea>`;
            }
            
            return `<textarea ${inputIdAttr} class="modern-input action-val live-formula-input" style="width:100%; box-sizing:border-box; margin:0; font-family:monospace; color:var(--accent-color); min-height:80px; resize:vertical;" placeholder="${ph}" oninput="${onchangeCallback}('value', this.value)">${safeVal1}</textarea>`;
        }

        if (actType === 'set_fixed' && extraData && extraData.isEmailBody) {
             return `<textarea class="modern-input action-val" style="width:100%; box-sizing:border-box; margin:0; min-height:80px; resize:vertical;" placeholder="Scrivi il corpo dell'email qui... (Testo statico su più righe)" oninput="${onchangeCallback}('value', this.value)">${safeVal1}</textarea>`;
        }

        if (actType.includes('math_') && ['date', 'datetime'].includes(colDef.type)) {
            return `
                <div style="display:flex; width:100%; gap:2px; margin:0;">
                    <input type="number" class="modern-input action-val" style="width:60px; text-align:center;" value="${val1 || '1'}" min="1" onchange="${onchangeCallback}('value', this.value)">
                    <select class="modern-input action-val2" style="flex:1;" onchange="${onchangeCallback}('value2', this.value)">
                        <option value="hours" ${val2 === 'hours' ? 'selected' : ''}>Ore</option>
                        <option value="days" ${val2 === 'days' || !val2 ? 'selected' : ''}>Giorni</option>
                        <option value="weeks" ${val2 === 'weeks' ? 'selected' : ''}>Settimane</option>
                        <option value="months" ${val2 === 'months' ? 'selected' : ''}>Mesi</option>
                    </select>
                </div>
            `;
        }

        if (actType.includes('_fixed') && ['date', 'datetime'].includes(colDef.type)) {
            const inputType = colDef.type === 'datetime' ? 'datetime-local' : 'date';
            return `<input type="${inputType}" class="modern-input action-val" style="width:100%; box-sizing:border-box; margin:0;" value="${safeVal1}" onchange="${onchangeCallback}('value', this.value)">`;
        }

        if (colDef.type === 'select' || colDef.type === 'multi-select') {
            let opts = targetState && targetState.selectOptions ? (targetState.selectOptions[colDef.id] || []) : [];
            let listId = `dl_act_${colDef.id}_${Date.now()}`;
            return `
                <input type="text" list="${listId}" class="modern-input action-val" style="width:100%; box-sizing:border-box; margin:0;" value="${safeVal1}" placeholder="Scrivi o scegli..." oninput="${onchangeCallback}('value', this.value)">
                <datalist id="${listId}">${opts.map(o => `<option value="${UI.escapeHTML(o)}">`).join('')}</datalist>
            `;
        }

        if (colDef.type === 'relation') {
            let optsHTML = '<option value="">-- Seleziona --</option>';
            const relState = typeof AdvancedTable !== 'undefined' ? AdvancedTable.getTableState(colDef.targetTableId) : null;
            if (relState) {
                relState.rows.forEach(r => {
                    let name = UI.escapeHTML(r.cells[colDef.targetColId] || 'Senza nome');
                    let sel = String(r.id) === String(val1) ? 'selected' : '';
                    optsHTML += `<option value="${r.id}" ${sel}>${name}</option>`;
                });
            }
            return `<select class="modern-input action-val" style="width:100%; box-sizing:border-box; margin:0;" onchange="${onchangeCallback}('value', this.value)">${optsHTML}</select>`;
        }

        let ph = "Valore testuale...";
        if (colDef.type === 'number') ph = "Numero...";
        if (colDef.type === 'time') return `<input type="time" class="modern-input action-val" style="width:100%; box-sizing:border-box; margin:0;" value="${safeVal1}" onchange="${onchangeCallback}('value', this.value)">`;

        return `<input type="text" class="modern-input action-val" style="width:100%; box-sizing:border-box; margin:0; ${colDef.type === 'number' ? 'text-align:right;' : ''}" placeholder="${ph}" value="${safeVal1}" oninput="${onchangeCallback}('value', this.value)">`;
    }
};