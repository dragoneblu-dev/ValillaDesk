Manual.registerSection(
    'sec-4',
    '4. Tabelle Semplici vs Database (Guida Completa)',
    `<p>L'applicazione offre due strumenti diametralmente opposti per gestire le griglie, accessibili dal menu "Blocchi" (o "Inserisci Tabella"): le <b>Tabelle Semplici (🔲)</b>, progettate per l'impaginazione visiva e la formattazione testuale, e le <b>Tabelle Database (📊)</b>, dei veri e propri RDBMS (Sistemi di Gestione di Database Relazionali) in-memory.</p>

    <div style="background: rgba(37,99,235,0.05); border-left: 4px solid var(--accent-color); padding: 15px; border-radius: 4px; margin-bottom: 20px;">
        <h4 style="margin-top:0; color:var(--accent-color);">Quale scegliere?</h4>
        <p style="margin-bottom:0; font-size:0.9rem;">Usa le <b>Tabelle Semplici</b> se devi creare un modulo da stampare, unire celle, colorare sfondi a piacimento o incollare dati da Excel. Usa i <b>Database</b> se devi gestire liste di Task, Inventari, CRM, se devi ordinare/filtrare i dati o far scattare automazioni matematiche.</p>
    </div>

    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 30px 0;">

    <h3 style="color: var(--text-primary); display:flex; align-items:center; gap:8px;">${Icons.tableSimple} Le Tabelle Semplici (Gestione Visiva)</h3>
    <p>Le tabelle semplici si comportano come quelle di un word processor classico (es. Microsoft Word). Cliccando all'interno di una cella, appariranno dei comandi fluttuanti vicino al cursore e un ingranaggio (⚙️) per le opzioni globali.</p>

    <ul>
        <li><b>Spostamento Fisico di Righe e Colonne:</b> Quando il cursore è in una cella, osserva i bordi superiore e sinistro della tabella. Appariranno delle maniglie (⋮ e ⋯) subito fuori dalla tabella. Puoi <b>afferrarle col mouse e trascinarle</b> per spostare un'intera riga o scambiare due colonne tra loro istantaneamente!</li>
        <li><b>Layout e Ridimensionamento (⚙️):</b> Dal menu principale della tabella puoi scegliere 3 comportamenti strutturali:
            <ul>
                <li><b>🤖 Adattivo (Testo):</b> Le colonne si stringono o allargano automaticamente in base alla lunghezza della parola più lunga al loro interno.</li>
                <li><b>% Percentuale (Schermo):</b> La tabella occupa il 100% dello schermo. Se trascini i bordi delle colonne, queste si ridimensioneranno in percentuale (es. 30% - 70%). Perfetto per documenti responsivi.</li>
                <li><b>⬄ Libera (Pixel):</b> Sgancia la tabella dai limiti dello schermo. Puoi allargare le colonne all'infinito e apparirà una barra di scorrimento orizzontale.</li>
            </ul>
        </li>
        <li><b>Selezione Multipla Avanzata:</b> Clicca su una cella e trascina il mouse per selezionare un blocco di celle. Se tieni premuto <b>CTRL (o Cmd) + Click</b>, puoi selezionare <i>celle sparse</i> non adiacenti!</li>
        <li><b>Il Menu Fluttuante:</b> Quando selezioni una o più celle, apparirà un menu pop-up (Ghost Mode) che ti permette di:
            <ul>
                <li>Applicare il <b>Grassetto</b> in massa.</li>
                <li>Cambiare l'<b>Allineamento</b> del testo (Sinistra, Centro, Destra).</li>
                <li>Applicare un <b>Colore di Sfondo</b> specifico a quelle celle (es. per evidenziare totali o criticità).</li>
                <li><b>Unire (Merge) e Dividere (Split) le celle:</b> Seleziona più celle contigue e clicca sull'icona di unione per fonderle (Rowspan/Colspan).</li>
                <li><b>Copia per Excel (📋):</b> Copia l'esatta selezione negli appunti in formato (TSV) pronto per Excel.</li>
            </ul>
        </li>
        <li><b>Import/Export CSV:</b> Dal menu (⚙️) puoi aprire un editor di testo per incollare dati grezzi (CSV) e generare istantaneamente la tabella, oppure modificare in blocco i dati esistenti.</li>
        <li><b>Conversione Magica:</b> Hai creato una tabella semplice e ti rendi conto che ti servono filtri e formule? Clicca su "Converti in Database"! Il sistema assorbirà i testi e trasformerà l'HTML statico in un Database funzionante. <i>(Nota: le celle unite verranno perse).</i></li>
    </ul>

    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 30px 0;">

    <h3 style="color: var(--accent-color); display:flex; align-items:center; gap:8px;">${Icons.tableDatabase} Le Tabelle Database (Il Motore Relazionale)</h3>
    <p>I Database sono il cuore pulsante dell'applicazione. Non memorizzano "HTML", ma veri e propri record di dati isolati (JSON). Questo permette di visualizzare gli stessi dati come Tabella, Kanban, Calendario o Timeline senza mai corromperli.</p>

    <h4>1. L'Ecosistema Relazionale (Come collegare i DB)</h4>
    <p>A differenza dei fogli di calcolo tradizionali, qui puoi far dialogare le tabelle tra loro creando un sistema aziendale completo.</p>
    <ul>
        <li><b>Relazione (🔗):</b> Permette di collegare fisicamente la colonna a un altro Database. Esempio: In un DB "Fatture", crei una relazione verso il DB "Clienti". Quando cliccherai sulla cella, non dovrai digitare nulla: si aprirà un pannello per selezionare il Cliente direttamente dal DB Clienti. Una volta selezionato, apparirà il suo nome in una pillola blu cliccabile (che apre la scheda del cliente).</li>
        <li><b>Relazione Inversa (Backlink):</b> È la vera magia. Quando colleghi la "Fattura 01" ad "Apple", nel database Clienti, alla riga "Apple", apparirà AUTOMATICAMENTE una colonna "Backlink" che ti mostra che "Fattura 01" è collegata! 
            <br>Dal menu della colonna Backlink, puoi decidere di visualizzarla in 3 modi:
            <ol>
                <li><i>Elenco Record:</i> Mostra le pillole cliccabili (Fattura 01, Fattura 02).</li>
                <li><i>Conteggio Numerico:</i> Mostra solo un numero (es. "2"). Utile per sapere "Quanti ticket ha aperto questo utente?".</li>
                <li><i>Estrazione Proprietà (Distinct):</i> Permette di "tuffarsi" nei record collegati ed estrarne un campo specifico (es. estrarre tutti gli "Importi" delle fatture collegate, sommarli, o farne una lista senza duplicati).</li>
            </ol>
        </li>
        <li><b>Rollup (Lookup - 🔍):</b> Lavora in coppia con la Relazione. Se nella Fattura hai collegato il "Cliente", e vuoi vedere la sua P.IVA per non doverla ricopiare, crei un Rollup! Il Rollup "viaggia" attraverso il cavo della Relazione, legge la P.IVA nel DB Clienti e te la mostra in sola lettura nella Fattura.</li>
    </ul>

    <h4>2. Tipi di Dato a Disposizione (Proprietà Colonna)</h4>
    <p>Cliccando sull'intestazione di una colonna puoi cambiarne il tipo di dato o formattarlo:</p>
    <ul style="column-count: 2; column-gap: 20px;">
        <li><b>Testo (📝):</b> Campo libero.</li>
        <li><b>Numero (123):</b> Accetta solo numeri. Dal menu colonna puoi impostare i <i>Decimali</i> (da 0 a 4) per forzare l'arrotondamento (es. 10.50).</li>
        <li><b>Select / Multi-Select (▾ / 🍱):</b> Etichette/Tag colorati. Dal menu contestuale del singolo Tag puoi cambiargli colore o rinominarlo (aggiornando tutti i record del database).</li>
        <li><b>Data e Ora (📅 / 🕒):</b> Selezionatori nativi. Dal menu puoi attivare "Data di Fine" per creare intervalli di tempo (fondamentale per Gantt e Calendari).</li>
        <li><b>Checkbox (☑):</b> Vero o Falso.</li>
        <li><b>Formula (∑):</b> Esegue script JS.</li>
        <li><b>URL (🔗):</b> Rende i link (Web o file locali C:\\) direttamente cliccabili aprendoli in una nuova scheda.</li>
        <li><b>Pulsante Macro (▶):</b> Inserisce un bottone per eseguire automazioni massive su quel record.</li>
        <li><b>Data Creazione / Modifica (⏱️):</b> Si auto-compilano e si auto-aggiornano da sole ogni volta che tocchi la riga.</li>
    </ul>

    <h4>3. Pagine Dedicate (Record Note - 📄)</h4>
    <p>Cosa succede se un record del tuo CRM (es. un Cliente) richiede molto più spazio di una riga di tabella per descriverne gli appunti, allegare i contratti o caricare immagini? Semplice: aggiungi una colonna di tipo <b>Pagina Dedicata (Record Note)</b>.<br>
    Questo campo speciale genera una vera e propria Nota completa (come quelle della barra laterale) ancorata indissolubilmente a quella riga. Cliccando su [📄 Apri Pagina], l'editor si trasformerà, dandoti una pagina bianca a tutto schermo in cui inserire codice, immagini o altre tabelle. La nota sarà visibile nell'albero a sinistra nidificata sotto il nome del database!</p>

    <h4>4. Gestione Visuale e UX (Interfaccia Tabella)</h4>
    <ul>
        <li><b>Modalità Dettaglio Record (Focus):</b> Cliccando due volte su una riga (o sull'icona della lente a fine riga), si aprirà un elegante cassetto laterale destro (Drawer) che ti mostrerà tutti i campi di quella riga in formato modulo (dall'alto verso il basso). Ideale per compilare tabelle con 30+ colonne senza dover scrollare orizzontalmente! Se il testo di una cella è lunghissimo, nel Drawer diventerà una spaziosa Textarea.</li>
        <li><b>Troncamento Testo (Text Clamp):</b> Se hai incollato un intero paragrafo in una cella, la riga diventerà altissima e fastidiosa. Dal menu (⋮) del Database, vai su "Altezza Righe Testo" e seleziona "Max 1 riga" o "Max 2 righe". L'app taglierà visivamente il testo con dei puntini di sospensione (...) mantenendo la tabella ordinata. Il testo completo rimane intatto e visibile passando col mouse o aprendo il Dettaglio Record.</li>
        <li><b>Visibilità Dinamica Colonne:</b> Dal menu opzioni del Database, sotto "Visualizza Campo" o "Campi Nascosti", puoi accendere e spegnere le colonne. Questa impostazione <i>è legata alla singola vista</i>. Puoi avere la colonna "ID" visibile nella tabella, ma nascosta nella vista Kanban.</li>
        <li><b>Colorazione Condizionale (🎨):</b> Vuoi che le fatture non pagate si colorino di rosso? Dal menu (⋮) del Database seleziona "Colorazione Condizionale". Si aprirà un builder dove potrai creare regole dinamiche (Es. <i>Se "Stato" = "Insoluto" E "Scadenza" < "Oggi", allora Sfondo = Rosso</i>). 
            <br><b>Feature Pro: Opacità Dinamica!</b> Nel selettore colore, puoi impostare l'opacità dello sfondo al 50%, oppure usare una Formula JS per farla calcolare dai dati! (Es. Opacità = <code>riga["Percentuale Completamento"]</code> per creare barre di avanzamento termiche sulle righe!).</li>
        <li><b>Row Selector Globale (Eliminazione Massiva):</b> Se passi il mouse sull'estrema sinistra di una riga, vedrai comparire un quadratino fluttuante. Cliccandolo, selezionerai la riga. Selezionane diverse, e in basso allo schermo apparirà un pulsante rosso per l'eliminazione massiva (Batch Delete).</li>
    </ul>`
);