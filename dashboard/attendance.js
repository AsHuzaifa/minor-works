/* ===========================================================================
   Smart Attendance Register System - console

   A reconstruction of the Flask page that fronted the original build. The
   original read a SQLite table an OpenCV loop wrote to; this runs the same
   surface with the matcher in the browser, against a simulated room. Every
   number here is produced by the simulation below, seeded so the page is the
   same on every load.

   The one honest piece of the original that survives intact is the decision:
   a face crop becomes a 128-d vector, the vector is compared by cosine
   distance against the enrolled set, and anything at or under the threshold
   is a match. Everything else on this page is scaffolding around that number.
   =========================================================================== */

const SEED = 512; // the project's own seed, kept
const STORE_KEY = 'ashuzaifa.attendance.v2';
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- deterministic randomness ------------------------------------------- */

function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Box-Muller, so the distance draws are actually normal rather than a
   triangular fudge. Clamped, because a cosine distance cannot leave [0, 1]. */
function gauss(rnd, mean, sd) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return clamp(mean + n * sd, 0.02, 0.99);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pad2 = (n) => String(n).padStart(2, '0');
const pct = (n) => Math.round(n * 100);
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/* ---- the two distributions the matcher lives between --------------------- */

const GENUINE = { mean: 0.36, sd: 0.085 }; // same person, different frame
const IMPOSTOR = { mean: 0.74, sd: 0.085 }; // anyone else

/* ---- roster ------------------------------------------------------------- */

const NAMES = [
  'Aisha Rahman', 'Rohit Menon', 'Sanjana Iyer', 'Faizan Qureshi', 'Neha Bhatt',
  'Arjun Nair', 'Meera Krishnan', 'Zaid Ansari', 'Kavya Reddy', 'Imran Sheikh',
  'Priya Deshmukh', 'Aditya Rao', 'Fatima Siddiqui', 'Vikram Joshi', 'Ananya Ghosh',
  'Tanvir Alam', 'Divya Pillai', 'Harsh Vardhan', 'Ayesha Khan', 'Nikhil Shetty',
  'Ritika Sen', 'Omar Farooq', 'Sneha Kulkarni', 'Yusuf Baig', 'Pooja Mehta',
  'Karthik Subramanian', 'Zara Mirza', 'Abhishek Dutta', 'Lakshmi Varma', 'Sameer Chowdhury',
];

const CLASSES = [
  { id: 'cse-a', label: 'CSE A / Sem 5', size: 24, offset: 0 },
  { id: 'ece-b', label: 'ECE B / Sem 3', size: 20, offset: 6 },
  { id: 'mech-c', label: 'MECH C / Sem 7', size: 18, offset: 12 },
];

const SESSIONS_BACK = 14;

function buildClass(def) {
  const rnd = mulberry32(SEED + def.offset * 977);
  const students = [];

  for (let i = 0; i < def.size; i += 1) {
    const name = NAMES[(i + def.offset) % NAMES.length];
    students.push({
      id: def.id + '-' + i,
      roll: def.id.slice(0, 3).toUpperCase() + pad2(i + 1),
      name: name,
      /* how reliably this face matches: some people wear glasses, some sit
         under the window, some never look at the camera */
      bias: (rnd() - 0.35) * 0.14,
      samples: 3 + Math.floor(rnd() * 3),
      propensity: 0.58 + rnd() * 0.41,
      seat: { x: 0.1 + rnd() * 0.76, y: 0.24 + rnd() * 0.5, s: 0.78 + rnd() * 0.5 },
      history: [],
    });
  }

  /* Historical sessions, newest last. The mid-term dip is deliberate: the
     camera was moved to the back of the room that week and the crops got
     smaller, so more people fell the wrong side of the threshold. */
  const today = new Date();
  const sessions = [];
  for (let s = 0; s < SESSIONS_BACK; s += 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - (SESSIONS_BACK - s) * 3);
    const dip = s >= 6 && s <= 8 ? 0.2 : 0;
    const wobble = (rnd() - 0.5) * 0.1;
    let present = 0;
    students.forEach((st) => {
      const here = rnd() < clamp(st.propensity - dip + wobble, 0.05, 0.99);
      st.history.push(here);
      if (here) present += 1;
    });
    sessions.push({
      date: d,
      label: pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1),
      present: present,
      size: students.length,
      rate: present / students.length,
    });
  }

  students.forEach((st) => {
    st.attended = st.history.filter(Boolean).length;
    st.rate = st.attended / st.history.length;
  });

  return { id: def.id, label: def.label, students: students, sessions: sessions };
}

/* ---- state -------------------------------------------------------------- */

const state = {
  classes: CLASSES.map(buildClass),
  classId: CLASSES[0].id,
  threshold: 0.52,
  running: false,
  closed: false,
  boxes: true,
  frame: 0,
  fps: 0,
  hits: 0,
  misses: 0,
  sightings: 0,
  filter: 'all',
  query: '',
  sort: { key: 'roll', dir: 1 },
  rows: new Map(), // student id -> register row
  truth: new Set(), // who is actually in the room this session
  samples: [], // { d, genuine }
  tracks: [],
  log: [],
  rnd: mulberry32(SEED),
};

const cls = () => state.classes.find((c) => c.id === state.classId);

/* ---- persistence -------------------------------------------------------- */

function save() {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        classId: state.classId,
        threshold: state.threshold,
        boxes: state.boxes,
        closed: state.classes.map((c) => ({ id: c.id, extra: c.extra || [] })),
      })
    );
  } catch (e) {
    /* private mode, quota, a browser that blocks site data. Not worth a fuss. */
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const v = JSON.parse(raw);
    if (v.classId && state.classes.some((c) => c.id === v.classId)) state.classId = v.classId;
    if (typeof v.threshold === 'number') state.threshold = clamp(v.threshold, 0.25, 0.85);
    if (typeof v.boxes === 'boolean') state.boxes = v.boxes;
    (v.closed || []).forEach((row) => {
      const c = state.classes.find((x) => x.id === row.id);
      if (!c || !Array.isArray(row.extra)) return;
      c.extra = row.extra;
      row.extra.forEach((s) => c.sessions.push(reviveSession(s)));
    });
  } catch (e) {
    /* fall through to defaults */
  }
}

