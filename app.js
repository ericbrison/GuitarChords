/* ============================================================
   État & interface
   ============================================================ */
const state = {
  root: 0,
  type: 'maj7',
  tuning: 'guitar-std',
  bass: null,           // basse imposée (intervalle) ; null = rien d'imposé
  inv: false,           // renversements : basse libre quand rien n'est imposé
  theme: 'auto',
  big: false,           // mode basse vision : une colonne, éléments agrandis
  fretMin: null,        // filtre de position : plage de cases [fretMin, fretMax]
  fretMax: null,
  tool: 'chords',       // outil actif : 'chords' | 'scales'
  scale: 'penta-maj',   // id de gamme, 'custom' ou 'savedscale:Nom'
  scaleCustom: null,    // { name, intervals } pour la gamme libre
  neckView: 'h-left',   // orientation du manche : h-left | h-right | v-top | v-bottom
  scaleMaxFret: 22,     // nombre de cases du manche des gammes (indépendant des accords)
  neckZoom: 1,          // agrandissement du manche par re-rendu (pas de zoom gestuel)
  omit5: true,
  labels: 'intervals',
  maxFret: 22,
};

const APP_VERSION = 'v32';

/* --- persistance de toutes les options --- */
const SETT_KEY = 'guitarchords.settings';
const SETT_FIELDS = ['tuning', 'labels', 'omit5', 'maxFret', 'inv', 'theme',
                     'big', 'neckView', 'scaleMaxFret', 'neckZoom'];
function saveSettings() {
  try {
    const o = {};
    SETT_FIELDS.forEach(f => o[f] = state[f]);
    localStorage.setItem(SETT_KEY, JSON.stringify(o));
  } catch (e) {}
}
function loadSettings() {
  try {
    const o = JSON.parse(localStorage.getItem(SETT_KEY) || '{}');
    if (TUNINGS.some(t => t.id === o.tuning)) state.tuning = o.tuning;
    if (o.labels === 'notes' || o.labels === 'intervals') state.labels = o.labels;
    if (typeof o.omit5 === 'boolean') state.omit5 = o.omit5;
    if ([12, 15, 19, 22].includes(o.maxFret)) state.maxFret = o.maxFret;
    if (typeof o.inv === 'boolean') state.inv = o.inv;
    if (['auto', 'light', 'dark'].includes(o.theme)) state.theme = o.theme;
    if (typeof o.big === 'boolean') state.big = o.big;
    if (o.neckView === 'v-top' || o.neckView === 'h-left') state.neckView = o.neckView;
    else if (o.neckView === 'v-bottom') state.neckView = 'v-top';
    else if (o.neckView === 'h-right') state.neckView = 'h-left';
    if ([15, 19, 22, 24].includes(o.scaleMaxFret)) state.scaleMaxFret = o.scaleMaxFret;
    if (NECK_ZOOMS.includes(o.neckZoom)) state.neckZoom = o.neckZoom;
  } catch (e) {}
}

/* --- thème clair / sombre / auto --- */
const THEME_KEY = 'guitarchords.theme';
const DIAG_THEMES = {
  dark: {
    board: '#262B33', fret: '#4A5160', nut: '#E8E4DA', string: '#6B7280',
    inlay: '#3C434F', mute: '#7A8089', openBg: '#171310',
    num: '#E8E4DA', dotStroke: '#12151A', barre: '#E8E4DA',
  },
  light: {
    board: '#EFEAE0', fret: '#B9B2A2', nut: '#332E26', string: '#9A937F',
    inlay: '#DAD3C4', mute: '#8A8375', openBg: '#FDFBF6',
    num: '#4A4438', dotStroke: 'rgba(0,0,0,.28)', barre: '#332E26',
  },
};
let DIAG = DIAG_THEMES.dark;
const mqLight = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

function resolvedTheme() {
  if (state.theme === 'light' || state.theme === 'dark') return state.theme;
  return mqLight && mqLight.matches ? 'light' : 'dark';
}
function applyBig() {
  document.documentElement.dataset.big = state.big ? '1' : '0';
}

function applyTheme(rerender) {
  const t = resolvedTheme();
  document.documentElement.dataset.theme = t;
  DIAG = DIAG_THEMES[t];
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'light' ? '#F4EFE6' : '#171310';
  if (rerender) refreshCurrent();
}
if (mqLight && mqLight.addEventListener) {
  mqLight.addEventListener('change', () => { if (state.theme === 'auto') applyTheme(true); });
}

/* couleur par degré chromatique : [fond, texte] — utilisée pour les
   intervalles (relatifs à la fondamentale) ou les notes (absolues) */
const PALETTE = {
  0:  ['#EF4444', '#FFFFFF'],  // 1 / do        rouge
  1:  ['#F97316', '#221204'],  // ♭9            orange
  2:  ['#EAB308', '#221B03'],  // 9             jaune
  3:  ['#84CC16', '#131F02'],  // ♭3, ♯9        lime
  4:  ['#22C55E', '#04200D'],  // 3             vert
  5:  ['#14B8A6', '#032420'],  // 4 / 11        sarcelle
  6:  ['#22D3EE', '#062B33'],  // ♭5, ♯11       cyan
  7:  ['#3B82F6', '#FFFFFF'],  // 5             bleu
  8:  ['#818CF8', '#101438'],  // ♯5, ♭13       indigo
  9:  ['#A855F7', '#FFFFFF'],  // 6 / 13        violet
  10: ['#E879F9', '#33082E'],  // ♭7            fuchsia
  11: ['#EC4899', '#FFFFFF'],  // 7             rose
};
function toneColor(interval, pc) {
  return PALETTE[state.labels === 'notes' ? pc : interval];
}

