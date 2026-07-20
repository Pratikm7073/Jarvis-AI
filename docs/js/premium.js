/* ════════════════════════════════════════════════════
   PREMIUM LAYER — micro-interactions & choreography
   · magnetic buttons        (pointer-fine only)
   · cursor-reactive card spotlight (rAF-batched)
   · cinematic entrance      (IO-staggered, once)
   · focus-mode depth + real dialog focus management
   All handlers are passive; all writes happen inside
   one requestAnimationFrame per frame; every effect is
   skipped under prefers-reduced-motion.
════════════════════════════════════════════════════ */

const MAGNETIC = '#gestureBtn, #voiceBtn, .pill-btn, .fl-close, .tab-btn, .cal-nav button';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;

export function initPremium() {
  document.documentElement.classList.add('pv-ready');
  entrance();
  if (finePointer) { magnetic(); spotlight(); }
  focusDepth();
}

/* ── cinematic entrance: strip → reactor → cards stagger.
     hidden states only exist under html.pv-ready (CSS), so
     a JS failure can never blank the page ── */
function entrance() {
  const reveal = (el, delay = 0) => {
    if (!el) return;
    if (reduced()) { el.classList.add('pv-in'); return; }
    setTimeout(() => el.classList.add('pv-in'), delay);
  };
  reveal(document.getElementById('todayStrip'), 80);
  reveal(document.getElementById('reactorStage'), 260);
  reveal(document.querySelector('footer'), 900);
  const cards = [...document.querySelectorAll('.widget-card')];
  if (reduced()) { cards.forEach(c => c.classList.add('pv-in', 'pv-done')); return; }
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      io.unobserve(el);
      // stagger by grid column so rows cascade left→right
      const idx = cards.indexOf(el) % 3;
      el.style.transitionDelay = `${380 + idx * 70}ms`;
      el.classList.add('pv-in');
      // pv-done releases the entrance transition so console-mode
      // tilt can drive transforms at its own speed
      const settle = () => { el.style.transitionDelay = ''; el.classList.add('pv-done'); };
      el.addEventListener('transitionend', settle, { once: true });
      setTimeout(settle, 1600);
    });
  }, { threshold: 0.12 });
  cards.forEach(c => io.observe(c));
}

/* ── magnetic buttons: while hovered, the element leans
     toward the cursor (≤6px); leaving hands control back
     to a CSS spring. transform-only, per-element rAF ── */
function magnetic() {
  let el = null, raf = 0, mx = 0, my = 0;
  const strength = 0.22, maxPull = 6;
  function frame() {
    raf = 0;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1;
    const pull = Math.min(maxPull, d * strength);
    el.style.transform = `translate(${(dx / d) * pull}px, ${(dy / d) * pull}px)`;
  }
  addEventListener('pointerover', e => {
    const t = e.target.closest(MAGNETIC);
    if (!t || reduced()) return;
    el = t;
    t.classList.add('magnetic', 'mag-live');
    t.style.willChange = 'transform';
  }, { passive: true });
  addEventListener('pointermove', e => {
    if (!el) return;
    mx = e.clientX; my = e.clientY;
    raf ||= requestAnimationFrame(frame);
  }, { passive: true });
  addEventListener('pointerout', e => {
    if (!el || el.contains(e.relatedTarget)) return;
    const t = el; el = null;
    t.classList.remove('mag-live');          // CSS transition springs it home
    t.style.transform = '';
    t.addEventListener('transitionend', () => { t.style.willChange = ''; }, { once: true });
  }, { passive: true });
}

/* ── card spotlight: one delegated listener updates the
     hovered card's --mx/--my custom props (compositor
     paints the radial — no layout, no repaint storms).
     Exported so the gesture cursor can feed it too. ── */
let spotCard = null, spotRaf = 0, spotX = 0, spotY = 0;
function spotFrame() {
  spotRaf = 0;
  if (!spotCard) return;
  const r = spotCard.getBoundingClientRect();
  spotCard.style.setProperty('--mx', `${spotX - r.left}px`);
  spotCard.style.setProperty('--my', `${spotY - r.top}px`);
}
export function feedSpotlight(x, y, cardEl) {
  spotCard = cardEl; spotX = x; spotY = y;
  spotRaf ||= requestAnimationFrame(spotFrame);
}
function spotlight() {
  addEventListener('pointermove', e => {
    const card = e.target.closest?.('.widget-card');
    if (card) feedSpotlight(e.clientX, e.clientY, card);
  }, { passive: true });
}

/* ── focus mode as a first-class dialog:
     · page recedes (body.focus-open → CSS depth)
     · keyboard focus moves into the dialog, Tab cycles
       inside it, and focus RETURNS to the opening card
     main.js announces open/close via custom events ── */
function focusDepth() {
  let opener = null;
  const card = document.getElementById('focusCard');
  addEventListener('jarvis:focus-open', () => {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add('focus-open');
    setTimeout(() => document.getElementById('focusClose')?.focus(), 80);
  });
  addEventListener('jarvis:focus-close', e => {
    document.body.classList.remove('focus-open');
    const back = document.querySelector(`.widget-card[data-widget="${e.detail?.id}"]`) || opener;
    back?.focus?.({ preventScroll: true });
    opener = null;
  });
  /* focus trap: Tab wraps inside the dialog while it's open */
  addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !document.body.classList.contains('focus-open')) return;
    const focusables = card.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  });
}
