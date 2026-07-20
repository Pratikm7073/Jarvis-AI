/* ════════════════════════════════════════════════════
   CONSOLE MODE — drive the dashboard like an Xbox
   · 3D tile tilt toward the cursor (always on, subtle)
   · snapping focus ring: arrow keys OR a real game
     controller (Gamepad API) — D-pad/stick to move,
     A to open, B to close, LB/RB to switch tabs
   · HAPTICS: dual-rumble ticks on every snap, a thump
     on open, a bump at grid edges — you FEEL the UI
   · SPATIAL AUDIO: tiny synthesized blips (no audio
     files) panned in stereo to match the tile's actual
     position on screen
   Everything degrades silently: no controller, no
   haptics support, no audio permission — no errors.
════════════════════════════════════════════════════ */

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initConsole({ focusApi, widgets }) {
  const cards = () => [...document.querySelectorAll('.widget-card')];

  /* ── spatial audio: synthesized, created on first user gesture ── */
  let actx = null;
  function audio() {
    if (actx) return actx;
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { }
    return actx;
  }
  /* pan ∈ [-1,1] follows the tile's x-position on screen */
  function blip(f0, f1, dur, pan = 0, vol = .05, type = 'sine') {
    const ctx = audio();
    if (!ctx || ctx.state === 'suspended') return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + .008);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    p.pan.value = pan;
    osc.connect(g).connect(p).connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + .02);
  }
  const panOf = el => {
    const r = el.getBoundingClientRect();
    return Math.max(-1, Math.min(1, ((r.left + r.width / 2) / innerWidth - .5) * 1.8));
  };
  addEventListener('pointerdown', () => audio()?.resume(), { once: true, passive: true });
  addEventListener('keydown', () => audio()?.resume(), { once: true });

  /* ── haptics: rumble through whatever controller is connected ── */
  function rumble(strong, weak, ms) {
    const gp = [...(navigator.getGamepads?.() || [])].find(g => g && g.connected);
    gp?.vibrationActuator?.playEffect?.('dual-rumble',
      { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch?.(() => { });
  }

  /* ── 3D tile tilt (pointer-fine, after entrance settles) ── */
  if (matchMedia('(pointer: fine)').matches && !reduced()) {
    let tiltEl = null;
    addEventListener('pointermove', e => {
      const card = e.target.closest?.('.widget-card');
      if (card !== tiltEl) {
        if (tiltEl) { tiltEl.style.transform = ''; tiltEl.style.transition = ''; }
        tiltEl = card;
      }
      if (!card || !card.classList.contains('pv-in')) return;
      const r = card.getBoundingClientRect();
      const rx = ((e.clientY - r.top) / r.height - .5) * -5;
      const ry = ((e.clientX - r.left) / r.width - .5) * 6;
      card.style.transition = 'transform .18s cubic-bezier(.22,1,.36,1)';
      card.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-3px)`;
    }, { passive: true });
    addEventListener('pointerout', e => {
      const card = e.target.closest?.('.widget-card');
      if (card && !card.contains(e.relatedTarget) && card === tiltEl) {
        card.style.transform = ''; card.style.transition = ''; tiltEl = null;
      }
    }, { passive: true });
  }

  /* ── focus ring + snap navigation ── */
  const ring = document.createElement('div');
  ring.id = 'consoleRing';
  ring.innerHTML = '<span class="cr-hint">Ⓐ open · Ⓑ back</span>';
  document.body.appendChild(ring);
  const toast = document.createElement('div');
  toast.id = 'padToast';
  document.body.appendChild(toast);
  let toastTimer = 0;
  function say(msg) {
    toast.textContent = msg;
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('on'), 2600);
  }

  let mode = false, idx = 0;
  function paintRing() {
    const cs = cards();
    if (!cs.length) return;
    idx = Math.max(0, Math.min(idx, cs.length - 1));
    const el = cs[idx];
    el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
    const r = el.getBoundingClientRect();
    const ac = getComputedStyle(el).getPropertyValue('--ac').trim() || '#5ce1e6';
    Object.assign(ring.style, {
      left: `${r.left + scrollX - 7}px`, top: `${r.top + scrollY - 7}px`,
      width: `${r.width + 14}px`, height: `${r.height + 14}px`,
      borderColor: ac, boxShadow: `0 0 26px ${ac}66, inset 0 0 18px ${ac}22`, color: ac,
    });
  }
  function enter() {
    if (mode) return;
    mode = true;
    document.body.classList.add('console-on');
    paintRing();
    say('🎮 CONSOLE MODE — arrows/D-pad move · Ⓐ/Enter open · Ⓑ/Esc exit');
  }
  function exit() {
    mode = false;
    document.body.classList.remove('console-on');
  }
  /* grid-aware movement: pick the nearest card centre in the pressed
     direction, so up/down works across any responsive column count */
  function move(dx, dy) {
    const cs = cards();
    const cur = cs[idx].getBoundingClientRect();
    const cx = cur.left + cur.width / 2, cy = cur.top + cur.height / 2;
    let best = -1, bestScore = 1e9;
    cs.forEach((c, i) => {
      if (i === idx) return;
      const r = c.getBoundingClientRect();
      const ox = (r.left + r.width / 2) - cx, oy = (r.top + r.height / 2) - cy;
      if (dx && Math.sign(ox) !== dx) return;
      if (dy && Math.sign(oy) !== dy) return;
      if (dx && Math.abs(oy) > Math.abs(ox)) return;      // stay in the row
      if (dy && Math.abs(ox) > Math.abs(oy) * 1.6) return;
      const score = Math.hypot(ox, oy);
      if (score < bestScore) { bestScore = score; best = i; }
    });
    const el0 = cs[idx];
    if (best === -1) {                                    // grid edge
      rumble(.05, .35, 60);
      blip(160, 120, .06, panOf(el0), .04, 'triangle');
      return;
    }
    idx = best;
    paintRing();
    rumble(.02, .25, 28);                                 // snap tick
    blip(760, 880, .045, panOf(cs[idx]));
  }
  function openSel() {
    const el = cards()[idx];
    if (!el) return;
    focusApi.open(el.dataset.widget);
    rumble(.5, .3, 110);                                  // open thump
    blip(480, 920, .1, panOf(el), .06);
  }
  function closeFocus() {
    if (focusApi.isOpen()) {
      focusApi.close();
      rumble(.15, .2, 60);
      blip(700, 380, .09, 0, .05);
    } else exit();
  }
  /* rAF-coalesced: smooth scrolling fires dozens of events per frame —
     repaint the ring at most once per frame */
  let ringRaf = 0;
  const queueRing = () => { if (mode && !ringRaf) ringRaf = requestAnimationFrame(() => { ringRaf = 0; paintRing(); }); };
  addEventListener('resize', queueRing, { passive: true });
  addEventListener('scroll', queueRing, { passive: true });

  /* keyboard drives the same rails */
  addEventListener('keydown', e => {
    if (e.target.matches('input, textarea, select')) return;
    const k = e.key;
    if (!mode) {
      if (k.startsWith('Arrow') && !e.shiftKey && !focusApi.isOpen()) { enter(); e.preventDefault(); }
      return;
    }
    if (focusApi.isOpen()) {
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        const w = widgets[focusApi.current()];
        w?.cycleTabs?.(k === 'ArrowRight' ? 1 : -1);
        rumble(.02, .2, 25); e.preventDefault();
      }
      return;                                             // Escape handled by main.js
    }
    if (k === 'ArrowLeft') move(-1, 0);
    else if (k === 'ArrowRight') move(1, 0);
    else if (k === 'ArrowUp') move(0, -1);
    else if (k === 'ArrowDown') move(0, 1);
    else if (k === 'Enter' || k === ' ') openSel();
    else if (k === 'Escape') exit();
    else return;
    e.preventDefault();
  });

  /* ── the controller itself ── */
  const prev = {};                                        // edge detection
  let repeatAt = 0;
  function pressed(gp, i) { return !!gp.buttons[i]?.pressed; }
  function poll() {
    requestAnimationFrame(poll);
    const gp = [...(navigator.getGamepads?.() || [])].find(g => g && g.connected);
    if (!gp || document.hidden) return;
    const now = performance.now();
    const edge = i => { const was = prev[i]; prev[i] = pressed(gp, i); return !was && prev[i]; };
    /* stick → digital with a repeat delay, so held = steady stepping */
    const ax = Math.abs(gp.axes[0]) > .55 ? Math.sign(gp.axes[0]) : 0;
    const ay = Math.abs(gp.axes[1]) > .55 ? Math.sign(gp.axes[1]) : 0;
    const dir =
      edge(14) || (ax < 0 && now > repeatAt) ? [-1, 0] :
      edge(15) || (ax > 0 && now > repeatAt) ? [1, 0] :
      edge(12) || (ay < 0 && now > repeatAt) ? [0, -1] :
      edge(13) || (ay > 0 && now > repeatAt) ? [0, 1] : null;
    if (dir) {
      if (!mode) enter();
      else if (focusApi.isOpen()) { /* dpad scrolls the open widget */
        if (dir[1]) focusApi.scrollBody(dir[1] * 90);
      } else move(dir[0], dir[1]);
      repeatAt = now + 210;
    }
    if (edge(0)) { if (!mode) enter(); else if (!focusApi.isOpen()) openSel(); }   // A
    if (edge(1)) closeFocus();                                                     // B
    if (edge(4) || edge(5)) {                                                      // LB/RB
      const w = widgets[focusApi.current()];
      if (focusApi.isOpen()) { w?.cycleTabs?.(edge(5) ? 1 : -1); rumble(.02, .2, 25); }
    }
    if (edge(9)) document.getElementById('gestureBtn')?.click();                   // Start
  }
  requestAnimationFrame(poll);

  addEventListener('gamepadconnected', e => {
    say(`🎮 ${e.gamepad.id.split('(')[0].trim().slice(0, 34)} CONNECTED — press any direction`);
    rumble(.4, .4, 200);
    blip(520, 1040, .18, 0, .06);
  });
  addEventListener('gamepaddisconnected', () => { say('🎮 Controller disconnected'); exit(); });
}
