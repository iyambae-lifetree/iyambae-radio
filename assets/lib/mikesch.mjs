/*
 ── KATER MIKESCH ────────────────────────────────────────────────────

 Unten rechts (in Arabisch: links) schiebt Mikesch den Kopf ins Bild,
 blinzelt, zuckt mit dem Ohr und bietet Hilfe an. Ein Klick oeffnet das
 Gespraech; darunter liegt die Anmeldung zur Schnurrpost.

 Drei Regeln, die alles hier bestimmen:

 1. TEXT BLEIBT TEXT. Was Mikesch antwortet, kommt von einem Sprachmodell
    und wird deshalb nie als HTML eingesetzt — nur ueber Textknoten. Einzige
    Auszeichnung ist `[[sender:kennung]]`; daraus wird ein Knopf, und auch
    nur, wenn es den Sender im Katalog gibt.

 2. NICHTS GEHT VON SELBST WEG. Das Gespraech verlaesst den Browser erst,
    wenn der Gast etwas abschickt. Es liegt nur im Arbeitsspeicher dieser
    Seite; neu laden heisst neu anfangen.

 3. MIKESCH STOERT NICHT. Er sitzt ueber der Spielerleiste (und auf dem
    Handy ueber der Navigationsleiste), nie darauf. Wer ihn wegschickt,
    sieht nur noch zwei Ohrenspitzen am Rand — auch beim naechsten Besuch.

 Fuer CSP (432hz-radio#6): kein Inline-Skript, kein Inline-Stil ausser
 Eigenschaften ueber `style.setProperty`, Bilder von derselben Herkunft,
 Anfragen nur an /api/.
*/

import { t, sprache } from './sprache.mjs';

const BILD = '/assets/bild/mikesch/';
const MERKER = 'iyambae.mikesch';          // 'weg' | 'gegruesst'
const HOECHSTENS_ZUEGE = 16;               // wie im Dienst
const HOECHSTENS_ZEICHEN = 800;
const DATENSCHUTZ = '/recht/datenschutz/';

const ruhig = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function liesMerker() {
  try { return localStorage.getItem(MERKER); } catch { return null; }
}
function setzeMerker(wert) {
  try {
    if (wert) localStorage.setItem(MERKER, wert);
    else localStorage.removeItem(MERKER);
  } catch { /* privat surfen: dann eben nur fuer diesen Besuch */ }
}

/** Ein Element mit Klasse und Attributen — ohne innerHTML. */
function el(name, klasse, attribute = {}, ...kinder) {
  const e = document.createElement(name);
  if (klasse) e.className = klasse;
  for (const [k, v] of Object.entries(attribute)) {
    if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kinder) e.append(k);
  return e;
}

// ── Der Kopf ───────────────────────────────────────────────────────

/*
 Drei deckungsgleiche Bilder: der Kopf ohne rechtes Ohr, das Ohr allein
 (damit es zucken kann) und die geschlossenen Lider (die beim Blinzeln von
 oben ins Augenband fahren). Alle drei sind 320 × 425 und liegen exakt
 uebereinander; die Lage von Augen und Ohrfuss steht in mikesch.css.
*/
function baueKopf() {
  const bild = (datei, klasse) => el('img', 'mikesch__bild ' + klasse, {
    src: BILD + datei, alt: '', width: 320, height: 425, decoding: 'async', draggable: 'false',
  });
  return el('span', 'mikesch__gesicht', { 'aria-hidden': 'true' },
    bild('ohr.webp', 'mikesch__ohr'),
    bild('kopf.webp', 'mikesch__kopfbild'),
    bild('lider.webp', 'mikesch__lider'));
}

// ── Antworten zeichnen ─────────────────────────────────────────────

/*
 Aus Mikeschs Text werden Absaetze, aus `[[sender:x]]` Knoepfe. Eine
 Kennung, die der Katalog nicht kennt, faellt still weg: Lieber ein Knopf
 weniger als einer, der ins Leere spielt.
*/
function zeichneAntwort(text) {
  const huelle = document.createDocumentFragment();
  for (const absatz of text.split(/\n{2,}/)) {
    const p = el('p');
    const teile = absatz.split(/\[\[sender:([a-z0-9][a-z0-9-]*)\]\]/g);
    teile.forEach((teil, i) => {
      if (i % 2 === 0) { if (teil) p.append(teil.replace(/\n/g, ' ')); return; }
      const sender = window.app?.ui?.senderMitId?.(teil);
      if (!sender) return;
      const knopf = el('button', 'mikesch__sender', { type: 'button' }, '▶ ' + sender.name);
      knopf.setAttribute('aria-label', t('mikesch.spielen', { name: sender.name }));
      knopf.addEventListener('click', () => window.app?.spieleSender?.(sender));
      p.append(knopf);
    });
    // „Probier mal  ." — der Platz, wo ein unbekannter Sender stand.
    p.normalize();
    if (p.childNodes.length) huelle.append(p);
  }
  return huelle;
}

