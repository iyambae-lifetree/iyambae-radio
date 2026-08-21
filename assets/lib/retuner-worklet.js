/*
 MyRetuners Signalkern im Audio-Thread des Browsers.

 Dieselbe C-Datei, die auf dem Mac das Systemaudio umstimmt, hier als
 WebAssembly. Damit rät die Seite nicht mehr: `playbackRate` ändert Tonhöhe
 *und* Tempo — ein Stück läuft dabei 1,8 % langsamer. Der Signalkern ändert
 nur die Tonhöhe.

 Regeln in `process()` sind dieselben wie im IOProc auf dem Mac: nichts
 allozieren, nichts sperren, nichts ausgeben. Deshalb entstehen alle Puffer
 und Sichten einmal beim Aufbau — und deshalb ist das Modul mit
 ALLOW_MEMORY_GROWTH=0 gebaut: Wächst der Speicher, werden alle
 Float32Array-Sichten darauf ungültig, und man müsste sie in jedem Block neu
 anlegen. Genau das soll hier nicht passieren.
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

    constructor(optionen) {
        super();
        this.bereit = false;
        this.engine = 0;
        this.letzterFaktor = 1.0;

        this.port.onmessage = (e) => {
            if (e.data?.art === 'wasm') this._starte(e.data.bytes, e.data.frames);
            else if (e.data?.art === 'bypass' && this.bereit)
                this.x.rt_engine_set_bypass(this.engine, e.data.an ? 1 : 0);
        };
    }

    _starte(bytes, frames) {
        try {
            const modul = new WebAssembly.Module(bytes);
            const inst = new WebAssembly.Instance(modul, {});
            this.x = inst.exports;

            this.engine = this.x.rt_engine_create(sampleRate, frames || 2048);
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
            }

            this.bereit = true;
            this.port.postMessage({
                art: 'bereit',
                latenzMs: this.x.rt_engine_latency_seconds(this.engine) * 1000,
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
            this.x.rt_engine_set_factor(this.engine, faktor);
            this.letzterFaktor = faktor;
        }

        const kanaele = Math.min(ein.length, aus.length, MAX_KANAELE);
        for (let k = 0; k < kanaele; k++) {
            this.vEin[k].set(ein[k]);
            this.x.rt_engine_process_channel(
                this.engine, k, this.pEin[k], 1, this.pAus[k], 1, QUANTUM);
            aus[k].set(this.vAus[k]);
        }
        // Mehr Ausgangs- als Eingangskanäle: den Rest still lassen.
        for (let k = kanaele; k < aus.length; k++) aus[k].fill(0);

        return true;
    }
}

registerProcessor('retuner', RetunerProzessor);