const BATCH = 24;
let voicings = [];
let rendered = 0;
let curChord = null;   // objet accord courant (prédéfini, libre ou enregistré)
let curPcs = new Map(); // pc -> intervalle, accord + basse étrangère éventuelle

/* --- accords enregistrés (localStorage, indisponible dans certains aperçus) --- */
const LS_KEY = 'guitarchords.chords';
let savedChords = [];
try {
  savedChords = JSON.parse(localStorage.getItem(LS_KEY) ||
                localStorage.getItem('manche.chords') || '[]');  // migration ancien nom
} catch (e) {}
loadSettings();
function persistSaved() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(savedChords)); return true; }
  catch (e) { return false; }
}
const LS_SCALES = 'guitarchords.scales';
let savedScales = [];
try { savedScales = JSON.parse(localStorage.getItem(LS_SCALES) || '[]'); } catch (e) {}
function persistScales() {
  try { localStorage.setItem(LS_SCALES, JSON.stringify(savedScales)); return true; }
  catch (e) { return false; }
}

function currentScale() {
  if (state.scale === 'custom' && state.scaleCustom) return state.scaleCustom;
  if (state.scale.startsWith('savedscale:')) {
    const s = savedScales.find(x => 'savedscale:' + x.name === state.scale);
    if (s) return s;
  }
  return SCALES.find(s => s.id === state.scale) || SCALES[0];
}

function refreshCurrent() {
  if (state.tool === 'scales') refreshScales(); else refresh();
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
    if (p.bassIv != null) state.bass = p.bassIv;
  }
  if (h.has('b')) state.bass = Math.min(11, Math.max(0, +h.get('b') || 0));
  if (h.has('i')) state.inv = h.get('i') === '1';
  if (h.has('fm') && h.has('fx')) { state.fretMin = +h.get('fm'); state.fretMax = +h.get('fx'); }
  if (h.get('tool') === 's') state.tool = 'scales';
  if (h.has('g')) {
    if (h.get('g') === 'custom' && h.has('gi')) {
      state.scaleCustom = {
        name: h.get('gn') || 'Gamme libre',
        intervals: h.get('gi').split(',').map(Number).filter(n => n >= 0 && n < 12),
      };
      if (!state.scaleCustom.intervals.includes(0)) state.scaleCustom.intervals.unshift(0);
      state.scale = 'custom';
    } else if (SCALES.some(s => s.id === h.get('g'))) {
      state.scale = h.get('g');
    }
  }
} catch (e) {}

function pushHash() {
  try {
    const p = { r: state.root, t: state.type, a: state.tuning };
    if (state.bass != null) p.b = state.bass;
    if (state.inv) p.i = '1';
    if (state.fretMin != null) { p.fm = state.fretMin; p.fx = state.fretMax; }
    if (state.type === 'custom' || state.type.startsWith('saved:')) {
      delete p.t;
      p.c = NOTE_NAMES[state.root] + curChord.sym +
            (curChord.bassIv != null ? '/' + NOTE_NAMES[(state.root + curChord.bassIv) % 12] : '');
    }
    if (state.tool === 'scales') {
      p.tool = 's';
      const sc = currentScale();
      if (state.scale === 'custom' || state.scale.startsWith('savedscale:')) {
        p.g = 'custom'; p.gi = sc.intervals.join(','); p.gn = sc.name || sc.label || '';
      } else p.g = state.scale;
      delete p.b; delete p.fm; delete p.fx;
    }
    history.replaceState(null, '', '#' + new URLSearchParams(p));
  } catch (e) {}
}

