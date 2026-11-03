/*
 Der Einschlaf-Timer.

 Ein Knopf neben der Lautstärke. Jeder Druck schaltet eine Stufe weiter:
 aus → 15 → 30 → 60 → 90 Minuten → aus. Ist die Zeit um, wird das Radio
 über eine halbe Minute leiser und hält dann an. Danach steht die
 Lautstärke wieder, wo sie war — wer morgens auflegt, soll nicht vor einem
 stummen Regler sitzen.

 WARUM ES IHN GIBT

 Der Filter „Zum Einschlafen" ist mit 44 Sendern einer der meistbenutzten
 Zugänge, und genau dort fehlte das Gegenstück: Wer einschläft, kann das
 Radio nicht mehr ausmachen. Jedes Uhrenradio hat diese Taste.

 WARUM EINE UHRZEIT UND KEIN COUNTDOWN-TAKT

 Browser drosseln Zeitgeber in Hintergrund-Tabs, Chrome nach fünf Minuten
 auf einmal pro Minute. Ein Takt, der Sekunden herunterzählt, ginge dort
 nach. Gemerkt wird deshalb nur der Zeitpunkt, an dem Schluss ist; jeder
 Takt rechnet von der Uhr aus neu. Kommt ein gedrosselter Takt zu spät,
 fällt das Ausblenden kürzer aus — aber das Radio hält pünktlich an.

 Nichts davon wird gespeichert: Ein Timer, der ein Neuladen überlebt,
 schaltete am nächsten Abend ein Radio aus, das niemand mehr erwartet.

 Dieses Modul kennt weder DOM noch Audio. Es rechnet nur, damit es sich
 ohne Browser prüfen lässt (Scripts/test/schlummer.test.mjs).
*/

export const STUFEN = [0, 15, 30, 60, 90];   // Minuten; 0 heißt aus
export const AUSBLENDEN_MS = 30_000;

// Die Stufe nach `minuten`. Unbekannte Werte fangen vorn wieder an.
export function naechsteStufe(minuten) {
  const i = STUFEN.indexOf(minuten);
  return STUFEN[(i + 1) % STUFEN.length];
}

/*
 Der Zustand zu einem Zeitpunkt.
   ende   — Zeitpunkt (ms), an dem Schluss ist, oder null
   jetzt  — aktuelle Zeit (ms)
 Liefert { phase, restMinuten, faktor }:
   phase       'aus' | 'laeuft' | 'blendet' | 'schluss'
   restMinuten aufgerundet, für die Anzeige
   faktor      0…1, womit die eingestellte Lautstärke malzunehmen ist
*/
export function zustand(ende, jetzt) {
  if (ende == null) return { phase: 'aus', restMinuten: 0, faktor: 1 };
  const rest = ende - jetzt;
  if (rest <= 0) return { phase: 'schluss', restMinuten: 0, faktor: 0 };
  const restMinuten = Math.ceil(rest / 60_000);
  if (rest > AUSBLENDEN_MS) return { phase: 'laeuft', restMinuten, faktor: 1 };
  return { phase: 'blendet', restMinuten, faktor: rest / AUSBLENDEN_MS };
}
