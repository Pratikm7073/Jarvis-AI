/* ════════════════════════════════════════════════════
   NEWS — headlines with category tabs (GNews → demo)
════════════════════════════════════════════════════ */
import { getNews } from '../api.js';
import { esc, setBadge, timeAgo } from '../ui.js';

const CATS = ['general', 'business', 'technology', 'sports', 'science'];
let root = null, cat = 'general', reqId = 0;

async function render() {
  if (!root) return;
  const my = ++reqId;
  root.innerHTML = `
    <div class="tab-row" data-tabs="news">
      ${CATS.map(c => `<button class="tab-btn ${c === cat ? 'on' : ''}" data-cat="${c}">${c}</button>`).join('')}
    </div>
    <div class="news-list" aria-busy="true">
      ${'<div class="skel-news"><div class="skel"></div><div class="skel"></div></div>'.repeat(5)}
    </div>`;
  root.querySelector('.tab-row').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]');
    if (b && b.dataset.cat !== cat) { cat = b.dataset.cat; render(); }
  });
  const data = await getNews(cat);
  if (my !== reqId || !root) return;         // stale response — a newer tab won
  setBadge('news', data.source, data.provider);
  const list = root.querySelector('.news-list');
  if (!list) return;
  list.removeAttribute('aria-busy');
  list.innerHTML = data.items.map(a => `
    <a class="news-item" ${a.url ? `href="${esc(a.url)}" target="_blank" rel="noopener"` : ''}>
      <div class="n-title">${esc(a.title)}</div>
      <div class="n-meta"><b>${esc(a.source)}</b> · ${timeAgo(a.publishedAt)}${data.source === 'demo' ? ' · demo' : ''}</div>
    </a>`).join('');
}

export default {
  id: 'news', title: 'Today\'s News', icon: '📰',
  refreshInterval: 10 * 60_000,        // cache TTL (30 min) protects quota
  cycleTabs(dir) {
    cat = CATS[(CATS.indexOf(cat) + dir + CATS.length) % CATS.length];
    render();
  },
  mount(el) { root = el; render(); },
  expand(el) { root = el; render(); },
  refresh() { render(); },
  destroy() { root = null; },
};