/* --- contrôles --- */
function buildControls() {
  const rs = $('rootSel');
  for (let i = 0; i < 12; i++) {
    const pc = (9 + i) % 12;                    // de A à G♯
    rs.add(new Option(NOTE_NAMES[pc], String(pc)));
  }
  rs.value = String(state.root);
  rs.addEventListener('change', () => { state.root = +rs.value; refresh(); });

  rebuildTypeSelect();
  $('chordType').addEventListener('change', e => {
    state.type = e.target.value;
    const c = currentChord();
    state.bass = c.bassIv != null ? c.bassIv : null;
    refresh();
  });

  const tn = $('tuning');
  TUNINGS.forEach(t => tn.add(new Option(t.label, t.id)));
  tn.value = state.tuning;
  tn.addEventListener('change', () => { state.tuning = tn.value; saveSettings(); refreshCurrent(); });

  $('gearBtn').addEventListener('click', () => {
    const open = $('options').classList.toggle('open');
    $('gearBtn').setAttribute('aria-expanded', String(open));
  });
  $('optInv').checked = state.inv;
  $('optInv').addEventListener('change', e => {
    state.inv = e.target.checked;
    saveSettings();
    refresh();
  });

  $('optBig').checked = state.big;
  $('optBig').addEventListener('change', e => {
    state.big = e.target.checked;
    saveSettings();
    applyBig();
    refreshCurrent();
  });

  $('optNeck').value = state.neckView;
  $('optNeck').addEventListener('change', e => {
    state.neckView = e.target.value;
    saveSettings();
    refreshScales();
  });
  $('scaleFrets').value = String(state.scaleMaxFret);
  $('scaleFrets').addEventListener('change', e => {
    state.scaleMaxFret = +e.target.value;
    saveSettings();
    refreshScales();
  });

  $('optTheme').value = state.theme;
  $('optTheme').addEventListener('change', e => {
    state.theme = e.target.value;
    saveSettings();
    applyTheme(true);
  });
  $('optBass').addEventListener('change', e => {
    state.bass = e.target.value === '' ? null : +e.target.value;
    refresh();
  });
  $('optOmit5').checked = state.omit5;
  $('optLabels').value = state.labels;
  $('optMaxFret').value = String(state.maxFret);
  $('optOmit5').addEventListener('change', e => { state.omit5 = e.target.checked; saveSettings(); refresh(); });
  $('optLabels').addEventListener('change', e => { state.labels = e.target.value; saveSettings(); refreshCurrent(); });
  $('optMaxFret').addEventListener('change', e => {
    state.maxFret = +e.target.value;
    saveSettings();
    if (state.fretMax != null && state.fretMax > state.maxFret) {
      state.fretMax = state.maxFret;
      if (state.fretMin > state.maxFret) state.fretMin = state.fretMax = null;
    }
    buildFretSlider();
    syncSliderFromState();
    updateSliderUI();
    refreshCurrent();
  });

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

  buildFretSlider();          // pose max avant les valeurs (sinon écrêtage)
  syncSliderFromState();
  updateSliderUI();
  for (const id of ['fretMinR', 'fretMaxR']) {
    $(id).addEventListener('input', updateSliderUI);
    $(id).addEventListener('change', commitSlider);
  }
  $('fretbarClear').addEventListener('click', clearFretFilter);

  // onglets outils
  $('tabChords').addEventListener('click', () => setTool('chords'));
  $('tabScales').addEventListener('click', () => setTool('scales'));

  // contrôles de l'outil gammes
  const sr = $('scaleRoot');
  for (let i = 0; i < 12; i++) {
    const pc = (9 + i) % 12;                    // de A à G♯
    sr.add(new Option(NOTE_NAMES[pc], String(pc)));
  }
  sr.value = String(state.root);
  sr.addEventListener('change', () => { state.root = +sr.value; refreshScales(); });

  rebuildScaleSelect();
  $('scaleSel').addEventListener('change', e => { state.scale = e.target.value; refreshScales(); });
  $('ivChips').addEventListener('click', onIvChipTap);
  $('scaleSave').addEventListener('click', saveCurrentScale);
  $('savedScalesList').addEventListener('click', e => {
    const b = e.target.closest('button[data-del]');
    if (!b) return;
    savedScales = savedScales.filter(s => s.name !== b.dataset.del);
    persistScales();
    if (state.scale === 'savedscale:' + b.dataset.del) state.scale = 'penta-maj';
    rebuildScaleSelect(); renderSavedScalesList(); refreshCurrent();
  });

  $('moreBtn').addEventListener('click', renderBatch);
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
    state.bass = p.bassIv != null ? p.bassIv : null;
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

/* --- double slider de plage de cases ---
   Plage complète (1..maxFret) = aucun filtre. Libellé mis à jour en
   direct pendant le glissement, recalcul des positions au relâcher. */
function sliderVals() {
  let a = +$('fretMinR').value, z = +$('fretMaxR').value;
  if (a > z) [a, z] = [z, a];
  return [a, z];
}

function buildFretSlider() {
  const N = state.maxFret;
  $('fretMinR').max = N; $('fretMaxR').max = N;
  const marks = [1, 3, 5, 7, 9, 12, 15, 17, 19, 22].filter(f => f <= N);
  $('rangeScale').innerHTML = marks.map(f =>
    '<span style="left:' + ((f - 1) / (N - 1) * 100) + '%">' +
    (f === 12 ? '\u2022' + f + '\u2022' : f) + '</span>').join('');
  updateSliderUI();
}

function syncSliderFromState() {
  $('fretMinR').value = state.fretMin != null ? state.fretMin : 1;
  $('fretMaxR').value = state.fretMax != null ? state.fretMax : state.maxFret;
}

function updateSliderUI() {
  const N = state.maxFret;
  const [a, z] = sliderVals();
  const p = f => (f - 1) / (N - 1) * 100;
  $('rangeFill').style.left = p(a) + '%';
  $('rangeFill').style.width = (p(z) - p(a)) + '%';
  const all = a === 1 && z === N;
  $('fretbarClear').hidden = all;
  $('fretbarLabel').textContent = all
    ? 'Tout le manche (cases 1\u2013' + N + ')'
    : 'Cases ' + a + '\u2013' + z;
}

function commitSlider() {
  const N = state.maxFret;
  const [a, z] = sliderVals();
  if (a === 1 && z === N) { state.fretMin = state.fretMax = null; }
  else { state.fretMin = a; state.fretMax = z; }
  refresh();
}

function clearFretFilter() {
  state.fretMin = state.fretMax = null;
  syncSliderFromState();
  refresh();
}

function rebuildBassSelect(chord) {
  const sel = $('optBass');
  sel.innerHTML = '';
  sel.add(new Option('—', ''));   // rien d'imposé
  for (let i = 0; i < 12; i++) {
    const pc = (9 + i) % 12;                    // de A à G♯
    sel.add(new Option(NOTE_NAMES[pc], String((pc - state.root + 12) % 12)));
  }
  sel.value = state.bass == null ? '' : String(state.bass);
}

/* --- recalcul --- */
function refresh() {
  const chord = curChord = currentChord();
  const tuning = TUNINGS.find(t => t.id === state.tuning);

  $('rootSel').value = String(state.root);
  rebuildBassSelect(chord);
  const bassIv = state.bass != null ? state.bass : (state.inv ? null : 0);

  curPcs = new Map();
  chord.intervals.forEach(iv => curPcs.set((state.root + iv) % 12, iv));
  const foreignBass = bassIv != null && !chord.intervals.includes(bassIv);
  if (foreignBass) curPcs.set((state.root + bassIv) % 12, bassIv);

  voicings = findVoicings(state.root, chord, tuning, {
    maxFret: state.maxFret,
    omit5: state.omit5,
    bassIv,
  });

  // filtre de position : frettes dans la plage, cordes à vide seulement
  // si la plage commence au sillet
  if (state.fretMin != null) {
    const a = state.fretMin, z = state.fretMax;
    voicings = voicings.filter(v => v.frets.every(f =>
      f === MUTE || (f === 0 ? a <= 1 : f >= a && f <= z)));
  }
  updateSliderUI();

  const name = NOTE_NAMES[state.root];
  const slash = bassIv != null && bassIv !== 0
    ? '<span class="slash">/' + NOTE_NAMES[(state.root + bassIv) % 12] + '</span>' : '';
  $('chordName').innerHTML = name + (chord.sym ? '<sup>' + chord.sym + '</sup>' : '') + slash;
  const toneChip = (iv, extra) => {
    const pc = (state.root + iv) % 12;
    const lbl = (chord.labels && chord.labels[iv]) || INTERVAL_LABELS[iv];
    const [bg, fg] = toneColor(iv, pc);
    return '<span class="tone"><i style="background:' + bg + ';color:' + fg + '">' +
           lbl + '</i>' + NOTE_NAMES[pc] + (extra || '') + '</span>';
  };
  $('chordTones').innerHTML =
    chord.intervals.map(iv => toneChip(iv)).join('') +
    (foreignBass ? toneChip(bassIv, ' <small>basse</small>') : '');
  $('chordCount').innerHTML = '<b>' + voicings.length + '</b> position' + (voicings.length > 1 ? 's' : '');

  document.title = name + chord.sym + ' — Guitar Chords';
  renderSavedList();
  pushHash();

  $('results').innerHTML = '';
  rendered = 0;
  if (voicings.length === 0) {
    $('results').innerHTML =
      '<div class="empty">Aucune position jouable pour <b>' + name + chord.sym +
      '</b> avec ces réglages.<br>' +
      (state.fretMin != null
        ? 'Essayez d\u2019\u00e9largir la plage de cases (' + state.fretMin + '\u2013' + state.fretMax + ') ou de la r\u00e9initialiser (\u2715).'
        : 'Essayez d\u2019autoriser les notes omissibles ou une autre basse.') + '</div>';
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
   Outil gammes : manche complet
   ============================================================ */
function setTool(t) {
  state.tool = t;
  document.documentElement.dataset.tool = t;
  $('tabChords').setAttribute('aria-pressed', String(t === 'chords'));
  $('tabScales').setAttribute('aria-pressed', String(t === 'scales'));
  refreshCurrent();
}

function rebuildScaleSelect() {
  const sel = $('scaleSel');
  sel.innerHTML = '';
  SCALES.forEach(s => sel.add(new Option(s.label, s.id)));
  if (savedScales.length) {
    const og = document.createElement('optgroup');
    og.label = '\u2605 Mes gammes';
    savedScales.forEach(s => og.appendChild(new Option(s.name, 'savedscale:' + s.name)));
    sel.appendChild(og);
  }
  if (state.scale === 'custom') {
    sel.appendChild(new Option('(libre) ' + (state.scaleCustom ? state.scaleCustom.name : ''), 'custom'));
  }
  sel.value = state.scale;
  if (sel.value !== state.scale) { state.scale = 'penta-maj'; sel.value = state.scale; }
}

function renderSavedScalesList() {
  $('savedScalesRow').hidden = savedScales.length === 0;
  $('savedScalesList').innerHTML = savedScales.map(s =>
    '<span class="saved-item"><span>' + s.name +
    '</span><button data-del="' + s.name.replace(/"/g, '&quot;') +
    '" aria-label="Supprimer ' + s.name + '">\u2715</button></span>'
  ).join('');
}

function onIvChipTap(e) {
  const chip = e.target.closest('.ivchip');
  if (!chip || chip.disabled) return;
  const iv = +chip.dataset.iv;
  const cur = currentScale();
  const set = new Set(cur.intervals);
  if (set.has(iv)) set.delete(iv); else set.add(iv);
  set.add(0);
  state.scaleCustom = {
    name: (cur.name || cur.label || 'Gamme') + ' \u2726',
    intervals: [...set].sort((a, b) => a - b),
  };
  state.scale = 'custom';
  rebuildScaleSelect();
  refreshScales();
}

function saveCurrentScale() {
  const cur = currentScale();
  const name = ($('scaleName').value || '').trim() || cur.name || cur.label;
  if (SCALES.some(s => s === cur)) {
    scaleMsg('Cette gamme est d\u00e9j\u00e0 dans la liste pr\u00e9d\u00e9finie \u2014 modifiez un degr\u00e9 avant d\u2019enregistrer.', 'err');
    return;
  }
  const entry = { name, intervals: cur.intervals.slice() };
  const i = savedScales.findIndex(s => s.name === name);
  if (i >= 0) savedScales[i] = entry; else savedScales.push(entry);
  if (!persistScales()) {
    if (i < 0) savedScales.pop();
    scaleMsg('Sauvegarde indisponible dans cet environnement (aper\u00e7u). Elle fonctionnera une fois l\u2019app d\u00e9ploy\u00e9e.', 'err');
    return;
  }
  state.scale = 'savedscale:' + name;
  rebuildScaleSelect(); renderSavedScalesList();
  scaleMsg('\u2605 \u00ab\u202f' + name + '\u202f\u00bb enregistr\u00e9e \u2014 transposable sur les 12 fondamentales.', 'ok');
  refreshScales();
}

function scaleMsg(txt, cls) {
  const el = $('scaleMsg');
  el.textContent = txt || '';
  el.className = 'free-msg' + (cls ? ' ' + cls : '');
}

function refreshScales() {
  const sc = currentScale();
  const tuning = TUNINGS.find(t => t.id === state.tuning);
  $('scaleRoot').value = String(state.root);

  // pastilles de degrés
  $('ivChips').innerHTML = Array.from({ length: 12 }, (_, iv) => {
    const on = sc.intervals.includes(iv);
    const pc = (state.root + iv) % 12;
    const [bg, fg] = toneColor(iv, pc);
    return '<button class="ivchip" data-iv="' + iv + '" aria-pressed="' + on + '"' +
      (iv === 0 ? ' disabled title="La fondamentale fait toujours partie de la gamme"' : '') +
      (on ? ' style="--chipbg:' + bg + ';--chipfg:' + fg + '"' : '') +
      '><b>' + SCALE_LABELS[iv] + '</b><small>' + NOTE_NAMES[pc] + '</small></button>';
  }).join('');

  const title = NOTE_NAMES[state.root] + ' \u2014 ' + (sc.name || sc.label);
  $('scaleTitle').textContent = title;
  document.title = title + ' \u2014 Guitar Chords';
  $('scaleTones').innerHTML = sc.intervals.map(iv => {
    const pc = (state.root + iv) % 12;
    const [bg, fg] = toneColor(iv, pc);
    return '<span class="tone"><i style="background:' + bg + ';color:' + fg + '">' +
      SCALE_LABELS[iv] + '</i>' + NOTE_NAMES[pc] + '</span>';
  }).join('');
  $('scaleName').value = state.scale.startsWith('savedscale:') ? sc.name
    : state.scale === 'custom' ? (sc.name || '') : '';

  $('neckCanvas').innerHTML = neckSVG(sc, tuning);
  updateNeckZoomUI();
  renderSavedScalesList();
  pushHash();
}

/* --- agrandissement du manche par re-rendu ---
   Les boutons − / + redessinent le manche avec des cases, pastilles et
   textes plus grands (SVG vectoriel : net à tous les niveaux). Aucun zoom
   gestuel : le défilement, natif, ne concerne que l'axe du manche. */
const NECK_ZOOMS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];

function snapNeckZoom(k) {
  return NECK_ZOOMS.reduce((a, b) => Math.abs(b - k) < Math.abs(a - k) ? b : a);
}

/* change de palier en gardant le point d'ancrage (le long du manche)
   sous le doigt / au centre de la vue */
function neckSetZoom(k, anchorX) {
  if (k === state.neckZoom) return;
  const wrap = $('neckWrap');
  const ax = anchorX != null ? anchorX : wrap.clientWidth / 2;
  const kOld = state.neckZoom;
  const focus = (wrap.scrollLeft + ax) / kOld;
  state.neckZoom = k;
  saveSettings();
  refreshScales();
  wrap.scrollLeft = focus * k - ax;
}

function neckZoomStep(dir) {
  const i = NECK_ZOOMS.indexOf(state.neckZoom);
  const j = Math.min(NECK_ZOOMS.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir));
  neckSetZoom(NECK_ZOOMS[j]);
}

function updateNeckZoomUI() {
  $('neckZoomLabel').textContent = Math.round(state.neckZoom * 100) + '\u202f%';
  $('neckZoomOut').disabled = state.neckZoom <= NECK_ZOOMS[0];
  $('neckZoomIn').disabled = state.neckZoom >= NECK_ZOOMS[NECK_ZOOMS.length - 1];
}

/* --- pincement asservi aux paliers ---
   Deux doigts : le rapport d'écartement choisit le palier le plus proche,
   re-rendu à chaque changement. Un doigt : défilement natif, intact. */
const neckPtrs = new Map();
let pinch0 = null;

function neckPointerDown(e) {
  if (e.pointerType !== 'touch') return;
  neckPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (neckPtrs.size === 2) {
    const [a, b] = [...neckPtrs.values()];
    pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: state.neckZoom };
  }
}

function neckPointerMove(e) {
  const p = neckPtrs.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX; p.y = e.clientY;
  if (neckPtrs.size !== 2 || !pinch0) return;
  const [a, b] = [...neckPtrs.values()];
  const target = snapNeckZoom(pinch0.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch0.d);
  if (target !== state.neckZoom) {
    const rect = $('neckWrap').getBoundingClientRect();
    neckSetZoom(target, (a.x + b.x) / 2 - rect.left);
  }
  e.preventDefault();
}

function neckPointerUp(e) {
  neckPtrs.delete(e.pointerId);
  if (neckPtrs.size < 2) pinch0 = null;
}

function neckWheel(e) {
  if (!e.ctrlKey) return;
  e.preventDefault();
  const rect = $('neckWrap').getBoundingClientRect();
  const i = NECK_ZOOMS.indexOf(state.neckZoom);
  const j = Math.min(NECK_ZOOMS.length - 1, Math.max(0, i + (e.deltaY < 0 ? 1 : -1)));
  neckSetZoom(NECK_ZOOMS[j], e.clientX - rect.left);
}

/* manche complet, quatre orientations.
   Géométrie en axes logiques : L le long du manche (0 = tête),
   T en travers. La projection P place ensuite chaque point selon
   l'orientation ; les textes restent toujours horizontaux. */
function neckSVG(scale, tuning) {
  const nS = tuning.midi.length;
  const pcs = new Map();
  scale.intervals.forEach(iv => pcs.set((state.root + iv) % 12, iv));

  const big = state.big;
  const vert = state.neckView.startsWith('v');
  const flip = state.neckView === 'h-right' || state.neckView === 'v-bottom';
  const z = state.neckZoom;
  const fw = (big ? 56 : 46) * z;
  const sh = (big ? 34 : 27) * z;
  const dotR = (big ? 12 : 9.6) * z;
  const openZone = fw * 0.75;
  const N = state.scaleMaxFret;

  const x0 = 8 + openZone;                 // position du sillet sur L
  const Llen = x0 + N * fw + 12;
  const Tfirst = (vert ? 34 : 14) * z;           // couloir des numéros : à gauche (vertical) / en bas (horizontal)
  const Tlast = Tfirst + (nS - 1) * sh;
  const Tlen = Tlast + (vert ? 14 : 26) * z;

  const W = vert ? Tlen : Llen, H = vert ? Llen : Tlen;
  const P = (L, T) => vert ? [T, flip ? H - L : L] : [flip ? W - L : L, T];
  const rectP = (L1, L2, T1, T2, rx, fill, extra) => {
    const [xa, ya] = P(L1, T1), [xb, yb] = P(L2, T2);
    return '<rect x="' + Math.min(xa, xb) + '" y="' + Math.min(ya, yb) +
      '" width="' + Math.abs(xb - xa) + '" height="' + Math.abs(yb - ya) +
      '" rx="' + rx + '" fill="' + fill + '"' + (extra || '') + '/>';
  };
  // corde s : graves en bas (horizontal) / à gauche (vertical)
  const t = s => vert ? Tfirst + s * sh : Tfirst + (nS - 1 - s) * sh;
  const caseL = f => x0 + f * fw - fw / 2;  // centre longitudinal de la case f

  const s2 = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img">'];

  // touche
  s2.push(rectP(x0, x0 + N * fw, Tfirst - 8, Tlast + 8, 4, DIAG.board));

  // repères
  const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
  const midT = (Tfirst + Tlast) / 2;
  const dotAt = (L, T) => { const [x, y] = P(L, T);
    return '<circle cx="' + x + '" cy="' + y + '" r="' + 4 * z + '" fill="' + DIAG.inlay + '"/>'; };
  for (let f = 1; f <= N; f++) {
    if (f === 12) s2.push(dotAt(caseL(f), midT - sh), dotAt(caseL(f), midT + sh));
    else if (INLAYS.includes(f)) s2.push(dotAt(caseL(f), midT));
  }

  // frettes + numéros
  const numT = vert ? Tfirst - 22 * z : Tlast + 22 * z;
  for (let f = 1; f <= N; f++) {
    s2.push(rectP(x0 + f * fw - 1, x0 + f * fw + 1, Tfirst - 8, Tlast + 8, 1, DIAG.fret));
    if ([3, 5, 7, 9, 12, 15, 17, 19, 21].includes(f)) {
      const [x, y] = P(caseL(f), numT);
      s2.push('<text x="' + x + '" y="' + (y + 4 * z) + '" text-anchor="middle"' +
        ' font-family="ui-monospace,Menlo,monospace" font-size="' + (big ? 13 : 11) * z + '"' +
        ' fill="' + DIAG.num + '">' + f + '</text>');
    }
  }
  // sillet
  s2.push(rectP(x0 - 4, x0 + 1, Tfirst - 8, Tlast + 8, 2, DIAG.nut));

  // cordes
  for (let s = 0; s < nS; s++) {
    const w = 2.4 - 1.5 * (s / (nS - 1));
    s2.push(rectP(8, Llen - 8, t(s) - w / 2, t(s) + w / 2, 0, DIAG.string));
  }

  // notes de la gamme
  for (let s = 0; s < nS; s++) {
    for (let f = 0; f <= N; f++) {
      const midi = tuning.midi[s] + f;
      const pc = midi % 12;
      if (!pcs.has(pc)) continue;
      const iv = pcs.get(pc);
      const label = state.labels === 'notes' ? NOTE_NAMES[pc] : SCALE_LABELS[iv];
      const [bg, fg] = toneColor(iv, pc);
      const L = f === 0 ? 8 + openZone / 2 - 2 : caseL(f);
      const [cx, cy] = P(L, t(s));
      let fs = (label.length > 1 ? 8.6 : 10) * z;
      if (big) fs += 2.2 * z;
      s2.push('<g class="ndot">');
      if (f === 0) {
        s2.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + (dotR - 1.4) + '" fill="' + DIAG.openBg +
          '" stroke="' + bg + '" stroke-width="2.4"/>');
        s2.push('<text x="' + cx + '" y="' + (cy + fs * .36) + '" text-anchor="middle" font-size="' + (fs - 1) +
          '" font-weight="700" font-family="ui-monospace,Menlo,monospace" fill="' + bg + '">' + label + '</text>');
      } else {
        s2.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + dotR + '" fill="' + bg +
          '" stroke="' + (iv === 0 ? DIAG.nut : DIAG.dotStroke) + '" stroke-width="' + (iv === 0 ? 2 : 1) + '"/>');
        s2.push('<text x="' + cx + '" y="' + (cy + fs * .36) + '" text-anchor="middle" font-size="' + fs +
          '" font-weight="700" font-family="ui-monospace,Menlo,monospace" fill="' + fg + '">' + label + '</text>');
      }
      s2.push('</g>');
    }
  }

  s2.push('</svg>');
  return s2.join('');
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
  const big = state.big;
  const dotR = big ? 11 : 9.4, openR = big ? 8.8 : 7.4;
  const s2 = [];

  s2.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">');

  // touche neutre sombre : les pastilles colorées portent l'information
  s2.push('<rect x="' + (LEFT - 7) + '" y="' + (TOP - 2) + '" width="' + (gridW + 14) +
    '" height="' + (NROWS * fretH + 4) + '" rx="4" fill="' + DIAG.board + '"/>');

  // repères de cases (3,5,7,9,15,17… — double au 12)
  const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
  for (let r = 0; r < NROWS; r++) {
    const fret = base + r;
    const cy = fy(r) + fretH / 2;
    if (fret === 12) {
      s2.push('<circle cx="' + (LEFT + gridW * .3) + '" cy="' + cy + '" r="3.2" fill="' + DIAG.inlay + '"/>',
              '<circle cx="' + (LEFT + gridW * .7) + '" cy="' + cy + '" r="3.2" fill="' + DIAG.inlay + '"/>');
    } else if (INLAYS.includes(fret)) {
      s2.push('<circle cx="' + (LEFT + gridW / 2) + '" cy="' + cy + '" r="3.2" fill="' + DIAG.inlay + '"/>');
    }
  }

  // frettes
  for (let r = 1; r <= NROWS; r++) {
    s2.push('<rect x="' + (LEFT - 7) + '" y="' + (fy(r) - 1) + '" width="' + (gridW + 14) +
      '" height="2" rx="1" fill="' + DIAG.fret + '"/>');
  }
  // sillet ou numéro de case
  if (base === 1) {
    s2.push('<rect x="' + (LEFT - 7) + '" y="' + (TOP - 4.5) + '" width="' + (gridW + 14) +
      '" height="5" rx="1.5" fill="' + DIAG.nut + '"/>');
  } else {
    s2.push('<rect x="' + (LEFT - 7) + '" y="' + (TOP - 1.2) + '" width="' + (gridW + 14) +
      '" height="2.4" rx="1.2" fill="' + DIAG.fret + '"/>');
    s2.push('<text x="' + (LEFT - 12) + '" y="' + (TOP + fretH / 2 + 4) +
      '" text-anchor="end" font-family="ui-monospace,Menlo,monospace" font-size="11"' +
      ' font-weight="700" fill="' + DIAG.num + '">' + base + '</text>');
  }

  // cordes
  for (let s = 0; s < nS; s++) {
    const w = 2.2 - 1.4 * (s / (nS - 1));
    s2.push('<rect x="' + (sx(s) - w / 2) + '" y="' + (TOP - 2) + '" width="' + w +
      '" height="' + (NROWS * fretH + 4) + '" fill="' + DIAG.string + '"/>');
  }

  // barré : bande claire discrète derrière les pastilles
  if (v.barre) {
    const y = fy(v.barre.fret - base) + fretH / 2;
    s2.push('<rect x="' + (sx(v.barre.from) - 7.5) + '" y="' + (y - 7) +
      '" width="' + (sx(v.barre.to) - sx(v.barre.from) + 15) +
      '" height="14" rx="7" fill="' + DIAG.barre + '" opacity=".30"/>');
  }

  // marqueurs ✕ / ○ et pastilles colorées

  for (let s = 0; s < nS; s++) {
    const f = v.frets[s], x = sx(s);
    if (f === MUTE) {
      s2.push('<text x="' + x + '" y="' + (TOP - 8) + '" text-anchor="middle" font-size="' + (big ? 14 : 12) + '"' +
        ' font-weight="700" font-family="system-ui" fill="' + DIAG.mute + '">\u2715</text>');
      continue;
    }
    const midi = tuning.midi[s] + f;
    const pc = midi % 12;
    const iv = curPcs.get(pc);
    const label = state.labels === 'notes' ? NOTE_NAMES[pc]
      : ((curChord.labels && curChord.labels[iv]) || INTERVAL_LABELS[iv]);
    const [bg, fg] = toneColor(iv, pc);
    let small = label.length > 2 ? 7.4 : label.length > 1 ? 8.2 : 9.5;
    if (big) small += 1.8;
    if (f === 0) {
      // corde à vide : anneau coloré au-dessus du sillet
      s2.push('<circle cx="' + x + '" cy="' + (TOP - 13) + '" r="' + openR + '" fill="' + DIAG.openBg + '"' +
        ' stroke="' + bg + '" stroke-width="2.4"/>');
      s2.push('<text x="' + x + '" y="' + (TOP - 13 + small * .36) + '" text-anchor="middle"' +
        ' font-size="' + (small - 1) + '" font-weight="700"' +
        ' font-family="ui-monospace,Menlo,monospace" fill="' + bg + '">' + label + '</text>');
    } else {
      const cy = fy(f - base) + fretH / 2;
      s2.push('<circle cx="' + x + '" cy="' + cy + '" r="' + dotR + '" fill="' + bg + '"' +
        ' stroke="' + DIAG.dotStroke + '" stroke-width="1"/>');
      s2.push('<text x="' + x + '" y="' + (cy + small * .36) + '" text-anchor="middle"' +
        ' font-size="' + small + '" font-weight="700"' +
        ' font-family="ui-monospace,Menlo,monospace" fill="' + fg + '">' + label + '</text>');
    }
  }

  s2.push('</svg>');
  return s2.join('');
}


