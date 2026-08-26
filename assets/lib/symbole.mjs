/*
 Symbole für die Bedienelemente.

 Vorher standen hier Emoji: 🔍 ♡ 💿 🗃 ▶. Die sehen auf jedem System anders
 aus — Apple zeichnet sie plastisch, Windows flach, Android wieder anders —
 und keine dieser Fassungen gehört zu dieser Seite. Emoji als Bedienelement
 wirken deshalb immer geliehen.

 Diese hier sind einlinig, ohne Füllung, 1,6 px Strichstärke auf 24 px, und
 nehmen die Textfarbe an. Sie fügen sich damit in die Typografie ein, statt
 daneben zu stehen.

 **Für die Regale gibt es bewusst keine.** Trennkarten in einem Plattenregal
 tragen Schrift, keine Bildchen. Neun mittelmäßige Symbole wären derselbe
 Fehler wie neun Emoji, nur in besserer Auflösung. Die Regalnamen tragen sich
 selbst — die Symbole in data/sender.json bleiben unangetastet, sie werden
 nur nicht mehr gezeigt.
*/

const RAHMEN = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
               'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

const PFADE = {
    suche: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',

    // Gefülltes Dreieck: Ein einliniges wirkt bei kleiner Größe zerbrechlich,
    // und Abspielen ist die wichtigste Handlung der Seite.
    abspielen: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M9 5.5v13M15 5.5v13"/>',

    merken: '<path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7-2.8c0 4.8-7 14.8-7 14.8z"/>',
    gemerkt: '<path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7-2.8c0 4.8-7 14.8-7 14.8z" ' +
             'fill="currentColor"/>',

    // Pfeil aus dem Kasten heraus — die übliche Form für „öffnet woanders".
    // Weitergeben: drei Punkte, durch zwei Linien verbunden.
    teilen: '<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/>' +
            '<circle cx="18" cy="19" r="2.6"/>' +
            '<path d="M8.3 10.8 15.7 6.4"/><path d="M8.3 13.2 15.7 17.6"/>',

    // Auf den Startbildschirm: ein Geraet mit einem Pfeil hinein.
    hinzufuegen: '<rect x="6" y="2.5" width="12" height="19" rx="2"/>' +
            '<path d="M12 7v7"/><path d="M9 11l3 3 3-3"/>',

    extern: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/>' +
            '<path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',

    // Plattenkiste: ein Kasten mit angedeuteten Trennkarten darin.
    laden: '<path d="M3 8h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>' +
           '<path d="M3 8l1.6-3.4A1 1 0 0 1 5.5 4h13a1 1 0 0 1 .9.6L21 8"/>' +
           '<path d="M9 12v4M15 12v4"/>',

    // Eigene Sammlung: dieselbe Kiste, aber mit einer Karte, die heraussteht.
    meine: '<path d="M3 9h18v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>' +
           '<path d="M8 9V4.8a.8.8 0 0 1 .8-.8h6.4a.8.8 0 0 1 .8.8V9"/>' +
           '<path d="M12 13v4"/>',

    // Schallplatte mit Mittelloch.
    platte: '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="2.2"/>' +
            '<path d="M12 3.8v2M12 18.2v2"/>',

    stern: '<path d="m12 4 2.3 5 5.4.6-4 3.7 1.1 5.3-4.8-2.7-4.8 2.7 1.1-5.3-4-3.7 5.4-.6z"/>',

    // Blaettern in einer Regalreihe. Ein Winkel, kein Pfeil mit Schaft: Der
    // Schaft wuerde bei 16 px zur Flaeche verschmieren.
    zurueck: '<path d="m14.5 5-7 7 7 7"/>',
    weiter:  '<path d="m9.5 5 7 7-7 7"/>',

    // Trichter fuer den Filterknopf.
    filter: '<path d="M4 5h16l-6.2 7.4v5.9l-3.6 1.7v-7.6z"/>',

    // Uhr mit Zeiger nach hinten — der Verlauf.
    verlauf: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.4V12l3.2 1.9"/>',

    // Konto. Schulterlinie statt vollem Koerper, damit es bei 20 px nicht
    // zur Bohne wird.
    konto: '<circle cx="12" cy="8.4" r="3.6"/>' +
           '<path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',

    // Schliessen.
    zu: '<path d="m6 6 12 12M18 6 6 18"/>',
};

/**
 * Ein Symbol als SVG-Zeichenkette.
 * @param {keyof PFADE} name
 * @param {number} [groesse] Kantenlänge in px
 */
export function symbol(name, groesse = 20) {
    const pfad = PFADE[name];
    if (!pfad) return '';
    return `<svg class="symbol" width="${groesse}" height="${groesse}" ${RAHMEN} ` +
           `aria-hidden="true" focusable="false">${pfad}</svg>`;
}

/** Setzt alle `<span data-symbol="…">` im Dokument. */
export function setzeSymbole(wurzel = document) {
    for (const el of wurzel.querySelectorAll('[data-symbol]')) {
        const groesse = Number(el.dataset.symbolGroesse) || 20;
        el.innerHTML = symbol(el.dataset.symbol, groesse);
    }
}

export const SYMBOLNAMEN = Object.keys(PFADE);