// ── Anfragen ───────────────────────────────────────────────────────

async function schicke(pfad, koerper) {
  const antwort = await fetch('/api/' + pfad, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(koerper),
    credentials: 'same-origin',
  });
  let daten = null;
  if (antwort.status !== 204) { try { daten = await antwort.json(); } catch { /* leer */ } }
  return { status: antwort.status, daten };
}

// ── Das Ganze ──────────────────────────────────────────────────────

export function starteMikesch() {
  if (document.querySelector('.mikesch')) return;

  const verlauf = [];          // [{ wer: 'gast'|'mikesch', text }]
  let wartet = false;

  // Gerüst
  const kopf = el('button', 'mikesch__kopf', {
    type: 'button', 'aria-expanded': 'false', 'aria-controls': 'mikeschFenster',
  }, baueKopf());

  const blaseText = el('p', 'mikesch__blasentext');
  const blaseJa = el('button', 'mikesch__blasenknopf', { type: 'button' });
  const blaseWeg = el('button', 'mikesch__weg', { type: 'button' }, '×');
  const blase = el('div', 'mikesch__blase', { role: 'status' }, blaseText,
    el('div', 'mikesch__blasenzeile', {}, blaseJa), blaseWeg);

  const titel = el('h2', 'mikesch__titel', { id: 'mikeschTitel' });
  const ki = el('span', 'mikesch__ki');
  const zu = el('button', 'mikesch__zu', { type: 'button' }, '×');
  const hinweis = el('p', 'mikesch__hinweis');
  const liste = el('div', 'mikesch__verlauf', { 'aria-live': 'polite', 'aria-relevant': 'additions' });
  const vorschlaege = el('div', 'mikesch__vorschlaege');
  const feld = el('textarea', 'mikesch__feld', { rows: 1, maxlength: HOECHSTENS_ZEICHEN, id: 'mikeschFeld' });
  const senden = el('button', 'mikesch__senden', { type: 'submit' }, '➤');
  const eingabe = el('form', 'mikesch__eingabe', {}, feld, senden);

  const postMail = el('input', 'mikesch__mail', { type: 'email', required: true, autocomplete: 'email', id: 'mikeschMail' });
  const postMailLabel = el('label', 'mikesch__sr', { for: 'mikeschMail' });
  const postHaken = el('input', '', { type: 'checkbox', required: true, id: 'mikeschHaken' });
  const postHakenText = el('span');
  const postDs = el('a', '', { href: DATENSCHUTZ, target: '_blank', rel: 'noopener' });
  const postHakenLabel = el('label', 'mikesch__haken', { for: 'mikeschHaken' }, postHaken, postHakenText);
  const postKnopf = el('button', 'mikesch__postknopf', { type: 'submit' });
  const postStand = el('p', 'mikesch__poststand', { role: 'status' });
  const postTitel = el('summary', 'mikesch__posttitel');
  const postText = el('p', 'mikesch__posttext');
  const postForm = el('form', 'mikesch__postform', {}, postText, postMailLabel,
    el('div', 'mikesch__postzeile', {}, postMail, postKnopf), postHakenLabel, el('p', 'mikesch__postds', {}, postDs), postStand);
  const post = el('details', 'mikesch__post', {}, postTitel, postForm);

  const avatar = el('img', 'mikesch__avatar', { src: BILD + 'kopf.webp', alt: '', width: 40, height: 53 });
  const fenster = el('section', 'mikesch__fenster', {
    id: 'mikeschFenster', role: 'dialog', 'aria-labelledby': 'mikeschTitel', hidden: true,
  },
    el('header', 'mikesch__kopfzeile', {}, avatar, el('div', 'mikesch__namen', {}, titel, ki), zu),
    hinweis, liste, vorschlaege, eingabe, post);

  const wurzel = el('aside', 'mikesch', { 'data-zustand': 'versteckt' }, fenster, blase, kopf);

  // Texte — eigene Funktion, weil der Sprachumschalter die Seite neu laedt
  // und es deshalb keinen zweiten Aufruf braucht; sie bleibt trotzdem
  // beisammen, damit man alle Schluessel an einem Ort sieht.
  function beschrifte() {
    wurzel.setAttribute('aria-label', t('mikesch.name'));
    kopf.setAttribute('aria-label', t('mikesch.kopf.aria'));
    blaseText.textContent = t('mikesch.gruss');
    blaseJa.textContent = t('mikesch.gruss.ja');
    blaseWeg.setAttribute('aria-label', t('mikesch.weg'));
    blaseWeg.title = t('mikesch.weg');
    titel.textContent = t('mikesch.name');
    ki.textContent = t('mikesch.ki');
    zu.setAttribute('aria-label', t('mikesch.schliessen'));
    zu.title = t('mikesch.schliessen');
    hinweis.textContent = t('mikesch.hinweis') + ' ';
    hinweis.append(el('a', '', { href: DATENSCHUTZ, target: '_blank', rel: 'noopener' }, t('mikesch.datenschutz')));
    feld.placeholder = t('mikesch.eingabe');
    feld.setAttribute('aria-label', t('mikesch.eingabe'));
    senden.setAttribute('aria-label', t('mikesch.senden'));
    senden.title = t('mikesch.senden');
    for (const n of [1, 2, 3]) {
      const k = el('button', 'mikesch__vorschlag', { type: 'button' }, t('mikesch.vorschlag.' + n));
      k.addEventListener('click', () => frage(k.textContent));
      vorschlaege.append(k);
    }
    postTitel.textContent = t('mikesch.post.titel');
    postText.textContent = t('mikesch.post.text');
    postMailLabel.textContent = t('mikesch.post.mail');
    postMail.placeholder = t('mikesch.post.mail');
    postHakenText.textContent = t('mikesch.post.einwilligung');
    postDs.textContent = t('mikesch.post.datenschutz');
    postKnopf.textContent = t('mikesch.post.knopf');
  }
  beschrifte();
  document.body.append(wurzel);

  // ── Abstand nach unten ──
  /*
   Mikesch sitzt auf der hoechsten Leiste am unteren Rand. Gemessen statt
   gerechnet: Die Spielerleiste erscheint erst mit dem ersten Sender, die
   Navigationsleiste nur auf dem Handy, und beide sind je nach Sprache
   verschieden hoch (siehe misstKopf in app.js).
  */
  const leisten = ['spieler', 'handyLeiste'].map((id) => document.getElementById(id)).filter(Boolean);
  function setzeUnten() {
    let oben = innerHeight;
    for (const l of leisten) {
      if (getComputedStyle(l).display === 'none') continue;
      oben = Math.min(oben, l.getBoundingClientRect().top);
    }
    document.documentElement.style.setProperty('--mikesch-unten', Math.max(0, Math.round(innerHeight - oben)) + 'px');
  }
  setzeUnten();
  const ro = new ResizeObserver(setzeUnten);
  for (const l of leisten) {
    ro.observe(l);
    new MutationObserver(setzeUnten).observe(l, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  }
  addEventListener('resize', setzeUnten);

  // ── Zustaende ──
  // versteckt → da (Kopf) → gruesst (Kopf + Blase) → offen (Fenster)
  //                       ↘ weg (nur Ohrenspitzen, gemerkt)
  const zustand = (z) => { wurzel.dataset.zustand = z; };

  function zeigeKopf({ mitGruss }) {
    zustand(mitGruss ? 'gruesst' : 'da');
    starteLeben();
    // Die Blase bleibt nicht ewig stehen: Wer nicht antwortet, hat sie
    // gelesen. Der Kopf bleibt, die Seite wird wieder frei.
    if (mitGruss) setTimeout(() => { if (wurzel.dataset.zustand === 'gruesst') zustand('da'); }, 15000);
  }

  function oeffne() {
    setzeMerker('gegruesst');
    zustand('offen');
    fenster.hidden = false;
    kopf.setAttribute('aria-expanded', 'true');
    if (!liste.childElementCount) zeigeZug('mikesch', t('mikesch.anfang'));
    // Auf dem Handy wuerde die Tastatur sofort hochspringen und das halbe
    // Fenster verdecken — dort erst auf Antippen.
    if (matchMedia('(min-width: 720px)').matches) feld.focus({ preventScroll: true });
  }

  function schliesse() {
    fenster.hidden = true;
    kopf.setAttribute('aria-expanded', 'false');
    zustand('da');
    kopf.focus({ preventScroll: true });
  }

  function schickeWeg() {
    setzeMerker('weg');
    fenster.hidden = true;
    kopf.setAttribute('aria-expanded', 'false');
    zustand('weg');
    kopf.setAttribute('aria-label', t('mikesch.zurueck.aria'));
  }

  kopf.addEventListener('click', () => {
    if (wurzel.dataset.zustand === 'weg') {
      kopf.setAttribute('aria-label', t('mikesch.kopf.aria'));
      setzeMerker('gegruesst');
      zeigeKopf({ mitGruss: false });
      return;
    }
    if (wurzel.dataset.zustand === 'offen') schliesse(); else oeffne();
  });
  blaseJa.addEventListener('click', oeffne);
  blaseWeg.addEventListener('click', schickeWeg);
  zu.addEventListener('click', schliesse);
  wurzel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && wurzel.dataset.zustand === 'offen') { e.stopPropagation(); schliesse(); }
  });

  // ── Leben: blinzeln und Ohr zucken ──
  /*
   Zufaellige Abstaende, damit es nicht nach Uhrwerk aussieht. Bei
   reduzierter Bewegung gar nicht — und auch dann nicht, wenn der Tab im
   Hintergrund liegt: Niemand sieht hin, und die Zeitgeber laufen sonst
   gestaut nach.
  */
  let lebt = false;
  function starteLeben() {
    if (lebt) return;
    lebt = true;
    const einmal = (klasse, dauer, von, bis) => {
      const naechstes = () => setTimeout(() => {
        const sichtbar = ['da', 'gruesst'].includes(wurzel.dataset.zustand);
        if (sichtbar && !ruhig() && !document.hidden) {
          wurzel.classList.add(klasse);
          setTimeout(() => wurzel.classList.remove(klasse), dauer);
        }
        naechstes();
      }, von + Math.random() * (bis - von));
      naechstes();
    };
    einmal('blinzelt', 220, 2800, 6500);
    einmal('zuckt', 520, 5000, 12000);
  }

  // ── Gespraech ──
  function zeigeZug(wer, text, { fehler = false } = {}) {
    const zug = el('div', 'mikesch__zug mikesch__zug--' + wer + (fehler ? ' mikesch__zug--fehler' : ''));
    if (wer === 'gast') zug.append(el('p', '', {}, text));
    else zug.append(zeichneAntwort(text));
    liste.append(zug);
    liste.scrollTop = liste.scrollHeight;
    return zug;
  }

  /*
   Was mitgeht: hoechstens 16 Zuege, beginnend mit einem des Gastes — so
   verlangt es der Dienst. Die Begruessung oben ist nur zum Ansehen und
   geht nie mit.
  */
  function zuSchicken() {
    let ab = Math.max(0, verlauf.length - HOECHSTENS_ZUEGE);
    while (ab < verlauf.length && verlauf[ab].wer !== 'gast') ab += 1;
    return verlauf.slice(ab);
  }

  async function frage(text) {
    text = text.trim().slice(0, HOECHSTENS_ZEICHEN);
    if (!text || wartet) return;
    wartet = true;
    vorschlaege.hidden = true;
    verlauf.push({ wer: 'gast', text });
    zeigeZug('gast', text);
    feld.value = '';
    passeFeldAn();
    senden.disabled = true;

    const denkt = el('div', 'mikesch__zug mikesch__zug--mikesch mikesch__denkt', {},
      el('span', 'mikesch__punkte', { 'aria-hidden': 'true' }, el('i'), el('i'), el('i')),
      el('span', 'mikesch__sr', {}, t('mikesch.denkt')));
    liste.append(denkt);
    liste.scrollTop = liste.scrollHeight;

    let antwort = null, schluessel = 'mikesch.stumm';
    try {
      const r = await schicke('mikesch', { sprache: sprache(), verlauf: zuSchicken() });
      if (r.status === 200 && r.daten?.text) antwort = r.daten.text;
      else if (r.status === 200 && r.daten?.verweigert) schluessel = 'mikesch.verweigert';
      else if (r.status === 429) schluessel = 'mikesch.zuviel';
      else if (r.status === 503 && r.daten?.fehler === 'mikesch_schlaeft') schluessel = 'mikesch.schlaeft';
      else if (r.status === 404) schluessel = 'mikesch.schlaeft';   // Dienst ohne den Weg
    } catch { /* offline: bleibt „stumm" */ }

    denkt.remove();
    if (antwort) {
      verlauf.push({ wer: 'mikesch', text: antwort });
      zeigeZug('mikesch', antwort);
    } else {
      // Die Frage bleibt nicht im Verlauf stehen: Ohne Antwort darauf
      // waeren sonst zwei Gastzuege hintereinander, und die lehnt der Dienst ab.
      verlauf.pop();
      zeigeZug('mikesch', t(schluessel), { fehler: true });
    }
    wartet = false;
    senden.disabled = false;
  }

  function passeFeldAn() {
    feld.style.setProperty('height', 'auto');
    feld.style.setProperty('height', Math.min(feld.scrollHeight, 128) + 'px');
    feld.style.setProperty('overflow-y', feld.scrollHeight > 128 ? 'auto' : 'hidden');
  }
  feld.addEventListener('input', passeFeldAn);
  feld.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); eingabe.requestSubmit(); }
  });
  eingabe.addEventListener('submit', (e) => { e.preventDefault(); frage(feld.value); });

  // ── Schnurrpost ──
  postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!postHaken.checked || !postMail.validity.valid) { postStand.textContent = t('mikesch.post.fehler'); return; }
    postKnopf.disabled = true;
    let s = 'mikesch.post.fehler';
    try {
      const r = await schicke('rundbrief/anmelden', { mail: postMail.value, sprache: sprache(), einwilligung: true });
      if (r.status === 204) s = 'mikesch.post.danke';
      else if (r.status === 429) s = 'mikesch.post.zuviel';
    } catch { /* bleibt Fehler */ }
    postStand.textContent = t(s);
    postKnopf.disabled = false;
    if (s === 'mikesch.post.danke') { postMail.value = ''; postHaken.checked = false; }
  });

  // ── Links aus der Mail ──
  /*
   Bestaetigen und Abmelden kommen als `#schnurrpost=…` bzw.
   `#schnurrpost-ab=…`. Das Fragment verlaesst den Browser nie von selbst;
   hier wird es einmal per POST eingeloest und dann aus der Adresszeile
   genommen, damit es weder im Verlauf noch beim Teilen weiterwandert.
  */
  async function loeseEin() {
    const m = location.hash.match(/^#schnurrpost(-ab)?=([0-9a-f]{32}\.[A-Za-z0-9_-]{32})$/);
    if (!m) return false;
    history.replaceState(null, '', location.pathname + location.search);
    const ab = Boolean(m[1]);
    let s = ab ? 'mikesch.post.abFehler' : 'mikesch.post.ungueltig';
    try {
      const r = await schicke(ab ? 'rundbrief/abmelden' : 'rundbrief/bestaetigen', { marke: m[2] });
      if (r.status === 204) s = ab ? 'mikesch.post.abgemeldet' : 'mikesch.post.bestaetigt';
      else if (r.status === 410) s = 'mikesch.post.abgelaufen';
    } catch { /* bleibt Fehler */ }
    oeffne();
    liste.replaceChildren();
    zeigeZug('mikesch', t(s), { fehler: !s.endsWith('bestaetigt') && !s.endsWith('abgemeldet') });
    return true;
  }

  // Auch wenn die Seite schon offen ist und nur das Fragment wechselt —
  // etwa weil das Postfach den Link im selben Tab oeffnet.
  addEventListener('hashchange', () => { loeseEin(); });

  // ── Auftritt ──
  loeseEin().then((eingeloest) => {
    if (eingeloest) return;
    const merker = liesMerker();
    if (merker === 'weg') {
      zustand('weg');
      kopf.setAttribute('aria-label', t('mikesch.zurueck.aria'));
      return;
    }
    // Erst ankommen lassen: Wer die Seite oeffnet, will zuerst die Seite.
    setTimeout(() => {
      zeigeKopf({ mitGruss: merker !== 'gegruesst' });
      if (merker !== 'gegruesst') setzeMerker('gegruesst');
    }, ruhig() ? 600 : 3500);
  });
}
