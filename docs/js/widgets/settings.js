/* ════════════════════════════════════════════════════
   SETTINGS — name, location, API keys (localStorage)
════════════════════════════════════════════════════ */
import { store } from '../store.js';
import { geocode } from '../api.js';
import { esc } from '../ui.js';

let root = null;

function render() {
  if (!root) return;
  const s = store.get('settings');
  root.innerHTML = `
    <form class="set-form">
      <div class="set-group">
        <h4>Profile</h4>
        <div class="set-row"><label>Name</label><input name="name" value="${esc(s.name)}" maxlength="40"></div>
        <div class="set-row"><label>City</label><input name="city" value="${esc(s.location.name)}" maxlength="60"></div>
      </div>
      <div class="set-group">
        <h4>API keys (all free tiers)</h4>
        <div class="set-row"><label>Finnhub</label><input name="finnhub" value="${esc(s.keys.finnhub)}" placeholder="US stocks — finnhub.io" autocomplete="off"></div>
        <div class="set-row"><label>GNews</label><input name="gnews" value="${esc(s.keys.gnews)}" placeholder="news — gnews.io" autocomplete="off"></div>
        <div class="set-row"><label>Twelve Data</label><input name="twelvedata" value="${esc(s.keys.twelvedata)}" placeholder="IN/UK indices — twelvedata.com" autocomplete="off"></div>
        <div class="set-note">keys are stored only in this browser (localStorage) and are visible client-side — use free-tier keys only.
          crypto (CoinGecko) &amp; weather (Open-Meteo) need no key.</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <button class="pill-btn solid" type="submit">Save</button>
        <button class="pill-btn danger set-reset" type="button">Reset all data</button>
        <span class="set-saved">✓ saved</span>
      </div>
    </form>`;

  root.querySelector('.set-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target.elements;
    const cityIn = f.city.value.trim();
    let location = s.location;
    if (cityIn && cityIn.toLowerCase() !== s.location.name.toLowerCase()) {
      try { location = await geocode(cityIn); }
      catch { location = { ...s.location, name: cityIn }; }   // keep old coords, new label
    }
    store.update('settings', cur => ({
      ...cur,
      name: f.name.value.trim() || cur.name,
      location,
      keys: {
        finnhub: f.finnhub.value.trim(),
        gnews: f.gnews.value.trim(),
        twelvedata: f.twelvedata.value.trim(),
      },
    }));
    store.set('cache', {});           // drop stale demo/live cache so badges flip now
    const ok = root.querySelector('.set-saved');
    ok.classList.add('show');
    setTimeout(() => ok && ok.classList.remove('show'), 1800);
    dispatchEvent(new CustomEvent('jarvis:settings-changed'));
  });

  root.querySelector('.set-reset').addEventListener('click', () => {
    if (!confirm('Erase ALL dashboard data in this browser (tasks, gym log, events, keys)?')) return;
    for (const k of Object.keys(localStorage)) if (k.startsWith('jarvis.')) localStorage.removeItem(k);
    location.reload();
  });
}

export default {
  id: 'settings', title: 'Settings', icon: '⚙️',
  refreshInterval: null,
  mount(el) { root = el; render(); },
  expand(el) { root = el; render(); },
  refresh() { render(); },
  destroy() { root = null; },
};
