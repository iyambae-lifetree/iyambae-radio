/*
  Die Seite /<sprache>/passwort-neu/ — das Gegenstueck zur Mail aus
  „Passwort vergessen" (432hz-radio#42).

  ── Der Weg der Marke ──────────────────────────────────────────────

  Die Mail verweist auf /passwort-neu#marke=…, nginx leitet anhand der
  Sprache auf /<sprache>/passwort-neu/ weiter, und der Browser nimmt das
  Fragment dabei mit. Das Fragment geht nie zum Server, also auch nie als
  Referrer ins Protokoll.

  Gleich nach dem Lesen verschwindet es aus der Adresse
  (history.replaceState, ohne Hash). Sonst stuende es im Verlauf, in jedem
  Lesezeichen und in jedem Bildschirmfoto der Adresszeile. Von da an lebt
  die Marke nur noch in einer Variablen dieser Seite.

  ── Warum vor dem Absenden geprueft wird ───────────────────────────

  Der Dienst verbraucht die Marke beim EINLOESEN, nicht erst beim Erfolg.
  Lehnt er das Passwort ab (400 passwort_abgelehnt), ist der Link weg und
  es braucht eine neue Mail. Deshalb prueft die Seite vorher alles, was sie
  ohne Netz pruefen kann — dieselben Regeln wie pruefeRegeln() in
  dienst/src/passwort.mjs. Was bleibt, ist der Abgleich mit den Listen
  gestohlener Passwoerter; den kann nur der Dienst.

  Die Regeln stehen damit an zwei Stellen. Der Dienst bleibt die Wahrheit:
  Weicht diese Seite ab, kostet das schlimmstenfalls einen Link, nie die
  Sicherheit.
*/

export const MINDESTLAENGE = 15;
export const HOECHSTLAENGE = 256;

