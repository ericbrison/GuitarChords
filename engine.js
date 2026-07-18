/* ============================================================
   Moteur de voicings — vanilla JS, aucune dépendance
   ============================================================ */

const NOTE_NAMES = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];

const INTERVAL_LABELS = {
  0:'1', 1:'♭9', 2:'9', 3:'♭3', 4:'3', 5:'4', 6:'♭5',
  7:'5', 8:'♯5', 9:'6', 10:'♭7', 11:'7'
};

/* intervals en demi-tons ; opt = intervalles omissibles (quinte juste) */
const CHORD_TYPES = [
  { id:'maj',   sym:'',      label:'Majeur',        intervals:[0,4,7] },
  { id:'min',   sym:'m',     label:'Mineur',        intervals:[0,3,7] },
  { id:'7',     sym:'7',     label:'7 (dominante)', intervals:[0,4,7,10], opt:[7] },
  { id:'maj7',  sym:'M7',    label:'Majeur 7',      intervals:[0,4,7,11], opt:[7] },
  { id:'m7',    sym:'m7',    label:'Mineur 7',      intervals:[0,3,7,10], opt:[7] },
  { id:'m7b5',  sym:'m7♭5',  label:'Demi-diminué',  intervals:[0,3,6,10] },
  { id:'dim',   sym:'dim',   label:'Diminué',       intervals:[0,3,6] },
  { id:'dim7',  sym:'dim7',  label:'Diminué 7',     intervals:[0,3,6,9] },
  { id:'aug',   sym:'aug',   label:'Augmenté',      intervals:[0,4,8] },
  { id:'sus2',  sym:'sus2',  label:'Sus2',          intervals:[0,2,7] },
  { id:'sus4',  sym:'sus4',  label:'Sus4',          intervals:[0,5,7] },
  { id:'7sus4', sym:'7sus4', label:'7 sus4',        intervals:[0,5,7,10], opt:[7] },
  { id:'6',     sym:'6',     label:'Sixte',         intervals:[0,4,7,9],  opt:[7] },
  { id:'m6',    sym:'m6',    label:'Mineur 6',      intervals:[0,3,7,9],  opt:[7] },
  { id:'add9',  sym:'add9',  label:'Add 9',         intervals:[0,2,4,7],  opt:[7] },
  { id:'9',     sym:'9',     label:'9',             intervals:[0,2,4,7,10], opt:[7] },
  { id:'m9',    sym:'m9',    label:'Mineur 9',      intervals:[0,2,3,7,10], opt:[7] },
  { id:'maj9',  sym:'M9',    label:'Majeur 9',      intervals:[0,2,4,7,11], opt:[7] },
];

/* midi des cordes à vide, de la plus grave à la plus aiguë */
const TUNINGS = [
  { id:'guitar-std',  label:'Guitare — standard (EADGBE)', midi:[40,45,50,55,59,64] },
  { id:'guitar-dropd',label:'Guitare — drop D (DADGBE)',   midi:[38,45,50,55,59,64] },
  { id:'guitar-dadgad',label:'Guitare — DADGAD',           midi:[38,45,50,55,57,62] },
  { id:'bass-4',      label:'Basse 4 cordes (EADG)',       midi:[28,33,38,43] },
  { id:'bass-5',      label:'Basse 5 cordes (BEADG)',      midi:[23,28,33,38,43] },
];

const MUTE = -1;

/* ------------------------------------------------------------
   Génération : pour chaque fenêtre de 4 cases (pos..pos+3),
   chaque corde peut être : étouffée, à vide (si note de l'accord),
   ou frettée dans la fenêtre (si note de l'accord).
   ------------------------------------------------------------ */
