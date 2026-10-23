/*
  Mailversand ueber Azure Communication Services — mit Warteschlange.

  ── Warum eine Warteschlange und nicht einfach senden ───────────────

  Die Zahlen stehen in infra/konto.bicep.entwurf und sind Microsofts, nicht
  unsere: Fuer eine eigene Absenderdomaene gelten ab Werk 30 Mails je MINUTE
  und 100 je STUNDE — und zwar JE ABONNEMENT, nicht je Ressource. Das traegt
  den Schnitt von 20.000 Mails im Monat locker (rund 28 je Stunde). Es traegt
  keine SPITZE.

  Und Spitzen sind genau das, was bei einer Anmeldung passiert: Ein Beitrag
  wird geteilt, zweihundert Leute melden sich in zehn Minuten an. Ohne
  Warteschlange bekaemen die ersten dreissig ihre Mail und der Rest ein 429
  aus dem Nichts — nur sieht er das nicht, denn /api/anmelden antwortet
  IMMER 204. Er wartet auf eine Mail, die nie kommt.

  Mit Warteschlange bekommt er sie ein paar Minuten spaeter. Das ist der
  Unterschied zwischen langsam und kaputt.

  ── Warum kein Timer im Sekundentakt ────────────────────────────────

  Der Ausleerer laeuft NUR, solange etwas in der Schlange liegt. Ist sie
  leer, gibt es keinen Timer, keine Schleife, keinen Weckruf. Das ist
  Voraussetzung fuer die Leerlaufabrechnung von Container Apps (unter 0,01
  vCPU UND unter 1.000 Byte je Sekunde) — ein Wecker je Sekunde reisst beide
  Grenzen und verdreifacht die Rechnung.

  ── Was passiert, wenn die Schlange voll ist ────────────────────────

  Dann wird die AELTESTE Mail verworfen, nicht die neueste. Eine Mail, die
  seit zwanzig Minuten wartet, hilft niemandem mehr — der Einmalcode darin
  ist ohnehin fast abgelaufen, und der Mensch hat es laengst noch einmal
  versucht. Die neueste Anforderung ist die, auf die gerade jemand schaut.
  Verworfen wird mit einer Protokollzeile, damit es nicht still passiert.
*/

import { protokolliere } from './protokoll.mjs';

const JE_MINUTE = Number(process.env.MAIL_JE_MINUTE ?? 25);
const JE_STUNDE = Number(process.env.MAIL_JE_STUNDE ?? 90);
const SCHLANGE_MAX = Number(process.env.MAIL_WARTESCHLANGE ?? 500);

/*
  Bewusst unter Microsofts 30 und 100. Die Grenze gilt je ABONNEMENT — wenn
  dort eines Tages ein zweiter Dienst mitsendet, ist der Puffer der Grund,
  warum nicht beide gleichzeitig ausfallen.
*/

// ── Die Texte ───────────────────────────────────────────────────────

