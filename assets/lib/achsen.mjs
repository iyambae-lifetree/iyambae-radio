// ═══════════════════════════════════════════════════════════════════
// Filterachsen — wonach man in diesem Laden wirklich sucht
//
// Vorher filterte die Leiste nach Regal. Das war doppelt gemoppelt: Die
// Regalwand darueber tut genau das, mit Bildern und groesserer Flaeche. Zwei
// Bedienelemente fuer dieselbe Sache sind schlechter als eines.
//
// Also: Welche Frage stellt jemand, die das Regal NICHT beantwortet?
// Der Katalog gibt die Antwort selbst. Ausgezaehlt ueber 129 Sender:
//
//   ohne-werbung       80    nachts             17
//   nur-instrumental   48    regional           11
//   community          33    neunziger           8
//   mensch-am-mikro    27    lossless            5
//   live-dj            22    achtziger           4
//
// Das sind keine Genres. Das sind ANLAESSE — Musik zum Arbeiten, jemand am
// Mikrofon statt einer Abspielliste, nachts anders als tags. Wer ein Regal
// waehlt, sagt "welche Musik". Wer ein Etikett waehlt, sagt "wozu". Die
// beiden Fragen ueberschneiden sich nicht, und deshalb duerfen beide
// Bedienelemente nebeneinander stehen.
//
// Dazu die Weltregion. 29 Laender, aber 41 davon in den USA und ein langer
// Schwanz mit je einem Sender — als Chipreihe waere das unbrauchbar. In fuenf
// Regionen gebuendelt traegt es: Europa 61, Nordamerika 42, Asien 15,
// Lateinamerika 7, Afrika 4.
// ═══════════════════════════════════════════════════════════════════

import { t } from './sprache.mjs';

/*
 Laenderkennzeichen nach Region.

 Zwei Zuordnungen sind Entscheidungen, keine Geographie:
 Mexiko steht bei Lateinamerika, nicht bei Nordamerika — der Katalog fuehrt
 dort Cumbia und Salsa, und wer "Lateinamerika" waehlt, sucht genau das.
 Die Tuerkei steht bei Asien; sie liegt auf beiden Seiten, aber der eine
 Sender im Katalog sendet aus Istanbul.
*/
export const REGIONEN = {
  europa:        ['DE', 'GB', 'FR', 'RU', 'ES', 'IT', 'CH', 'AT', 'FI', 'BE',
                  'HR', 'UA', 'RO', 'GR', 'NL', 'SE', 'NO', 'DK', 'PL', 'PT',
                  'CZ', 'HU', 'IE', 'IS', 'EE', 'LV', 'LT', 'SI', 'SK', 'RS', 'BG'],
  nordamerika:   ['US', 'CA'],
  lateinamerika: ['MX', 'PE', 'CO', 'VE', 'BO', 'AR', 'CL', 'BR', 'UY', 'EC',
                  'CR', 'CU', 'DO', 'GT', 'PA', 'PY'],
  asien:         ['JP', 'KR', 'AZ', 'TR', 'CN', 'TW', 'HK', 'TH', 'VN', 'IN',
                  'ID', 'PH', 'SG', 'MY', 'IL', 'AE', 'SA', 'LB'],
  afrika:        ['GH', 'NG', 'MA', 'SN', 'ZA', 'EG', 'KE', 'TN', 'DZ', 'ET',
                  'CI', 'CM', 'ML', 'BF'],
};

const REGION_VON_LAND = new Map();
for (const [region, laender] of Object.entries(REGIONEN)) {
  for (const l of laender) REGION_VON_LAND.set(l, region);
}

/** In welcher Region ein Sender steht — oder null, wenn das Land fehlt. */
export function regionVon(sender) {
  return REGION_VON_LAND.get((sender?.land ?? '').toUpperCase()) ?? null;
}

/*
 Die Klangstufen. Zwei, nicht fuenf.

 "verlustfrei & Opus" trennt die 11 Sender, bei denen kein Ton verlorengeht
 oder das Format bei gleicher Datenrate deutlich besser klingt. "ab 256" ist
 die Schwelle, ab der auch MP3 fuer die meisten Ohren unauffaellig wird.
 Feiner abzustufen hiesse, Chips fuer Unterschiede zu bauen, die man nicht
 hoert.
*/
export const GUETE = {
  verlustfrei: (x) => ['flac', 'opus', 'vorbis'].includes(x.codec),
  hoch:        (x) => ['flac', 'opus', 'vorbis'].includes(x.codec) || (x.bitrate ?? 0) >= 256,
};

/*
 Beschriftung eines Etiketts.

 In den Daten steht ein Bindestrich-Kuerzel (ohne-werbung), weil das ein
 stabiler Schluessel ist und uebersetzt werden muss. Faellt die Uebersetzung
 aus, erscheint das Kuerzel mit Leerzeichen statt eines nackten Schluessels —
 lesbar bleibt es dann immer noch.
*/
export function etikettName(kuerzel) {
  const text = t('etikett.' + kuerzel);
  return text === 'etikett.' + kuerzel ? kuerzel.replace(/-/g, ' ') : text;
}

