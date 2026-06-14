Manual.registerSection(
    'sec-6',
    '6. Ricerca, Filtri, Tag Globali e Paginazione',
    `<p>L'applicazione distingue tra la ricerca generale (usata per trovare le Note) e la manipolazione matematica dei database tramite le condizioni WHERE.</p>
    
    <h4>Ricerca Globale e Autocompletamento Tag (Sidebar)</h4>
    <p>La barra di ricerca in alto a sinistra scandaglia l'intero spazio di lavoro. Cerca le parole sia nei titoli che nei contenuti, <b>inclusi i testi degli appunti nascosti (Footnotes)</b>.</p>
    <p><b>La Magia dei Filtri Strutturali (Tag):</b><br>
    Non appena inizi a digitare nella barra di ricerca, l'applicazione aprirà un menu a tendina intelligente (Autocompletamento). Il sistema va a leggere il Database di Sistema (quello che gestisce le Proprietà e le Etichette delle Pagine) e ti suggerisce dei filtri basati su ciò che hai scritto.</p>
    <ul>
        <li><b>Filtro per Valore Esatto:</b> Se hai assegnato il Tag "Urgente" a 5 note, digitando "urg" il sistema ti suggerirà la pillola colorata "Urgente". Cliccandola, l'albero mostrerà <i>esclusivamente</i> le 5 note che possiedono quel Tag.</li>
        <li><b>Filtro di Esistenza (*EXISTS*):</b> Il sistema ti suggerirà anche l'etichetta 🏷️ della proprietà stessa (Es. "Qualsiasi valore in <i>Data Scadenza</i>"). Cliccandola, filtrerai l'albero per mostrare tutte le note che hanno quel campo compilato, a prescindere dal valore che contiene!</li>
        <li>I filtri scelti diventano delle <b>Pillole Colorate</b> posizionate sotto la barra di ricerca. Puoi combinarne quanti ne vuoi per creare ricerche incrociate potentissime.</li>
    </ul>

    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 30px 0;">

    <h4>Filtri Database e Operatori (Sulle singole Tabelle)</h4>
    <p>I tasti "Filtra" e "Viste Salvate" sul singolo database non cercano solo stringhe, ma nascondono righe in tempo reale usando operatori logici e matematici. Cliccando sull'icona a imbuto aprirai l'impostazione dei filtri attuali, mentre l'icona a segnalibro ti permetterà di salvare quelle configurazioni e richiamarle in seguito (Viste Personalizzate).</p>
    
    <div style="background: rgba(0,0,0,0.03); padding: 15px; border-radius: 6px; border: 1px solid var(--border-color); margin-bottom: 20px;">
        <ul style="list-style-type: none; padding-left: 0; margin: 0;">
            <li style="margin-bottom: 10px;"><b>&gt; (Maggiore) e &lt; (Minore):</b>
                <br><code style="background:#1e1e1e; color:#d4d4d4; padding:2px 6px; border-radius:3px;">&gt; 50</code> (Trova tutti i numeri sopra il 50)
                <br><code style="background:#1e1e1e; color:#d4d4d4; padding:2px 6px; border-radius:3px;">&lt; 01/05/2024</code> (Trova date precedenti al primo Maggio)
            </li>
            <li style="margin-bottom: 10px;"><b>&gt;= (Maggiore o uguale) e &lt;= (Minore o uguale):</b>
                <br><code style="background:#1e1e1e; color:#d4d4d4; padding:2px 6px; border-radius:3px;">&gt;= 100</code> (Mostra dal 100 in su)
            </li>
            <li style="margin-bottom: 10px;"><b>=:</b>
                <br><code style="background:#1e1e1e; color:#d4d4d4; padding:2px 6px; border-radius:3px;">= In Lavorazione</code> (Trova esattamente "In Lavorazione", ignorando ad esempio "In Lavorazione Urgente")
            </li>
            <li style="margin-bottom: 10px;"><b>!= (Diverso da / Escludi):</b>
                <br><code style="background:#1e1e1e; color:#d4d4d4; padding:2px 6px; border-radius:3px;">!= Fatto</code> (Nasconde tutte le righe che contengono la parola "Fatto")
            </li>
            <li><b>Contiene / Non contiene:</b> Cerca una sottostringa all'interno di un testo più lungo.</li>
        </ul>
    </div>

    <h4 style="color:var(--danger-color);">La Super-Condizione: ⚡ Formula JS (Personalizzata)</h4>
    <p>Quando devi configurare l'Azione di un Pulsante o il Trigger di un'Automazione, potresti trovarti di fronte al limite degli operatori "AND". Cosa succede se vuoi operare su un record <i>"Se lo stato è Aperto OPPURE l'importo è maggiore di 1000"</i>? Qui entra in gioco la Formula JS.<br><br>Selezionando dal menu a tendina "Colonna" la voce speciale <b>⚡ Formula JS</b>, non opererai su un campo singolo, ma su tutta la riga contemporaneamente, usando il codice Javascript per costruire la tua condizione.</p>

    <div style="background: rgba(0,0,0,0.03); padding: 15px; border-radius: 6px; border: 1px solid var(--border-color); margin-top: 15px;">
        <h4 style="margin-top:0; color:var(--text-primary);">5 Esempi di Condizioni Complesse (Da usare nel WHERE)</h4>
        <p style="font-size:0.8rem; margin-bottom:10px;">Queste espressioni devono sempre restituire <code>true</code> (Esegui azione) o <code>false</code> (Ignora record).</p>
        <ol style="margin: 0; padding-left: 20px; font-size: 0.9rem; line-height: 1.6;">
            <li style="margin-bottom: 10px;">
                <b>La clausola "OR" (Almeno uno è vero)</b><br>
                <code style="background:#1e1e1e; color:#d4d4d4; padding:4px 6px; border-radius:4px; font-family:monospace; display:block; margin-top:4px;">riga["Stato"] === "Aperto" || riga["Urgenza"] === "Alta"</code>
            </li>
            <li style="margin-bottom: 10px;">
                <b>La clausola "IN" (Appartiene a una lista)</b><br>
                <code style="background:#1e1e1e; color:#d4d4d4; padding:4px 6px; border-radius:4px; font-family:monospace; display:block; margin-top:4px;">["AMS", "Helpdesk", "DevOps"].includes(riga["Dipartimento"])</code>
            </li>
            <li style="margin-bottom: 10px;">
                <b>La clausola "NOT IN" (Escludi da una lista)</b><br>
                <code style="background:#1e1e1e; color:#d4d4d4; padding:4px 6px; border-radius:4px; font-family:monospace; display:block; margin-top:4px;">!["Chiuso", "Rifiutato"].includes(riga["Stato"])</code>
            </li>
            <li style="margin-bottom: 10px;">
                <b>Condizioni Miste (AND + OR su Numeri)</b><br>
                <code style="background:#1e1e1e; color:#d4d4d4; padding:4px 6px; border-radius:4px; font-family:monospace; display:block; margin-top:4px;">riga["Stato"] === "Aperto" && (Number(riga["Costo"]) > 1000 || riga["Approvato"] === "Sì")</code>
            </li>
            <li>
                <b>Controllo Avanzato sulle Date (Scaduti da Ieri)</b><br>
                <code style="background:#1e1e1e; color:#d4d4d4; padding:4px 6px; border-radius:4px; font-family:monospace; display:block; margin-top:4px;">(new Date(riga["Scadenza"]).getTime() < Date.now()) && riga["Stato"] !== "Fatto"</code>
            </li>
        </ol>
    </div>

    <h4>Paginazione (Per Database Estremi)</h4>
    <p>Se il tuo Database conta centinaia di righe, l'editor ti permette di dividerlo in pagine per non sovraccaricare il browser. In basso a destra della tabella troverai il testo "Tutte le righe". Cliccaci per selezionare la visualizzazione a <b>10, 20 o 50 righe per pagina</b>. Appariranno le freccette ◀ ▶ per sfogliare il database mantenendo l'app fluidissima.</p>`
);