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

/* libellés de degrés pour les gammes (2 plutôt que 9, ♭6 plutôt que ♯5) */
const SCALE_LABELS = {
  0:'1', 1:'\u266d2', 2:'2', 3:'\u266d3', 4:'3', 5:'4',
  6:'\u266d5', 7:'5', 8:'\u266d6', 9:'6', 10:'\u266d7', 11:'7'
};

const SCALES = [
  { id:'penta-maj', label:'Pentatonique majeure',        intervals:[0,2,4,7,9] },
  { id:'penta-min', label:'Pentatonique mineure',        intervals:[0,3,5,7,10] },
  { id:'blues',     label:'Blues (penta min + \u266d5)', intervals:[0,3,5,6,7,10] },
  { id:'blues-maj', label:'Blues majeure',               intervals:[0,2,3,4,7,9] },
  { id:'major',     label:'Majeure (ionien)',            intervals:[0,2,4,5,7,9,11] },
  { id:'minor',     label:'Mineure naturelle (\u00e9olien)', intervals:[0,2,3,5,7,8,10] },
  { id:'harm-min',  label:'Mineure harmonique',          intervals:[0,2,3,5,7,8,11] },
  { id:'mel-min',   label:'Mineure m\u00e9lodique',     intervals:[0,2,3,5,7,9,11] },
  { id:'dorian',    label:'Dorien',                      intervals:[0,2,3,5,7,9,10] },
  { id:'phrygian',  label:'Phrygien',                    intervals:[0,1,3,5,7,8,10] },
  { id:'lydian',    label:'Lydien',                      intervals:[0,2,4,6,7,9,11] },
  { id:'mixo',      label:'Mixolydien',                  intervals:[0,2,4,5,7,9,10] },
  { id:'locrian',   label:'Locrien',                     intervals:[0,1,3,5,6,8,10] },
  { id:'whole',     label:'Tons entiers',                intervals:[0,2,4,6,8,10] },
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

  // basse imposée hors accord (ex. C/D) : la note est ajoutée aux notes
  // autorisées, mais ne pourra apparaître qu'à la basse (contrôle plus bas)
  const wantBassPc = opts.bassIv != null ? (rootPc + opts.bassIv) % 12 : null;
  const foreignBass = wantBassPc != null && !pcToInterval.has(wantBassPc);
  if (foreignBass) pcToInterval.set(wantBassPc, opts.bassIv);

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
    if (played.length < minNotes + (foreignBass ? 1 : 0)) return;

    // une basse étrangère à l'accord ne peut sonner qu'à la basse
    if (foreignBass) {
      for (let k = 1; k < played.length; k++) {
        if ((tuning.midi[played[k]] + frets[played[k]]) % 12 === wantBassPc) return;
      }
    }

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

    // graves : fondamentale, renversement, ou basse imposée (accord /X)
    const bassIv = pcToInterval.get((tuning.midi[played[0]] + frets[played[0]]) % 12);
    const inversion = bassIv !== 0;
    if (opts.bassIv != null) { if (bassIv !== opts.bassIv) return; }
    else if (opts.rootBassOnly && inversion) return;

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


/* ------------------------------------------------------------
   Analyse d'un nom d'accord libre : "CM7add11", "F♯m7♭5/A",
   "Bb13", "Cadd9", "C6/9", "Ddim7", "Esus4", "G7♯9", "C5"…
   Retourne { rootPc, sym, intervals, labels, opt, bassIv }.
   Lève une Error (message en français) si illisible.
   ------------------------------------------------------------ */
function parseChord(input) {
  const PC = { c:0, d:2, e:4, f:5, g:7, a:9, b:11 };
  const acc = a => (a === '#' || a === '\u266f') ? 1 : (a === 'b' || a === '\u266d') ? -1 : 0;

  let s = String(input || '').trim().replace(/\s+/g, '');
  if (!s) throw new Error('Saisissez un nom d\u2019accord (ex. CM7add11).');

  const rm = s.match(/^([A-Ga-g])([#\u266fb\u266d]?)/);
  if (!rm) throw new Error('Fondamentale illisible : commencez par une note A\u2013G.');
  const rootPc = (PC[rm[1].toLowerCase()] + acc(rm[2]) + 12) % 12;
  s = s.slice(rm[0].length);

  // basse imposée "/X" en fin de nom
  let bassPc = null;
  const bm = s.match(/\/([A-Ga-g])([#\u266fb\u266d]?)$/);
  if (bm) {
    bassPc = (PC[bm[1].toLowerCase()] + acc(bm[2]) + 12) % 12;
    s = s.slice(0, -bm[0].length);
  }

  // symbole affiché : la saisie, cosmétiquement normalisée
  const sym = s.replace(/b(?=\d)/g, '\u266d').replace(/#/g, '\u266f');

  // normalisation pour l'analyse ("J" = marqueur majeur 7)
  s = s.replace(/maj|MAJ|Maj|[\u0394\u2206]/g, 'J').replace(/M/g, 'J')
       .replace(/[()\u266d,]/g, m => m === '\u266d' ? 'b' : '')
       .replace(/\u266f/g, '#').replace(/\u00b0/g, 'o').replace(/\u00f8/g, 'h')
       .toLowerCase().replace(/min/g, 'm').replace(/[\u2212-]/g, 'm')
       .replace(/j/g, 'J');

  let third = 4, thirdLbl = '3', fifth = 7, fifthLbl = '5';
  let seventh = null, sevLbl = null, dim = false, no3 = false, no5 = false;
  const extras = new Map(), extraLbl = new Map(), optExtra = new Set();
  const put = (semi, lbl, optional) => {
    extras.set(semi, true); if (!extraLbl.has(semi)) extraLbl.set(semi, lbl);
    if (optional) optExtra.add(semi);
  };
  const eat = re => { const t = s.match(re); if (t) s = s.slice(t[0].length); return t; };

  // qualité initiale
  if (eat(/^dim|^o/))       { third = 3; thirdLbl = '\u266d3'; fifth = 6; fifthLbl = '\u266d5'; dim = true; }
  else if (eat(/^aug|^\+/)) { fifth = 8; fifthLbl = '\u266f5'; }
  else if (eat(/^h/))        { third = 3; thirdLbl = '\u266d3'; fifth = 6; fifthLbl = '\u266d5'; seventh = 10; sevLbl = '\u266d7'; }
  else if (eat(/^m/))        { third = 3; thirdLbl = '\u266d3'; }

  let guard = 0;
  while (s && guard++ < 24) {
    if (eat(/^J(?=$)/)) { seventh = 11; sevLbl = '7'; }
    else if (eat(/^J13/)) { seventh = 11; sevLbl = '7'; put(2, '9', true); put(9, '13'); }
    else if (eat(/^J11/)) { seventh = 11; sevLbl = '7'; put(2, '9', true); put(5, '11'); }
    else if (eat(/^J9/))  { seventh = 11; sevLbl = '7'; put(2, '9'); }
    else if (eat(/^J7?/)) { seventh = 11; sevLbl = '7'; }
    else if (eat(/^13/)) { if (seventh == null) { seventh = 10; sevLbl = '\u266d7'; } put(2, '9', true); put(9, '13'); }
    else if (eat(/^11/)) { if (seventh == null) { seventh = 10; sevLbl = '\u266d7'; } put(2, '9', true); put(5, '11'); }
    else if (eat(/^9/))  { if (seventh == null) { seventh = 10; sevLbl = '\u266d7'; } put(2, '9'); }
    else if (eat(/^7/))  { if (seventh == null) { seventh = dim ? 9 : 10; sevLbl = dim ? '\u00b07' : '\u266d7'; } }
    else if (eat(/^69|^6\/9/)) { put(9, '6'); put(2, '9'); }
    else if (eat(/^6/))  { put(9, '6'); }
    else if (eat(/^5(?=$)/)) { no3 = true; }
    else if (eat(/^sus2/)) { third = 2; thirdLbl = '2'; }
    else if (eat(/^sus4?/)) { third = 5; thirdLbl = '4'; }
    else if (eat(/^(no|omit)3/)) { no3 = true; }
    else if (eat(/^(no|omit)5/)) { no5 = true; }
    else {
      let t;
      if ((t = eat(/^add(b|#)?(2|4|6|9|11|13)/))) {
        const semiBase = { 2:2, 4:5, 6:9, 9:2, 11:5, 13:9 }[+t[2]];
        put((semiBase + (t[1] === 'b' ? -1 : t[1] === '#' ? 1 : 0) + 12) % 12,
            (t[1] === 'b' ? '\u266d' : t[1] === '#' ? '\u266f' : '') + t[2]);
      } else if ((t = eat(/^(b|#)(5|9|11|13)/))) {
        const flat = t[1] === 'b';
        if (t[2] === '5')       { fifth = flat ? 6 : 8; fifthLbl = (flat ? '\u266d' : '\u266f') + '5'; }
        else if (t[2] === '9')  put(flat ? 1 : 3, (flat ? '\u266d' : '\u266f') + '9');
        else if (t[2] === '11') put(flat ? 4 : 6, (flat ? '\u266d' : '\u266f') + '11');
        else                    put(flat ? 8 : 10, (flat ? '\u266d' : '\u266f') + '13');
      } else {
        throw new Error('Fragment non reconnu : \u00ab\u202f' + s + '\u202f\u00bb');
      }
    }
  }

  // assemblage
  const labels = { 0: '1' };
  const set = new Set([0]);
  if (!no3 && third != null)  { set.add(third);  labels[third]  = thirdLbl; }
  if (!no5 && fifth != null)  { set.add(fifth);  labels[fifth]  = fifthLbl; }
  if (seventh != null)        { set.add(seventh); labels[seventh] = labels[seventh] || sevLbl; }
  for (const semi of extras.keys()) {
    if (!set.has(semi)) { set.add(semi); labels[semi] = extraLbl.get(semi); }
  }
  const intervals = [...set].sort((a, b) => a - b);
  if (intervals.length < 2) throw new Error('Accord incomplet : il faut au moins deux notes.');

  const opt = [];
  if (!no5 && fifth === 7 && set.has(7) && labels[7] === '5') opt.push(7);
  for (const semi of optExtra) if (set.has(semi) && labels[semi] === extraLbl.get(semi)) opt.push(semi);

  // basse imposée : n'importe quelle note, même hors accord (ex. C/D)
  let bassIv = null;
  if (bassPc != null) bassIv = (bassPc - rootPc + 12) % 12;

  return { rootPc, sym, intervals, labels, opt, bassIv };
}

if (typeof module !== 'undefined') {
  module.exports = { NOTE_NAMES, INTERVAL_LABELS, SCALE_LABELS, SCALES, CHORD_TYPES, TUNINGS, findVoicings, parseChord, MUTE };
}
