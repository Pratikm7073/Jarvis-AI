/* ════════════════════════════════════════════════════
   TASKS — daily to-do list (localStorage, keyed per day)
════════════════════════════════════════════════════ */
import { store, todayKey } from '../store.js';
import { esc } from '../ui.js';

let root = null;

const dayTasks = () => store.get('tasks')[todayKey()] || [];

function save(list) {
  store.update('tasks', all => {
    all[todayKey()] = list;
    // keep only the last 60 days so the store never bloats
    const keys = Object.keys(all).sort();
    while (keys.length > 60) delete all[keys.shift()];
    return all;
  });
}

function yesterdayUnfinished() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return (store.get('tasks')[todayKey(d)] || []).filter(t => !t.done);
}

function render() {
  if (!root) return;
  const list = dayTasks();
  const open = list.filter(t => !t.done).length;
  const carry = yesterdayUnfinished().length;
  root.innerHTML = `
    <form class="task-add">
      <input type="text" name="text" placeholder="Add a task for today…" autocomplete="off" maxlength="140">
      <button class="pill-btn solid" type="submit">＋</button>
    </form>
    <div class="task-list">
      ${list.length ? list.map(t => `
        <div class="task-item ${t.done ? 'done' : ''}" data-id="${t.id}">
          <button class="task-check" aria-label="toggle">${t.done ? '✓' : ''}</button>
          <span class="task-text">${esc(t.text)}</span>
          <button class="task-del" aria-label="delete">×</button>
        </div>`).join('')
      : '<div class="empty-note">No tasks yet — add your first mission.</div>'}
    </div>
    <div class="task-meta">
      <span>${open} open · ${list.length - open} done</span>
      ${carry ? `<button class="pill-btn task-carry">⤵ carry over ${carry} from yesterday</button>` : ''}
    </div>`;

  root.querySelector('.task-add').addEventListener('submit', e => {
    e.preventDefault();
    const inp = e.target.elements.text;
    const text = inp.value.trim();
    if (!text) return;
    save([...dayTasks(), { id: crypto.randomUUID(), text, done: false, createdAt: Date.now() }]);
    render();
  });
  root.querySelector('.task-list').addEventListener('click', e => {
    const item = e.target.closest('.task-item');
    if (!item) return;
    if (e.target.closest('.task-check'))
      save(dayTasks().map(t => t.id === item.dataset.id ? { ...t, done: !t.done } : t));
    else if (e.target.closest('.task-del'))
      save(dayTasks().filter(t => t.id !== item.dataset.id));
    else return;
    render();
  });
  root.querySelector('.task-carry')?.addEventListener('click', () => {
    const add = yesterdayUnfinished().map(t => ({ ...t, id: crypto.randomUUID(), done: false }));
    save([...dayTasks(), ...add]);
    render();
  });
}

export default {
  id: 'tasks', title: 'Tasks', icon: '☑️',
  refreshInterval: null,
  mount(el) { root = el; render(); },
  expand(el) { root = el; render(); },
  refresh() { render(); },
  destroy() { root = null; },
};
