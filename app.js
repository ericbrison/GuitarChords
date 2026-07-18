/* ============================================================
   État & interface
   ============================================================ */
const state = {
  root: 0,
  type: 'maj7',
  tuning: 'guitar-std',
  inv: true,
  omit5: true,
  labels: 'intervals',
  maxFret: 15,
};

const BATCH = 24;
let voicings = [];
let rendered = 0;
let curChord = null;   // objet accord courant (prédéfini, libre ou enregistré)

/* --- accords enregistrés (localStorage, indisponible dans certains aperçus) --- */
const LS_KEY = 'manche.chords';
let savedChords = [];
try { savedChords = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) {}
function persistSaved() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(savedChords)); return true; }
  catch (e) { return false; }
}
function currentChord() {
  if (state.type === 'custom' && state.custom) return state.custom;
  if (state.type.startsWith('saved:')) {
    const c = savedChords.find(x => 'saved:' + x.sym === state.type);
    if (c) return c;
  }
  return CHORD_TYPES.find(c => c.id === state.type) || CHORD_TYPES[0];
}

const $ = id => document.getElementById(id);

/* --- lecture de l'état depuis l'URL (partage) --- */
try {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.has('r')) state.root = Math.min(11, Math.max(0, +h.get('r') || 0));
  if (h.has('t') && CHORD_TYPES.some(c => c.id === h.get('t'))) state.type = h.get('t');
  if (h.has('a') && TUNINGS.some(t => t.id === h.get('a'))) state.tuning = h.get('a');
  if (h.has('c')) {
    const p = parseChord(h.get('c'));
    state.root = p.rootPc; state.custom = p; state.type = 'custom';
  }
} catch (e) {}

function pushHash() {
  try {
    const p = { r: state.root, t: state.type, a: state.tuning };
    if (state.type === 'custom' || state.type.startsWith('saved:')) {
      delete p.t;
      p.c = NOTE_NAMES[state.root] + curChord.sym +
            (curChord.bassIv != null ? '/' + NOTE_NAMES[(state.root + curChord.bassIv) % 12] : '');
    }
    history.replaceState(null, '', '#' + new URLSearchParams(p));
  } catch (e) {}
}

/* --- contrôles --- */
function buildControls() {
  const notes = $('notes');
  NOTE_NAMES.forEach((n, i) => {
    const b = document.createElement('button');
    b.className = 'note';
    b.textContent = n;
    b.setAttribute('aria-pressed', String(i === state.root));
    b.addEventListener('click', () => {
      state.root = i;
      notes.querySelectorAll('.note').forEach((x, j) =>
        x.setAttribute('aria-pressed', String(j === i)));
      refresh();
    });
    notes.appendChild(b);
  });

  rebuildTypeSelect();
  $('chordType').addEventListener('change', e => { state.type = e.target.value; refresh(); });

  const tn = $('tuning');
  TUNINGS.forEach(t => tn.add(new Option(t.label, t.id)));
  tn.value = state.tuning;
  tn.addEventListener('change', () => { state.tuning = tn.value; refresh(); });

  $('gearBtn').addEventListener('click', () => {
    const open = $('options').classList.toggle('open');
    $('gearBtn').setAttribute('aria-expanded', String(open));
  });
  $('optInv').addEventListener('change', e => { state.inv = e.target.checked; refresh(); });
  $('optOmit5').addEventListener('change', e => { state.omit5 = e.target.checked; refresh(); });
  $('optLabels').addEventListener('change', e => { state.labels = e.target.value; refresh(); });
  $('optMaxFret').addEventListener('change', e => { state.maxFret = +e.target.value; refresh(); });

  $('freeGo').addEventListener('click', applyFreeChord);
  $('freeInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); applyFreeChord(); }
  });
  $('freeSave').addEventListener('click', saveCurrentChord);
  $('savedList').addEventListener('click', e => {
    const b = e.target.closest('button[data-del]');
    if (!b) return;
    savedChords = savedChords.filter(c => c.sym !== b.dataset.del);
    persistSaved();
    if (state.type === 'saved:' + b.dataset.del) state.type = 'maj';
    rebuildTypeSelect(); renderSavedList(); refresh();
  });

  $('moreBtn').addEventListener('click', renderBatch);
  $('results').addEventListener('click', onCardTap);
}

function rebuildTypeSelect() {
  const ct = $('chordType');
  ct.innerHTML = '';
  CHORD_TYPES.forEach(c => ct.add(new Option(c.label + (c.sym ? '  (' + c.sym + ')' : ''), c.id)));
  if (savedChords.length) {
    const og = document.createElement('optgroup');
    og.label = '★ Mes accords';
    savedChords.forEach(c => og.appendChild(new Option(c.sym, 'saved:' + c.sym)));
    ct.appendChild(og);
  }
  if (state.type === 'custom') {
    ct.appendChild(new Option('(libre) ' + (state.custom ? state.custom.sym : ''), 'custom'));
  }
  ct.value = state.type;
  if (ct.value !== state.type) { state.type = 'maj'; ct.value = 'maj'; }
}