function findVoicings(rootPc, chordType, tuning, opts = {}) {
  const maxFret  = opts.maxFret ?? 15;
  const span     = opts.span ?? 3;              // écart max entre frettes
  const omit5    = opts.omit5 ?? true;          // autoriser l'omission de la quinte
  const interior = opts.interiorMutes ?? 1;     // cordes étouffées "internes" max

  const pcToInterval = new Map();
  for (const iv of chordType.intervals) pcToInterval.set((rootPc + iv) % 12, iv);

  const omittable = new Set(omit5 ? (chordType.opt || []) : []);
  const mustHave  = chordType.intervals.filter(iv => !omittable.has(iv));
  const minNotes  = Math.max(3, mustHave.length);

  const nStrings = tuning.midi.length;
  const seen = new Map();

  for (let pos = 1; pos <= Math.max(1, maxFret - span); pos++) {
    // options par corde
    const options = tuning.midi.map(openMidi => {
      const o = [MUTE];
      if (pcToInterval.has(openMidi % 12)) o.push(0);
      for (let f = pos; f <= pos + span && f <= maxFret; f++) {
        if (pcToInterval.has((openMidi + f) % 12)) o.push(f);
      }
      return o;
    });

    const frets = new Array(nStrings).fill(MUTE);
    const walk = (s) => {
      if (s === nStrings) { consider(frets); return; }
      for (const f of options[s]) { frets[s] = f; walk(s + 1); }
      frets[s] = MUTE;
    };
    walk(0);
  }

  function consider(frets) {
    const key = frets.join(',');
    if (seen.has(key)) return;

    const played = [];
    for (let s = 0; s < nStrings; s++) if (frets[s] !== MUTE) played.push(s);
    if (played.length < minNotes) return;

    // cordes étouffées internes
    let interiorMutes = 0;
    for (let s = played[0] + 1; s < played[played.length - 1]; s++) {
      if (frets[s] === MUTE) interiorMutes++;
    }
    if (interiorMutes > interior) return;

    // intervalles couverts
    const covered = new Set();
    for (const s of played) covered.add(pcToInterval.get((tuning.midi[s] + frets[s]) % 12));
    for (const iv of mustHave) if (!covered.has(iv)) return;

    // doigté : nombre de doigts, barré éventuel
    const fretted = played.filter(s => frets[s] > 0);
    let fingers = fretted.length, barre = null;

    if (fretted.length > 0) {
      const minF = Math.min(...fretted.map(s => frets[s]));
      const maxF = Math.max(...fretted.map(s => frets[s]));
      if (maxF - minF > span) return;

      if (fretted.length > 4) {
        // barré à la frette minimale, de la corde la plus grave à cette frette
        // jusqu'à la chanterelle ; aucune corde à vide ni étouffée dans le barré
        const atMin = fretted.filter(s => frets[s] === minF);
        const start = Math.min(...atMin);
        for (let s = start; s < nStrings; s++) {
          if (frets[s] === MUTE || frets[s] === 0 || frets[s] < minF) return;
        }
        fingers = 1 + fretted.filter(s => frets[s] > minF).length;
        if (fingers > 4) return;
        barre = { fret: minF, from: start, to: nStrings - 1 };
      }
    }

    // graves : fondamentale ou renversement
    const bassIv = pcToInterval.get((tuning.midi[played[0]] + frets[played[0]]) % 12);
    const inversion = bassIv !== 0;
    if (opts.rootBassOnly && inversion) return;

    const minFretted = fretted.length ? Math.min(...fretted.map(s => frets[s])) : 0;
    const maxFretted = fretted.length ? Math.max(...fretted.map(s => frets[s])) : 0;
    const stretch = fretted.length ? maxFretted - minFretted : 0;
    const baseFret = (maxFretted <= 4) ? 1 : minFretted;

    const score =
      (inversion ? 40 : 0) +
      fingers * 6 +
      stretch * 5 +
      interiorMutes * 12 +
      (nStrings - played.length) * 3 +
      (barre ? 4 : 0);

    seen.set(key, {
      frets: frets.slice(), played: played.length, fingers, barre,
      baseFret, stretch, inversion, bassIv,
      intervals: [...covered].sort((a, b) => a - b), score,
    });
  }

  // élague les voicings qui sont un sous-ensemble strict d'un autre
  // (mêmes frettes sur les cordes jouées, mais des cordes étouffées en plus)
  const lowest = f => f.findIndex(x => x !== MUTE);
  const all = [...seen.values()];
  const kept = all.filter(v => !all.some(w => {
    if (w === v || w.played <= v.played) return false;
    if (lowest(w.frets) !== lowest(v.frets)) return false; // même basse
    if (v.baseFret > 4) return false;                      // position ouverte seulement
    for (let s = 0; s < v.frets.length; s++) {
      if (v.frets[s] !== MUTE && v.frets[s] !== w.frets[s]) return false;
      if (v.frets[s] === MUTE && w.frets[s] !== 0) return false; // n'ajoute que des cordes à vide
    }
    return true;
  }));

  return kept.sort((a, b) => a.baseFret - b.baseFret || a.score - b.score);
}

if (typeof module !== 'undefined') {
  module.exports = { NOTE_NAMES, INTERVAL_LABELS, CHORD_TYPES, TUNINGS, findVoicings, MUTE };
}