function reviveSession(s) {
  return { date: new Date(s.date), label: s.label, present: s.present, size: s.size, rate: s.rate };
}

/* ---- session ------------------------------------------------------------ */

function newSession() {
  const c = cls();
  state.rnd = mulberry32(SEED + Date.now() % 100000);
  state.frame = 0;
  state.hits = 0;
  state.misses = 0;
  state.sightings = 0;
  state.tracks = [];
  state.log = [];
  state.closed = false;
  state.rows = new Map();
  state.truth = new Set();

  c.students.forEach((st) => {
    state.rows.set(st.id, {
      id: st.id,
      status: 'absent',
      first: null,
      last: null,
      hits: 0,
      best: null,
      flagged: false,
      manual: null,
    });
    if (state.rnd() < st.propensity) state.truth.add(st.id);
  });

  /* Seed the histogram with the attempts from previous sessions, so the two
     distributions have a shape before this session has produced anything. */
  state.samples = [];
  const seedRnd = mulberry32(SEED + 31);
  for (let i = 0; i < 760; i += 1) state.samples.push({ d: gauss(seedRnd, GENUINE.mean, GENUINE.sd), genuine: true });
  for (let i = 0; i < 210; i += 1) state.samples.push({ d: gauss(seedRnd, IMPOSTOR.mean, IMPOSTOR.sd), genuine: false });

  pushLog('sys', 'Session opened for <b>' + esc(c.label) + '</b>. ' + c.students.length + ' enrolled.');
  pushLog('sys', 'Detector warm, threshold at <b>' + state.threshold.toFixed(2) + '</b>.');
}

function closeSession() {
  if (state.closed) return;
  const c = cls();
  const present = countBy('present');
  const d = new Date();
  const row = {
    date: d,
    label: pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1),
    present: present,
    size: c.students.length,
    rate: present / c.students.length,
  };
  c.sessions.push(row);
  c.extra = (c.extra || []).concat([{ date: d.toISOString(), label: row.label, present: present, size: row.size, rate: row.rate }]);
  state.running = false;
  state.closed = true;
  pushLog('sys', 'Roll closed. <b>' + present + '</b> of ' + c.students.length + ' written to the register.');
  save();
  renderAll();
}

/* ---- the matcher -------------------------------------------------------- */

function attempt(track) {
  const c = cls();
  const rnd = state.rnd;
  const genuine = !track.visitor;
  const subject = track.student;

  const d = genuine
    ? gauss(rnd, GENUINE.mean + subject.bias, GENUINE.sd)
    : gauss(rnd, IMPOSTOR.mean, IMPOSTOR.sd);

  state.samples.push({ d: d, genuine: genuine });
  /* the histogram only ever shows a shape, and an unbounded pool would make a
     long session slower and slower for no gain in the picture */
  if (state.samples.length > 4000) state.samples.splice(0, 400);
  state.frame += 1;
  state.sightings += 1;

  const accepted = d <= state.threshold;
  track.state = accepted ? 'ok' : 'no';
  track.dist = d;

  /* A false accept does not politely announce itself. The matcher simply hands
     back its nearest enrolled neighbour, and someone who is not in the room
     gets marked present. That is the whole cost of a loose threshold. */
  const claimed = genuine ? subject : nearestNeighbour(c);
  track.claimed = claimed;

  if (!accepted) {
    state.misses += 1;
    if (genuine) {
      const row = state.rows.get(subject.id);
      row.near = Math.min(row.near == null ? 1 : row.near, d);
      if (row.status === 'absent') row.status = 'review';
      pushLog('no', 'frame ' + state.frame + ' &middot; no match for the face at seat ' + track.seatNo + ' &middot; nearest <em>' + d.toFixed(2) + '</em>');
    } else {
      pushLog('no', 'frame ' + state.frame + ' &middot; unenrolled subject rejected &middot; nearest <em>' + d.toFixed(2) + '</em>');
    }
    return;
  }

  state.hits += 1;
  const row = state.rows.get(claimed.id);
  const now = new Date();
  row.hits += 1;
  row.last = now;
  if (row.best == null || d < row.best) row.best = d;

  if (row.first == null) {
    row.first = now;
    row.status = 'present';
    pushLog('ok', 'frame ' + state.frame + ' &middot; matched <b>' + esc(claimed.roll) + ' ' + esc(claimed.name) + '</b> &middot; d <em>' + d.toFixed(2) + '</em> &middot; row written');
  } else {
    pushLog('ok', 'frame ' + state.frame + ' &middot; matched <b>' + esc(claimed.roll) + '</b> &middot; d <em>' + d.toFixed(2) + '</em> &middot; deduplicated');
  }

  if (!genuine) {
    row.flagged = true;
    row.status = 'review';
    pushLog('warn', 'frame ' + state.frame + ' &middot; <em>false accept</em> &middot; an unenrolled face claimed <b>' + esc(claimed.roll) + '</b> at d ' + d.toFixed(2));
  }
}

/* Whichever enrolled vector happens to sit closest. The matcher has no notion
   of "none of the above": it always returns its best neighbour, and the
   threshold is the only thing standing between that answer and the register. */
function nearestNeighbour(c) {
  return c.students[Math.floor(state.rnd() * c.students.length)];
}

/* ---- tracks ------------------------------------------------------------- */

function spawnTrack() {
  const c = cls();
  const rnd = state.rnd;
  const inRoom = c.students.filter((s) => state.truth.has(s.id));
  if (!inRoom.length) return;

  const visitor = rnd() < 0.11;
  const student = inRoom[Math.floor(rnd() * inRoom.length)];
  const seat = visitor ? { x: 0.12 + rnd() * 0.72, y: 0.3 + rnd() * 0.4, s: 0.9 } : student.seat;

  if (!visitor && state.tracks.some((t) => t.student && t.student.id === student.id)) return;

  state.tracks.push({
    student: student,
    visitor: visitor,
    seatNo: 1 + Math.floor(seat.x * 8),
    x: seat.x,
    y: seat.y,
    s: seat.s,
    phase: rnd() * Math.PI * 2,
    born: performance.now(),
    life: 1900 + rnd() * 2600,
    nextAt: performance.now() + 260 + rnd() * 300,
    state: 'scan',
    dist: null,
    claimed: null,
  });
}