function renderSavedList() {
  $('savedRow').hidden = savedChords.length === 0;
  $('savedList').innerHTML = savedChords.map(c =>
    '<span class="saved-item"><span>' + c.sym +
    '</span><button data-del="' + c.sym + '" aria-label="Supprimer ' + c.sym + '">✕</button></span>'
  ).join('');
}

function freeMsg(txt, cls) {
  const el = $('freeMsg');
  el.textContent = txt || '';
  el.className = 'free-msg' + (cls ? ' ' + cls : '');
}

function applyFreeChord() {
  const raw = $('freeInput').value;
  try {
    const p = parseChord(raw);
    state.custom = p;
    state.root = p.rootPc;
    state.type = 'custom';
    document.querySelectorAll('#notes .note').forEach((x, j) =>
      x.setAttribute('aria-pressed', String(j === p.rootPc)));
    rebuildTypeSelect();
    freeMsg('');
    refresh();
  } catch (err) {
    freeMsg(err.message, 'err');
  }
}

function saveCurrentChord() {
  const c = currentChord();
  if (CHORD_TYPES.some(x => x === c)) {
    freeMsg('Ce type est déjà dans la liste prédéfinie.', 'err');
    return;
  }
  if (!savedChords.some(x => x.sym === c.sym)) {
    savedChords.push({ sym: c.sym, intervals: c.intervals, labels: c.labels,
                       opt: c.opt || [], bassIv: c.bassIv != null ? c.bassIv : null });
    if (!persistSaved()) {
      savedChords.pop();
      freeMsg('Sauvegarde indisponible dans cet environnement (aperçu). Elle fonctionnera une fois l’app déployée.', 'err');
      return;
    }
  }
  state.type = 'saved:' + c.sym;
  rebuildTypeSelect(); renderSavedList();
  freeMsg('★ ' + c.sym + ' enregistré — transposable sur les 12 fondamentales.', 'ok');
  refresh();
}

/* --- recalcul --- */
function refresh() {
  const chord = curChord = currentChord();
  const tuning = TUNINGS.find(t => t.id === state.tuning);

  voicings = findVoicings(state.root, chord, tuning, {
    maxFret: state.maxFret,
    omit5: state.omit5,
    rootBassOnly: !state.inv,
    bassIv: chord.bassIv != null ? chord.bassIv : null,
  });

  const name = NOTE_NAMES[state.root];
  const slash = chord.bassIv != null
    ? '<span style="font-size:55%">/' + NOTE_NAMES[(state.root + chord.bassIv) % 12] + '</span>' : '';
  $('chordName').innerHTML = name + (chord.sym ? '<sup>' + chord.sym + '</sup>' : '') + slash;
  $('chordNotes').textContent =
    chord.intervals.map(iv => NOTE_NAMES[(state.root + iv) % 12]).join(' · ');
  $('chordCount').innerHTML = '<b>' + voicings.length + '</b> position' + (voicings.length > 1 ? 's' : '');

  document.title = name + chord.sym + ' — Manche';
  renderSavedList();
  pushHash();

  $('results').innerHTML = '';
  rendered = 0;
  if (voicings.length === 0) {
    $('results').innerHTML =
      '<div class="empty">Aucune position jouable pour <b>' + name + chord.sym +
      '</b> avec ces réglages.<br>Essayez d’autoriser la quinte omissible ou les renversements.</div>';
    $('moreWrap').hidden = true;
    return;
  }
  renderBatch();
}

/* --- rendu par lots, groupé par case --- */
function renderBatch() {
  const tuning = TUNINGS.find(t => t.id === state.tuning);
  const end = Math.min(rendered + BATCH, voicings.length);
  const frag = [];
  let lastPos = rendered > 0 ? voicings[rendered - 1].baseFret : null;
  let openGrid = false;

  for (let i = rendered; i < end; i++) {
    const v = voicings[i];
    if (v.baseFret !== lastPos) {
      if (openGrid) frag.push('</div></section>');
      frag.push('<section class="pos-group"><div class="pos-head">Case <b>' +
        v.baseFret + '</b></div><div class="grid">');
      openGrid = true;
      lastPos = v.baseFret;
    } else if (!openGrid) {
      // reprise d'un groupe existant : on rouvre une grille dans une section
      frag.push('<section class="pos-group"><div class="grid">');
      openGrid = true;
    }
    frag.push(cardHTML(v, i, tuning));
  }
  if (openGrid) frag.push('</div></section>');

  $('results').insertAdjacentHTML('beforeend', frag.join(''));
  rendered = end;

  const left = voicings.length - rendered;
  $('moreWrap').hidden = left <= 0;
  if (left > 0) $('moreBtn').textContent = 'Afficher ' + Math.min(BATCH, left) + ' de plus (' + left + ' restantes)';
}

