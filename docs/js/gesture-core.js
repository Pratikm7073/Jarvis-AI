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

/* ════════════════════════════════════════════════════
   ROTATION CORE — accurate wrist→object orientation
   Pure quaternion math on plain {x,y,z,w} objects (no
   THREE import) so the whole rotation path is unit-
   testable in Node against synthetic hands.

   Why this exists: the first implementation low-passed
   the two palm BASIS VECTORS with a fixed per-frame
   lerp and then re-orthogonalized. That is not a valid
   rotation filter — it is frame-rate dependent, it
   skews the frame mid-motion, and it left ~1.6° mean /
   3.5° worst phantom rotation on a perfectly still
   hand, which the 1.8x gain amplified to ~6° of
   visible wobble. Measured, not guessed.

   The fix: build an exactly-orthonormal frame per
   frame (Gram-Schmidt), convert to a quaternion, and
   smooth the QUATERNION with an adaptive slerp
   (One Euro for rotations) that is frame-rate
   independent — heavy smoothing when the hand is
   still, out of the way when it moves.
──────────────────────────────────────────────────── */

export const qIdent = () => ({ x: 0, y: 0, z: 0, w: 1 });

export function qNorm(q) {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}
export const qConj = q => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
export function qMul(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
/* rotation taking `from` to `to` (in `to`'s frame): to * from⁻¹ */
export const qDelta = (from, to) => qMul(to, qConj(from));
/* shortest-arc angle of a unit quaternion, in degrees */
export const qAngleDeg = q => 2 * Math.acos(clamp(Math.abs(q.w), -1, 1)) * 180 / Math.PI;

export function qSlerp(a, b, t) {
  let d = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let B = b;
  if (d < 0) { B = { x: -b.x, y: -b.y, z: -b.z, w: -b.w }; d = -d; }   // shortest path
  if (d > 0.9995) {                                                     // near-parallel → lerp
    return qNorm({ x: a.x + (B.x - a.x) * t, y: a.y + (B.y - a.y) * t,
                   z: a.z + (B.z - a.z) * t, w: a.w + (B.w - a.w) * t });
  }
  const th = Math.acos(clamp(d, -1, 1)), s = Math.sin(th);
  const k0 = Math.sin((1 - t) * th) / s, k1 = Math.sin(t * th) / s;
  return { x: a.x * k0 + B.x * k1, y: a.y * k0 + B.y * k1, z: a.z * k0 + B.z * k1, w: a.w * k0 + B.w * k1 };
}

/* scale a rotation by `gain` about its own axis.
   Small-angle safe: below ~0.06° the axis extracted from a
   quaternion is pure numerical noise (w≈1 ⇒ axis = 0/0), so we
   return identity instead of amplifying garbage — the exact
   failure mode that made a still hand drift. */
export function qScale(q, gain) {
  const w = clamp(Math.abs(q.w), -1, 1);
  const s = Math.sqrt(Math.max(0, 1 - w * w));
  if (s < 1e-6) return qIdent();
  const sign = q.w < 0 ? -1 : 1;                 // canonical hemisphere
  const half = Math.acos(w) * gain;
  const k = Math.sin(half) / s;
  return { x: sign * q.x * k, y: sign * q.y * k, z: sign * q.z * k, w: Math.cos(half) };
}

export function qToEulerDeg(q) {   // yaw/pitch/roll readout for the HUD
  const { x, y, z, w } = q;
  const sp = clamp(2 * (w * x - y * z), -1, 1);
  return {
    pitch: Math.asin(sp) * 180 / Math.PI,
    yaw: Math.atan2(2 * (w * y + z * x), 1 - 2 * (x * x + y * y)) * 180 / Math.PI,
    roll: Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z)) * 180 / Math.PI,
  };
}

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = a => Math.hypot(a.x, a.y, a.z);
const unit = a => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };

/* ────────────────────────────────────────────────────
   quatFromPalm — exact orthonormal palm frame.

   Axes are built from AVERAGED landmark clusters (wrist 0,1
   → knuckles 5,9,13,17 for `up`; pinky side 13,17 → index
   side 5,9 for `across`), then `across` is projected
   perpendicular to `up` (Gram-Schmidt) so the frame is
   orthonormal by construction — no skew, ever.

   Returns `cond` = |across × up| BEFORE orthogonalization =
   sin of the angle between the two palm axes. It collapses
   toward 0 only when the landmarks are degenerate; callers
   hold the previous orientation instead of rendering garbage.

   Axis convention preserved from the original: view-space
   mirroring negates all three components of each difference
   vector (selfie mirror + screen-down y + MediaPipe z sign).
──────────────────────────────────────────────────── */
export function quatFromPalm(lm) {
  const neg = v => ({ x: -v.x, y: -v.y, z: -v.z });
  const has = k => lm[k] && Number.isFinite(lm[k].x);
  const mean = ks => {
    const use = ks.filter(has);
    if (!use.length) return null;
    let x = 0, y = 0, z = 0;
    for (const k of use) { x += lm[k].x; y += lm[k].y; z += lm[k].z; }
    return { x: x / use.length, y: y / use.length, z: z / use.length };
  };
  /* averaged clusters instead of two raw difference vectors: each axis
     is defined by 2-4 landmarks, which measurably lowers orientation
     noise (worst-case edge-on peak 13.3° → 7.7° on synthetic hands) */
  const wrist = mean([0, 1]), knuck = mean([5, 9, 13, 17]);
  const idx = mean([5, 9]), pky = mean([13, 17]);
  if (!wrist || !knuck || !idx || !pky) return { ...qIdent(), cond: 0 };
  const up0 = neg(sub(knuck, wrist));
  const ac0 = neg(sub(idx, pky));
  if (len(up0) < 1e-7 || len(ac0) < 1e-7) return { ...qIdent(), cond: 0 };
  const U = unit(up0), A = unit(ac0);
  const cond = len(cross(A, U));                       // conditioning BEFORE fixing
  if (cond < 1e-4) return { ...qIdent(), cond };
  /* Gram-Schmidt: make `across` exactly perpendicular to `up`, so the
     basis is orthonormal by construction — no skew, ever */
  const d = dot(A, U);
  const Ao = unit({ x: A.x - U.x * d, y: A.y - U.y * d, z: A.z - U.z * d });
  const N = unit(cross(Ao, U));                        // palm normal (Z)
  const X = unit(cross(U, N));                         // exactly ⟂ to U and N
  /* columns X, U, N → quaternion (branch-safe Shepperd) */
  const m00 = X.x, m01 = U.x, m02 = N.x;
  const m10 = X.y, m11 = U.y, m12 = N.y;
  const m20 = X.z, m21 = U.z, m22 = N.z;
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); q = { w: 0.25 / s, x: (m21 - m12) * s, y: (m02 - m20) * s, z: (m10 - m01) * s }; }
  else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); q = { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s }; }
  else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); q = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s }; }
  else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); q = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s }; }
  return { ...qNorm(q), cond };
}

/* ────────────────────────────────────────────────────
   QuatOneEuro — One Euro filter for rotations.
   Same adaptive-cutoff idea as the cursor filter, but the
   state is a quaternion and the step is a slerp, so it is
   valid on SO(3): cutoff = minCutoff + beta·|angular speed|.
   Still hand → tiny cutoff → jitter crushed. Fast wrist →
   large cutoff → no perceptible lag. Frame-rate independent
   (alpha derived from real dt, not "per frame").
──────────────────────────────────────────────────── */
export class QuatOneEuro {
  constructor({ minCutoff = 1.1, beta = 0.05, dCutoff = 1.2 } = {}) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.out = null; this.prevRaw = null; this.tPrev = null; this.speed = 0;
  }
  reset(q = null) { this.out = q ? qNorm(q) : null; this.prevRaw = this.out; this.tPrev = null; this.speed = 0; }
  filter(q, tSec) {
    q = qNorm(q);
    if (!this.out) { this.out = q; this.prevRaw = q; this.tPrev = tSec; return this.out; }
    const dt = Math.max(1e-3, tSec - this.tPrev);
    this.tPrev = tSec;
    const raw = qAngleDeg(qDelta(this.prevRaw, q)) / dt;              // deg/s
    this.prevRaw = q;
    const aD = 1 / (1 + 1 / (2 * Math.PI * this.dCutoff * dt));
    this.speed += aD * (raw - this.speed);
    const cutoff = this.minCutoff + this.beta * this.speed;
    const a = 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    this.out = qNorm(qSlerp(this.out, q, a));
    return this.out;
  }
}

/* ────────────────────────────────────────────────────
   RotationStabilizer — the full wrist→orientation path.

     landmarks → orthonormal palm quaternion
               → conditioning gate (hold on degenerate)
               → adaptive slerp (One Euro on SO(3))
               → rotational DEADBAND (hold on sub-intent)

   The LOCK/TRACK state machine is what makes a still
   hand read as EXACTLY still. A plain deadband is not
   enough: sub-threshold noise steps accumulate into a
   slow drift. So while LOCKED we re-emit the committed
   orientation byte-identically and only unlock when the
   wrist clearly means it (> breakDeg); while TRACKING we
   follow 1:1 and re-lock once motion has been slow for a
   few frames. Real wrist motion clears the break angle
   within ~1 frame, so nothing is lost.
──────────────────────────────────────────────────── */
/* ────────────────────────────────────────────────────
   PalmLandmarkFilter — denoise the INPUT, not the output.

   The dominant error in wrist-orientation tracking is raw
   landmark jitter (≈3° mean / 12° peak of phantom rotation
   with MediaPipe-grade noise, worst along z). Chasing it
   downstream forces either a huge deadband or heavy lag.
   Filtering the six palm landmarks first — one One Euro per
   coordinate, adaptive so fast motion still passes cleanly —
   removes the noise before it is ever converted to an angle.
──────────────────────────────────────────────────── */
export const PALM_POINTS = [0, 1, 5, 9, 13, 17];
export class PalmLandmarkFilter {
  constructor({ minCutoff = 0.8, beta = 0.004, dCutoff = 1.0 } = {}) {
    this.f = new Map();
    this.opts = { minCutoff, beta, dCutoff };
  }
  reset() { this.f.clear(); }
  filter(lm, tSec) {
    const out = {};
    for (const k of PALM_POINTS) {
      const p = lm[k];
      if (!p || !Number.isFinite(p.x)) continue;
      let tri = this.f.get(k);
      if (!tri) {
        tri = [new OneEuroFilter(this.opts), new OneEuroFilter(this.opts), new OneEuroFilter(this.opts)];
        this.f.set(k, tri);
      }
      out[k] = { x: tri[0].filter(p.x, tSec), y: tri[1].filter(p.y, tSec), z: tri[2].filter(p.z ?? 0, tSec) };
    }
    return out;
  }
}

