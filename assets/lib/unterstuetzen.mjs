// ═══════════════════════════════════════════════════════════════════
// „Diesen Sender unterstützen“
//
// Viele Sender im Laden leben von ihren Hörern: SomaFM, WFMU, KEXP, Radio
// Paradise, dublab, NTS. Wer hier stundenlang Groove Salad hört, soll den
// Weg zu deren Spendenseite finden, ohne ihn suchen zu müssen. Der Laden
// sammelt dabei nichts für sich; das Geld geht direkt an den Sender.
//
// Die Adresse steht als `unterstuetzen` in data/sender.json, nur bei Sendern,
// die wirklich darum bitten, und jede ist auf der eigenen Seite des Senders
// nachgesehen (15.10.2026). Fehlt das Feld, gibt es keinen Link — eine
// geratene Adresse wäre schlimmer als keine.
//
// WARUM ALS EIGENES MODUL: Die Karten entstehen als HTML-Text. Eine Adresse
// mit Anführungszeichen bräche dort aus dem Attribut aus. `new URL` setzt
// solche Zeichen in Prozentschreibweise, und nur https kommt durch — ein
// http-Link wäre auf einer https-Seite ein Rückschritt, und `javascript:`
// darf in einem href nie stehen.
// ═══════════════════════════════════════════════════════════════════

export function unterstuetzenAdresse(sender) {
  const roh = sender?.unterstuetzen;
  if (typeof roh !== 'string' || !roh) return null;
  try {
    const url = new URL(roh);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
