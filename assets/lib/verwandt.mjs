// Sucht einen Ersatz fuer einen Sender, der gerade nicht antwortet:
// gleiches Regal zuerst, darin die meisten gemeinsamen Etiketten.

export function findeVerwandten(sender, alle, ausgeschlossen = new Set()) {
  const eigene = new Set(sender.etiketten ?? []);
  const bewerte = (s) => {
    const treffer = (s.etiketten ?? []).filter(e => eigene.has(e)).length;
    return (s.regal === sender.regal ? 100 : 0) + treffer;
  };
  const kandidaten = alle
    .filter(s => !ausgeschlossen.has(s.id) && s.id !== sender.id)
    .sort((a, b) => bewerte(b) - bewerte(a));
  return kandidaten[0] ?? null;
}
