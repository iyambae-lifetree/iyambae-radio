/*
  Das Loeschformular auf der Abzeichen-Seite /messung/<kennung>.

  Die Seite liefert der Anmeldedienst (dienst/src/abzeichen.mjs) mit einer
  scharfen Richtlinie: `script-src 'self'`, kein Inline-Skript. Deshalb
  steht dieses Stueck hier und nicht in der Seite. Die Saetze fuer die
  Rueckmeldung bringt das Formular als data-Attribute mit, in der Sprache
  der Seite.

  Die Kennung geht im RUMPF hinaus, nicht im Pfad: Den Pfad schreibt nginx
  mit der gekuerzten Adresse ins Zugriffsprotokoll.
*/
const formular = document.getElementById('loeschen');

if (formular) {
  const meldung = formular.querySelector('.meldung');
  const knopf = formular.querySelector('button');
  const sage = (satz) => { meldung.textContent = satz; meldung.hidden = false; };

  formular.addEventListener('submit', async (e) => {
    e.preventDefault();
    knopf.disabled = true;
    try {
      const antwort = await fetch('/api/messung', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kennung: formular.dataset.kennung,
          loeschschluessel: formular.elements.schluessel.value.trim(),
        }),
        credentials: 'omit',
      });
      if (antwort.status === 204) {
        sage(formular.dataset.ok);
        formular.elements.schluessel.disabled = true;
        return;
      }
      sage(antwort.status === 403 || antwort.status === 400
        ? formular.dataset.falsch : formular.dataset.fehler);
    } catch {
      sage(formular.dataset.fehler);
    }
    knopf.disabled = false;
  });
}
