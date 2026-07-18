const { parseChord, findVoicings, TUNINGS, NOTE_NAMES } = require('./engine.js');
const cases = [
  ['C',        [0,4,7]],
  ['Cm',       [0,3,7]],
  ['C7',       [0,4,7,10]],
  ['CM7',      [0,4,7,11]],
  ['Cmaj7',    [0,4,7,11]],
  ['CΔ9',      [0,2,4,7,11]],
  ['Cm7b5',    [0,3,6,10]],
  ['F♯m7♭5',   [0,3,6,10]],
  ['Cdim7',    [0,3,6,9]],
  ['Caug',     [0,4,8]],
  ['C7#9',     [0,3,4,7,10]],
  ['C7b9',     [0,1,4,7,10]],
  ['C9',       [0,2,4,7,10]],
  ['C11',      [0,2,4,5,7,10]],
  ['C13',      [0,2,4,7,9,10]],
  ['C6',       [0,4,7,9]],
  ['Cm6',      [0,3,7,9]],
  ['C69',      [0,2,4,7,9]],
  ['C6/9',     [0,2,4,7,9]],
  ['Csus4',    [0,5,7]],
  ['C7sus4',   [0,5,7,10]],
  ['Csus2',    [0,2,7]],
  ['Cadd9',    [0,2,4,7]],
  ['Cmadd9',   [0,2,3,7]],
  ['CM7add11', [0,4,5,7,11]],
  ['CM7#11',   [0,4,6,7,11]],
  ['C5',       [0,7]],
  ['C7b5',     [0,4,6,10]],
  ['Cm11',     [0,2,3,5,7,10]],
  ['CmM7',     [0,3,7,11]],
  ['Cminmaj7', [0,3,7,11]],
  ['Bb13',     [0,2,4,7,9,10]],
  ['C7no5',    [0,4,10]],
];
let fail = 0;
for (const [name, want] of cases) {
  try {
    const p = parseChord(name);
    const ok = JSON.stringify(p.intervals) === JSON.stringify(want);
    if (!ok) { fail++; console.log('✗', name, '→', p.intervals, 'attendu', want); }
  } catch (e) { fail++; console.log('✗', name, 'ERREUR:', e.message); }
}
console.log(fail === 0 ? `✓ ${cases.length} accords analysés correctement` : `${fail} échecs`);

// racines et basses
const s = parseChord('F♯m7♭5/A');
console.log('F♯m7♭5/A → root', NOTE_NAMES[s.rootPc], 'bassIv', s.bassIv, 'sym', s.sym);
const b = parseChord('Bb13');
console.log('Bb13 → root', NOTE_NAMES[b.rootPc]);

// erreurs attendues
for (const bad of ['', 'H7', 'Cxyz', 'C/D']) {
  try { parseChord(bad); console.log('✗ aurait dû échouer:', bad); }
  catch (e) { console.log('✓ rejeté:', JSON.stringify(bad), '—', e.message); }
}

// bout-en-bout : CM7add11 doit produire des voicings avec le 11 obligatoire
const p = parseChord('CM7add11');
const v = findVoicings(p.rootPc, p, TUNINGS[0], {});
console.log('CM7add11 →', v.length, 'positions ; ex:', v[0] && v[0].frets.map(x=>x<0?'x':x).join('-'));
// slash : CM7/E → toutes les positions ont mi à la basse
const pe = parseChord('CM7/E');
const ve = findVoicings(pe.rootPc, pe, TUNINGS[0], { bassIv: pe.bassIv });
console.log('CM7/E →', ve.length, 'positions, toutes basse E :',
  ve.every(o => o.bassIv === 4));

// basse hors accord : C/D
const pd = parseChord('C/D');
console.log('C/D → bassIv', pd.bassIv);
const vd = findVoicings(pd.rootPc, pd, TUNINGS[0], { bassIv: pd.bassIv });
const okBass = vd.every(o => o.bassIv === 2);
const fmt2 = f => f.map(x=>x<0?'x':x).join('-');
console.log('C/D →', vd.length, 'positions, toutes basse D :', okBass, '; ex:', vd[0] && fmt2(vd[0].frets));
// la note D ne doit apparaître qu'à la basse
const { MUTE } = require('./engine.js');
const noInnerD = vd.every(o => {
  const played = o.frets.map((f,s)=>f===MUTE?null:(TUNINGS[0].midi[s]+f)%12).filter(x=>x!==null);
  return played.slice(1).every(pc => pc !== 2);
});
console.log('D uniquement à la basse :', noInnerD);
