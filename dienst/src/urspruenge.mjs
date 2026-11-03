/*
  Welche Seite darf welchen Weg rufen (432hz-radio#46, Punkt 5).

  Bis hierher galt EINE Liste fuer alles. In main.bicep stand darin auch
  apps.iyambae.fm, weil die Umfrage und die beiden Messwerkzeuge von dort
  senden. Damit durfte apps.iyambae.fm aber auch jeden Kontoweg rufen, bis
  hin zu „Konto loeschen". Die Seite dort hat kein Konto, keine Anmeldung
  und keinen Grund dafuer. Eine Luecke auf apps.iyambae.fm (ein
  eingeschleustes Skript in einem der Werkzeuge) waere so eine Luecke in
  jedem Konto gewesen.

  Jetzt zwei Listen:

    konto         Alles ausser den drei Rueckmeldewegen. Nur iyambae.fm und
                  www.iyambae.fm. Dieselbe Liste bekommen die Fremdanmeldung
                  und die Passkeys.
    rueckmeldung  POST /api/umfrage, /api/hoertest, /api/stimmung. Die
                  Kontoliste und dazu apps.iyambae.fm.

  ── Warum apps abgezogen wird, statt bloss nicht dazuzukommen ────────

  Ausgerollt wird nur das Abbild, nicht main.bicep (.github/workflows/
  ausliefern.yml). In der laufenden Umgebung steht apps.iyambae.fm deshalb
  weiter in ERLAUBTE_URSPRUENGE, bis jemand die Vorlage von Hand ausrollt.
  Wuerde die Kontoliste einfach ERLAUBTE_URSPRUENGE lesen, bliebe apps bis
  dahin auf allen Kontowegen zugelassen, und niemand saehe es. Also gilt:
  Was in APPS_URSPRUENGE steht, ist NIE ein Kontoursprung, egal wo es
  sonst noch steht.
*/

const KONTO_VORGABE = 'https://iyambae.fm,https://www.iyambae.fm';
const APPS_VORGABE = 'https://apps.iyambae.fm';

function liste(wert) {
    return String(wert).split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * @param {object} [umgebung]  process.env oder ein Ersatz fuer Tests
 * @returns {{konto: string[], rueckmeldung: string[]}}
 */
export function liesUrspruenge(umgebung = process.env) {
    const apps = liste(umgebung.APPS_URSPRUENGE ?? APPS_VORGABE);
    const konto = liste(umgebung.ERLAUBTE_URSPRUENGE ?? KONTO_VORGABE).filter((u) => !apps.includes(u));
    const rueckmeldung = [...konto, ...apps.filter((u) => !konto.includes(u))];
    return { konto, rueckmeldung };
}

/*
  Die drei Wege, die apps.iyambae.fm rufen darf. Alle drei sind anonym,
  schreiben eine Zeile ohne Personenbezug und schicken keine Mail. Wer hier
  einen vierten eintraegt, prueft vorher, dass das auch fuer ihn gilt.
*/
export const RUECKMELDEWEGE = new Set([
    'POST /api/umfrage',
    'POST /api/hoertest',
    'POST /api/stimmung',
]);
