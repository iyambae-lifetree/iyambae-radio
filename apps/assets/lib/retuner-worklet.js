/*
 Der Signalkern des IYAMBAE Tuners im Audio-Thread des Browsers.

 Dieselben Quelldateien, die auf dem Mac das Systemaudio umstimmen, hier als
 WebAssembly. Damit rät die Seite nicht mehr: `playbackRate` ändert Tonhöhe
 *und* Tempo — ein Stück läuft dabei 1,8 % langsamer. Der Signalkern ändert
 nur die Tonhöhe.

 ── ZWEI ENGINES, SEIT DEM 30.08.2026 ──────────────────────────────

 Bis dahin lag hier nur die schnelle Delay-Line, und sie lief mit
 `delayFrames = 128`. Sāmi-Ra hörte, was dabei herauskommt, und fragte, ob
 in dem Beispielstück binaurale Beats oder isochrone Töne steckten.

 Steckten sie nicht. Es war die Engine. Gemessen an einem reinen Ton bei
 dieser Einstellung:

     delayFrames   Welligkeit   Pulsfrequenz
        128          7,89 dB      12,55 Hz     ← was die Seite spielte
       2048          2,73 dB       0,80 Hz

 Ein Ton, der 12,5-mal je Sekunde um fast 8 dB an- und abschwillt, IST ein
 isochroner Ton. Seine Frage war keine Vermutung ins Blaue, sondern eine
 richtige Diagnose.

 Der Grund steht im Quelltext der Engine selbst: Bei der voreingestellten
 Überblendbreite 0,5 tragen beide Leseköpfe immer bei, also liegt durchgehend
 ein Kammfilter aus zwei Kopien über dem Signal — und der wandert, weil die
 Köpfe wandern. Je kürzer die Verzögerungsstrecke, desto schneller wandert er.

 Deshalb spielt die Probe jetzt über `gut` — Signalsmith Stretch, auf dem Mac
 „High Quality". Sie kostet 240 ms Verzögerung; für ein Stück, das man anhört,
 ohne dazu ein Bild zu sehen, kostet das nichts.

 `schnell` bleibt erreichbar. Nicht als Notnagel, sondern weil sie das ist,
 was der Tuner nimmt, wenn Ton und Bild zusammenpassen müssen.

 ── DIE REGELN IM AUDIO-THREAD ─────────────────────────────────────

 Regeln in `process()` sind dieselben wie im IOProc auf dem Mac: nichts
 allozieren, nichts sperren, nichts ausgeben. Deshalb entstehen alle Puffer
 und Sichten einmal beim Aufbau — und deshalb ist das Modul mit
 ALLOW_MEMORY_GROWTH=0 gebaut: Wächst der Speicher, werden alle
 Float32Array-Sichten darauf ungültig, und man müsste sie in jedem Block neu
 anlegen. Genau das soll hier nicht passieren.

 NEU UND NICHT WEGZULASSEN: `_initialize()`. Die gute Engine ist C++, und
 ihre statischen Konstruktoren laufen sonst nie.

 ── VIER STUMMEL, DIE DAS MODUL VERLANGT ───────────────────────────

 Bis zum 30.08.2026 kam das Modul ohne einen einzigen Import aus, und der
 Bauskript-Kommentar war stolz darauf. Mit C++ geht das nicht mehr: Die
 Standardbibliothek zieht vier WASI-Aufrufe herein.

   random_get   Signalsmith wuerfelt beim Anlegen Phasen aus. Hier reicht
                ein Xorshift — es geht um Klang, nicht um Geheimnisse, und
                `crypto` gibt es im AudioWorkletGlobalScope ohnehin nicht.
   fd_write     } Kommen aus den Abbruchpfaden von libc++ und werden nie
   fd_seek      } gerufen. Sie sind trotzdem da, weil ein fehlender Import
   fd_close     } das ganze Modul unbrauchbar macht, nicht bloss den Pfad.

 Bewusst KEIN echtes Schreiben: Was hier ausgegeben wuerde, saehe ohnehin
 niemand, und im Audio-Thread hat Ausgabe nichts verloren.
*/

const QUANTUM = 128;        // Renderquantum der Web Audio API
const MAX_KANAELE = 2;

class RetunerProzessor extends AudioWorkletProcessor {

    static get parameterDescriptors() {
        return [{
            name: 'faktor',
            defaultValue: 1.0,
            minValue: 0.5,
            maxValue: 2.0,
            automationRate: 'k-rate',   // ein Wert je Block genügt
        }];
    }

    constructor() {
        super();
        this.bereit = false;
        this.gut = false;
        this.engine = 0;
        this.letzterFaktor = 1.0;

        this.port.onmessage = (e) => {
            if (e.data?.art === 'wasm') this._starte(e.data);
            else if (e.data?.art === 'bypass' && this.bereit) {
                if (this.gut) this.x.rt_stretch_set_bypass(this.engine, e.data.an ? 1 : 0);
                else          this.x.rt_engine_set_bypass(this.engine, e.data.an ? 1 : 0);
            }
        };
    }