/* ---- log ---------------------------------------------------------------- */

function pushLog(kind, html) {
  const d = new Date();
  state.log.unshift({
    kind: kind,
    t: pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()),
    html: html,
  });
  if (state.log.length > 220) state.log.length = 220;
}

function renderLog() {
  const el = $('#log');
  if (!state.log.length) {
    el.innerHTML = '<p class="tape__empty">Nothing printed yet. Start a sitting to fill the register.</p>';
    return;
  }
  el.innerHTML = state.log
    .map((e) => '<div class="ev ev--' + e.kind + '"><span class="ev__t">' + e.t + '</span><span class="ev__m">' + e.html + '</span></div>')
    .join('');
}

/* ---- canvas feed -------------------------------------------------------- */

const feed = $('#feed');
const fctx = feed.getContext('2d');
const W = feed.width;
const H = feed.height;

/* One small noise tile, drawn scaled up. Cheaper than per-pixel work every
   frame and it reads the same at this size. */
const grain = (() => {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 80;
  const g = c.getContext('2d');
  const img = g.createImageData(c.width, c.height);
  const r = mulberry32(SEED + 7);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 130 + r() * 125;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
})();

/* The viewfinder is the one dark surface on the whole page, because a screen
   behind glass is dark. Its marks are the light ends of the same two hues. */
const INK = {
  ok: '#bad797',
  no: '#e8748f',
  warn: '#e6b45c',
  scan: '#bad797',
  muted: '#9a8087',
};

function drawFeed(now) {
  fctx.clearRect(0, 0, W, H);

  fctx.fillStyle = '#14040b';
  fctx.fillRect(0, 0, W, H);

  const wash = fctx.createLinearGradient(0, 0, 0, H);
  wash.addColorStop(0, 'rgba(103, 6, 39, 0.42)');
  wash.addColorStop(0.55, 'rgba(58, 4, 22, 0.25)');
  wash.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  fctx.fillStyle = wash;
  fctx.fillRect(0, 0, W, H);

  // benches, receding
  fctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
  for (let i = 0; i < 4; i += 1) {
    const y = H * (0.42 + i * 0.145);
    const inset = (3 - i) * 26;
    fctx.fillRect(inset, y, W - inset * 2, H * 0.035);
  }

  fctx.globalAlpha = 0.055;
  fctx.drawImage(grain, 0, 0, W, H);
  fctx.globalAlpha = 1;

  if (state.boxes) state.tracks.forEach((t) => drawTrack(t, now));

  // sweep
  if (state.running && !REDUCED) {
    const y = ((now / 2600) % 1) * H;
    const g = fctx.createLinearGradient(0, y - 46, 0, y + 6);
    g.addColorStop(0, 'rgba(186, 215, 151, 0)');
    g.addColorStop(1, 'rgba(186, 215, 151, 0.14)');
    fctx.fillStyle = g;
    fctx.fillRect(0, y - 46, W, 52);
    fctx.fillStyle = 'rgba(186, 215, 151, 0.4)';
    fctx.fillRect(0, y, W, 1.5);
  }

  // HUD
  fctx.font = '400 15px "JetBrains Mono", monospace';
  fctx.fillStyle = 'rgba(164, 140, 148, 0.85)';
  fctx.fillText('CAM 01  640x400  ' + (state.running ? 'LIVE' : state.closed ? 'CLOSED' : 'IDLE'), 18, 30);
  const stamp = new Date();
  fctx.textAlign = 'right';
  fctx.fillText(pad2(stamp.getHours()) + ':' + pad2(stamp.getMinutes()) + ':' + pad2(stamp.getSeconds()), W - 18, 30);
  fctx.textAlign = 'left';

  // corner ticks
  fctx.strokeStyle = 'rgba(247, 238, 241, 0.14)';
  fctx.lineWidth = 2;
  const m = 14;
  const L = 26;
  [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, sx, sy]) => {
    fctx.beginPath();
    fctx.moveTo(x + L * sx, y);
    fctx.lineTo(x, y);
    fctx.lineTo(x, y + L * sy);
    fctx.stroke();
  });
}

