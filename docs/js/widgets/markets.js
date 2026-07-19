/* ════════════════════════════════════════════════════
   MARKETS — IN / US / UK / Crypto watchlists
════════════════════════════════════════════════════ */
import { getQuotes } from '../api.js';
import { esc, setBadge, fmtPrice, fmtChg, sparkSVG } from '../ui.js';

const TABS = [['in', '🇮🇳 India'], ['us', '🇺🇸 US'], ['uk', '🇬🇧 UK'], ['crypto', '🪙 Crypto']];
const CCY = { in: '₹', us: '$', uk: '£', crypto: '$' };
let root = null, market = 'in', reqId = 0;

async function render() {
  if (!root) return;
  const my = ++reqId;
  root.innerHTML = `
    <div class="tab-row" data-tabs="markets">
      ${TABS.map(([k, label]) => `<button class="tab-btn ${k === market ? 'on' : ''}" data-mkt="${k}">${label}</button>`).join('')}
    </div>
    <div class="mkt-list" aria-busy="true">
      ${'<div class="skel-mkt"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>'.repeat(5)}
    </div>`;
  root.querySelector('.tab-row').addEventListener('click', e => {
    const b = e.target.closest('[data-mkt]');
    if (b && b.dataset.mkt !== market) { market = b.dataset.mkt; render(); }
  });
  const data = await getQuotes(market);
  if (my !== reqId || !root) return;
  setBadge('markets', data.source, data.provider);
  const list = root.querySelector('.mkt-list');
  if (!list) return;
  list.removeAttribute('aria-busy');
  const ccy = CCY[market];
  list.innerHTML = data.rows.map(r => `
    <div class="mkt-row">
      <span class="mkt-sym">${esc(r.sym)}</span>
      <span class="mkt-name">${esc(r.name || '')}</span>
      ${r.spark ? sparkSVG(r.spark) : '<span class="mkt-spark"></span>'}
      <span class="mkt-px">${ccy}${fmtPrice(r.price)}</span>
      <span class="mkt-chg ${r.chg >= 0 ? 'up' : 'dn'}">${fmtChg(r.chg)}</span>
    </div>`).join('') +
    (data.source === 'proxy'
      ? `<div class="mkt-note">⚠ live ${market.toUpperCase()} index data isn't on the free tier — showing a US-listed country ETF as a proxy (${esc(data.provider)}).</div>`
      : data.source === 'demo'
        ? `<div class="mkt-note">demo values — add a Finnhub / Twelve Data key in Settings for live quotes.</div>`
        : '');
}

export default {
  id: 'markets', title: 'Markets', icon: '📈',
  refreshInterval: 60_000,             // per-market TTL caching guards rate limits
  cycleTabs(dir) {
    const i = TABS.findIndex(([k]) => k === market);
    market = TABS[(i + dir + TABS.length) % TABS.length][0];
    render();
  },
  mount(el) { root = el; render(); },
  expand(el) { root = el; render(); },
  refresh() { render(); },
  destroy() { root = null; },
};
