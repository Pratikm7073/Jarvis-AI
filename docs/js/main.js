/* ════════════════════════════════════════════════════
   MAIN — widget registry, focus-mode manager,
   refresh scheduler, reactor + gesture bootstrap
════════════════════════════════════════════════════ */
import today from './widgets/today.js';
import tasks from './widgets/tasks.js';
import gym from './widgets/gym.js';
import calendar from './widgets/calendar.js';
import news from './widgets/news.js';
import markets from './widgets/markets.js';
import settings from './widgets/settings.js';

const REGISTRY = [tasks, gym, calendar, news, markets, settings, today];
const widgets = Object.fromEntries(REGISTRY.map(w => [w.id, w]));
const gridIds = REGISTRY.filter(w => !w.hidden).map(w => w.id);

/* ── grid cards ────────────────────────────────────── */
const grid = document.getElementById('grid');
for (const w of REGISTRY) {
  if (w.hidden) { w.mount(null); continue; }
  const card = document.createElement('article');
  card.className = 'widget-card';
  card.dataset.widget = w.id;
  card.innerHTML = `
    <div class="w-head"><span class="w-icon">${w.icon}</span>
      <span class="w-title">${w.title}</span><span class="w-badge"></span></div>
    <div class="w-body"></div>`;
  grid.appendChild(card);
  w.mount(card.querySelector('.w-body'));
  card.addEventListener('click', e => {
    // plain click opens focus unless an inner control was the target
    if (e.target.closest('button, a, input, select, textarea, label, .cal-cell, .task-item')) return;
    focusApi.open(w.id);
  });
}

/* ── focus mode ────────────────────────────────────── */
const layer = document.getElementById('focusLayer');
const focusCard = document.getElementById('focusCard');
const focusBody = document.getElementById('focusBody');
let focusId = null;

export const focusApi = {
  open(id) {
    const w = widgets[id];
    if (!w) return;
    if (focusId) this.close();
    focusId = id;
    document.getElementById('focusIcon').textContent = w.icon;
    document.getElementById('focusTitle').textContent = w.title;
    focusBody.innerHTML = '';
    (w.expand || w.mount).call(w, focusBody);
    layer.classList.add('open');
    layer.setAttribute('aria-hidden', 'false');
  },
  close() {
    if (!focusId) return;
    const w = widgets[focusId];
    focusId = null;
    layer.classList.remove('open', 'tilting');
    layer.setAttribute('aria-hidden', 'true');
    focusCard.style.transform = '';
    // hand the widget its grid card back
    const body = document.querySelector(`.widget-card[data-widget="${w.id}"] .w-body`);
    if (body) w.mount(body);
  },
  isOpen: () => focusId !== null,
  current: () => focusId,
  scrollBody(dy) { focusBody.scrollBy(0, dy); },
  cycle(dir) {
    const i = Math.max(0, gridIds.indexOf(focusId));
    this.open(gridIds[(i + dir + gridIds.length) % gridIds.length]);
  },
  setTilt(rx, ry, s) {
    if (!focusId) return;
    if (rx === 0 && ry === 0 && s === 1) {
      layer.classList.remove('tilting');
      focusCard.style.transform = '';
    } else {
      layer.classList.add('tilting');
      focusCard.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${s.toFixed(3)})`;
    }
  },
};

document.getElementById('focusClose').addEventListener('click', () => focusApi.close());
layer.querySelector('.fl-backdrop').addEventListener('click', () => focusApi.close());
addEventListener('keydown', e => { if (e.key === 'Escape') focusApi.close(); });

/* weather chip in the strip opens the hidden weather widget */
document.getElementById('tsWeather').addEventListener('click', () => focusApi.open('weather'));
document.getElementById('tsWeather').style.cursor = 'pointer';

/* ── refresh scheduler (paused while tab is hidden) ── */
for (const w of REGISTRY) {
  if (!w.refreshInterval) continue;
  setInterval(() => { if (!document.hidden) w.refresh(); }, w.refreshInterval);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) REGISTRY.forEach(w => w.refreshInterval && w.refresh());
});
addEventListener('jarvis:settings-changed', () => {
  REGISTRY.forEach(w => w.refresh && w.refresh());
});

/* reactor status line typewriter */
const LINES = [
  'J.A.R.V.I.S. ONLINE — ALL SYSTEMS NOMINAL',
  'PINCH A CARD TO OPEN IT',
  'GRAB THE REACTOR AND ROTATE YOUR WRIST',
  'BOTH HANDS: ROTATE · TWIST · ZOOM',
  'AT YOUR SERVICE, SIR',
];
function startTypewriter() {
  const lineEl = document.getElementById('reactorLine');
  let li = 0;
  function typeLine() {
    const text = LINES[li % LINES.length]; li++;
    let i = 0;
    lineEl.innerHTML = '<span class="ai-caret"></span>';
    const tick = setInterval(() => {
      if (document.hidden) return;
      i++;
      lineEl.innerHTML = text.slice(0, i) + '<span class="ai-caret"></span>';
      if (i >= text.length) clearInterval(tick);
    }, 34);
  }
  typeLine();
  setInterval(typeLine, 9000);
}

/* ── reactor + gestures ────────────────────────────────
   loaded dynamically: both depend on the three.js CDN,
   and the dashboard must survive that CDN being down —
   widgets + mouse control keep working regardless */
try {
  const [{ initReactor }, { initGestures }] = await Promise.all([
    import('./reactor.js'),
    import('./gestures.js'),
  ]);
  const reactorApi = initReactor(document.getElementById('reactorCanvas'));
  initGestures({ reactorApi, focusApi, widgets });
  startTypewriter();
} catch (e) {
  console.warn('3D/gesture engine unavailable (CDN unreachable?)', e);
  document.getElementById('reactorStage').style.height = '10vh';
  document.getElementById('reactorStage').style.minHeight = '70px';
  document.getElementById('gestureBtn').style.display = 'none';
  document.getElementById('reactorLine').textContent = 'HOLO-CORE OFFLINE — dashboard running in standard mode';
}