/*
  DIE EINZIGE STELLE IM DIENST MIT ECHTEN UMLAUTEN, und sie ist eine
  Ausnahme mit Ansage. Ueberall sonst steht hier „ue", „ae", „oe" — das ist
  Quelltext, den Werkzeuge, Terminals und Unterschiede lesen. Was hier steht,
  liest ein MENSCH in seinem Postfach. „Ihr Anmeldecode fuer IYAMBAE FM"
  sieht dort nach einem kaputten Zeichensatz aus, und eine Mail, die kaputt
  aussieht, sieht nach Betrug aus — ausgerechnet die eine Mail, bei der es
  auf Vertrauen ankommt.

  Wer diese Datei anfasst, achtet auf die Kodierung: UTF-8, ohne BOM.

  Nur Deutsch und Englisch. Die Webseite kann sieben Sprachen; ihr Katalog
  liegt in assets/lib/sprache.mjs und gehoert nicht in diesen Dienst kopiert
  — zwei Kataloge laufen auseinander. Die fehlenden fuenf stehen als offener
  Punkt im README.
*/
const TEXTE = {
    de: {
        code: {
            betreff: (code) => code + ' — Ihr Anmeldecode für IYAMBAE FM',
            text: (code, minuten) =>
                'Ihr Anmeldecode lautet:\n\n    ' + code + '\n\n'
                + 'Er gilt ' + minuten + ' Minuten und nur einmal.\n\n'
                + 'Wenn Sie sich nicht anmelden wollten, können Sie diese Nachricht '
                + 'ignorieren. Der Code allein genügt niemandem, der Ihr Postfach '
                + 'nicht lesen kann.\n\n'
                + 'Fragen? Antworten Sie nicht auf diese Nachricht — sie wird nicht '
                + 'gelesen. Schreiben Sie an hallo@iyambae.fm.\n\nIYAMBAE FM',
        },
        marke: {
            betreff: () => 'Neues Passwort für IYAMBAE FM',
            text: (verweis, minuten) =>
                'Sie können hier ein neues Passwort setzen:\n\n    ' + verweis + '\n\n'
                + 'Der Link gilt ' + minuten + ' Minuten und nur einmal.\n\n'
                + 'Wenn Sie das nicht angefordert haben, ist nichts passiert: Ihr '
                + 'bisheriges Passwort gilt unverändert weiter, solange dieser Link '
                + 'nicht benutzt wird.\n\nIYAMBAE FM',
        },
        unbekannt: {
            betreff: () => 'Neues Passwort für IYAMBAE FM',
            text: () =>
                'Jemand hat für diese Adresse ein neues Passwort bei IYAMBAE FM '
                + 'angefordert. Zu dieser Adresse gibt es hier kein Konto — es gibt '
                + 'also auch nichts zurückzusetzen.\n\n'
                + 'Wenn Sie das selbst waren: Vielleicht haben Sie sich mit einer '
                + 'anderen Adresse angemeldet.\n\n'
                + 'Wenn nicht, müssen Sie nichts tun.\n\nIYAMBAE FM',
        },
    },
    en: {
        code: {
            betreff: (code) => code + ' — your IYAMBAE FM sign-in code',
            text: (code, minuten) =>
                'Your sign-in code is:\n\n    ' + code + '\n\n'
                + 'It is valid for ' + minuten + ' minutes and can be used once.\n\n'
                + 'If you did not try to sign in, you can ignore this message.\n\n'
                + 'Questions? Do not reply to this message. Write to hallo@iyambae.fm.\n\n'
                + 'IYAMBAE FM',
        },
        marke: {
            betreff: () => 'A new password for IYAMBAE FM',
            text: (verweis, minuten) =>
                'You can set a new password here:\n\n    ' + verweis + '\n\n'
                + 'The link is valid for ' + minuten + ' minutes and can be used once.\n\n'
                + 'If you did not ask for this, nothing has happened: your existing '
                + 'password keeps working as long as this link goes unused.\n\nIYAMBAE FM',
        },
        unbekannt: {
            betreff: () => 'A new password for IYAMBAE FM',
            text: () =>
                'Someone asked for a new IYAMBAE FM password for this address. There '
                + 'is no account here for it, so there is nothing to reset.\n\n'
                + 'If that was you, you may have signed up with a different address.\n\n'
                + 'If it was not, there is nothing you need to do.\n\nIYAMBAE FM',
        },
    },
};

