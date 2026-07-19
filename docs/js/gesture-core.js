/* ════════════════════════════════════════════════════
   GESTURE CORE — pure signal-processing pipeline
   No DOM, no MediaPipe imports: every class here takes
   numbers in and gives numbers out, so the whole file
   is unit-testable in Node with synthetic streams.

   The pipeline (used by gestures.js):

     raw landmarks ──► confidence gate ──► interaction box
        ──► One Euro filter (adaptive smoothing)
        ──► motion predictor (dropout bridging)
        ──► hysteresis gates (pinch/fist debounce)
        ──► calibrator (per-user thresholds)

   WHY EACH PIECE EXISTS is documented on the class.
════════════════════════════════════════════════════ */

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ────────────────────────────────────────────────────
   LowPass — exponential smoothing building block.
   y += α(x − y). α near 0 = heavy smoothing, near 1 =
   trust the new sample. Everything below composes this.
──────────────────────────────────────────────────── */
export class LowPass {
  constructor() { this.y = null; }
  filter(x, alpha) {
    this.y = this.y == null ? x : this.y + alpha * (x - this.y);
    return this.y;
  }
  reset() { this.y = null; }
}

/* α for a given cutoff frequency (Hz) at sample spacing dt (s).
   Derived from the RC low-pass discretization: α = 1/(1 + τ/dt),
   τ = 1/(2πf). Higher cutoff → larger α → less smoothing. */
const alphaFor = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