    _stummel() {
        let z = 0x9E3779B9 | 0;
        const speicher = () => this.x.memory.buffer;
        return { wasi_snapshot_preview1: {
            random_get: (zeiger, laenge) => {
                const m = new Uint8Array(speicher(), zeiger, laenge);
                for (let i = 0; i < laenge; i++) {
                    z ^= z << 13; z ^= z >>> 17; z ^= z << 5; z |= 0;
                    m[i] = z & 0xff;
                }
                return 0;
            },
            fd_close: () => 0,
            fd_seek:  () => 0,
            fd_write: (fd, iovs, anzahl, hinaus) => {
                // Nichts schreiben, aber die volle Laenge melden: Wer sonst
                // in einer Schleife nachlegt, laeuft ewig.
                const sicht = new DataView(speicher());
                let ges = 0;
                for (let i = 0; i < anzahl; i++) ges += sicht.getUint32(iovs + i*8 + 4, true);
                sicht.setUint32(hinaus, ges, true);
                return 0;
            },
        } };
    }

    _starte({ bytes, engine, frames }) {
        try {
            const modul = new WebAssembly.Module(bytes);
            const inst = new WebAssembly.Instance(modul, this._stummel());
            this.x = inst.exports;

            // C++-Konstruktoren. Ohne das bleibt die gute Engine tot.
            if (typeof this.x._initialize === 'function') this.x._initialize();

            this.gut = engine !== 'schnell' && typeof this.x.rt_stretch_create === 'function';

            if (this.gut) {
                this.engine = this.x.rt_stretch_create(
                    sampleRate, MAX_KANAELE, QUANTUM, 0);
            } else {
                /*
                 2048 statt der frueheren 128. Bei 128 pulst der Kammfilter
                 12,5-mal je Sekunde; bei 2048 einmal in gut einer Sekunde,
                 und dann verschwindet er unter der Musik.
                */
                this.engine = this.x.rt_engine_create(sampleRate, frames || 2048);
            }
            if (!this.engine) throw new Error('Engine nicht anlegbar');

            /*
             Ein Puffer je Kanal und Richtung, einmalig. Die Sichten bleiben
             gültig, weil der Speicher nicht wachsen kann.
            */
            this.pEin = [];
            this.pAus = [];
            this.vEin = [];
            this.vAus = [];
            for (let k = 0; k < MAX_KANAELE; k++) {
                const pe = this.x.malloc(QUANTUM * 4);
                const pa = this.x.malloc(QUANTUM * 4);
                this.pEin.push(pe);
                this.pAus.push(pa);
                this.vEin.push(new Float32Array(this.x.memory.buffer, pe, QUANTUM));
                this.vAus.push(new Float32Array(this.x.memory.buffer, pa, QUANTUM));
                /*
                 Die gute Engine merkt sich die Zeiger. Einmal setzen genügt,
                 solange sie sich nicht ändern — und sie ändern sich nie.
                */
                if (this.gut) this.x.rt_stretch_set_channel(this.engine, k, pe, 1, pa, 1);
            }

            this.bereit = true;
            this.port.postMessage({
                art: 'bereit',
                engine: this.gut ? 'gut' : 'schnell',
                latenzMs: (this.gut
                    ? this.x.rt_stretch_latency_seconds(this.engine)
                    : this.x.rt_engine_latency_seconds(this.engine)) * 1000,
            });
        } catch (fehler) {
            this.port.postMessage({ art: 'fehler', text: String(fehler) });
        }
    }

    process(eingaenge, ausgaenge, parameter) {
        const ein = eingaenge[0];
        const aus = ausgaenge[0];
        if (!aus || aus.length === 0) return true;

        // Noch nicht bereit, oder keine Eingabe: unverändert durchreichen.
        if (!this.bereit || !ein || ein.length === 0) {
            for (let k = 0; k < aus.length; k++) {
                if (ein && ein[k]) aus[k].set(ein[k]);
                else aus[k].fill(0);
            }
            return true;
        }

        const faktor = parameter.faktor[0];
        if (faktor !== this.letzterFaktor) {
            if (this.gut) this.x.rt_stretch_set_factor(this.engine, faktor);
            else          this.x.rt_engine_set_factor(this.engine, faktor);
            this.letzterFaktor = faktor;
        }

        const kanaele = Math.min(ein.length, aus.length, MAX_KANAELE);

        if (this.gut) {
            /*
             Mono hinein, zwei Kanaele hinaus: Die Engine ist auf zwei Kanaele
             angelegt und rechnet beide. Der zweite bekommt dann dieselbe
             Eingabe, sonst rauscht dort der letzte Blockrest weiter.
            */
            for (let k = 0; k < MAX_KANAELE; k++)
                this.vEin[k].set(ein[Math.min(k, ein.length - 1)]);
            this.x.rt_stretch_process(this.engine, QUANTUM);
            for (let k = 0; k < kanaele; k++) aus[k].set(this.vAus[k]);
        } else {
            for (let k = 0; k < kanaele; k++) {
                this.vEin[k].set(ein[k]);
                this.x.rt_engine_process_channel(
                    this.engine, k, this.pEin[k], 1, this.pAus[k], 1, QUANTUM);
                aus[k].set(this.vAus[k]);
            }
        }
        // Mehr Ausgangs- als Eingangskanäle: den Rest still lassen.
        for (let k = kanaele; k < aus.length; k++) aus[k].fill(0);

        return true;
    }
}

registerProcessor('retuner', RetunerProzessor);