function drawTrack(t, now) {
  const drift = REDUCED ? 0 : Math.sin(now / 900 + t.phase) * 6;
  const bw = 118 * t.s;
  const bh = 142 * t.s;
  const cx = t.x * W + drift;
  const cy = t.y * H + Math.cos(now / 1200 + t.phase) * (REDUCED ? 0 : 4);
  const x = cx - bw / 2;
  const y = cy - bh / 2;

  const color = t.state === 'ok' ? INK.ok : t.state === 'no' ? INK.no : INK.muted;

  // the head inside the box, so a box is never empty
  fctx.fillStyle = 'rgba(247, 238, 241, 0.09)';
  fctx.beginPath();
  fctx.ellipse(cx, cy - bh * 0.06, bw * 0.3, bh * 0.34, 0, 0, Math.PI * 2);
  fctx.fill();
  fctx.beginPath();
  fctx.ellipse(cx, cy + bh * 0.62, bw * 0.62, bh * 0.42, 0, Math.PI, Math.PI * 2);
  fctx.fill();

  // the region under consideration
  fctx.fillStyle = t.state === 'ok' ? 'rgba(124, 162, 69, 0.1)' : t.state === 'no' ? 'rgba(202, 48, 91, 0.1)' : 'rgba(247, 238, 241, 0.05)';
  fctx.fillRect(x, y, bw, bh);

  // corner brackets rather than a full box: less ink, same read
  fctx.strokeStyle = color;
  fctx.lineWidth = 2.5;
  const c = Math.min(22, bw * 0.28);
  [[x, y, 1, 1], [x + bw, y, -1, 1], [x, y + bh, 1, -1], [x + bw, y + bh, -1, -1]].forEach(([px, py, sx, sy]) => {
    fctx.beginPath();
    fctx.moveTo(px + c * sx, py);
    fctx.lineTo(px, py);
    fctx.lineTo(px, py + c * sy);
    fctx.stroke();
  });

  // label chip
  const label =
    t.state === 'scan'
      ? 'scanning'
      : t.state === 'ok'
      ? (t.claimed ? t.claimed.roll : '') + '  ' + (1 - t.dist).toFixed(2)
      : 'no match  ' + t.dist.toFixed(2);

  fctx.font = '400 15px "JetBrains Mono", monospace';
  const tw = fctx.measureText(label).width;
  const lw = tw + 18;
  const lx = clamp(cx - lw / 2, 4, W - lw - 4);
  const ly = y + bh + 8;

  fctx.fillStyle = 'rgba(18, 3, 9, 0.88)';
  roundRect(fctx, lx, ly, lw, 26, 5);
  fctx.fill();
  fctx.strokeStyle = color;
  fctx.lineWidth = 1;
  roundRect(fctx, lx, ly, lw, 26, 5);
  fctx.stroke();
  fctx.fillStyle = color;
  fctx.fillText(label, lx + 9, ly + 18);
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/* ---- loop --------------------------------------------------------------- */

let raf = 0;
let lastTick = 0;
let lastSpawn = 0;
let fpsMark = 0;
let fpsCount = 0;

function loop(now) {
  raf = requestAnimationFrame(loop);

  if (state.running) {
    const tickEvery = REDUCED ? 420 : 92;

    if (now - lastSpawn > (REDUCED ? 1500 : 780) && state.tracks.length < 4) {
      spawnTrack();
      lastSpawn = now;
    }

    state.tracks = state.tracks.filter((t) => now - t.born < t.life);

    state.tracks.forEach((t) => {
      if (now >= t.nextAt) {
        attempt(t);
        t.nextAt = now + 620 + state.rnd() * 520;
      }
    });

    if (now - lastTick > tickEvery) {
      lastTick = now;
      fpsCount += 1;
      renderLive(now);
    }

    if (now - fpsMark > 1000) {
      state.fps = fpsCount;
      fpsCount = 0;
      fpsMark = now;
    }
  }

  drawFeed(now);
}

/* Two speeds. The readouts are a handful of text nodes and can run at the tick
   rate; the table, the log and the histogram rebuild whole subtrees, so they go
   at 2.5 Hz. Rebuilding the table at 11 Hz also fought the pointer, because a
   row could be replaced out from under a hover. */
let lastHeavy = 0;

function renderLive(now) {
  $('#ro-frame').textContent = state.frame;
  $('#ro-fps').textContent = state.fps;
  $('#ro-faces').textContent = state.tracks.length;
  $('#ro-hit').textContent = state.hits;
  $('#ro-miss').textContent = state.misses;
  renderHero();

  const t = now == null ? performance.now() : now;
  if (t - lastHeavy < 400) return;
  lastHeavy = t;
  /* Close roll starts disabled and only earns its way in once there is a frame
     to close, so the button state has to be refreshed here rather than only on
     the run/pause click, which happens before any frame exists. */
  setRunning(state.running);
  renderLog();
  renderKpis();
  renderRegister();
  renderHistogram();
}

/* ---- SVG helpers -------------------------------------------------------- */

const SURFACE = '#fbf7ef'; // the ledger paper the marks are printed on

function svg(w, h, body) {
  return '<svg class="chart-svg" viewBox="0 0 ' + w + ' ' + h + '" role="img" preserveAspectRatio="xMidYMid meet">' + body + '</svg>';
}

/* A bar with a 4px rounded data end and a square baseline end. */
function barPath(x, y, w, h, r, side) {
  const rr = Math.min(r, w / 2, h);
  if (h <= 0.5) return '';
  if (side === 'top') {
    return `M${x} ${y + h} L${x} ${y + rr} Q${x} ${y} ${x + rr} ${y} L${x + w - rr} ${y} Q${x + w} ${y} ${x + w} ${y + rr} L${x + w} ${y + h} Z`;
  }
  // side === 'right'
  return `M${x} ${y} L${x + w - rr} ${y} Q${x + w} ${y} ${x + w} ${y + rr} L${x + w} ${y + h - rr} Q${x + w} ${y + h} ${x + w - rr} ${y + h} L${x} ${y + h} Z`;
}

/* Axis ticks land on 1 / 2 / 5 x a power of ten, so the labels stay readable
   whatever the counts happen to be. */
function niceStep(max, target) {
  const raw = max / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  return Math.max(1, Math.round(step));
}

function gridLine(x1, y1, x2, y2) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#e5dcc9" stroke-width="1" />`;
}

/* ---- chart: match distance distribution --------------------------------- */

const BIN_LO = 0.1;
const BIN_HI = 1.0;
const BINS = 30;

function bins() {
  const g = new Array(BINS).fill(0);
  const i = new Array(BINS).fill(0);
  state.samples.forEach((s) => {
    const k = clamp(Math.floor(((s.d - BIN_LO) / (BIN_HI - BIN_LO)) * BINS), 0, BINS - 1);
    if (s.genuine) g[k] += 1;
    else i[k] += 1;
  });
  return { g: g, i: i };
}

