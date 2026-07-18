/* ════════════════════════════════════════════════════
   GYM — weekly routine planner + today's workout
════════════════════════════════════════════════════ */
import { store, todayKey, DOW } from '../store.js';
import { esc } from '../ui.js';

let root = null, editing = false;

const todayDow = () => DOW[new Date().getDay()];

function renderView() {
  const gym = store.get('gym');
  const dow = todayDow();
  const today = gym.schedule[dow];
  const doneToday = !!gym.doneLog[todayKey()];
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  root.innerHTML = `
    <div class="gym-today">
      <div class="gt-label">Today · ${dow}</div>
      <div class="gt-title">${esc(today.title)}</div>
      <ul>${today.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="pill-btn ${doneToday ? '' : 'solid'} gym-done">${doneToday ? '✓ logged — undo' : 'Mark done 💪'}</button>
        <button class="pill-btn gym-edit">✎ edit plan</button>
      </div>
    </div>
    <div class="gym-week">
      ${order.map(d => `
        <div class="gym-day ${d === dow ? 'today' : ''}">
          <span class="gd-dow">${d}</span>
          <span class="gd-title">${esc(gym.schedule[d].title)}</span>
          ${d === dow && doneToday ? '<span class="gd-done">✓ done</span>' : ''}
        </div>`).join('')}
    </div>`;
  root.querySelector('.gym-done').addEventListener('click', () => {
    store.update('gym', g => {
      if (g.doneLog[todayKey()]) delete g.doneLog[todayKey()];
      else g.doneLog[todayKey()] = true;
      return g;
    });
    render();
  });
  root.querySelector('.gym-edit').addEventListener('click', () => { editing = true; render(); });
}

function renderEdit() {
  const gym = store.get('gym');
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  root.innerHTML = `
    <form class="gym-form">
      ${order.map(d => `
        <div class="gym-edit-row">
          <label>${d} — title</label>
          <input type="text" name="${d}-title" value="${esc(gym.schedule[d].title)}" maxlength="60">
          <textarea name="${d}-items" rows="2" placeholder="one exercise per line">${esc(gym.schedule[d].items.join('\n'))}</textarea>
        </div>`).join('')}
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="pill-btn solid" type="submit">Save plan</button>
        <button class="pill-btn gym-cancel" type="button">Cancel</button>
      </div>
    </form>`;
  root.querySelector('.gym-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    store.update('gym', g => {
      for (const d of order) {
        g.schedule[d].title = f.elements[`${d}-title`].value.trim() || g.schedule[d].title;
        g.schedule[d].items = f.elements[`${d}-items`].value.split('\n').map(s => s.trim()).filter(Boolean);
      }
      return g;
    });
    editing = false; render();
  });
  root.querySelector('.gym-cancel').addEventListener('click', () => { editing = false; render(); });
}

function render() { if (root) (editing ? renderEdit : renderView)(); }

export default {
  id: 'gym', title: 'Gym Plan', icon: '🏋️',
  refreshInterval: null,
  mount(el) { root = el; editing = false; render(); },
  expand(el) { root = el; render(); },
  refresh() { render(); },
  destroy() { root = null; },
};