/* ============================================================
   Démarrage + PWA
   ============================================================ */
document.getElementById('appVersion').textContent = APP_VERSION;
buildControls();
$('neckZoomIn').addEventListener('click', () => neckZoomStep(1));
$('neckZoomOut').addEventListener('click', () => neckZoomStep(-1));
$('neckWrap').addEventListener('pointerdown', neckPointerDown);
$('neckWrap').addEventListener('pointermove', neckPointerMove);
$('neckWrap').addEventListener('pointerup', neckPointerUp);
$('neckWrap').addEventListener('pointercancel', neckPointerUp);
$('neckWrap').addEventListener('wheel', neckWheel, { passive: false });
applyBig();
applyTheme(false);
document.documentElement.dataset.tool = state.tool;
$('tabChords').setAttribute('aria-pressed', String(state.tool === 'chords'));
$('tabScales').setAttribute('aria-pressed', String(state.tool === 'scales'));
refreshCurrent();
if (state.tool === 'scales') refresh();   // pré-rendu de l'outil accords en arrière-plan

/* --- mises à jour --- */
function updHint(txt) {
  const el = document.getElementById('updHint');
  if (el) el.textContent = txt;
}

async function serverVersion() {
  // lit la version réellement déployée, en ignorant tous les caches
  const res = await fetch('sw.js?ts=' + Date.now(), { cache: 'no-store' });
  const m = (await res.text()).match(/guitarchords-(v\d+)/);
  return m ? m[1] : null;
}