function renderHistogram() {
  const w = 660;
  const h = 236;
  const pad = { t: 20, r: 14, b: 34, l: 40 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const b = bins();
  const max = Math.max(1, ...b.g.map((v, k) => v + b.i[k]));
  const step = niceStep(max, 4);
  const top = Math.ceil(max / step) * step;

  const xOf = (d) => pad.l + ((d - BIN_LO) / (BIN_HI - BIN_LO)) * iw;
  const yOf = (v) => pad.t + ih - (v / top) * ih;
  const bw = iw / BINS;

  let out = '';

  for (let v = 0; v <= top; v += step) {
    out += gridLine(pad.l, yOf(v), pad.l + iw, yOf(v));
    out += `<text class="tick tick--val" x="${pad.l - 8}" y="${yOf(v) + 3.5}" text-anchor="end">${v}</text>`;
  }

  for (let k = 0; k < BINS; k += 1) {
    const gN = b.g[k];
    const iN = b.i[k];
    const x = pad.l + k * bw + 1; // 2px gap between neighbouring bars, halved each side
    const cw = Math.max(1, bw - 2);
    const total = gN + iN;
    if (!total) continue;

    const yTop = yOf(total);
    const hTot = pad.t + ih - yTop;
    // genuine sits at the baseline, impostor stacks above it
    const hG = (gN / total) * hTot;
    const hI = hTot - hG;

    if (hI > 0.5) {
      out += `<path d="${barPath(x, yTop, cw, hI, 4, 'top')}" fill="#a3003d" />`;
    }
    if (hG > 0.5) {
      // 2px surface gap keeps the two segments apart without a stroke
      const gap = hI > 0.5 ? 2 : 0;
      out += `<path d="${barPath(x, yTop + hI + gap, cw, hG - gap, hI > 0.5 ? 0 : 4, 'top')}" fill="#789949" />`;
    }

    const lo = (BIN_LO + (k / BINS) * (BIN_HI - BIN_LO)).toFixed(2);
    const hi = (BIN_LO + ((k + 1) / BINS) * (BIN_HI - BIN_LO)).toFixed(2);
    out += `<rect class="hit" x="${pad.l + k * bw}" y="${pad.t}" width="${bw}" height="${ih}"
      data-tip="${esc('d ' + lo + ' to ' + hi + '|' + gN + ' same person|' + iN + ' different person')}" />`;
  }

  for (let d = 0.2; d <= 1.001; d += 0.2) {
    out += `<text class="tick tick--val" x="${xOf(d)}" y="${h - 14}" text-anchor="middle">${d.toFixed(1)}</text>`;
  }
  out += `<text class="tick" x="${pad.l + iw / 2}" y="${h - 1}" text-anchor="middle">cosine distance to the nearest enrolled vector</text>`;

  // baseline
  out += `<line x1="${pad.l}" y1="${pad.t + ih}" x2="${pad.l + iw}" y2="${pad.t + ih}" stroke="#c9bda9" stroke-width="1" />`;

  // the threshold
  const tx = xOf(state.threshold);
  out += `<line x1="${tx}" y1="${pad.t - 6}" x2="${tx}" y2="${pad.t + ih}" stroke="#670627" stroke-width="2" stroke-linecap="round" />`;
  out += `<text class="dlabel" x="${tx - 7}" y="${pad.t - 9}" text-anchor="end">accept &#8592; ${state.threshold.toFixed(2)}</text>`;
  out += `<text class="annot" x="${tx + 7}" y="${pad.t - 9}">&#8594; reject</text>`;

  $('#fig-hist').innerHTML = svg(w, h, out);
  renderTradeoff();
}

function renderTradeoff() {
  let tp = 0;
  let fr = 0;
  let fa = 0;
  let tn = 0;
  state.samples.forEach((s) => {
    const accept = s.d <= state.threshold;
    if (s.genuine) accept ? (tp += 1) : (fr += 1);
    else accept ? (fa += 1) : (tn += 1);
  });
  $('#tr-tp').textContent = tp.toLocaleString();
  $('#tr-tn').textContent = tn.toLocaleString();
  $('#tr-fr').textContent = fr.toLocaleString();
  $('#tr-fa').textContent = fa.toLocaleString();

  const gTot = tp + fr || 1;
  const iTot = fa + tn || 1;
  const frr = fr / gTot;
  const far = fa / iTot;

  let verdict;
  if (far > 0.03) {
    verdict = 'Loose. ' + pct(far) + '% of the strangers who walked past this camera were let in under someone else\'s roll number. Attendance stops meaning anything before it looks broken.';
  } else if (frr > 0.15) {
    verdict = 'Tight. ' + pct(frr) + '% of genuine faces were turned away, so students who sat through the whole class get marked absent and come to argue about it afterwards.';
  } else {
    verdict = 'A workable middle. ' + pct(frr) + '% of genuine faces rejected, ' + pct(far) + '% of strangers accepted. The register is wrong sometimes in both directions, which is the most any single number can buy you.';
  }
  $('#thresh-verdict').textContent = verdict;
}

/* ---- chart: attendance across the term ---------------------------------- */

function renderHistory() {
  const c = cls();
  const data = c.sessions.slice(-16);
  const w = 660;
  const h = 236;
  const pad = { t: 18, r: 54, b: 34, l: 42 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;

  const lo = 40;
  const hi = 100;
  const xOf = (i) => pad.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const yOf = (v) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;

  let out = '';
  for (let v = lo; v <= hi; v += 15) {
    out += gridLine(pad.l, yOf(v), pad.l + iw, yOf(v));
    out += `<text class="tick tick--val" x="${pad.l - 8}" y="${yOf(v) + 3.5}" text-anchor="end">${v}%</text>`;
  }

  const pts = data.map((s, i) => [xOf(i), yOf(clamp(pct(s.rate), lo, hi))]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');

  out += `<path d="${line} L${pts[pts.length - 1][0]} ${pad.t + ih} L${pts[0][0]} ${pad.t + ih} Z" fill="#789949" fill-opacity="0.1" />`;
  out += `<path d="${line}" fill="none" stroke="#789949" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;

  data.forEach((s, i) => {
    const last = i === data.length - 1;
    if (last) {
      out += `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="6" fill="#789949" stroke="${SURFACE}" stroke-width="2" />`;
      out += `<text class="dlabel" x="${pts[i][0] + 12}" y="${pts[i][1] + 4}">${pct(s.rate)}%</text>`;
    }
    out += `<rect class="hit" x="${pts[i][0] - iw / data.length / 2}" y="${pad.t}" width="${iw / data.length}" height="${ih}"
      data-tip="${esc(s.label + '|' + pct(s.rate) + '% present|' + s.present + ' of ' + s.size)}" />`;
    if (i % 3 === 0 || last) {
      out += `<text class="tick tick--val" x="${pts[i][0]}" y="${h - 14}" text-anchor="middle">${s.label}</text>`;
    }
  });

  out += `<line x1="${pad.l}" y1="${pad.t + ih}" x2="${pad.l + iw}" y2="${pad.t + ih}" stroke="#c9bda9" stroke-width="1" />`;

  $('#fig-history').innerHTML = svg(w, h, out);
}

/* ---- chart: attendance rate by student ---------------------------------- */

function renderStudents() {
  const c = cls();
  const rows = c.students.slice().sort((a, b) => a.rate - b.rate);
  const rowH = 22;
  const w = 660;
  const pad = { t: 8, r: 56, b: 26, l: 150 };
  const h = pad.t + rows.length * rowH + pad.b;
  const iw = w - pad.l - pad.r;

  let out = '';
  for (let v = 0; v <= 100; v += 25) {
    const x = pad.l + (v / 100) * iw;
    out += gridLine(x, pad.t, x, pad.t + rows.length * rowH);
    out += `<text class="tick tick--val" x="${x}" y="${h - 10}" text-anchor="middle">${v}%</text>`;
  }

  rows.forEach((s, i) => {
    const y = pad.t + i * rowH;
    const bh = 12;
    const by = y + (rowH - bh) / 2;
    const bwv = Math.max(2, (s.rate * iw));
    const short = s.rate < 0.75;
    out += `<text class="tick" x="${pad.l - 10}" y="${by + 9.5}" text-anchor="end" fill="#4a3a3e">${esc(s.name)}</text>`;
    out += `<path d="${barPath(pad.l, by, bwv, bh, 4, 'right')}" fill="${short ? '#a3003d' : '#789949'}" />`;
    out += `<text class="dlabel" x="${pad.l + bwv + 9}" y="${by + 10}">${pct(s.rate)}%</text>`;
    out += `<rect class="hit" x="0" y="${y}" width="${w}" height="${rowH}"
      data-tip="${esc(s.roll + ' ' + s.name + '|' + s.attended + ' of ' + s.history.length + ' sessions|' + pct(s.rate) + '% attendance')}" />`;
  });

  out += `<line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + rows.length * rowH}" stroke="#c9bda9" stroke-width="1" />`;

  $('#fig-students').innerHTML =
    '<div style="max-height:340px;overflow-y:auto;overscroll-behavior:contain">' + svg(w, h, out) + '</div>';
}

/* ---- sparkline ---------------------------------------------------------- */

function sparkline(values) {
  const w = 120;
  const h = 26;
  if (values.length < 2) return '';
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * w,
    h - 3 - ((v - lo) / span) * (h - 6),
  ]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  const tail = 'M' + pts[pts.length - 2][0].toFixed(1) + ' ' + pts[pts.length - 2][1].toFixed(1) + ' L' + last[0].toFixed(1) + ' ' + last[1].toFixed(1);
  return (
    '<svg class="chart-svg meterplate__spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true" preserveAspectRatio="none">' +
    `<path d="${d}" fill="none" stroke="#c4b8a6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />` +
    `<path d="${tail}" fill="none" stroke="#789949" stroke-width="2" stroke-linecap="round" />` +
    `<circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="#789949" />` +
    '</svg>'
  );
}

/* ---- hero, KPIs --------------------------------------------------------- */

function countBy(status) {
  let n = 0;
  state.rows.forEach((r) => {
    if (effective(r) === status) n += 1;
  });
  return n;
}

function effective(row) {
  return row.manual || row.status;
}

const flapCells = $$('#hero-flaps .flap:not(.flap--unit)');

function renderHero() {
  const c = cls();
  const total = c.students.length;
  const present = countBy('present');
  const rate = total ? present / total : 0;
  const reading = String(pct(rate)).padStart(flapCells.length, '0');

  /* Only the drums whose digit actually changed get touched. Rewriting all
     three every tick made the counter shimmer. */
  for (let i = 0; i < flapCells.length; i += 1) {
    if (flapCells[i].textContent !== reading[i]) flapCells[i].textContent = reading[i];
  }

  $('#hero-flaps').setAttribute('aria-label', pct(rate) + ' percent present, ' + present + ' of ' + total);
  $('#hero-sub').textContent = state.frame
    ? present + ' of ' + total + ' marked present'
    : 'Roll not started';
  $('#meter-fill').style.width = pct(rate) + '%';
  $('#meter').setAttribute('aria-label', pct(rate) + ' percent present, ' + present + ' of ' + total);
}

function renderKpis() {
  const c = cls();
  const present = countBy('present');
  const absent = countBy('absent');
  const review = countBy('review');
  const rows = [...state.rows.values()].filter((r) => r.hits > 0);
  const meanD = rows.length ? rows.reduce((a, r) => a + (r.best || 0), 0) / rows.length : 0;
  const dedup = rows.length ? state.sightings / rows.length : 0;
  const termAvg = c.sessions.reduce((a, s) => a + s.rate, 0) / c.sessions.length;
  const delta = c.students.length ? present / c.students.length - termAvg : 0;

  const tiles = [
    {
      label: 'Present',
      value: present,
      delta:
        state.frame && Math.abs(delta) > 0.001
          ? (delta >= 0 ? '+' : '') + pct(delta) + ' pts vs term average'
          : 'term average ' + pct(termAvg) + '%',
      spark: sparkline(c.sessions.slice(-12).map((s) => s.present)),
    },
    { label: 'Not seen', value: absent, delta: 'no accepted match this session' },
    { label: 'Needs review', value: review, delta: 'seen but never confidently matched' },
    { label: 'Best match, mean', value: rows.length ? meanD.toFixed(2) : '--', delta: 'cosine distance, matched students' },
    { label: 'Sightings per row', value: rows.length ? dedup.toFixed(1) + 'x' : '--', delta: state.sightings + ' attempts, ' + rows.length + ' rows' },
  ];

  $('#kpis').innerHTML = tiles
    .map(
      (t) =>
        '<div class="meterplate">' +
        '<span class="meterplate__label">' + esc(t.label) +
        '<span class="meterplate__note">' + esc(t.delta) + '</span></span>' +
        '<span class="meterplate__val">' + esc(String(t.value)) + '</span>' +
        (t.spark || '') +
        '</div>'
    )
    .join('');
}

/* ---- register ----------------------------------------------------------- */

/* The mark is a word, not a colour. Each stamp reads on its own in print, in
   forced colours, and to anyone who cannot tell the wine from the matcha. */
const LABEL = { present: 'Present', absent: 'Not seen', review: 'Review' };

function hhmm(d) {
  return d ? pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) : '<span class="muted">--</span>';
}

