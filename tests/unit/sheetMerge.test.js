import { mergeSheet } from '../../src/lib/sheetMerge.js';

// Three-way merge used when a character-sheet save hits a version conflict:
// the local edit is re-applied on top of the server's newer document.
describe('mergeSheet', () => {
  it('takes the local change when only the local side changed', () => {
    const base = { notes: 'a', stats: { force: 10 } };
    const mine = { notes: 'a', stats: { force: 12 } };
    const theirs = { notes: 'a', stats: { force: 10 } };

    const { sheet, conflicts } = mergeSheet(base, mine, theirs);

    expect(sheet).toEqual(mine);
    expect(conflicts).toEqual([]);
  });

  it('takes the server change when only the server side changed', () => {
    const base = { notes: 'a', stats: { force: 10 } };
    const mine = { notes: 'a', stats: { force: 10 } };
    const theirs = { notes: 'server', stats: { force: 10 } };

    const { sheet, conflicts } = mergeSheet(base, mine, theirs);

    expect(sheet).toEqual(theirs);
    expect(conflicts).toEqual([]);
  });

  it('keeps both edits when they touch different fields', () => {
    const base = { notes: '', derived: { fatigue: 0, pvActuels: 10 } };
    const mine = { notes: 'joueur', derived: { fatigue: 0, pvActuels: 10 } };
    const theirs = { notes: '', derived: { fatigue: 2, pvActuels: 10 } };

    const { sheet, conflicts } = mergeSheet(base, mine, theirs);

    expect(sheet.notes).toBe('joueur');
    expect(sheet.derived.fatigue).toBe(2);
    expect(conflicts).toEqual([]);
  });

  it('takes the shared value when both sides changed the same way', () => {
    const base = { notes: 'a' };
    const mine = { notes: 'b' };
    const theirs = { notes: 'b' };

    const { sheet, conflicts } = mergeSheet(base, mine, theirs);

    expect(sheet.notes).toBe('b');
    expect(conflicts).toEqual([]);
  });

  it('prefers the local value AND records the path when both sides disagree', () => {
    const base = { notes: 'a' };
    const mine = { notes: 'mine' };
    const theirs = { notes: 'theirs' };

    const { sheet, conflicts } = mergeSheet(base, mine, theirs);

    expect(sheet.notes).toBe('mine');
    expect(conflicts).toEqual([{ path: 'notes', reason: 'both-changed' }]);
  });

  it('does nothing when the local and server documents are equal', () => {
    const base = { notes: 'a' };
    const mine = { notes: 'b', nested: { x: 1 } };

    const { sheet, conflicts } = mergeSheet(base, mine, { notes: 'b', nested: { x: 1 } });

    expect(sheet).toEqual(mine);
    expect(conflicts).toEqual([]);
  });

  it('keeps a local deletion when the server did not touch the key', () => {
    const base = { portrait: 'x', notes: 'a' };
    const mine = { notes: 'a' };
    const theirs = { portrait: 'x', notes: 'b' };

    const { sheet, conflicts } = mergeSheet(base, mine, theirs);

    expect('portrait' in sheet).toBe(false);
    expect(sheet.notes).toBe('b');
    expect(conflicts).toEqual([]);
  });

  it('reports a delete-vs-edit conflict and lets the local deletion win', () => {
    const base = { totem: { nom: 'A' }, notes: '' };
    const mine = { notes: '' };
    const theirs = { totem: { nom: 'B' }, notes: '' };

    const { sheet, conflicts } = mergeSheet(base, mine, theirs);

    expect('totem' in sheet).toBe(false);
    expect(conflicts).toEqual([{ path: 'totem', reason: 'delete-vs-edit' }]);
  });

  it('keeps a key the server added while the local document is older', () => {
    const base = {};
    const mine = {};
    const theirs = { notes: 'from another frame' };

    const { sheet } = mergeSheet(base, mine, theirs);

    expect(sheet.notes).toBe('from another frame');
  });

  it('unions scalar lists (pinnedSkills)', () => {
    const base = { pinnedSkills: ['perception'] };
    const mine = { pinnedSkills: ['perception', 'discretion'] };
    const theirs = { pinnedSkills: ['perception', 'arcanes'] };

    const { sheet, conflicts } = mergeSheet(base, mine, theirs);

    expect(sheet.pinnedSkills).toEqual(['perception', 'discretion', 'arcanes']);
    expect(conflicts).toEqual([]);
  });

  it('merges object arrays per item so two frames can edit different items', () => {
    const base = { inventoryItems: [{ nom: 'Corde' }, { nom: 'Torche' }] };
    const mine = { inventoryItems: [{ nom: 'Corde' }, { nom: 'Torche', description: 'local' }] };
    const theirs = { inventoryItems: [{ nom: 'Corde', quantite: 3 }, { nom: 'Torche' }] };

    const { sheet, conflicts } = mergeSheet(base, mine, theirs);

    expect(sheet.inventoryItems).toEqual([
      { nom: 'Corde', quantite: 3 },
      { nom: 'Torche', description: 'local' },
    ]);
    expect(conflicts).toEqual([]);
  });

  it('adds items added on either side and lets a one-sided deletion win', () => {
    const base = { weapons: [{ nom: 'Épée' }, { nom: 'Dague' }] };
    const mine = { weapons: [{ nom: 'Dague' }, { nom: 'Hache' }] }; // removed Épée, added Hache
    const theirs = { weapons: [{ nom: 'Épée' }, { nom: 'Arc' }] }; // removed Dague, added Arc

    const { sheet } = mergeSheet(base, mine, theirs);

    // Épée: removed locally, untouched on the server → gone.
    // Dague: removed on the server, untouched locally → gone (the deletion
    // wins; an edited item would have been kept, see the next test).
    expect(sheet.weapons.map((w) => w.nom)).toEqual(['Hache', 'Arc']);
  });

  it('reports delete-vs-edit conflicts inside object arrays', () => {
    const base = { weapons: [{ nom: 'Épée', bonus: '' }] };

    // Deleted locally, edited on the server → local deletion wins, recorded.
    const removed = mergeSheet(base, { weapons: [] }, { weapons: [{ nom: 'Épée', bonus: '+1' }] });
    expect(removed.sheet.weapons).toEqual([]);
    expect(removed.conflicts).toEqual([{ path: 'weapons[nom:Épée]', reason: 'delete-vs-edit' }]);

    // Edited locally, deleted on the server → local edit wins, recorded.
    const edited = mergeSheet(base, { weapons: [{ nom: 'Épée', bonus: '+2' }] }, { weapons: [] });
    expect(edited.sheet.weapons).toEqual([{ nom: 'Épée', bonus: '+2' }]);
    expect(edited.conflicts).toEqual([{ path: 'weapons[nom:Épée]', reason: 'delete-vs-edit' }]);
  });

  it('merges the same item field by field', () => {
    const base = { capacities: [{ nom: 'Leyline', cost: { total: 5 }, usage: 'Action' }] };
    const mine = { capacities: [{ nom: 'Leyline', cost: { total: 5 }, usage: 'Action, 1/tour' }] };
    const theirs = { capacities: [{ nom: 'Leyline', cost: { total: 7 }, usage: 'Action' }] };

    const { sheet } = mergeSheet(base, mine, theirs);

    expect(sheet.capacities[0]).toEqual({ nom: 'Leyline', cost: { total: 7 }, usage: 'Action, 1/tour' });
  });

  // 13 live sheets carry two weapons with the same name (no weapon has an id),
  // so a name-only key used to keep the first and DROP the rest silently.
  it('keeps every same-named item and both edits', () => {
    const base = { weapons: [{ nom: 'Serpe', de: '1d6' }, { nom: 'Serpe', de: '1d8' }] };
    const mine = { weapons: [{ nom: 'Serpe', de: '2d6' }, { nom: 'Serpe', de: '1d8' }] };
    const theirs = { weapons: [{ nom: 'Serpe', de: '1d6' }, { nom: 'Serpe', de: '2d8' }] };

    const { sheet, conflicts } = mergeSheet(base, mine, theirs);

    expect(sheet.weapons).toEqual([{ nom: 'Serpe', de: '2d6' }, { nom: 'Serpe', de: '2d8' }]);
    expect(conflicts.filter((c) => c.reason === 'duplicate-key').length).toBeGreaterThan(0);
  });

  it('never drops an item when one side has more same-named items', () => {
    const base = { weapons: [{ nom: 'Serpe', de: '1d6' }] };
    const mine = { weapons: [{ nom: 'Serpe', de: '1d6' }] };
    const theirs = { weapons: [{ nom: 'Serpe', de: '1d6' }, { nom: 'Serpe', de: '1d8' }] };

    const { sheet } = mergeSheet(base, mine, theirs);

    expect(sheet.weapons).toHaveLength(2);
    expect(sheet.weapons.map((w) => w.de)).toEqual(['1d6', '1d8']);
  });

  it('keeps a same-named item added locally', () => {
    const base = { weapons: [{ nom: 'Serpe', de: '1d6' }] };
    const mine = { weapons: [{ nom: 'Serpe', de: '1d6' }, { nom: 'Serpe', de: '1d10' }] };
    const theirs = { weapons: [{ nom: 'Serpe', de: '1d6', notes: 'autre frame' }] };

    const { sheet } = mergeSheet(base, mine, theirs);

    expect(sheet.weapons).toHaveLength(2);
    expect(sheet.weapons[1]).toEqual({ nom: 'Serpe', de: '1d10' });
  });

  it('reports no duplicate-key conflict when the twins agree on both sides', () => {
    const twins = () => [{ nom: 'Serpe', de: '1d6' }, { nom: 'Serpe', de: '1d8' }];

    const { sheet, conflicts } = mergeSheet(
      { weapons: twins() },
      { weapons: [...twins(), { nom: 'Hache', de: '1d6' }] },
      { weapons: [...twins(), { nom: 'Arc', de: '1d6' }] },
    );

    expect(sheet.weapons.map((w) => w.nom)).toEqual(['Serpe', 'Serpe', 'Hache', 'Arc']);
    expect(conflicts).toEqual([]);
  });
});