/** Liest die Marke aus einem Fragment wie `#marke=abc.def`. */
export function liesMarke(hash) {
  const roh = (/[#&]marke=([^&]*)/.exec(hash ?? '') || [])[1];
  if (!roh) return '';
  try {
    return decodeURIComponent(roh);
  } catch {
    return '';
  }
}

/** Die Regeln aus dienst/src/passwort.mjs, soweit sie ohne Netz gehen. */
export function vorpruefe(roh) {
  const zeichen = [...String(roh ?? '').normalize('NFKC')];
  const n = zeichen.length;
  if (n === 0) return { grund: 'leer' };
  if (n < MINDESTLAENGE) return { grund: 'zu_kurz', mindestens: MINDESTLAENGE, fehlt: MINDESTLAENGE - n };
  if (n > HOECHSTLAENGE) return { grund: 'zu_lang', hoechstens: HOECHSTLAENGE, zuviel: n - HOECHSTLAENGE };
  if (zeichen.every((z) => z === zeichen[0])) return { grund: 'nur_wiederholung' };
  let hoch = true;
  let runter = true;
  for (let i = 1; i < n; i++) {
    const d = zeichen[i].codePointAt(0) - zeichen[i - 1].codePointAt(0);
    if (d !== 1) hoch = false;
    if (d !== -1) runter = false;
  }
  if (hoch || runter) return { grund: 'nur_fortlaufend' };
  return null;
}

/** Setzt {platzhalter} ein. */
export function fuelle(satz, werte = {}) {
  return String(satz).replace(/\{(\w+)\}/g, (ganz, name) => (name in werte ? String(werte[name]) : ganz));
}

/** Ein Grund des Dienstes als Satz. Unbekannte Gruende bekommen den allgemeinen. */
export function grundAlsSatz(texte, grund) {
  const satz = texte['grund.' + grund?.grund] ?? texte['grund.sonst'];
  return fuelle(satz, grund ?? {});
}

// ── Die Seite ─────────────────────────────────────────────────────

if (typeof document !== 'undefined') starte();

function starte() {
  const texte = JSON.parse(document.getElementById('texte').textContent);
  const sprache = document.documentElement.lang;
  const $ = (id) => document.getElementById(id);

  const marke = liesMarke(location.hash);
  if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }

  /*
    Die Sprachwahl fuehrt auf dieselbe Seite in einer anderen Sprache. Ohne
    die Marke im Fragment kaeme man dort ohne Link an — dann haette das
    Umschalten den Link gekostet. Sie steht nur im Verweis, nicht in der
    Adresse, und geht auch so nie zum Server.
  */
  if (marke) {
    for (const a of document.querySelectorAll('.sprachen a')) {
      a.href = a.getAttribute('href') + '#marke=' + encodeURIComponent(marke);
    }
  }

  const formNeu = $('formNeu');
  const feld = $('feldPasswort');
  const knopf = $('knopfSpeichern');
  const meldung = $('meldung');
  const fertig = $('fertig');
  const formLink = $('formLink');
  const linkMeldung = $('linkMeldung');

  function melde(ziel, text, art = 'fehler') {
    ziel.textContent = text;
    ziel.dataset.art = art;
    ziel.hidden = !text;
  }

  function zeigeLinkAnfordern(eingangstext) {
    formNeu.hidden = true;
    formLink.hidden = false;
    if (eingangstext) melde(meldung, eingangstext);
  }

  if (!marke) {
    $('vorwort').hidden = true;
    zeigeLinkAnfordern(texte.fehlt);
  }

  $('zeigen').addEventListener('change', (e) => {
    feld.type = e.target.checked ? 'text' : 'password';
  });

  feld.addEventListener('input', () => {
    if (meldung.dataset.art === 'fehler') melde(meldung, '');
  });

  formNeu.addEventListener('submit', async (e) => {
    e.preventDefault();
    const vorab = vorpruefe(feld.value);
    if (vorab) {
      melde(meldung, grundAlsSatz(texte, vorab));
      feld.focus();
      return;
    }

    knopf.disabled = true;
    knopf.textContent = texte.sendet;
    melde(meldung, '');

    let antwort = null;
    let daten = {};
    try {
      antwort = await fetch('/api/passwort/neu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify({ marke, passwort: feld.value }),
        signal: AbortSignal.timeout(20000),
      });
      if ((antwort.headers.get('content-type') ?? '').includes('application/json')) {
        daten = await antwort.json();
      }
    } catch {
      antwort = null;
    }

    knopf.disabled = false;
    knopf.textContent = texte.senden;

    if (antwort?.status === 204) {
      feld.value = '';
      formNeu.hidden = true;
      $('vorwort').hidden = true;
      fertig.hidden = false;
      fertig.querySelector('h2').focus();
      return;
    }

    if (antwort?.status === 400 && daten.fehler === 'passwort_abgelehnt') {
      const gruende = (daten.gruende ?? []).map((g) => grundAlsSatz(texte, g)).join(' ');
      const satz = fuelle(texte.abgelehnt, { gruende: gruende || texte['grund.sonst'] });
      if (daten.markeVerbraucht !== false) {
        zeigeLinkAnfordern(satz + ' ' + texte.verbraucht);
      } else {
        melde(meldung, satz);
      }
      return;
    }

    if (antwort?.status === 410) {
      zeigeLinkAnfordern(daten.grund === 'abgelaufen' ? texte.abgelaufen : texte.ungueltig);
      return;
    }

    // Gedrosselt: Das geschieht VOR dem Einloesen, der Link gilt weiter.
    if (antwort?.status === 429) {
      const sekunden = Number(antwort.headers.get('retry-after')) || 60;
      melde(meldung, fuelle(texte.gedrosselt, { sekunden }));
      return;
    }

    // Kein Netz, Dienst schlaeft, Ueberlast: Ob die Marke noch gilt, weiss
    // die Seite nicht. Also beides anbieten — noch einmal, oder neu.
    melde(meldung, texte.netz);
    formLink.hidden = false;
  });

  formLink.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mail = $('feldMail').value.trim();
    if (!mail) {
      melde(linkMeldung, texte['link.ohneMail']);
      $('feldMail').focus();
      return;
    }
    const k = $('knopfLink');
    k.disabled = true;
    let ok = false;
    try {
      const a = await fetch('/api/passwort/vergessen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify({ mail, sprache }),
        signal: AbortSignal.timeout(20000),
      });
      ok = a.status === 204;
      if (a.status === 429) {
        const sekunden = Number(a.headers.get('retry-after')) || 60;
        melde(linkMeldung, fuelle(texte.gedrosselt, { sekunden }));
        k.disabled = false;
        return;
      }
    } catch {
      ok = false;
    }
    k.disabled = false;
    melde(linkMeldung, ok ? texte['link.ok'] : texte.netz, ok ? 'ok' : 'fehler');
  });
}
