/* ════════════════════════════════════════════════════
   API — provider chains with TTL caching and graceful
   fallback to demo data. Every result is tagged:
     source: 'live' | 'proxy' | 'demo'  (+ provider name)
   Chains (first success wins):
     weather  Open-Meteo (keyless)          → demo
     news     GNews (key, 100/day, 30m TTL) → demo
     us       Finnhub (key, 60/min)         → demo
     crypto   CoinGecko (keyless)           → demo
     in/uk    Twelve Data (key, 8/min)      → Finnhub ETF proxy → demo
════════════════════════════════════════════════════ */
import { store, cache } from './store.js';
import { demoQuotes, demoNews, demoWeather } from './demo-data.js';

const keys = () => store.get('settings').keys || {};

// per-provider politeness: don't re-hit a provider that just failed
const failCool = new Map();  // provider → retry-after epoch
function coolingDown(p) { return (failCool.get(p) || 0) > Date.now(); }
function markFail(p, ms = 90_000) { failCool.set(p, Date.now() + ms); }

async function getJSON(url, provider, timeout = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`${provider} HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* ── WEATHER · Open-Meteo (keyless, CORS-open) ─────── */
const WMO = [
  [[0], '☀️', 'Clear'], [[1, 2], '🌤️', 'Partly cloudy'], [[3], '☁️', 'Overcast'],
  [[45, 48], '🌫️', 'Fog'], [[51, 53, 55, 56, 57], '🌦️', 'Drizzle'],
  [[61, 63, 65, 66, 67], '🌧️', 'Rain'], [[71, 73, 75, 77], '🌨️', 'Snow'],
  [[80, 81, 82], '🌧️', 'Showers'], [[85, 86], '🌨️', 'Snow showers'],
  [[95, 96, 99], '⛈️', 'Thunderstorm'],
];
export function wmo(code) {
  for (const [codes, icon, label] of WMO) if (codes.includes(code)) return { icon, label };
  return { icon: '🌡️', label: '—' };
}

export async function getWeather() {
  const { location } = store.get('settings');
  const ck = `wx.${location.lat.toFixed(2)},${location.lon.toFixed(2)}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  try {
    if (coolingDown('openmeteo')) throw new Error('cooldown');
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}` +
      `&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=5&timezone=auto`;
    const j = await getJSON(u, 'openmeteo');
    const labels = ['Today', 'Tomorrow'];
    const out = {
      source: 'live', provider: 'Open-Meteo',
      current: {
        temp: Math.round(j.current.temperature_2m),
        code: j.current.weather_code,
        humidity: j.current.relative_humidity_2m,
        wind: Math.round(j.current.wind_speed_10m),
      },
      daily: j.daily.time.map((d, i) => ({
        label: labels[i] || new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short' }),
        code: j.daily.weather_code[i],
        max: Math.round(j.daily.temperature_2m_max[i]),
        min: Math.round(j.daily.temperature_2m_min[i]),
      })),
    };
    cache.set(ck, out, 15 * 60_000);
    return out;
  } catch (e) {
    if (e.message !== 'cooldown') markFail('openmeteo');
    return demoWeather();
  }
}

export async function geocode(name) {
  const j = await getJSON(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`,
    'geocode');
  const r = j.results && j.results[0];
  if (!r) throw new Error('place not found');
  return { name: r.name, lat: r.latitude, lon: r.longitude };
}

/* ── NEWS · GNews (key) → demo ─────────────────────── */
export async function getNews(category = 'general') {
  const ck = `news.${category}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const key = keys().gnews;
  if (key && !coolingDown('gnews')) {
    try {
      const u = `https://gnews.io/api/v4/top-headlines?category=${category}&lang=en&country=in&max=10&apikey=${key}`;
      const j = await getJSON(u, 'gnews');
      if (!j.articles) throw new Error('gnews: no articles');
      const out = {
        source: 'live', provider: 'GNews',
        items: j.articles.map(a => ({
          title: a.title, url: a.url,
          source: a.source?.name || '—',
          publishedAt: a.publishedAt,
        })),
      };
      // 30 min TTL: protects the 100/day quota across reloads
      cache.set(ck, out, 30 * 60_000);
      return out;
    } catch (e) { markFail('gnews', 10 * 60_000); }
  }
  return { source: 'demo', provider: 'demo', items: demoNews(category) };
}