function registerRows() {
  const c = cls();
  const q = state.query.trim().toLowerCase();
  let rows = c.students.map((s) => {
    const r = state.rows.get(s.id) || { status: 'absent', hits: 0, best: null, first: null, last: null, manual: null };
    return { s: s, r: r, st: effective(r) };
  });

  if (state.filter !== 'all') rows = rows.filter((x) => x.st === state.filter);
  if (q) rows = rows.filter((x) => x.s.name.toLowerCase().includes(q) || x.s.roll.toLowerCase().includes(q));

  const k = state.sort.key;
  const dir = state.sort.dir;
  rows.sort((a, b) => {
    const va = sortVal(a, k);
    const vb = sortVal(b, k);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return a.s.roll.localeCompare(b.s.roll);
  });
  return rows;
}

function sortVal(x, k) {
  switch (k) {
    case 'name': return x.s.name;
    case 'status': return x.st;
    case 'first': return x.r.first ? x.r.first.getTime() : Infinity;
    case 'last': return x.r.last ? x.r.last.getTime() : Infinity;
    case 'hits': return -x.r.hits;
    case 'conf': return x.r.best == null ? Infinity : x.r.best;
    case 'rate': return -x.s.rate;
    default: return x.s.roll;
  }
}

function renderRegister() {
  const rows = registerRows();
  const c = cls();
  $('#reg-count').textContent = state.frame
    ? rows.length + ' of ' + c.students.length + ' shown, ' + countBy('present') + ' stamped present'
    : 'nothing entered yet, ' + c.students.length + ' on the roll';

  if (!rows.length) {
    $('#register-body').innerHTML = '<tr><td colspan="9"><p class="empty">Nothing matches that filter.</p></td></tr>';
    return;
  }

  $('#register-body').innerHTML = rows
    .map(({ s, r, st }) => {
      const conf = r.best == null ? '<span class="muted">--</span>'
        : '<span class="conf"><span class="conf__bar"><i style="width:' + pct(1 - r.best) + '%"></i></span>' + (1 - r.best).toFixed(2) + '</span>';
      return (
        '<tr>' +
        '<td class="num">' + esc(s.roll) + '</td>' +
        '<td class="name">' + esc(s.name) + (r.flagged ? ' <span class="flagnote" title="A face that is not enrolled was accepted under this roll number">queried</span>' : '') + '</td>' +
        '<td><span class="stamp stamp--' + st + '">' + LABEL[st] + (r.manual ? ' <small>by hand</small>' : '') + '</span></td>' +
        '<td class="num">' + hhmm(r.first) + '</td>' +
        '<td class="num">' + hhmm(r.last) + '</td>' +
        '<td class="num">' + (r.hits || '<span class="muted">0</span>') + '</td>' +
        '<td class="num">' + conf + '</td>' +
        '<td class="num">' + pct(s.rate) + '%</td>' +
        '<td class="act">' +
        '<button class="btn btn--sm" type="button" data-mark="present" data-id="' + s.id + '">P</button> ' +
        '<button class="btn btn--sm" type="button" data-mark="absent" data-id="' + s.id + '">A</button>' +
        '</td>' +
        '</tr>'
      );
    })
    .join('');
}