/* ────────────────────────────────────────────────────
   OneEuroFilter — THE fix for "smooth vs laggy".
   (Casiez et al. 2012; used by countless AR/VR stacks.)

   A fixed low-pass forces a trade-off: enough smoothing
   to kill jitter makes fast motion feel like dragging
   through syrup. One Euro makes the cutoff ADAPTIVE:

     cutoff = minCutoff + β·|velocity|

   · hand still  → velocity ≈ 0 → tiny cutoff → heavy
     smoothing → sub-pixel jitter is crushed
   · hand moving → velocity big → high cutoff → filter
     gets out of the way → no perceptible lag

   The velocity itself is low-passed (dCutoff) so a
   single noise spike can't open the gate.
──────────────────────────────────────────────────── */
export class OneEuroFilter {
  constructor({ minCutoff = 0.7, beta = 0.007, dCutoff = 1.2 } = {}) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
    this.x = new LowPass(); this.dx = new LowPass();
    this.tPrev = null; this.xPrev = null;
  }
  filter(x, tSec) {
    if (this.tPrev == null) {
      this.tPrev = tSec; this.xPrev = x;
      this.x.filter(x, 1); this.dx.filter(0, 1);
      return x;
    }
    const dt = Math.max(1e-3, tSec - this.tPrev);
    this.tPrev = tSec;
    const dxRaw = (x - this.xPrev) / dt;
    this.xPrev = x;
    const dxHat = this.dx.filter(dxRaw, alphaFor(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    return this.x.filter(x, alphaFor(cutoff, dt));
  }
  reset() { this.x.reset(); this.dx.reset(); this.tPrev = null; this.xPrev = null; }
}

/* ────────────────────────────────────────────────────
   PointFilter — One Euro on x & y plus a micro-deadzone.
   The deadzone (~1.5 px) freezes the cursor completely
   when the residual filtered motion is below what a
   human can intend — the last visible shimmer goes away
   without adding any lag (real moves blow straight
   through a 1.5 px radius on the first frame).
──────────────────────────────────────────────────── */
export class PointFilter {
  constructor(opts = {}) {
    this.fx = new OneEuroFilter(opts); this.fy = new OneEuroFilter(opts);
    this.dead = opts.deadzone ?? 1.5;
    this.ox = null; this.oy = null;      // last committed output
  }
  filter(x, y, tSec) {
    const nx = this.fx.filter(x, tSec), ny = this.fy.filter(y, tSec);
    if (this.ox == null || Math.hypot(nx - this.ox, ny - this.oy) > this.dead) {
      this.ox = nx; this.oy = ny;
    }
    return { x: this.ox, y: this.oy };
  }
  reset() { this.fx.reset(); this.fy.reset(); this.ox = this.oy = null; }
}

/* ────────────────────────────────────────────────────
   HysteresisGate — turns a noisy analog metric into a
   clean boolean gesture with three defenses stacked:

   1. HYSTERESIS: engage below `enter`, release only
      above `exit` (exit > enter). A value dithering on
      one threshold can no longer machine-gun the state.
   2. DEBOUNCE: the pose must hold for `framesOn`
      consecutive frames before it fires (a single bad
      landmark frame can't click), and `framesOff`
      frames to release (a single dropout can't end a
      drag mid-gesture).
   3. COOLDOWN: after firing, re-triggering is blocked
      for `cooldownMs` — the classic double-fire when a
      pinch "bounces" is gone.

   update() returns edge events (rose/fell), which is
   what UI code should consume — never the raw metric.
──────────────────────────────────────────────────── */
export class HysteresisGate {
  constructor({ enter, exit, framesOn = 2, framesOff = 2, cooldownMs = 250 }) {
    Object.assign(this, { enter, exit, framesOn, framesOff, cooldownMs });
    this.active = false; this.onCount = 0; this.offCount = 0; this.lastRise = -1e9;
  }
  /* metric: engaged when LOW (e.g. normalized pinch distance).
     ok: external veto (confidence gate, entry guard). */
  update(metric, nowMs, ok = true) {
    let rose = false, fell = false;
    if (!this.active) {
      if (ok && metric < this.enter) {
        if (++this.onCount >= this.framesOn && nowMs - this.lastRise > this.cooldownMs) {
          this.active = true; rose = true; this.lastRise = nowMs; this.offCount = 0;
        }
      } else this.onCount = 0;
    } else {
      if (!ok || metric > this.exit) {
        if (++this.offCount >= this.framesOff) { this.active = false; fell = true; this.onCount = 0; }
      } else this.offCount = 0;
    }
    return { active: this.active, rose, fell };
  }
  reset() { this.active = false; this.onCount = this.offCount = 0; }
}

/* ────────────────────────────────────────────────────
   Calibrator — automatic per-user, per-session tuning.

   Absolute pixel thresholds break the moment the hand
   moves closer to the camera, and every hand is a
   different size. So:

   · every metric is already NORMALIZED by palm width
     (knuckle-to-knuckle), making it distance- and
     hand-size-invariant;
   · on top of that we LEARN this user's range: a slow
     EMA of their relaxed-hand ratio (openR) and a
     decaying minimum of their deepest pinch (minR).
     Thresholds sit proportionally between the two, so
     small hands, big hands, near or far all land in
     the same relative spot;
   · everything is clamped to safe factory bounds so a
     weird session can degrade calibration, never break
     the gesture entirely.
──────────────────────────────────────────────────── */
export class Calibrator {
  constructor() {
    this.openR = 1.1;    // typical relaxed thumb-index distance / palm width
    this.minR = 0.30;    // typical deepest pinch
  }
  observe(ratio) {
    if (ratio > 0.85)                     // clearly not pinching → refine "open"
      this.openR += (ratio - this.openR) * 0.02;
    if (ratio < this.minR) this.minR = ratio;         // new deepest pinch
    else this.minR += 0.0005;                         // slow decay → adapts if conditions change
    this.openR = clamp(this.openR, 0.9, 1.6);
    this.minR = clamp(this.minR, 0.15, 0.45);
  }
  /* pinch engages 22% of the way from deepest-pinch to fully-open,
     releases at 42% — a wide hysteresis band tuned from the learned range */
  get pinchEnter() { return clamp(this.minR + (this.openR - this.minR) * 0.22, 0.32, 0.55); }
  get pinchExit() { return clamp(this.minR + (this.openR - this.minR) * 0.42, this.pinchEnter + 0.12, 0.75); }
}

/* ────────────────────────────────────────────────────
   MotionPredictor — bridges tracking dropouts.

   MediaPipe loses the hand for a few frames constantly
   (motion blur, edge of frame, bad light). Freezing the
   cursor feels broken; hiding it is worse. Instead we
   keep an EMA of cursor velocity while tracked, and on
   dropout DEAD-RECKON: advance along the last velocity
   with exponential decay (τ≈150 ms), hard-capped at
   `maxMs`. Short dropouts become invisible; long ones
   coast to a gentle stop instead of teleporting.
──────────────────────────────────────────────────── */
export class MotionPredictor {
  constructor({ tau = 0.15, maxMs = 700 } = {}) {
    this.tau = tau; this.maxMs = maxMs;
    this.vx = 0; this.vy = 0; this.x = 0; this.y = 0;
    this.tPrev = null;
  }
  track(x, y, tMs) {
    if (this.tPrev != null) {
      const dt = Math.max(1e-3, (tMs - this.tPrev) / 1000);
      // EMA over ~4 frames: robust to one-frame velocity spikes
      this.vx += ((x - this.x) / dt - this.vx) * 0.25;
      this.vy += ((y - this.y) / dt - this.vy) * 0.25;
    }
    this.x = x; this.y = y; this.tPrev = tMs;
  }
  /* returns predicted {x,y} during a dropout, or null once expired.
     expiry is measured from the LAST REAL OBSERVATION (tPrev), so the
     coast window can't be stretched by repeatedly asking */
  predict(tMs) {
    if (this.tPrev == null || tMs - this.tPrev > this.maxMs) return null;
    const dt = Math.max(1e-3, (tMs - this.tPrev) / 1000);
    const decay = this.tau / dt * (1 - Math.exp(-dt / this.tau));   // ∫v·e^(−t/τ)
    return { x: this.x + this.vx * dt * decay, y: this.y + this.vy * dt * decay };
  }
  reset() { this.vx = this.vy = 0; this.tPrev = null; }
}

/* ────────────────────────────────────────────────────
   AdaptivePacer — holds real-time under any load.

   Inference cost varies wildly across devices. A fixed
   66 ms tick either wastes a fast machine or buries a
   slow one (queued frames → seconds of latency). The
   pacer measures each inference's latency (EMA) and
   sets the next sampling interval so inference uses at
   most `budget` of wall time — a fast laptop runs at
   30 fps, a weak one degrades gracefully to 12–15 fps
   with the LATEST frame, never a stale queue.
──────────────────────────────────────────────────── */
export class AdaptivePacer {
  constructor({ budget = 0.5, minInterval = 33, maxInterval = 100 } = {}) {
    Object.assign(this, { budget, minInterval, maxInterval });
    this.latency = 20;
  }
  record(latencyMs) { this.latency += (latencyMs - this.latency) * 0.2; }
  get interval() {
    return Math.round(clamp(this.latency / this.budget, this.minInterval, this.maxInterval));
  }
}

/* ────────────────────────────────────────────────────
   InteractionBox — maps a comfortable central window of
   the camera frame onto the FULL screen (Leap-Motion
   style). Without it the user must drag their hand to
   the physical frame edge — exactly where MediaPipe
   tracking dies — to reach screen corners. With it,
   corners are reachable from a relaxed ±30° wrist arc,
   and works identically at ANY camera resolution or
   aspect ratio because inputs are normalized [0..1].
──────────────────────────────────────────────────── */
export class InteractionBox {
  constructor({ marginX = 0.16, marginTop = 0.14, marginBottom = 0.26 } = {}) {
    Object.assign(this, { marginX, marginTop, marginBottom });
  }
  map(nx, ny) {
    return {
      x: clamp((nx - this.marginX) / (1 - 2 * this.marginX), 0, 1),
      y: clamp((ny - this.marginTop) / (1 - this.marginTop - this.marginBottom), 0, 1),
    };
  }
}
