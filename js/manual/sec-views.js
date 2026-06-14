Manual.registerSection(
    'sec-5',
    '5. Viste Database: Kanban, Calendario, Timeline',
    `<p>Un database (📊) non è solo una griglia orizzontale. Cliccando sul pulsante "Vista" in alto a destra della tabella, puoi trasformare istantaneamente i tuoi dati in formati grafici avanzati.</p>

    <h4>Vista Bacheca (Kanban)</h4>
    <p>Richiede che tu abbia creato almeno una colonna di tipo "Select Singola". Divide i record in colonne verticali (stile Trello), ordinate in base ai valori del tag (es. "Da Fare", "In Corso", "Finito").</p>
    <ul>
        <li><b>Drag & Drop:</b> Puoi afferrare una card e trascinarla da una colonna all'altra. Quando la rilasci, il database aggiornerà automaticamente l'etichetta di quel record con il nuovo stato.</li>
        <li>Le card mostrano un riassunto dei campi più importanti. Se un campo testo è troppo lungo, andrà a capo internamente mantenendo l'impaginazione della colonna in ordine.</li>
    </ul>

    <h4>Vista Calendario</h4>
    <p>Richiede almeno una colonna di tipo "Data" (con o senza data di fine attivata).</p>
    <ul>
        <li><b>Modalità Multipla:</b> In alto a destra puoi passare tra le visualizzazioni Mese, Settimana e Giorno.</li>
        <li><b>Riprogrammazione visiva:</b> Se tieni premuto su un evento e lo trascini in un'altra casella, il sistema aggiornerà la data del record. Nelle viste Settimana/Giorno, l'asse Y rappresenta le ore: trascinando un blocco in verticale, ne cambierai l'orario di inizio con uno snap guidato!</li>
        <li><b>Ridimensionamento:</b> Se il tuo campo data prevede una "Data di fine", nella vista Settimana/Giorno apparirà una maniglia alla base del blocco colorato. Trascinala per allungare o accorciare la durata dell'attività.</li>
    </ul>

    <h4>Vista Timeline (Diagramma di Gantt)</h4>
    <p>La visualizzazione più avanzata per il Project Management. Richiede una colonna data (preferibilmente con data di fine).</p>
    <ul>
        <li><b>Zoom Profondo:</b> Usa le lenti d'ingrandimento (+ e -) sulla destra per esplorare il tempo. Lo zoom passa gradualmente da una visuale su più anni, ai mesi, fino alle frazioni di ore!</li>
        <li><b>Spostamento completo:</b> Passando il mouse sulla barra di un task, puoi afferrare le maniglie di sinistra/destra per modificare le date di inizio/fine, oppure cliccare al centro della barra per traslarla interamente nel tempo. Un tooltip intelligente ti mostrerà le nuove date in tempo reale mentre trascini.</li>
        <li><b>Frecce Relazionali (Dipendenze):</b> Questa è una magia nascosta. Se il tuo database ha una colonna di tipo "Relazione" che <b>punta a se stesso</b> (usata per dire "L'attività B dipende dall'Attività A"), la Timeline lo capirà da sola. Ti basterà trascinare il cerchietto a destra di una barra verso un'altra barra (Drag-to-Connect) per far nascere una freccia di dipendenza. Se le date andranno in conflitto, la freccia diventerà rossa!</li>
    </ul>`
);