/* ============================================================
   Diagrammes SVG — façon touche palissandre
   ============================================================ */
const NROWS = 4;

function cardHTML(v, idx, tuning) {
  const bass = v.inversion
    ? '<span class="badge">/' + NOTE_NAMES[(state.root + v.bassIv) % 12] + '</span>' : '';
  const txt = v.frets.map(f => f === MUTE ? 'x' : f).join('·');
  return '<button class="card" data-idx="' + idx + '" aria-label="Position case ' + v.baseFret + ', ' + txt + '">' +
    diagramSVG(v, tuning) +
    '<span class="card-foot"><span class="frets-txt">' + txt + '</span>' + bass + '</span></button>';
}

function diagramSVG(v, tuning) {
  const nS = tuning.midi.length;
  const W = 132, TOP = 26, LEFT = 22, RIGHT = 10, BOT = 8;
  const gridW = W - LEFT - RIGHT;
  const fretH = 27;
  const H = TOP + NROWS * fretH + BOT;
  const sx = s => LEFT + gridW * (s / (nS - 1));
  const fy = r => TOP + r * fretH;           // ligne de frette r (0 = sillet/haut)
  const base = v.baseFret;
  const s2 = [];

  s2.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">');

  // défs : bois + laiton + perloïd
  s2.push('<defs>',
    '<linearGradient id="wd" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0" stop-color="#4A3423"/><stop offset=".55" stop-color="#3A2818"/>',
    '<stop offset="1" stop-color="#2E1F12"/></linearGradient>',
    '<linearGradient id="br" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" stop-color="#E7C36B"/><stop offset=".5" stop-color="#C99F44"/>',
    '<stop offset="1" stop-color="#8F6F28"/></linearGradient>',
    '<linearGradient id="fr" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" stop-color="#D8D3C8"/><stop offset="1" stop-color="#8B857A"/></linearGradient>',
    '</defs>');

  // touche
  s2.push('<rect x="' + (LEFT - 7) + '" y="' + (TOP - 2) + '" width="' + (gridW + 14) +
    '" height="' + (NROWS * fretH + 4) + '" rx="4" fill="url(#wd)"/>');
  // veinage discret
  for (let i = 1; i <= 3; i++) {
    const y = TOP + (NROWS * fretH) * (i / 3.6) + 3;
    s2.push('<path d="M' + (LEFT - 5) + ' ' + y + ' q ' + (gridW / 2) + ' 4 ' + (gridW + 10) +
      ' 0" stroke="#00000022" fill="none"/>');
  }

  // repères perloïd (cases 3,5,7,9,15,17 simples — 12 double)
  const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
  for (let r = 0; r < NROWS; r++) {
    const fret = base + r;
    const cy = fy(r) + fretH / 2;
    if (fret === 12) {
      s2.push('<circle cx="' + (LEFT + gridW * .3) + '" cy="' + cy + '" r="3.4" fill="#EDE5D0" opacity=".85"/>',
              '<circle cx="' + (LEFT + gridW * .7) + '" cy="' + cy + '" r="3.4" fill="#EDE5D0" opacity=".85"/>');
    } else if (INLAYS.includes(fret)) {
      s2.push('<circle cx="' + (W - RIGHT + LEFT) / 2 + '" cy="' + cy + '" r="3.4" fill="#EDE5D0" opacity=".85"/>');
    }
  }

  // frettes
  for (let r = 1; r <= NROWS; r++) {
    s2.push('<rect x="' + (LEFT - 7) + '" y="' + (fy(r) - 1.1) + '" width="' + (gridW + 14) +
      '" height="2.2" rx="1.1" fill="url(#fr)"/>');
  }
  // sillet ou numéro de case
  if (base === 1) {
    s2.push('<rect x="' + (LEFT - 7) + '" y="' + (TOP - 4.5) + '" width="' + (gridW + 14) +
      '" height="5" rx="1.5" fill="#EDE5D0"/>');
  } else {
    s2.push('<rect x="' + (LEFT - 7) + '" y="' + (TOP - 1.4) + '" width="' + (gridW + 14) +
      '" height="2.6" rx="1.2" fill="url(#fr)"/>');
    s2.push('<text x="' + (LEFT - 12) + '" y="' + (TOP + fretH / 2 + 4) +
      '" text-anchor="end" font-family="ui-monospace,Menlo,monospace" font-size="11" fill="#D2A84E">' + base + '</text>');
  }

  // cordes (épaisseur décroissante vers l'aigu)
  for (let s = 0; s < nS; s++) {
    const w = 2.4 - 1.6 * (s / (nS - 1));
    s2.push('<rect x="' + (sx(s) - w / 2) + '" y="' + (TOP - 2) + '" width="' + w +
      '" height="' + (NROWS * fretH + 4) + '" fill="#9A9184" opacity=".9"/>');
  }

  // barré
  if (v.barre) {
    const r = v.barre.fret - base;
    const y = fy(r) + fretH / 2;
    s2.push('<rect x="' + (sx(v.barre.from) - 7.5) + '" y="' + (y - 7) +
      '" width="' + (sx(v.barre.to) - sx(v.barre.from) + 15) + '" height="14" rx="7" fill="url(#br)" opacity=".95"/>');
  }

  // marqueurs o / x, pastilles
  const chordPcs = new Map();
  curChord.intervals.forEach(iv => chordPcs.set((state.root + iv) % 12, iv));

  for (let s = 0; s < nS; s++) {
    const f = v.frets[s], x = sx(s);
    if (f === MUTE) {
      s2.push('<text x="' + x + '" y="' + (TOP - 9) + '" text-anchor="middle" font-size="11"' +
        ' font-family="system-ui" fill="#8A7B65">✕</text>');
      continue;
    }
    const midi = tuning.midi[s] + f;
    const iv = chordPcs.get(midi % 12);
    const label = state.labels === 'notes' ? NOTE_NAMES[midi % 12]
        : ((curChord.labels && curChord.labels[iv]) || INTERVAL_LABELS[iv]);
    if (f === 0) {
      s2.push('<circle cx="' + x + '" cy="' + (TOP - 12) + '" r="5" fill="none" stroke="#EDE5D0" stroke-width="1.5"/>');
      s2.push('<text x="' + x + '" y="' + (TOP - 20) + '" text-anchor="middle" font-size="8.5"' +
        ' font-family="ui-monospace,Menlo,monospace" fill="#A2937D">' + label + '</text>');
    } else {
      const r = f - base;
      const cy = fy(r) + fretH / 2;
      const isRoot = iv === 0;
      s2.push('<circle cx="' + x + '" cy="' + cy + '" r="8.6" fill="url(#br)"' +
        (isRoot ? ' stroke="#EDE5D0" stroke-width="1.6"' : ' stroke="#00000055" stroke-width=".8"') + '/>');
      s2.push('<text x="' + x + '" y="' + (cy + 3.4) + '" text-anchor="middle" font-size="9"' +
        ' font-weight="700" font-family="ui-monospace,Menlo,monospace" fill="#241A0B">' + label + '</text>');
    }
  }

  s2.push('</svg>');
  return s2.join('');
}