async function forceRefresh() {
  // équivalent d'un effacement du cache, sans toucher aux accords/gammes
  // enregistrés ni aux réglages (localStorage préservé)
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  } catch (e) {}
  location.reload();
}

async function checkForUpdate(manual) {
  if (!('serviceWorker' in navigator)) {
    if (manual) updHint('Indisponible dans cet environnement (aper\u00e7u).');
    return;
  }
  try {
    if (manual) updHint('Recherche\u2026');
    const sv = await serverVersion();
    if (sv === APP_VERSION) {
      if (manual) updHint('D\u00e9j\u00e0 \u00e0 jour (' + APP_VERSION + ').');
      return;
    }
    updHint((sv ? sv + ' disponible' : 'Mise \u00e0 jour') + ', installation\u2026');
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update();
    // si la nouvelle version n'a pas pris la main en 5 s
    // (controllerchange aurait rechargé la page), on force
    setTimeout(forceRefresh, 5000);
  } catch (e) {
    if (manual) updHint('V\u00e9rification impossible : hors-ligne\u2009?');
  }
}

if ('serviceWorker' in navigator) {
  try {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
    // quand une nouvelle version prend la main, recharger une fois
    // pour servir immédiatement les fichiers frais
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
    // une PWA installée peut rester ouverte longtemps sans navigation :
    // on vérifie aussi à chaque retour au premier plan
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate(false);
    });
  } catch (e) {}
}
document.getElementById('updHint').textContent = 'Version install\u00e9e : ' + APP_VERSION;
document.getElementById('optUpdate').addEventListener('click', () => checkForUpdate(true));