/*
  Die Bestaetigung fuer Mikeschs Schnurrpost — in ALLEN sieben Sprachen,
  anders als die Kontomails darueber. Der Rundbrief wird je Sprache
  verschickt; wer sich auf /ja/ anmeldet, liest ihn auf Japanisch, und die
  erste Mail davon darf nicht die einzige auf Englisch sein.

  Die Mail sagt, was der Klick bedeutet, und was passiert, wenn man nicht
  klickt: nichts. Das ist der Teil, auf den es bei einer doppelten
  Bestaetigung ankommt.
*/
const RUNDBRIEF = {
    de: {
        betreff: 'Bitte bestätigen: Mikeschs Schnurrpost',
        text: (v, h) => 'Miau! Jemand — hoffentlich du — möchte Mikeschs Schnurrpost von IYAMBAE FM bekommen: '
            + 'ab und zu neue Sender im Laden und Neues vom IYAMBAE Tuner.\n\n'
            + 'Ein Klick, und du bist dabei:\n\n    ' + v + '\n\n'
            + 'Der Link gilt ' + h + ' Stunden. Klickst du nicht, passiert nichts: Du bekommst keine weitere Mail, '
            + 'und deine Adresse wird nach einer Woche gelöscht. Abmelden geht jederzeit über den Link in jeder Ausgabe.\n\n'
            + 'Kater Mikesch und IYAMBAE FM',
    },
    en: {
        betreff: 'Please confirm: Mikesch\'s Purr Post',
        text: (v, h) => 'Meow! Someone — hopefully you — would like to receive Mikesch\'s Purr Post from IYAMBAE FM: '
            + 'new stations in the shop now and then, and news about the IYAMBAE Tuner.\n\n'
            + 'One click and you are in:\n\n    ' + v + '\n\n'
            + 'The link is valid for ' + h + ' hours. If you do not click it, nothing happens: you will get no further mail, '
            + 'and your address is deleted after a week. You can unsubscribe at any time with the link in every issue.\n\n'
            + 'Mikesch the cat and IYAMBAE FM',
    },
    fr: {
        betreff: 'Merci de confirmer : la Ronron-Poste de Mikesch',
        text: (v, h) => 'Miaou ! Quelqu\'un — toi, j\'espère — souhaite recevoir la Ronron-Poste de Mikesch d\'IYAMBAE FM : '
            + 'de temps en temps de nouvelles stations et des nouvelles de l\'IYAMBAE Tuner.\n\n'
            + 'Un clic et c\'est fait :\n\n    ' + v + '\n\n'
            + 'Le lien est valable ' + h + ' heures. Si tu ne cliques pas, il ne se passe rien : aucun autre e-mail, '
            + 'et ton adresse est effacée au bout d\'une semaine. Désinscription à tout moment via le lien présent dans chaque numéro.\n\n'
            + 'Le chat Mikesch et IYAMBAE FM',
    },
    es: {
        betreff: 'Confirma, por favor: el Ronroneo de Mikesch',
        text: (v, h) => '¡Miau! Alguien — ojalá tú — quiere recibir el Ronroneo de Mikesch de IYAMBAE FM: '
            + 'de vez en cuando emisoras nuevas en la tienda y novedades del IYAMBAE Tuner.\n\n'
            + 'Un clic y estás dentro:\n\n    ' + v + '\n\n'
            + 'El enlace vale ' + h + ' horas. Si no haces clic, no pasa nada: no recibirás más correos '
            + 'y tu dirección se borra al cabo de una semana. Puedes darte de baja cuando quieras con el enlace de cada número.\n\n'
            + 'El gato Mikesch e IYAMBAE FM',
    },
    it: {
        betreff: 'Conferma, per favore: le Fusa di Mikesch',
        text: (v, h) => 'Miao! Qualcuno — speriamo tu — vuole ricevere le Fusa di Mikesch da IYAMBAE FM: '
            + 'ogni tanto nuove stazioni nel negozio e novità sull\'IYAMBAE Tuner.\n\n'
            + 'Un clic e ci sei:\n\n    ' + v + '\n\n'
            + 'Il link vale ' + h + ' ore. Se non clicchi, non succede nulla: nessun\'altra e-mail, '
            + 'e il tuo indirizzo viene cancellato dopo una settimana. Puoi disiscriverti in qualsiasi momento con il link in ogni numero.\n\n'
            + 'Il gatto Mikesch e IYAMBAE FM',
    },
    ja: {
        betreff: '確認のお願い：ミケシュのゴロゴロ便り',
        text: (v, h) => 'にゃあ！ どなたか（きっとあなた）が IYAMBAE FM の「ミケシュのゴロゴロ便り」の受け取りを希望しました。'
            + 'ときどき、お店の新しい局と IYAMBAE Tuner のお知らせをお届けします。\n\n'
            + 'クリックひとつで登録完了です：\n\n    ' + v + '\n\n'
            + 'リンクの有効期限は ' + h + ' 時間です。クリックしなければ何も起きません。これ以上メールは届かず、'
            + 'アドレスは1週間後に削除されます。配信停止は毎号のリンクからいつでもできます。\n\n'
            + '猫のミケシュと IYAMBAE FM',
    },
    ar: {
        betreff: 'يرجى التأكيد: خرخرة ميكش',
        text: (v, h) => 'مياو! شخص ما — ونأمل أنه أنت — يرغب في تلقي «خرخرة ميكش» من IYAMBAE FM: '
            + 'محطات جديدة في المتجر من حين لآخر وأخبار عن IYAMBAE Tuner.\n\n'
            + 'نقرة واحدة وتصبح معنا:\n\n    ' + v + '\n\n'
            + 'الرابط صالح لمدة ' + h + ' ساعة. إن لم تنقر فلن يحدث شيء: لن تصلك رسائل أخرى، '
            + 'وسيُحذف عنوانك بعد أسبوع. يمكنك إلغاء الاشتراك في أي وقت عبر الرابط في كل عدد.\n\n'
            + 'القط ميكش و IYAMBAE FM',
    },
};

