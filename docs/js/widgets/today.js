/* ════════════════════════════════════════════════════
   TODAY — sticky strip (clock · greeting · weather)
   plus a hidden "weather" widget for focus mode
════════════════════════════════════════════════════ */
import { store } from '../store.js';
import { getWeather, wmo } from '../api.js';
import { esc } from '../ui.js';
import { odometer } from '../fx.js';

let wx = null, clockTimer = null;

function tickClock() {
  const now = new Date();
  const clock = document.getElementById('tsClock');
  const date = document.getElementById('tsDate');
  const greet = document.getElementById('tsGreeting');
  odometer(clock, now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
  date.textContent = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const h = now.getHours();
  const part = h < 5 ? 'Burning the midnight oil' :
    h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night';
  const name = store.get('settings').name || 'there';
  greet.textContent = `${part}, ${name} — all systems operational.`;
}

async function refreshWeather() {
  wx = await getWeather();
  const chip = document.getElementById('tsWeather');
  const { icon, label } = wmo(wx.current.code);
  const place = store.get('settings').location.name;
  chip.classList.remove('skel-chip');
  chip.textContent = `${icon} ${wx.current.temp}°C · ${place}`;
  chip.title = `${label} · humidity ${wx.current.humidity}% · wind ${wx.current.wind} km/h` +
    (wx.source === 'demo' ? ' · DEMO DATA' : '');
}

export default {
  id: 'weather', title: 'Weather', icon: '🌤️',
  hidden: true,                       // no grid card — lives in the strip
  refreshInterval: 15 * 60_000,

  mount() {
    tickClock();
    clockTimer ??= setInterval(tickClock, 1000);
    refreshWeather();
  },

  expand(body) {
    if (!wx) { body.innerHTML = '<div class="empty-note">Loading…</div>'; return; }
    const cur = wmo(wx.current.code);
    const place = store.get('settings').location.name;
    body.innerHTML = `
      <div class="wx-now">
        <div class="wx-t">${cur.icon} ${wx.current.temp}°C</div>
        <div class="wx-d">${esc(cur.label)} · ${esc(place)}<br>
          humidity ${wx.current.humidity}% · wind ${wx.current.wind} km/h<br>
          <span style="color:${wx.source === 'demo' ? 'var(--faint)' : 'var(--lime)'}">
            ${wx.source === 'demo' ? 'DEMO DATA' : 'LIVE · Open-Meteo'}</span></div>
      </div>
      <div class="wx-days">${wx.daily.map(d => {
        const w = wmo(d.code);
        return `<div class="wx-day"><div class="d">${esc(d.label)}</div>
          <div class="i">${w.icon}</div><div class="t">${d.max}° / ${d.min}°</div></div>`;
      }).join('')}</div>`;
  },

  refresh() { refreshWeather(); },
  destroy() { clearInterval(clockTimer); clockTimer = null; },
};