/* ---- roster ------------------------------------------------------------- */

function renderRoster() {
  const c = cls();
  $('#roster').innerHTML = c.students
    .map((s) => {
      const pips = Array.from({ length: 5 }, (_, i) => '<i data-on="' + (i < s.samples ? 1 : 0) + '"></i>').join('');
      return (
        '<div class="card">' +
        '<div class="card__name">' + esc(s.name) + '</div>' +
        '<span class="card__roll">' + esc(s.roll) + '</span>' +
        '<div class="pips" role="img" aria-label="' + s.samples + ' of 5 enrolment stills">' + pips + '</div>' +
        '<div class="card__foot"><span>' + s.samples + ' stills</span><span>128-d</span></div>' +
        '</div>'
      );
    })
    .join('');
}

/* ---- tooltip ------------------------------------------------------------ */

const tip = $('#tip');

document.addEventListener('mousemove', (e) => {
  const hit = e.target.closest ? e.target.closest('[data-tip]') : null;
  if (!hit) {
    tip.dataset.on = '0';
    return;
  }
  const parts = hit.getAttribute('data-tip').split('|');
  tip.innerHTML = '<b>' + esc(parts[0]) + '</b>' + parts.slice(1).map((p) => '<br>' + esc(p)).join('');
  tip.style.left = e.clientX + 'px';
  tip.style.top = e.clientY - 14 + 'px';
  tip.dataset.on = '1';
});

document.addEventListener('mouseleave', () => { tip.dataset.on = '0'; });

/* ---- export ------------------------------------------------------------- */

function download(name, mime, text) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp() {
  const d = new Date();
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes());
}