function texte(sprache) {
    return TEXTE[sprache] ?? TEXTE.en;
}

// ── Der Versender ───────────────────────────────────────────────────

/**
 * @param {object} o
 * @param {string} [o.endpunkt]  ACS-Endpunkt; fehlt er, wird auf die Konsole
 *                               geschrieben (nur oertlich, siehe README)
 * @param {string} [o.absender]  volle Absenderadresse
 * @param {Function} [o.jetzt]   fuer Tests
 */
export function erzeugeVersender({ endpunkt, absender, jetzt = Date.now, versendeRoh } = {}) {
    const schlange = [];
    let klient = null;
    let laeuft = false;
    let wecker = null;
    let pauseBis = 0;

    // Zwei Zeitfenster, beide als einfache Zeitstempellisten. Bei
    // hoechstens 90 Eintraegen je Stunde ist das billiger als jeder
    // Eimer-Algorithmus und leichter zu lesen.
    const gesendetMinute = [];
    const gesendetStunde = [];

    async function holeKlient() {
        if (klient) return klient;
        const { EmailClient } = await import('@azure/communication-email');
        const { DefaultAzureCredential } = await import('@azure/identity');
        klient = new EmailClient(endpunkt, new DefaultAzureCredential());
        return klient;
    }

    function beschneide(liste, fenster, nun) {
        while (liste.length && nun - liste[0] > fenster) liste.shift();
    }

    /** Wie lange muss gewartet werden, bis die naechste Mail raus darf? */
    function wartezeit(nun) {
        if (pauseBis > nun) return pauseBis - nun;
        beschneide(gesendetMinute, 60_000, nun);
        beschneide(gesendetStunde, 3_600_000, nun);
        if (gesendetMinute.length >= JE_MINUTE) return 60_000 - (nun - gesendetMinute[0]) + 50;
        if (gesendetStunde.length >= JE_STUNDE) return 3_600_000 - (nun - gesendetStunde[0]) + 50;
        return 0;
    }

    async function versendeEinen(auftrag) {
        const t = texte(auftrag.sprache);
        /*
          `unbekannt` ist die Mail an eine Adresse, zu der es kein Konto
          gibt. Sie muss es geben, damit /api/passwort/vergessen fuer
          bekannt und unbekannt dieselbe Arbeit tut — sonst waere das
          Ausbleiben einer Mail die Antwort auf die Frage, die der Endpunkt
          nicht beantworten soll. Und sie ist nicht bloss ein Feigenblatt:
          Wer sie bekommt, erfaehrt, dass jemand seine Adresse eingetippt
          hat, und das ist eine Auskunft, die ihm zusteht.
        */
        const brief = RUNDBRIEF[auftrag.sprache] ?? RUNDBRIEF.en;
        const inhalt = auftrag.art === 'rundbrief'
            ? { subject: brief.betreff, plainText: brief.text(auftrag.verweis, auftrag.stunden) }
            : auftrag.art === 'code'
            ? { subject: t.code.betreff(auftrag.code), plainText: t.code.text(auftrag.code, auftrag.minuten) }
            : auftrag.art === 'unbekannt'
                ? { subject: t.unbekannt.betreff(), plainText: t.unbekannt.text() }
                : { subject: t.marke.betreff(), plainText: t.marke.text(auftrag.verweis, auftrag.minuten) };

        if (versendeRoh) return versendeRoh({ an: auftrag.an, ...inhalt });

        if (!endpunkt) {
            /*
              Oertlicher Notbehelf. Er schreibt den CODE IM KLARTEXT auf die
              Konsole und ist damit genau das, was Regel 9 verbietet —
              deshalb steht er hinter einer eigenen Umgebungsvariablen, nicht
              hinter „Endpunkt fehlt zufaellig". Gegen Azure wird dieser
              Zweig nie erreicht, weil ACS_ENDPUNKT dort gesetzt ist.
            */
            if (process.env.MAIL_ART !== 'konsole') {
                /*
                  Fehlende Einstellungen sind KEIN voruebergehender Fehler.
                  Ohne diese Markierung wiederholte die Schlange den
                  Versuch zweimal und schriebe drei Zeilen ins Protokoll,
                  die alle dasselbe sagen — und die einzige Zeile, die
                  hilft („hier ist nichts eingestellt"), ginge darin unter.
                */
                const fehler = new Error('kein ACS_ENDPUNKT und MAIL_ART ist nicht konsole');
                fehler.endgueltig = true;
                throw fehler;
            }
            process.stdout.write('--- MAIL (nur oertlich) ---\n'
                + 'An: ' + auftrag.an + '\n' + inhalt.subject + '\n' + inhalt.plainText + '\n---\n');
            return;
        }

        const c = await holeKlient();
        /*
          `beginSend` stellt die Anfrage und liefert einen Abfrager zurueck.
          Auf `pollUntilDone` wird ABSICHTLICH verzichtet: Das waere eine
          Abfrageschleife je Mail, also genau die Grundlast, die es hier
          nicht geben darf. Ob eine Mail angekommen ist, sagt der
          Zustellbericht von ACS, nicht dieser Dienst.
        */
        await c.beginSend({
            senderAddress: absender,
            content: inhalt,
            recipients: { to: [{ address: auftrag.an }] },
        });
    }

    async function leere() {
        if (laeuft) return;
        laeuft = true;
        try {
            while (schlange.length) {
                const nun = jetzt();
                const warten = wartezeit(nun);
                if (warten > 0) {
                    plane(warten);
                    return;
                }
                const auftrag = schlange.shift();
                const start = Date.now();
                try {
                    await versendeEinen(auftrag);
                    gesendetMinute.push(jetzt());
                    gesendetStunde.push(jetzt());
                    protokolliere({
                        art: 'mail.gesendet', ergebnis: 'ok', grund: auftrag.art,
                        dauer: Date.now() - start, wartend: schlange.length,
                    });
                } catch (fehler) {
                    /*
                      429 von ACS heisst: Grenze erreicht, und ACS sagt in
                      Retry-After, wie lange. Der Auftrag geht vorn zurueck
                      in die Schlange — er ist nicht verloren, nur verspaetet.
                    */
                    if (fehler?.statusCode === 429) {
                        const sekunden = Number(fehler?.response?.headers?.get?.('retry-after')) || 60;
                        pauseBis = jetzt() + sekunden * 1000;
                        schlange.unshift(auftrag);
                        protokolliere({
                            art: 'mail.gedrosselt', ergebnis: 'gedrosselt', dienst: 'acs',
                            wartend: schlange.length,
                        });
                        plane(sekunden * 1000);
                        return;
                    }
                    if (!fehler?.endgueltig && (auftrag.versuche ?? 0) < 2) {
                        auftrag.versuche = (auftrag.versuche ?? 0) + 1;
                        schlange.push(auftrag);
                        protokolliere({
                            art: 'mail.wiederholung', ergebnis: 'fehler', dienst: 'acs',
                            versuch: auftrag.versuche,
                        });
                    } else {
                        protokolliere({
                            art: 'mail.aufgegeben', ergebnis: 'fehler', dienst: 'acs',
                            grund: fehler?.endgueltig ? 'nicht_eingerichtet'
                                : String(fehler?.statusCode ?? fehler?.code ?? 'unbekannt'),
                        });
                    }
                }
            }
        } finally {
            laeuft = false;
        }
    }

    function plane(ms) {
        laeuft = false;
        if (wecker) return;
        /*
          Ein einziger Wecker, und nur solange etwas wartet. `unref` sorgt
          dafuer, dass er einen Neustart nicht aufhaelt: Eine Mail, die noch
          in der Schlange liegt, ist beim Herunterfahren verloren — das ist
          hinnehmbar und steht im README. Ein Prozess, der wegen einer
          wartenden Mail nicht enden kann, ist es nicht.
        */
        wecker = setTimeout(() => {
            wecker = null;
            leere();
        }, Math.min(ms, 60_000));
        wecker.unref?.();
    }

    return {
        /** Nur fuer Tests und fuer /api/leben: wie lang ist die Schlange? */
        zustand: () => ({ wartend: schlange.length, pausiert: pauseBis > jetzt() }),

        /**
         * Reiht eine Mail ein und kehrt SOFORT zurueck. Der Aufrufer wartet
         * nie auf ACS — /api/anmelden muss in gleichbleibender Zeit
         * antworten, egal ob die Adresse bekannt ist und egal wie es dem
         * Mailversand gerade geht.
         */
        reiheEin(auftrag) {
            if (schlange.length >= SCHLANGE_MAX) {
                schlange.shift();
                protokolliere({ art: 'mail.verworfen', ergebnis: 'fehler', wartend: schlange.length });
            }
            schlange.push(auftrag);
            queueMicrotask(leere);
            return true;
        },
    };
}
