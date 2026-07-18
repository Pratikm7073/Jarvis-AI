/* ════════════════════════════════════════════════════
   DEMO DATA — realistic fallback values so the app is
   fully alive with zero API keys. A deterministic
   per-session random walk makes refreshes feel live.
   Everything produced here is badged DEMO in the UI.
════════════════════════════════════════════════════ */

// mulberry32 — tiny seeded PRNG; reseeded once per page load
let seed = (Date.now() / 3600000) | 0;
function rng() {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const drift = () => (rng() - 0.5) * 0.9;  // ±0.45%

const walk = new Map();  // symbol → cumulative % drift this session
function walked(sym, base) {
  const d = (walk.get(sym) ?? 0) + drift() * 0.2;
  walk.set(sym, d);
  return base * (1 + d / 100);
}

function spark(base, chg) {
  const pts = [];
  let v = base * (1 - chg / 200);
  for (let i = 0; i < 24; i++) {
    v *= 1 + (rng() - 0.5) * 0.004 + (chg / 100) / 48;
    pts.push(v);
  }
  return pts;
}

const QUOTES = {
  us: [
    ['AAPL',  'Apple',        232.4], ['MSFT', 'Microsoft', 511.7],
    ['NVDA',  'NVIDIA',       172.4], ['TSLA', 'Tesla',     329.6],
    ['GOOGL', 'Alphabet',     185.1], ['AMZN', 'Amazon',    226.1],
    ['SPX',   'S&P 500',     6297.4], ['IXIC', 'Nasdaq',  20895.7],
  ],
  in: [
    ['NIFTY 50', 'NSE Nifty 50', 24968.4], ['SENSEX', 'BSE Sensex', 81757.7],
    ['RELIANCE', 'Reliance Industries', 1476.9], ['TCS', 'Tata Consultancy', 3189.5],
    ['HDFCBANK', 'HDFC Bank', 1957.4], ['INFY', 'Infosys', 1586.2],
  ],
  uk: [
    ['FTSE 100', 'FTSE 100 Index', 8972.6], ['HSBA', 'HSBC Holdings', 9.52],
    ['SHEL', 'Shell', 26.84], ['AZN', 'AstraZeneca', 104.7],
    ['BP', 'BP', 4.02], ['ULVR', 'Unilever', 45.1],
  ],
  crypto: [
    ['bitcoin', 'Bitcoin · BTC', 118250], ['ethereum', 'Ethereum · ETH', 3545],
    ['solana', 'Solana · SOL', 177.2], ['ripple', 'XRP', 3.42],
    ['dogecoin', 'Dogecoin · DOGE', 0.239],
  ],
};

export function demoQuotes(market) {
  return (QUOTES[market] || []).map(([sym, name, base]) => {
    const price = walked(market + sym, base);
    const chg = ((price / base) - 1) * 100 + (rng() - 0.45) * 1.6;
    return { sym, name, price, chg, spark: spark(price, chg), source: 'demo' };
  });
}

const HEADLINES = {
  general: [
    ['Monsoon session of Parliament set to begin with packed agenda', 'The Hindu'],
    ['Heavy rains lash Mumbai and Pune; IMD issues orange alert for ghats', 'NDTV'],
    ['Global leaders gather for climate summit as temperatures break records', 'Reuters'],
    ['ISRO announces crewed Gaganyaan test flight window', 'India Today'],
    ['Chandigarh to Chennai: new expressway corridors approved', 'Economic Times'],
  ],
  business: [
    ['Sensex ends volatile session higher as IT stocks rebound', 'Mint'],
    ['RBI holds rates steady, flags food inflation risks', 'Business Standard'],
    ['Global chip demand pushes TSMC to record quarterly profit', 'Reuters'],
    ['Startup funding in India rebounds 40% year on year', 'Economic Times'],
    ['Oil steadies as markets weigh supply outlook', 'Bloomberg'],
  ],
  technology: [
    ['Next-gen AI assistants move from chat to hands-free control', 'The Verge'],
    ['MediaPipe-style on-device vision models keep getting smaller and faster', 'Ars Technica'],
    ['Quantum networking milestone: entanglement held across 100 km of fiber', 'Nature News'],
    ['Open-source LLMs close the gap in coding benchmarks', 'TechCrunch'],
    ['WebGPU adoption accelerates as browsers ship compute features', 'InfoWorld'],
  ],
  sports: [
    ['India name squad for upcoming Test series', 'ESPNcricinfo'],
    ['Premier League opening weekend fixtures announced', 'Sky Sports'],
    ['Olympic qualifiers: Indian shooters seal three more quotas', 'The Bridge'],
    ['F1: title fight tightens after dramatic street-circuit finish', 'Autosport'],
    ['Neeraj Chopra headlines Diamond League field', 'Olympics.com'],
  ],
  science: [
    ['James Webb spots unexpectedly mature galaxy in early universe', 'Science'],
    ['New malaria vaccine rollout reaches 20 countries', 'BBC Science'],
    ['Fusion experiment sustains plasma for record duration', 'New Scientist'],
    ['Deep-sea expedition finds dozens of new species', 'National Geographic'],
    ['CRISPR therapy shows durable results in five-year follow-up', 'STAT'],
  ],
};

export function demoNews(category = 'general') {
  const now = Date.now();
  return (HEADLINES[category] || HEADLINES.general).map(([title, src], i) => ({
    title, source: src,
    url: null,
    publishedAt: new Date(now - (i + 1) * 47 * 60000).toISOString(),
    sourceTag: 'demo',
  }));
}

export function demoWeather() {
  const t = 27 + Math.round(rng() * 4);
  const days = ['Today', 'Tomorrow', '+2', '+3', '+4'];
  return {
    source: 'demo',
    current: { temp: t, code: 3, humidity: 78, wind: 12 },
    daily: days.map((label, i) => ({
      label,
      code: [3, 61, 80, 3, 61][i],
      max: t + 2 - (i % 3),
      min: t - 5 - (i % 2),
    })),
  };
}
