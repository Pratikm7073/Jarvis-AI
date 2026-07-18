/* ════════════════════════════════════════════════════
   CALENDAR — month grid + events (localStorage)
════════════════════════════════════════════════════ */
import { store, todayKey } from '../store.js';
import { esc } from '../ui.js';

let root = null;
let view = new Date();               // month being shown
let selected = todayKey();

const evOn = date => store.get('calendar').events
  .filter(e => e.date === date)
  .sort((a, b) => (a.time || '') < (b.time || '') ? -1 : 1);

function render() {
  if (!root) return;
  const y = view.getFullYear(), m = view.getMonth();
  const first = new Date(y, m, 1);
  const pad = (first.getDay() + 6) % 7;          // week starts Monday
  const days = new Date(y, m + 1, 0).getDate();
  const tKey = todayKey();
  const events = store.get('calendar').events;
  const evDates = new Set(events.map(e => e.date));
  const cells = [];
  for (let i = 0; i < pad; i++) cells.push('<div class="cal-cell pad"></div>');
  for (let d = 1; d <= days; d++) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push(`<div class="cal-cell mo ${key === tKey ? 'today' : ''} ${key === selected ? 'sel' : ''}" data-date="${key}">
      ${d}${evDates.has(key) ? '<span class="dots"><i></i></span>' : ''}</div>`);
  }
  const selEv = evOn(selected);
  const selLabel = new Date(selected + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  root.innerHTML = `
    <div class="cal-head">
      <span class="cal-title">${view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
      <span class="cal-nav"><button data-nav="-1" aria-label="prev">‹</button><button data-nav="1" aria-label="next">›</button></span>
    </div>
    <div class="cal-grid">
      ${['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map(d => `<div class="cal-dow">${d}</div>`).join('')}
      ${cells.join('')}
    </div>
    <div class="cal-events">
      ${selEv.length ? selEv.map(e => `
        <div class="cal-ev" data-id="${e.id}">
          <span class="ev-time">${esc(e.time || '—')}</span>
          <span class="ev-title">${esc(e.title)}</span>
          <button class="ev-del" aria-label="delete">×</button>
        </div>`).join('')
      : `<div class="empty-note">Nothing on ${esc(selLabel)}.</div>`}
    </div>
    <form class="cal-add">
      <input type="text" name="title" placeholder="Add event on ${esc(selLabel)}…" autocomplete="off" maxlength="120">
      <input type="time" name="time">
      <button class="pill-btn solid" type="submit">＋</button>
    </form>`;

  root.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
    view = new Date(y, m + (+b.dataset.nav), 1); render();
  }));
  root.querySelector('.cal-grid').addEventListener('click', e => {
    const c = e.target.closest('.cal-cell.mo');
    if (c) { selected = c.dataset.date; render(); }
  });
  root.querySelector('.cal-events').addEventListener('click', e => {
    const row = e.target.closest('.cal-ev');
    if (row && e.target.closest('.ev-del')) {
      store.update('calendar', c => { c.events = c.events.filter(ev => ev.id !== row.dataset.id); return c; });
      render();
    }
  });
  root.querySelector('.cal-add').addEventListener('submit', e => {
    e.preventDefault();
    const title = e.target.elements.title.value.trim();
    if (!title) return;
    store.update('calendar', c => {
      c.events.push({ id: crypto.randomUUID(), date: selected, time: e.target.elements.time.value, title });
      return c;
    });
    render();
  });
}

export default {
  id: 'calendar', title: 'Calendar', icon: '📅',
  refreshInterval: null,
  mount(el) { root = el; render(); },
  expand(el) { root = el; render(); },
  refresh() { render(); },
  destroy() { root = null; },
};
