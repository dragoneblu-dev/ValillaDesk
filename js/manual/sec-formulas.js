Manual.registerSection(
    'sec-8',
    '8. Le Formule (I 20 Esempi Pratici)',
    `<p>Le colonne di tipo <b>Formula (∑)</b> trasformano il database in un'applicazione. Il calcolo avviene <b>da Sinistra verso Destra</b>: una colonna formula può richiamare il risultato di un'altra formula, purché quest'ultima si trovi fisicamente alla sua sinistra nella griglia!</p>
    
    <p>L'editor delle formule offre un <b>Dizionario</b> (che suggerisce i nomi delle colonne cliccabili), un <b>Intellisense</b> (che suggerisce i metodi matematici in base a ciò che stai scrivendo), e persino un tasto magico che genera il <b>Prompt perfetto da copiare e incollare in ChatGPT/Claude</b> se hai bisogno di aiuto a farti scrivere la formula! Di seguito, la guida definitiva (fai copia e incolla dei concetti che ti servono):</p>

    <div style="background: rgba(234, 179, 8, 0.1); border-left: 4px solid #eab308; padding: 10px 15px; margin: 15px 0; border-radius: 4px; font-size: 0.85rem;">
        <b>⚠️ Regola d'oro: Maiuscole e Minuscole (Case-Sensitive)</b><br>
        Quando richiami una colonna o un database (es. <code>riga["Stato"]</code> o <code>tabella["Clienti"]</code>), devi scriverli in modo <b>identico</b> all'originale, rispettando perfettamente <b>maiuscole, minuscole e gli spazi</b>. Scrivere <code>riga["stato"]</code> o <code>riga["Stato "]</code> (con uno spazio in più) non funzionerà! Usa le etichette del <i>Dizionario Colonne</i> in basso cliccandole per inserirle senza rischio di errori di battitura.
    </div>

    <h4>Manipolazione Testo e Stringhe</h4>
    <ul style="font-family:monospace; background:#1e1e1e; color:#d4d4d4; padding:15px; border-radius:4px; font-size:0.85rem; line-height:2;">
        <li><span style="color:#6a9955;">// 1. Unire testi semplici (Concatenazione)</span><br>
        riga["Nome"] + " " + riga["Cognome"]</li>
        
        <li><span style="color:#6a9955;">// 2. Trasformare tutto in Maiuscolo</span><br>
        String(riga["Stato"]).toUpperCase()</li>
        
        <li><span style="color:#6a9955;">// 3. Estrarre i primi 5 caratteri di una parola (Codice)</span><br>
        String(riga["Codice Fiscale"]).substring(0, 5)</li>
        
        <li><span style="color:#6a9955;">// 4. Sostituire una parola specifica dentro un testo</span><br>
        String(riga["Qualifica"]).replace("Junior", "Senior")</li>
        
        <li><span style="color:#6a9955;">// 5. Verificare se una parola contiene una chiocciola @</span><br>
        String(riga["Email"]).includes("@") ? "Valida" : "Non Valida"</li>
        
        <li><span style="color:#6a9955;">// 6. Contare da quanti caratteri è formata una frase</span><br>
        String(riga["Note"]).length</li>
    </ul>

    <h4>Matematica e Condizioni</h4>
    <ul style="font-family:monospace; background:#1e1e1e; color:#d4d4d4; padding:15px; border-radius:4px; font-size:0.85rem; line-height:2;">
        <li><span style="color:#6a9955;">// 7. Arrotondare un numero a due cifre decimali (es. per i soldi)</span><br>
        Math.round(Number(riga["Prezzo"]) * 100) / 100</li>
        
        <li><span style="color:#6a9955;">// 8. Calcolo matematico base (es. applicare sconto del 20%)</span><br>
        Number(riga["Prezzo"]) * 0.80</li>
        
        <li><span style="color:#6a9955;">// 9. Trovare il valore più alto tra due colonne della stessa riga</span><br>
        Math.max(Number(riga["Preventivo A"]), Number(riga["Preventivo B"]))</li>
        
        <li><span style="color:#6a9955;">// 10. Funzione SE (Se VERO fai questo, altrimenti fai l'altro)</span><br>
        SE(Number(riga["Giacenza"]) &lt; 10, "Riordinare", "Scorte OK")</li>
        
        <li><span style="color:#6a9955;">// 11. Funzione SE Annidata (Più condizioni concatenate)</span><br>
        SE(riga["Stato"] === "Chiuso", SE(Number(riga["Budget"]) > 0, "In Attivo", "In Perdita"), "In Lavorazione")</li>
    </ul>

    <h4>Aggregazioni Sulla Tabella Attuale (Uso di "righe")</h4>
    <p style="font-size:0.85rem;">La variabile speciale <code>righe</code> rappresenta un array con tutti i dati del database in cui ti trovi attualmente.</p>
    <ul style="font-family:monospace; background:#1e1e1e; color:#d4d4d4; padding:15px; border-radius:4px; font-size:0.85rem; line-height:2;">
        <li><span style="color:#6a9955;">// 12. Somma totale dell'intera colonna "Importo"</span><br>
        SOMMA(righe, "Importo")</li>
        
        <li><span style="color:#6a9955;">// 13. Calcolo della media escludendo le celle vuote</span><br>
        MEDIA(righe, "Voto")</li>
        
        <li><span style="color:#6a9955;">// 14. Contare quanti record in tutto il DB hanno la parola "Completato"</span><br>
        CONTA(righe, "Stato", "Completato")</li>
        
        <li><span style="color:#6a9955;">// 15. Calcolare la percentuale (Incidenza) di questa riga sul totale vendite</span><br>
        Math.round((Number(riga["Vendite"]) / SOMMA(righe, "Vendite")) * 100) + "%"</li>
        
        <li><span style="color:#6a9955;">// 16. Trovare il record col punteggio più alto in assoluto in tutto il DB (Avanzato)</span><br>
        Math.max(...righe.map(r => Number(r["Punteggio"]||0)))</li>
    </ul>

    <h4>Relazioni e Interazioni tra Database DIVERSI (Uso di tabella["..."])</h4>
    <p style="font-size:0.85rem;">Scrivendo <code>tabella["Nome Database"]</code> puoi interrogare qualsiasi altro Database del tuo file per estrarne dati in tempo reale. Usa il dizionario a schermo per non sbagliare i nomi.</p>
    <ul style="font-family:monospace; background:#1e1e1e; color:#d4d4d4; padding:15px; border-radius:4px; font-size:0.85rem; line-height:2;">
        <li><span style="color:#6a9955;">// 17. Il famoso VLOOKUP (CERCA.VERT). Cerca l'ID nel DB Clienti e dimmi il suo Telefono</span><br>
        CERCA(tabella["Clienti"], "ID Cliente", riga["ID"], "Telefono")</li>
        
        <li><span style="color:#6a9955;">// 18. Filtraggio e Somma esterna (Es. Totale spese fatte da questo specifico fornitore)</span><br>
        tabella["Spese"].filter(r => r["Fornitore"] === riga["Nome Fornitore"]).reduce((sum, r) => sum + Number(r["Importo"]), 0)</li>
        
        <li><span style="color:#6a9955;">// 19. Crea un elenco separato da virgola di tutti gli ordini fatti da questo cliente</span><br>
        tabella["Ordini"].filter(r => r["ID Cliente"] === riga["ID"]).map(r => r["Codice Ordine"]).join(", ")</li>
        
        <li><span style="color:#6a9955;">// 20. Controllo incrociato: Se nell'altro magazzino l'articolo c'è, scrivi Disp, sennò Esaurito</span><br>
        tabella["Magazzino"].find(p => p["Articolo"] === riga["Prodotto"])?.["Pezzi"] > 0 ? "Disponibile" : "Esaurito"</li>
    </ul>`
);