/**
 * manual-core.js
 * Motore per la gestione del Manuale d'Uso in formato frammentato.
 * Registra dinamicamente le sezioni caricate dai file separati e genera l'indice.
 */

const Manual = {
    isInitialized: false,
    sections: [], 

    registerSection: (id, title, contentHTML) => {
        Manual.sections.push({ id, title, contentHTML });
    },

    init: () => {
        if (Manual.isInitialized) return;

        // Ordina le sezioni in base al numero nell'ID (es. sec-1, sec-2) per garantire coerenza
        Manual.sections.sort((a, b) => {
            const numA = parseInt(a.id.replace('sec-', ''), 10);
            const numB = parseInt(b.id.replace('sec-', ''), 10);
            return numA - numB;
        });

        // 1. Costruzione dell'Indice Dinamico (TOC)
        let indexHTML = `
            <div style="background: rgba(37, 99, 235, 0.05); padding: 20px; border-left: 4px solid var(--accent-color); border-radius: 4px; margin-bottom: 30px;">
                <h2 style="margin-top:0; color: var(--accent-color);">Benvenuto nel tuo "Secondo Cervello"</h2>
                Questa applicazione non è un semplice blocco note. È un ambiente ibrido che unisce un <b>elaboratore di testi avanzato</b> a un potente <b>motore di database relazionale e automazioni</b>. Il tutto funziona <em>esclusivamente all'interno del tuo browser</em>: i tuoi dati non vengono mai inviati a server esterni, garantendo una privacy totale, sicurezza assoluta e una velocità di esecuzione istantanea.
            </div>

            <div style="background: var(--sidebar-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 20px; margin-bottom: 40px;">
                <h3 style="margin-top:0; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">📑 Indice dei Contenuti</h3>
                <ul style="list-style-type: none; padding-left: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        `;

        Manual.sections.forEach(sec => {
            indexHTML += `<li><a href="javascript:void(0)" onclick="document.getElementById('${sec.id}').scrollIntoView({behavior:'smooth'})" style="color:var(--accent-color); text-decoration:none; font-weight:bold;">${sec.title}</a></li>`;
        });
        
        indexHTML += `</ul></div>`;

        // 2. Costruzione dei Corpi delle Sezioni
        let bodyContentHTML = '';
        Manual.sections.forEach(sec => {
            bodyContentHTML += `
                <h2 id="${sec.id}" style="color: var(--accent-color); border-bottom: 2px solid var(--border-color); padding-bottom:5px; padding-top:20px;">${sec.title}</h2>
                ${sec.contentHTML}
                <div style="text-align:right;"><a href="javascript:void(0)" onclick="document.getElementById('manualScrollArea').scrollTop = 0" style="font-size:0.8rem; color:var(--text-secondary);">⬆ Torna all'indice</a></div>
            `;
        });

        // 3. Generazione Modale Completa
        const modalHTML = `
        <div id="manualModal" class="link-modal-overlay hidden" style="z-index: 5000;">
            <div class="link-modal" style="width: 950px; max-width: 95vw; height: 90vh; display: flex; flex-direction: column;">
                
                <div class="link-modal-header" style="background: var(--sidebar-bg); border-bottom: 1px solid var(--border-color); flex-shrink: 0;">
                    <div class="link-modal-title">
                        <span style="display:flex; align-items:center; gap:8px; font-size: 1.2rem;">📖 Manuale d'Uso: Guida Definitiva a VanillaDesk</span>
                        <button class="close-modal-btn" onclick="Manual.close()" title="Chiudi Manuale">✕</button>
                    </div>
                </div>
                
                <div class="link-modal-list" style="padding: 30px 40px; font-size: 0.95rem; line-height: 1.7; color: var(--text-primary); overflow-y: auto; scroll-behavior: smooth;" id="manualScrollArea">
                    ${indexHTML}
                    ${bodyContentHTML}
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        Manual.isInitialized = true;
    },

    open: () => {
        if (!Manual.isInitialized) Manual.init();
        document.getElementById('manualModal').classList.remove('hidden');
    },

    close: () => {
        document.getElementById('manualModal').classList.add('hidden');
    }
};