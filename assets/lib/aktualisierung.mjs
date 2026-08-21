/*
 Aktualisierung der installierten App.

 Der Service Worker ruft in seinem `install` bereits `skipWaiting()` und in
 `activate` `clients.claim()` auf. Eine neue Fassung übernimmt also von selbst,
 sobald der Browser sie bemerkt. Drei Lücken bleiben, und die schließt dieses
 Modul:

 **Der Browser sieht nicht von allein nach.** Geprüft wird bei einer
 Navigation und höchstens etwa alle 24 Stunden. Eine installierte App, die
 tagelang offen bleibt, prüft nie. Deshalb hier: bei jeder Rückkehr in den
 Vordergrund, und einmal pro Stunde.

 **Die laufende Seite behält ihren alten Code.** Der neue Worker bedient dann
 alte Skripte — meist harmlos, aber der Besucher sieht die Neuerung nicht.
 Erst ein Neuladen bringt beides zusammen.

 **Niemand sagt Bescheid.** Ein Radio darf sich aber nicht einfach neu laden:
 Das würde die Wiedergabe abreißen lassen. Deshalb wird nur dann still neu
 geladen, wenn gerade nichts spielt. Läuft Musik, erscheint ein Hinweis, der
 stehen bleibt, bis der Besucher entscheidet.
*/

import { t } from './sprache.mjs';


const STUNDE = 60 * 60 * 1000;

/**
 * @param {object} optionen
 * @param {() => boolean}  optionen.spieltGerade  Läuft gerade Wiedergabe?
 * @param {(text: string, art?: string) => void} [optionen.melde]  für Fehler
 */
export function beobachteAktualisierung({ spieltGerade, melde }) {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('./sw.js', { scope: './' })
        .then((registrierung) => {
            const sieheNach = () => registrierung.update().catch(() => {
                /*
                 Erwarteter Zustand, kein Fehler: ohne Netz schlägt die
                 Nachfrage fehl. Beim nächsten Mal wieder.
                */
            });

            // Bei Rückkehr in den Vordergrund — der häufigste Fall bei einer
            // installierten App, die tagelang im Hintergrund liegt.
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') sieheNach();
            });
            setInterval(sieheNach, STUNDE);
        })
        .catch((fehler) => {
            /*
             KEIN erwarteter Zustand. Schlägt die Registrierung fehl, gibt es
             weder Offline-Betrieb noch Aktualisierung — und bisher erfuhr das
             niemand, weil hier ein leeres catch stand.
            */
            console.error('Service Worker nicht registrierbar:', fehler);
            melde?.(t('aktualisierung.keinOffline'), 'warnung');
        });

    /*
     Feuert, sobald ein neuer Worker die Kontrolle übernommen hat. Weil
     `skipWaiting()` im Worker steht, passiert das ohne weiteres Zutun.
    */
    let schonNeugeladen = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (schonNeugeladen) return;
        schonNeugeladen = true;

        if (!spieltGerade()) {
            location.reload();
            return;
        }
        zeigeHinweis();
    });
}

/*
 Bleibt stehen, bis der Besucher entscheidet. Kein Zeitablauf: Wer gerade
 Musik hört, soll selbst wählen, wann der Faden reißt.
*/
function zeigeHinweis() {
    const behaelter = document.getElementById('meldungen');
    if (!behaelter || document.getElementById('neueFassung')) return;

    const kasten = document.createElement('div');
    kasten.id = 'neueFassung';
    kasten.className = 'meldung meldung--info meldung--bleibt';
    kasten.setAttribute('role', 'status');

    const text = document.createElement('span');
    text.textContent = t('aktualisierung.bereit');

    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'meldung__knopf';
    knopf.textContent = t('aktualisierung.neuLaden');
    knopf.addEventListener('click', () => location.reload());

    const spaeter = document.createElement('button');
    spaeter.type = 'button';
    spaeter.className = 'meldung__knopf meldung__knopf--leise';
    spaeter.textContent = t('aktualisierung.spaeter');
    spaeter.addEventListener('click', () => kasten.remove());

    kasten.append(text, knopf, spaeter);
    behaelter.appendChild(kasten);
}