/* ============================================================
   Audio — pincement Karplus-Strong, sans dépendance
   ============================================================ */
let actx = null;
const noteCache = new Map();

function pluckBuffer(midi) {
  if (noteCache.has(midi)) return noteCache.get(midi);
  const sr = actx.sampleRate;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const N = Math.max(2, Math.round(sr / freq));
  const dur = 1.6, len = Math.floor(sr * dur);
  const buf = actx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
  let idx = 0;
  const damp = 0.996;
  for (let i = 0; i < len; i++) {
    const next = (idx + 1) % N;
    const out = ring[idx];
    ring[idx] = damp * 0.5 * (ring[idx] + ring[next]);
    d[i] = out * (1 - i / len);
    idx = next;
  }
  noteCache.set(midi, buf);
  return buf;
}

function playVoicing(v, tuning) {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t0 = actx.currentTime + 0.02;
    let k = 0;
    for (let s = 0; s < v.frets.length; s++) {
      if (v.frets[s] === MUTE) continue;
      const src = actx.createBufferSource();
      src.buffer = pluckBuffer(tuning.midi[s] + v.frets[s]);
      const g = actx.createGain();
      g.gain.value = 0.28;
      src.connect(g); g.connect(actx.destination);
      src.start(t0 + k * 0.055);
      k++;
    }
  } catch (e) { /* audio indisponible : silencieux */ }
}

function onCardTap(e) {
  const card = e.target.closest('.card');
  if (!card) return;
  const v = voicings[+card.dataset.idx];
  if (v) playVoicing(v, TUNINGS.find(t => t.id === state.tuning));
}

/* ============================================================
   Démarrage + PWA
   ============================================================ */
buildControls();
refresh();

if ('serviceWorker' in navigator) {
  try { navigator.serviceWorker.register('sw.js'); } catch (e) {}
}
