/* ════════════════════════════════════════════════════
   FX — Tier-1 animation pack (see DESIGN-NOTES.md)
   · scramble(): dot-matrix glyph reveal (ref B6)
   · odometer(): rolling digit tickers (split-flap feel)
   · hover crop-mark brackets that draw themselves (B3/A4)
   All transform/opacity-only; every effect no-ops under
   prefers-reduced-motion.
════════════════════════════════════════════════════ */

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const GLYPHS = '░▒▓█<>/\\|=+*·01';

/* ── dot-matrix reveal: characters cycle random glyphs,
     then lock left→right (the "PAPER PLANES" effect) ── */
export function scramble(el, text, { step = 18, hold = 3 } = {}) {
  if (!el) return;
  if (reduced()) { el.textContent = text; return; }
  const chars = [...text];
  let locked = 0, frame = 0;
  clearInterval(el.__scr);
  el.__scr = setInterval(() => {
    if (++frame % hold === 0) locked++;
    if (locked >= chars.length) {
      clearInterval(el.__scr);
      el.textContent = text;
      return;
    }
    el.textContent = chars.map((c, i) =>
      i < locked ? c :
      c === ' ' ? ' ' :
      GLYPHS[(Math.random() * GLYPHS.length) | 0]).join('');
  }, step);
}

/* ── odometer: per-digit vertical roll from the previous
     value to the next (clock, prices, step counts) ── */
export function odometer(el, next) {
  if (!el) return;
  const prev = el.dataset.od ?? '';
  el.dataset.od = next;
  if (reduced() || !prev || prev === next) { el.textContent = next; return; }
  const frag = document.createDocumentFragment();
  const P = [...prev], N = [...next];
  N.forEach((ch, i) => {
    const old = P[i];
    if (old === undefined || old === ch || !/\d/.test(ch)) {
      frag.append(ch);
      return;
    }
    const cell = document.createElement('span');
    cell.className = 'od';
    const roll = document.createElement('span');
    roll.className = 'od-roll';
    roll.innerHTML = `<span>${old}</span><span>${ch}</span>`;
    cell.appendChild(roll);
    frag.appendChild(cell);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      roll.style.transform = 'translateY(-50%)';
    }));
  });
  el.textContent = '';
  el.appendChild(frag);
}

/* ── hover crop-marks: viewfinder corners that draw in
     around whichever card the pointer is over ── */
export function initFx() {
  /* software rasterizers (SwiftShader/llvmpipe — VMs, weak iGPUs) pay
     ~hundreds of ms per repaint of the blurred aurora; give them the
     static frame instead of a slideshow */
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const dbg = gl?.getExtension('WEBGL_DEBUG_RENDERER_INFO') || gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
    if (/swiftshader|llvmpipe|software/i.test(renderer)) {
      const a = document.querySelector('.aurora');
      if (a) { a.style.animation = 'none'; a.style.opacity = '.09'; a.dataset.static = '1'; }
    }
  } catch (e) { }

  const marks = document.createElement('div');
  marks.id = 'hoverMarks';
  marks.innerHTML = '<i></i><i></i><i></i><i></i>';
  marks.setAttribute('aria-hidden', 'true');
  document.body.appendChild(marks);
  if (!matchMedia('(pointer: fine)').matches || reduced()) return;

  let cur = null;
  addEventListener('pointerover', e => {
    const card = e.target.closest?.('.widget-card');
    if (!card || card === cur) return;
    cur = card;
    const r = card.getBoundingClientRect();
    const ac = getComputedStyle(card).getPropertyValue('--ac').trim() || '#5ce1e6';
    Object.assign(marks.style, {
      left: `${r.left + scrollX - 5}px`, top: `${r.top + scrollY - 5}px`,
      width: `${r.width + 10}px`, height: `${r.height + 10}px`, color: ac,
    });
    marks.classList.remove('draw');
    void marks.offsetWidth;                 // restart the draw animation
    marks.classList.add('draw', 'on');
  }, { passive: true });
  addEventListener('pointerout', e => {
    if (cur && e.target.closest?.('.widget-card') === cur && !cur.contains(e.relatedTarget)) {
      cur = null;
      marks.classList.remove('on');
    }
  }, { passive: true });
  addEventListener('scroll', () => { cur = null; marks.classList.remove('on'); }, { passive: true });
}