function exportCsv() {
  const head = ['roll', 'name', 'status', 'first_seen', 'last_seen', 'sightings', 'best_distance', 'term_rate', 'manual'];
  const body = registerRows().map(({ s, r, st }) => [
    s.roll,
    '"' + s.name.replace(/"/g, '""') + '"',
    st,
    r.first ? r.first.toISOString() : '',
    r.last ? r.last.toISOString() : '',
    r.hits,
    r.best == null ? '' : r.best.toFixed(4),
    s.rate.toFixed(4),
    r.manual ? 'yes' : 'no',
  ].join(','));
  download('register-' + state.classId + '-' + stamp() + '.csv', 'text/csv;charset=utf-8', [head.join(','), ...body].join('\n'));
}

function exportJson() {
  const c = cls();
  download(
    'session-' + state.classId + '-' + stamp() + '.json',
    'application/json',
    JSON.stringify(
      {
        class: c.label,
        opened: new Date().toISOString(),
        threshold: state.threshold,
        frames: state.frame,
        attempts: state.sightings,
        accepted: state.hits,
        rejected: state.misses,
        register: registerRows().map(({ s, r, st }) => ({
          roll: s.roll, name: s.name, status: st, sightings: r.hits,
          best_distance: r.best, first_seen: r.first, last_seen: r.last,
        })),
      },
      null,
      2
    )
  );
}

/* ---- wiring ------------------------------------------------------------- */

function setRunning(on) {
  state.running = on;
  const pill = $('#session-pill');
  const label = $('#session-state');
  const run = $('#btn-run');
  if (state.closed) {
    pill.dataset.state = 'closed';
    label.textContent = 'closed';
    run.textContent = 'New session';
    $('#btn-end').disabled = true;
    return;
  }
  pill.dataset.state = on ? 'running' : state.frame ? 'paused' : 'idle';
  label.textContent = on ? 'running' : state.frame ? 'paused' : 'idle';
  run.textContent = on ? 'Pause' : state.frame ? 'Resume' : 'Start session';
  $('#btn-end').disabled = !state.frame;
}

function renderAll() {
  renderHero();
  renderKpis();
  renderHistogram();
  renderHistory();
  renderStudents();
  renderRegister();
  renderRoster();
  renderLog();
  setRunning(state.running);
}

function boot() {
  load();

  $('#class-select').innerHTML = state.classes
    .map((c) => '<option value="' + c.id + '"' + (c.id === state.classId ? ' selected' : '') + '>' + esc(c.label) + '</option>')
    .join('');

  const d = new Date();
  $('#session-date').textContent = pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();

  const slider = $('#thresh');
  slider.value = state.threshold;
  syncSlider();

  $('#boxes-label').textContent = state.boxes ? 'Overlay' : 'Overlay off';
  $('#btn-boxes').setAttribute('aria-pressed', String(state.boxes));

  newSession();
  renderAll();
  raf = requestAnimationFrame(loop);
}

function syncSlider() {
  const slider = $('#thresh');
  const p = ((state.threshold - 0.25) / (0.85 - 0.25)) * 100;
  slider.style.setProperty('--pct', p.toFixed(1) + '%');
  $('#thresh-val').textContent = state.threshold.toFixed(2);
}

$('#thresh').addEventListener('input', (e) => {
  state.threshold = parseFloat(e.target.value);
  syncSlider();
  renderHistogram();
  save();
});

$('#btn-run').addEventListener('click', () => {
  if (state.closed) {
    newSession();
    renderAll();
    setRunning(true);
    return;
  }
  setRunning(!state.running);
  if (state.running) pushLog('sys', 'Capture ' + (state.frame ? 'resumed' : 'started') + '.');
  else pushLog('sys', 'Capture paused.');
  renderLog();
});

$('#btn-end').addEventListener('click', closeSession);

$('#btn-step').addEventListener('click', () => {
  if (state.tracks.length < 2) spawnTrack();
  state.tracks.forEach((t) => attempt(t));
  lastHeavy = 0; // a hand-stepped frame must never be swallowed by the throttle
  renderLive();
});

$('#btn-boxes').addEventListener('click', (e) => {
  state.boxes = !state.boxes;
  $('#boxes-label').textContent = state.boxes ? 'Overlay' : 'Overlay off';
  e.currentTarget.setAttribute('aria-pressed', String(state.boxes));
  save();
});

$('#btn-clear-log').addEventListener('click', () => {
  state.log = [];
  renderLog();
});

$('#class-select').addEventListener('change', (e) => {
  state.classId = e.target.value;
  state.running = false;
  newSession();
  renderAll();
  save();
});

$('#search').addEventListener('input', (e) => {
  state.query = e.target.value;
  renderRegister();
});

$$('.tabs button').forEach((b) => {
  b.addEventListener('click', () => {
    state.filter = b.dataset.filter;
    $$('.tabs button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderRegister();
  });
});

$$('thead th button').forEach((b) => {
  b.addEventListener('click', () => {
    const k = b.dataset.sort;
    state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : 1 };
    $$('thead th').forEach((th) => th.removeAttribute('aria-sort'));
    b.closest('th').setAttribute('aria-sort', state.sort.dir === 1 ? 'ascending' : 'descending');
    renderRegister();
  });
});

$('#register-body').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mark]');
  if (!b) return;
  const row = state.rows.get(b.dataset.id);
  if (!row) return;
  const want = b.dataset.mark;
  row.manual = row.manual === want ? null : want;
  const who = cls().students.find((s) => s.id === b.dataset.id);
  pushLog('sys', 'Manual override &middot; <b>' + esc(who.roll) + '</b> set to ' + (row.manual || 'automatic'));
  renderRegister();
  renderHero();
  renderKpis();
  renderLog();
});

$('#btn-csv').addEventListener('click', exportCsv);
$('#btn-json').addEventListener('click', exportJson);

$('#btn-enrol').addEventListener('click', () => {
  const c = cls();
  const i = c.students.length;
  const rnd = mulberry32(SEED + i * 131 + Date.now() % 9973);
  const name = NAMES[(i * 7 + 3) % NAMES.length];
  const s = {
    id: c.id + '-n' + i,
    roll: c.id.slice(0, 3).toUpperCase() + pad2(i + 1),
    name: name,
    bias: (rnd() - 0.35) * 0.14,
    samples: 3 + Math.floor(rnd() * 3),
    propensity: 0.6 + rnd() * 0.38,
    seat: { x: 0.1 + rnd() * 0.76, y: 0.24 + rnd() * 0.5, s: 0.8 + rnd() * 0.45 },
    history: c.sessions.slice(0, SESSIONS_BACK).map(() => rnd() < 0.8),
  };
  s.attended = s.history.filter(Boolean).length;
  s.rate = s.history.length ? s.attended / s.history.length : 0;
  c.students.push(s);
  state.rows.set(s.id, { id: s.id, status: 'absent', first: null, last: null, hits: 0, best: null, flagged: false, manual: null });
  pushLog('sys', 'Enrolled <b>' + esc(s.roll) + ' ' + esc(s.name) + '</b> from ' + s.samples + ' stills.');
  renderAll();
});

$('#btn-reset').addEventListener('click', () => {
  try { localStorage.removeItem(STORE_KEY); } catch (e) { /* nothing to clear */ }
  state.classes = CLASSES.map(buildClass);
  state.threshold = 0.52;
  state.running = false;
  $('#thresh').value = 0.52;
  syncSlider();
  newSession();
  renderAll();
});

document.addEventListener('keydown', (e) => {
  if (!(e.target instanceof Element) || e.target.matches('input, select, textarea, button, [contenteditable]')) return;
  if (e.key === ' ') { e.preventDefault(); $('#btn-run').click(); }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; }
  else if (!raf) raf = requestAnimationFrame(loop);
});

boot();