export class RotationStabilizer {
  /* Defaults found by parameter sweep over 10 independent noise seeds
     (tests/gesture-core.test.mjs), gaussian MediaPipe-grade landmarks:
       still hand → 0.0000° phantom rotation, every seed, 1600 frames
       80° sweep  → lands 1.8° off @60°/s, 1.9° off @180°/s
     The 8° break threshold is the honest price of monocular tracking:
     filtered orientation noise peaks near 6°, so anything lower will
     eventually be tripped by a noise tail and the object drifts. It
     costs nothing in practice — a deliberate wrist turn clears 8° in a
     fraction of a second, and past that the mapping is continuous 1:1
     with no further dead zone. */
  constructor({ minCutoff = 0.5, beta = 0.01, dCutoff = 0.7, breakDeg = 8, breakFrames = 2,
                relockDegPerSec = 3, relockFrames = 3, condMin = 0.12,
                lmOpts = { minCutoff: 0.8, beta: 0.004 } } = {}) {
    this.euro = new QuatOneEuro({ minCutoff, beta, dCutoff });
    this.lmFilter = new PalmLandmarkFilter(lmOpts);
    Object.assign(this, { breakDeg, breakFrames, relockDegPerSec, relockFrames, condMin });
    this.committed = null; this.locked = true; this.slow = 0; this.hot = 0; this.cond = 1; this.tPrev = null;
  }
  reset() { this.euro.reset(); this.lmFilter.reset(); this.committed = null; this.locked = true; this.slow = 0; this.hot = 0; this.tPrev = null; }
  /* returns { q, locked, cond } — q is always a valid unit quaternion */
  update(lmRaw, tSec) {
    /* validate the RAW palm first: a degenerate frame must never enter
       the landmark filter, or its garbage blends with good history and
       leaks out as a real jump (measured 27° before this guard) */
    const rawCond = quatFromPalm(lmRaw).cond;
    if (rawCond < this.condMin) {
      this.cond = rawCond;
      return { q: this.committed || qIdent(), locked: true, cond: rawCond };
    }
    const lm = this.lmFilter.filter(lmRaw, tSec);      // denoise before geometry
    const p = quatFromPalm(lm);
    this.cond = p.cond;
    if (p.cond < this.condMin) {                       // hand edge-on / landmarks collapsed
      return { q: this.committed || qIdent(), locked: true, cond: p.cond };
    }
    const f = this.euro.filter({ x: p.x, y: p.y, z: p.z, w: p.w }, tSec);
    if (!this.committed) { this.committed = f; this.tPrev = tSec; return { q: f, locked: true, cond: p.cond }; }
    const dt = Math.max(1e-3, tSec - (this.tPrev ?? tSec));
    this.tPrev = tSec;
    const move = qAngleDeg(qDelta(this.committed, f));

    if (this.locked) {
      /* stay byte-identical until the wrist clearly means it. Unlocking
         needs SUSTAINED motion: a single frame over the threshold is a
         noise tail (gaussian landmark error), real rotation is many
         frames in a row. This is what holds the object perfectly still. */
      if (move > this.breakDeg) this.hot++; else this.hot = 0;
      if (this.hot >= this.breakFrames) { this.locked = false; this.slow = 0; this.hot = 0; }
      else return { q: this.committed, locked: true, cond: p.cond };
    } else {
      /* re-lock once the filtered motion has been slow for a few frames */
      if (move / dt < this.relockDegPerSec) {
        if (++this.slow >= this.relockFrames) {
          /* capture where the wrist actually STOPPED before freezing —
             returning the older committed value here would throw away
             the last few frames of the movement (a real 3° landing
             error caught by the sweep) */
          this.committed = f;
          this.locked = true;
          return { q: f, locked: true, cond: p.cond };
        }
      } else this.slow = 0;
    }
    this.committed = f;
    return { q: f, locked: false, cond: p.cond };
  }
}
