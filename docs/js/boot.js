/* ════════════════════════════════════════════════════
   BOOT SEQUENCE — Iron-Man power-on
   Black screen → arc ring charges → systems check
   types out → curtain lifts onto the dashboard.
   · once per session (sessionStorage), force with ?boot=1
   · click/key skips instantly
   · skipped under reduced-motion and for webdriver
     (automated tests never wait on theatrics)
════════════════════════════════════════════════════ */
import { store } from './store.js';

export function initBoot() {
  const forced = new URLSearchParams(location.search).has('boot');
  if (!forced && (
    navigator.webdriver ||
    matchMedia('(prefers-reduced-motion: reduce)').matches ||
    sessionStorage.getItem('jarvis.booted'))) return;
  try { sessionStorage.setItem('jarvis.booted', '1'); } catch (e) { }

  const name = (store.get('settings').name || 'SIR').toUpperCase();
  const layer = document.createElement('div');
  layer.id = 'bootLayer';
  const R = 56, C = 2 * Math.PI * R;
  layer.innerHTML = `
    <div>
      <div class="boot-core">
        <svg viewBox="0 0 130 130">
          <circle cx="65" cy="65" r="${R}" opacity=".15"></circle>
          <circle class="boot-arc" cx="65" cy="65" r="${R}"
            stroke-dasharray="${C}" stroke-dashoffset="${C}"></circle>
          <circle cx="65" cy="65" r="14" opacity=".9" style="fill:var(--cyan);stroke:none"></circle>
        </svg>
      </div>
      <div class="boot-lines" aria-live="polite"></div>
    </div>
    <div class="boot-skip">TAP TO SKIP</div>`;
  document.body.appendChild(layer);

  const LINES = [
    'ARC REACTOR ............ ONLINE',
    'NEURAL LATTICE ......... SYNCED',
    'ULTRON CORE ............ CONTAINED',
    `WELCOME BACK, ${name}`,
  ];
  const linesEl = layer.querySelector('.boot-lines');
  const arc = layer.querySelector('.boot-arc');
  requestAnimationFrame(() => {
    arc.style.transition = 'stroke-dashoffset 2.1s cubic-bezier(.22,1,.36,1)';
    arc.style.strokeDashoffset = '0';
  });

  let done = false;
  const timers = [];
  LINES.forEach((l, i) => timers.push(setTimeout(() => {
    const row = document.createElement('div');
    if (i < LINES.length - 1) row.className = 'dim';
    row.textContent = l;
    linesEl.appendChild(row);
  }, 380 + i * 480)));

  function finish() {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    layer.classList.add('off');
    setTimeout(() => layer.remove(), 800);
  }
  timers.push(setTimeout(finish, 2650));
  layer.addEventListener('pointerdown', finish);
  addEventListener('keydown', finish, { once: true });
}
