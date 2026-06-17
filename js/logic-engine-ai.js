/**
 * logic-engine-ai.js
 * Generatore dei Prompt e Assistente Intelligenza Artificiale per l'Engine JS.
 */

Object.assign(LogicEngine, {
    
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
    }
});