/* ── MARKETS ───────────────────────────────────────── */
const finnhubQuote = async (sym, key) => {
  const j = await getJSON(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${key}`, 'finnhub');
  if (j.c === 0 && j.pc === 0) throw new Error(`finnhub: no data for ${sym}`);
  return { sym, price: j.c, chg: j.dp ?? ((j.c - j.pc) / j.pc) * 100 };
};

async function usQuotes() {
  const key = keys().finnhub;
  if (!key || coolingDown('finnhub')) return null;
  const syms = store.get('watchlist').us;
  const rows = [];
  for (const sym of syms) {           // sequential — stays far under 60/min
    try { rows.push({ ...(await finnhubQuote(sym, key)), name: sym }); }
    catch (e) { if (String(e).includes('429') || String(e).includes('401')) { markFail('finnhub'); return null; } }
  }
  if (!rows.length) return null;
  return { source: 'live', provider: 'Finnhub', rows };
}

async function cryptoQuotes() {
  if (coolingDown('coingecko')) return null;
  const ids = store.get('watchlist').crypto.join(',');
  try {
    const j = await getJSON(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}` +
      `&price_change_percentage=24h&sparkline=true`, 'coingecko');
    if (!Array.isArray(j) || !j.length) throw new Error('coingecko: empty');
    return {
      source: 'live', provider: 'CoinGecko',
      rows: j.map(c => ({
        sym: c.symbol.toUpperCase(), name: c.name,
        price: c.current_price, chg: c.price_change_percentage_24h ?? 0,
        spark: c.sparkline_in_7d?.price?.slice(-48),
      })),
    };
  } catch (e) { markFail('coingecko'); return null; }
}

// Twelve Data quote — free plan may not cover NSE/BSE/LSE: errors arrive
// as HTTP 200 + {status:'error'}, so detect in-band
async function twelveQuotes(market) {
  const key = keys().twelvedata;
  if (!key || coolingDown('twelvedata')) return null;
  const syms = store.get('watchlist')[market];
  const rows = [];
  for (const sym of syms.slice(0, 4)) {   // ≤4 keeps us under 8 credits/min
    try {
      const j = await getJSON(
        `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(sym)}&apikey=${key}`, 'twelvedata');
      if (j.status === 'error' || !j.close) throw new Error(`twelvedata: ${j.message || 'no data'}`);
      rows.push({ sym, name: j.name || sym, price: +j.close, chg: +j.percent_change });
    } catch (e) { /* symbol not on free plan — try the next */ }
  }
  if (!rows.length) { markFail('twelvedata', 10 * 60_000); return null; }
  return { source: 'live', provider: 'Twelve Data', rows };
}

// tier-2 for IN/UK: US-listed country ETFs quoted via Finnhub
const ETF_PROXY = { in: [['INDA', 'iShares MSCI India ETF']], uk: [['EWU', 'iShares MSCI UK ETF']] };
async function etfProxy(market) {
  const key = keys().finnhub;
  if (!key || coolingDown('finnhub')) return null;
  const rows = [];
  for (const [sym, name] of ETF_PROXY[market] || []) {
    try { rows.push({ ...(await finnhubQuote(sym, key)), name }); } catch (e) { /* skip */ }
  }
  if (!rows.length) return null;
  return { source: 'proxy', provider: `ETF proxy · ${rows.map(r => r.sym).join('/')}`, rows };
}

export async function getQuotes(market) {
  const ck = `mkt.${market}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  let out = null;
  if (market === 'us') out = await usQuotes();
  else if (market === 'crypto') out = await cryptoQuotes();
  else out = (await twelveQuotes(market)) || (await etfProxy(market));
  if (!out) {
    out = { source: 'demo', provider: 'demo', rows: demoQuotes(market) };
    cache.set(ck, out, 45_000);       // short TTL: retry live soon
  } else {
    cache.set(ck, out, market === 'in' || market === 'uk' ? 5 * 60_000 : 60_000);
  }
  return out;
}