export function regionName(id) {
  const text = t('region.' + id);
  return text === 'region.' + id ? id : text;
}

/*
 Welche Etiketten in der schlanken Leiste stehen und welche erst im Panel.

 Nicht nach Haeufigkeit sortiert, sondern danach, wie oft die Frage gestellt
 wird. "ohne Werbung" ist der haeufigste Grund, ein Webradio ueberhaupt zu
 suchen. "instrumental" ist der haeufigste Grund, eins waehrend der Arbeit
 laufen zu lassen. "nachts" ist die eine Angabe, die von der Uhrzeit abhaengt
 und deshalb genau dann gebraucht wird, wenn sie zutrifft.

 Der Rest steht im Panel. Nichts wird abgeschnitten oder versteckt — der
 Knopf sagt, wie viele Filter es insgesamt gibt.
*/
export const SCHNELL = ['ohne-werbung', 'nur-instrumental', 'nachts'];

/*
 Der Filterzustand — und warum jede Achse eine MENGE ist.

 Vorher hielt jede Achse genau einen Wert; ein zweiter Klick warf den ersten
 weg. Das ist bei Regalen richtig (ein Sender steht in genau einem Fach),
 bei Etiketten aber falsch: "ohne Werbung UND instrumental" ist eine voellig
 normale Frage, und die alte Fassung konnte sie nicht stellen.

 Innerhalb einer Achse gilt UND, nicht ODER. Wer zwei Etiketten waehlt, will
 Sender, die beides sind — sonst waere jeder zusaetzliche Klick eine
 Erweiterung, und der Filter wuerde beim Filtern mehr statt weniger zeigen.
 Bei den Regionen gilt ODER, weil ein Sender nur an einem Ort stehen kann.
*/
export function leererFilter() {
  return {
    guete: null,          // 'verlustfrei' | 'hoch' | null — hoechstens eine Stufe
    regal: null,          // kommt aus der Regalwand, nicht aus der Leiste
    etiketten: new Set(),
    regionen: new Set(),
    nurGemerkte: false,
    suche: '',
  };
}

/** Wie viele Achsen gerade greifen — die Zahl am Filterknopf. */
export function anzahlAktiv(f) {
  return (f.guete ? 1 : 0) + (f.regal ? 1 : 0) + f.etiketten.size
       + f.regionen.size + (f.nurGemerkte ? 1 : 0) + (f.suche.trim() ? 1 : 0);
}

export function istGefiltert(f) {
  return anzahlAktiv(f) > 0;
}

/**
 * Die eine Stelle, an der gefiltert wird.
 * @param {object[]} sender
 * @param {object} f       Filterzustand
 * @param {(id: string) => boolean} istFavorit
 */
export function wendeAn(sender, f, istFavorit) {
  const gueteTest = f.guete ? GUETE[f.guete] : null;
  const suchtext = f.suche.toLowerCase().trim();

  const suchTest = (x) =>
    x.name.toLowerCase().includes(suchtext) ||
    (x.betreiber ?? '').toLowerCase().includes(suchtext) ||
    (x.ort ?? '').toLowerCase().includes(suchtext) ||
    (x.land ?? '').toLowerCase().includes(suchtext) ||
    (x.kaertchen ?? '').toLowerCase().includes(suchtext) ||
    (x.etiketten ?? []).some(e => e.toLowerCase().includes(suchtext));

  return sender.filter(x =>
    (!gueteTest || gueteTest(x)) &&
    (!f.regal || x.regal === f.regal) &&
    (!f.etiketten.size || [...f.etiketten].every(e => (x.etiketten ?? []).includes(e))) &&
    (!f.regionen.size || f.regionen.has(regionVon(x))) &&
    (!f.nurGemerkte || istFavorit(x.id)) &&
    (!suchtext || suchTest(x)));
}

/*
 Wie viele Sender ein einzelner Chip noch uebrig liesse, WENN man ihn
 zusaetzlich anklickt.

 Eine feste Gesamtzahl am Chip ("instrumental 48") ist eine Luege, sobald ein
 anderer Filter greift: Neben "verlustfrei" sind es dann vielleicht drei. Ein
 Chip, der 48 verspricht und 3 liefert, ist schlechter als einer ohne Zahl.
 Deshalb wird die Zahl bei jedem Filterwechsel neu gerechnet — und eine Null
 macht den Chip stumpf, statt ihn in eine leere Ansicht laufen zu lassen.
*/
export function vorschau(sender, f, istFavorit, achse, wert) {
  const probe = {
    ...f,
    etiketten: new Set(f.etiketten),
    regionen: new Set(f.regionen),
  };
  if (achse === 'etikett') probe.etiketten.add(wert);
  else if (achse === 'region') probe.regionen.add(wert);
  else if (achse === 'guete') probe.guete = wert;
  else if (achse === 'gemerkte') probe.nurGemerkte = true;
  return wendeAn(sender, probe, istFavorit).length;
}
