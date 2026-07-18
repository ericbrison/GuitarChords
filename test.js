const { NOTE_NAMES, CHORD_TYPES, TUNINGS, findVoicings } = require('./engine.js');
const tuning = TUNINGS[0];
const maj7 = CHORD_TYPES.find(c => c.id==='maj7');
const v = findVoicings(0, maj7, tuning, { maxFret: 15 });
console.log('CM7 — total voicings:', v.length);
const fmt = f => f.map(x => x===-1?'x':x).join('-');
// vérifie que les formes classiques sont trouvées
const want = ['x-3-2-0-0-0','x-3-5-4-5-3','8-x-9-9-8-x','x-x-10-9-8-7'];
for (const w of want) {
  const hit = v.find(o => fmt(o.frets)===w);
  console.log(w, hit ? `OK (doigts:${hit.fingers} score:${hit.score}${hit.inversion?' renv.':''})` : 'ABSENT');
}
console.log('\n15 premiers:');
v.slice(0,15).forEach(o => console.log(fmt(o.frets), `pos:${o.baseFret} doigts:${o.fingers}${o.barre?' barré':''}${o.inversion?' renv('+o.bassIv+')':''} score:${o.score}`));
// basse
const bass = TUNINGS[3];
const vb = findVoicings(0, maj7, bass, {});
console.log('\nCM7 basse 4 cordes:', vb.length);
vb.slice(0,5).forEach(o => console.log(fmt(o.frets), 'doigts:'+o.fingers, o.inversion?'renv':''));

// sans renversements
const vr = findVoicings(0, maj7, tuning, { rootBassOnly: true });
console.log('\nCM7 fondamentale à la basse:', vr.length);
vr.slice(0,10).forEach(o => console.log(o.frets.map(x=>x===-1?'x':x).join('-'), 'pos:'+o.baseFret, 'doigts:'+o.fingers));
