/* ════════════════════════════════════════════════════
   UI helpers shared by widgets
════════════════════════════════════════════════════ */

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const esc = s => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/* update the source badge on a widget's grid card */
export function setBadge(widgetId, source, provider) {
  const b = document.querySelector(`.widget-card[data-widget="${widgetId}"] .w-badge`);
  if (!b) return;
  b.className = 'w-badge ' + source;
  b.textContent = source === 'live' ? `LIVE · ${provider}`
    : source === 'proxy' ? `PROXY · ${provider}`
    : 'DEMO';
}

export function fmtPrice(v) {
  if (v >= 10000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (v >= 100) return v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (v >= 1) return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 4 });
}

export function fmtChg(c) {
  const s = c >= 0 ? '+' : '';
  return `${s}${c.toFixed(2)}%`;
}

export function sparkSVG(pts, w = 64, h = 22) {
  if (!pts || pts.length < 2) return '';
  const min = Math.min(...pts), max = Math.max(...pts), span = (max - min) || 1;
  const up = pts[pts.length - 1] >= pts[0];
  const step = w / (pts.length - 1);
  const d = pts.map((p, i) =>
    `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(h - 2 - ((p - min) / span) * (h - 4)).toFixed(1)}`).join('');
  return `<svg class="mkt-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <path d="${d}" fill="none" stroke="${up ? 'var(--lime)' : 'var(--red)'}" stroke-width="1.5" opacity=".85"/></svg>`;
}

export function timeAgo(iso) {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso)) / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
