/* ════════════════════════════════════════════════════
   STORE — localStorage wrapper: namespaced keys,
   defaults, and a TTL cache for API responses
════════════════════════════════════════════════════ */
const NS = 'jarvis.v1.';

const DEFAULTS = {
  settings: {
    name: 'Pratik',
    location: { name: 'Pune', lat: 18.5204, lon: 73.8567 },
    keys: { finnhub: '', gnews: '', twelvedata: '' },
    camera: { autoStart: false },
  },
  tasks: {},          // { "2026-07-18": [ {id, text, done, createdAt} ] }
  gym: {
    schedule: {
      mon: { title: 'Chest + Triceps', items: ['Bench press 4×8', 'Incline DB press 3×10', 'Dips 3×12', 'Rope pushdown 3×12'] },
      tue: { title: 'Back + Biceps',   items: ['Deadlift 4×6', 'Lat pulldown 3×10', 'Barbell row 3×10', 'DB curls 3×12'] },
      wed: { title: 'Rest / Walk',     items: ['30 min walk', 'Stretching'] },
      thu: { title: 'Shoulders + Abs', items: ['Overhead press 4×8', 'Lateral raises 3×14', 'Face pulls 3×15', 'Plank 3×60s'] },
      fri: { title: 'Legs',            items: ['Squats 4×8', 'Leg press 3×12', 'Romanian deadlift 3×10', 'Calf raises 4×15'] },
      sat: { title: 'Cardio + Core',   items: ['20 min intervals', 'Hanging leg raises 3×12', 'Russian twists 3×20'] },
      sun: { title: 'Rest',            items: ['Recovery day'] },
    },
    doneLog: {},      // { "2026-07-18": true }
  },
  calendar: { events: [] },   // [ {id, date:'2026-07-21', time:'18:30', title} ]
  watchlist: {
    us:     ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL'],
    in:     ['NIFTY 50', 'SENSEX'],
    uk:     ['FTSE 100', 'HSBA', 'SHEL', 'AZN'],
    crypto: ['bitcoin', 'ethereum', 'solana'],
  },
  cache: {},
};

function read(key) {
  try {
    const raw = localStorage.getItem(NS + key);
    if (raw != null) return JSON.parse(raw);
  } catch (e) { /* corrupt entry falls through to default */ }
  return structuredClone(DEFAULTS[key]);
}

function write(key, val) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(val));
  } catch (e) {
    // QuotaExceeded: cache is the only unbounded namespace — drop it and retry once
    try {
      localStorage.removeItem(NS + 'cache');
      localStorage.setItem(NS + key, JSON.stringify(val));
    } catch (e2) { console.warn('store: write failed', key, e2); }
  }
}

export const store = {
  get: read,
  set: write,
  // convenience: read-modify-write
  update(key, fn) { const v = read(key); const out = fn(v) ?? v; write(key, out); return out; },
};

/* ── TTL cache (persisted so page reloads don't burn API quota) ── */
export const cache = {
  get(key) {
    const all = read('cache');
    const hit = all[key];
    if (hit && Date.now() - hit.at < hit.ttl) return hit.data;
    return null;
  },
  set(key, data, ttl) {
    const all = read('cache');
    // prune expired entries while we're here
    for (const k of Object.keys(all)) {
      if (Date.now() - all[k].at >= all[k].ttl) delete all[k];
    }
    all[key] = { at: Date.now(), ttl, data };
    write('cache', all);
  },
};

export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
