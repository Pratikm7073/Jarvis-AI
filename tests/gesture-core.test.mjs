/* Unit tests for gesture-core.js — synthetic landmark streams. */
import {
  PointFilter, HysteresisGate, Calibrator, MotionPredictor, AdaptivePacer, InteractionBox,
} from '../docs/js/gesture-core.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
  cond ? pass++ : fail++;
};

/* seeded gaussian noise (Box-Muller over mulberry32) */
let seed = 42;   // reassigned per-case by the rotation tests
const rng = () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = s => s * Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
const std = a => { const m = a.reduce((x, y) => x + y) / a.length; return Math.sqrt(a.reduce((s2, v) => s2 + (v - m) ** 2, 0) / a.length); };

/* 1. jitter: stationary hand + σ=3px noise @30fps → output var crushed */
{
  const f = new PointFilter({ minCutoff: 0.7, beta: 0.007, dCutoff: 1.2, deadzone: 1.5 });
  const inX = [], outX = [];
  for (let i = 0; i < 300; i++) {
    const x = 400 + gauss(3), y = 300 + gauss(3);
    inX.push(x);
    outX.push(f.filter(x, y, i / 30).x);
  }
  const tail = outX.slice(60);
  ok('jitter crushed (out σ < 30% of in σ)', std(tail) < std(inX) * 0.30,
    `in σ=${std(inX).toFixed(2)}px out σ=${std(tail).toFixed(2)}px`);
}

/* 2. lag: 800 px/s ramp → steady-state lag under ~45px (≈2.5 frames) */
{
  const f = new PointFilter({ minCutoff: 0.7, beta: 0.007, dCutoff: 1.2, deadzone: 1.5 });
  let lag = 0;
  for (let i = 0; i <= 30; i++) {
    const x = 100 + i * (800 / 30);
    lag = x - f.filter(x, 300, i / 30).x;
  }
  ok('fast-motion lag bounded (<45px @800px/s)', lag < 45, `lag=${lag.toFixed(1)}px`);
}

/* 3. gate: threshold flicker produces ≤1 event; clean pinch exactly 1+1; cooldown blocks double-fire */
{
  const g = new HysteresisGate({ enter: .45, exit: .60, framesOn: 2, framesOff: 2, cooldownMs: 250 });
  let rises = 0;
  for (let i = 0; i < 40; i++) {                       // dither across enter every frame
    const { rose } = g.update(i % 2 ? 0.44 : 0.47, i * 33);
    if (rose) rises++;
  }
  ok('threshold flicker → ≤1 activation (raw would be ~20)', rises <= 1, `rises=${rises}`);

  const g2 = new HysteresisGate({ enter: .45, exit: .60, framesOn: 2, framesOff: 2, cooldownMs: 250 });
  let ev = { rises: 0, falls: 0 };
  const seq = [1.1, 1.1, .3, .3, .3, .3, 1.1, 1.1, 1.1];
  seq.forEach((m, i) => { const r = g2.update(m, 1000 + i * 33); ev.rises += r.rose; ev.falls += r.fell; });
  ok('clean pinch → exactly 1 rise + 1 fall', ev.rises === 1 && ev.falls === 1, JSON.stringify(ev));

  const g3 = new HysteresisGate({ enter: .45, exit: .60, framesOn: 2, framesOff: 2, cooldownMs: 250 });
  let r3 = 0;
  [.3, .3, 1.1, 1.1, .3, .3].forEach((m, i) => { if (g3.update(m, i * 33).rose) r3++; });   // re-pinch at 132ms < cooldown
  ok('cooldown blocks 130ms double-fire', r3 === 1, `rises=${r3}`);
}

/* 4. calibrator: learns a user's range, thresholds stay in safe clamps */
{
  const c = new Calibrator();
  const d0 = c.pinchEnter;
  for (let i = 0; i < 20; i++) c.observe(0.18);   // user with very deep pinches
  ok('calibrator adapts enter threshold', d0 - c.pinchEnter > 0.02,
    `default=${d0.toFixed(3)} adapted=${c.pinchEnter.toFixed(3)}`);
  ok('calibrated thresholds inside safe clamps',
    c.pinchEnter >= 0.32 && c.pinchEnter <= 0.55 && c.pinchExit > c.pinchEnter && c.pinchExit <= 0.75,
    `enter=${c.pinchEnter.toFixed(3)} exit=${c.pinchExit.toFixed(3)}`);
}

/* 5. predictor: dead-reckons through a dropout, decays, then expires */
{
  const p = new MotionPredictor({ tau: 0.15, maxMs: 700 });
  for (let i = 0; i <= 30; i++) p.track(100 + i * (500 / 30), 300, i * 33);   // 500 px/s
  const t0 = 30 * 33;
  const a = p.predict(t0 + 100);
  const b = p.predict(t0 + 300);
  const c2 = p.predict(t0 + 800);
  ok('prediction continues along velocity', a && a.x > 600 && a.x < 700, a && `x@+100ms=${a.x.toFixed(0)}`);
  ok('prediction decays (Δ later < linear)', b && (b.x - a.x) < (a.x - 600), b && `x@+300ms=${b.x.toFixed(0)}`);
  ok('prediction expires after maxMs', c2 === null);
}

/* 6. pacer: heavy inference → backs off to max; light → sits at min */
{
  const p = new AdaptivePacer({ budget: 0.5, minInterval: 33, maxInterval: 100 });
  for (let i = 0; i < 30; i++) p.record(60);
  const slow = p.interval;
  for (let i = 0; i < 60; i++) p.record(5);
  const fast = p.interval;
  ok('pacer degrades under load / speeds up when idle', slow === 100 && fast === 33, `slow=${slow} fast=${fast}`);
}

/* 7. interaction box: relaxed central window reaches full screen */
{
  const b = new InteractionBox();
  const tl = b.map(0.16, 0.14), br = b.map(0.84, 0.74), mid = b.map(0.5, 0.44);
  ok('box maps margins to screen corners',
    tl.x === 0 && tl.y === 0 && br.x === 1 && br.y === 1 && mid.x > 0.45 && mid.x < 0.55,
    `mid=(${mid.x.toFixed(2)},${mid.y.toFixed(2)})`);
}


/* ════════════════════════════════════════════════════
   ROTATION ACCURACY — synthetic hands with realistic
   MediaPipe landmark noise. These are regression tests
   for the "zero error while rotating" requirement.
════════════════════════════════════════════════════ */
import { quatFromPalm, RotationStabilizer, qDelta, qAngleDeg, qMul, qConj,
         qScale, qSlerp, qNorm, qIdent, qToEulerDeg } from '../docs/js/gesture-core.js';

/* minimal quaternion/vector helpers so the tests carry no dependency */
const axisAngle = (ax, ay, az, deg) => {
  const l = Math.hypot(ax, ay, az) || 1, h = deg * Math.PI / 360, s = Math.sin(h) / l;
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(h) };
};
const rot = (q, v) => {                       // v' = q v q*
  const t = qMul(qMul(q, { x: v.x, y: v.y, z: v.z, w: 0 }), qConj(q));
  return { x: t.x, y: t.y, z: t.z };
};
/* full palm as MediaPipe actually reports it: wrist, thumb CMC and all
   four finger MCPs — the frame builder averages these clusters */
const REST = { 0: { x: 0, y: 0, z: 0 }, 1: { x: -.05, y: -.04, z: .01 },
               5: { x: -.09, y: -.17, z: 0 }, 9: { x: 0, y: -.19, z: 0 },
               13: { x: .05, y: -.18, z: 0 }, 17: { x: .09, y: -.15, z: 0 } };
/* noise model: MediaPipe x/y are ~2.5x cleaner than z */
const hand = (q, noise = 0) => {
  const o = {};
  for (const k of Object.keys(REST)) {
    const v = rot(q, REST[k]);
    o[k] = { x: v.x + gauss(noise), y: v.y + gauss(noise), z: v.z + gauss(noise * 2.5) };
  }
  return o;
};
const FPS = 1 / 15, NOISE = 0.0023;           // ≈ the ±0.004 uniform band used in the sweep

/* 8. clean round-trip: recovered angle must match the truth exactly */
{
  let worst = 0;
  for (const [ax, ay, az] of [[0, 1, 0], [1, 0, 0], [0, 0, 1], [1, 1, 0], [.3, -.7, .5]]) {
    for (const deg of [5, 20, 45, 90, 140]) {
      const q0 = quatFromPalm(hand(qIdent()));
      const q1 = quatFromPalm(hand(axisAngle(ax, ay, az, deg)));
      worst = Math.max(worst, Math.abs(qAngleDeg(qDelta(q0, q1)) - deg));
    }
  }
  ok('rotation round-trip exact on clean landmarks (<0.01°)', worst < 0.01, `worst ${worst.toExponential(1)}°`);
}

/* 9. THE headline requirement: a still hand must not move the object at
   all — asserted across 6 independent noise streams so a lucky seed
   cannot make this pass (gaussian tails are what break naive filters) */
{
  let worst = 0;
  for (const sd of [1, 7, 42, 99, 2026, 31337]) {
    seed = sd;
    for (const q of [qIdent(), axisAngle(0, 1, 0, 45), axisAngle(1, 0, 0, 60), axisAngle(0, 1, 0, 80)]) {
      const st = new RotationStabilizer(); let t = 0;
      for (let i = 0; i < 40; i++) st.update(hand(q, NOISE), t += FPS);      // settle
      const ref = st.update(hand(q, NOISE), t += FPS).q;
      for (let i = 0; i < 400; i++)
        worst = Math.max(worst, qAngleDeg(qDelta(ref, st.update(hand(q, NOISE), t += FPS).q)));
    }
  }
  ok('still hand → ZERO phantom rotation (9600 frames, 6 seeds)', worst < 1e-4, `worst ${worst.toExponential(1)}° (float residue)`);
}

/* 10. responsiveness is not sacrificed: a real sweep lands on target */
{
  const run = degPerSec => {
    const st = new RotationStabilizer(); let t = 0, q0 = null, last = 0;
    const frames = Math.ceil(80 / (degPerSec * FPS));
    for (let i = 0; i <= frames + 20; i++) {
      const deg = Math.min(80, i * degPerSec * FPS);
      const q = st.update(hand(axisAngle(0, 1, 0, deg), NOISE), t += FPS).q;
      if (i === 0) { q0 = q; continue; }
      last = qAngleDeg(qDelta(q0, q));
    }
    return Math.abs(last - 80);
  };
  const avg = dps => { let s = 0; for (const sd of [1, 7, 42, 99, 2026]) { seed = sd; s += run(dps); } return s / 5; };
  const e60 = avg(60), e180 = avg(180);
  ok('80° wrist sweep lands within 3° (mean of 5 seeds) at 60 and 180°/s', e60 < 3 && e180 < 3,
    `${e60.toFixed(2)}° / ${e180.toFixed(2)}°`);
}

/* 11. degenerate landmarks must never produce NaN or a wild jump */
{
  const bad = [
    { 0: { x: 0, y: 0, z: 0 }, 9: { x: 0, y: 0, z: 0 }, 5: { x: 0, y: 0, z: 0 }, 17: { x: 0, y: 0, z: 0 } },
    { 0: { x: 0, y: 0, z: 0 }, 9: { x: 0, y: -.2, z: 0 }, 5: { x: 0, y: -.1, z: 0 }, 17: { x: 0, y: -.1, z: 0 } },
    { 0: { x: .1, y: .1, z: .1 }, 9: { x: .2, y: .2, z: .2 }, 5: { x: .3, y: .3, z: .3 }, 17: { x: .4, y: .4, z: .4 } },
  ];
  const finite = q => [q.x, q.y, q.z, q.w].every(Number.isFinite);
  let allFinite = bad.every(lm => finite(quatFromPalm(lm)));
  const st = new RotationStabilizer(); let t = 0;
  for (let i = 0; i < 20; i++) st.update(hand(qIdent(), NOISE), t += FPS);
  const before = st.update(hand(qIdent(), NOISE), t += FPS).q;
  let jump = 0;
  for (const lm of bad) { const r = st.update(lm, t += FPS); allFinite &&= finite(r.q); jump = Math.max(jump, qAngleDeg(qDelta(before, r.q))); }
  ok("degenerate landmarks: finite output, orientation held", allFinite && jump < 0.01, `jump ${jump.toFixed(4)}°`);
}

/* 12. qScale: small-angle safety + exact scaling of real rotations */
{
  const tiny = qScale({ x: 1e-9, y: 0, z: 0, w: 1 }, 1.8);
  const safe = qAngleDeg(tiny) < 1e-6 && [tiny.x, tiny.y, tiny.z, tiny.w].every(Number.isFinite);
  const doubled = qAngleDeg(qScale(axisAngle(0, 1, 0, 30), 2));
  ok('qScale: noise-safe near zero, exact on real angles', safe && Math.abs(doubled - 60) < 1e-6,
    `2×30° = ${doubled.toFixed(4)}°`);
}

/* 13. slerp + euler sanity (used by the live gyro HUD) */
{
  const half = qSlerp(qIdent(), axisAngle(0, 1, 0, 90), 0.5);
  const e = qToEulerDeg(axisAngle(0, 1, 0, 35));
  ok('slerp midpoint = 45°, euler readout matches', Math.abs(qAngleDeg(half) - 45) < 1e-6 && Math.abs(e.yaw - 35) < 1e-6,
    `${qAngleDeg(half).toFixed(2)}° · yaw ${e.yaw.toFixed(2)}°`);
}

console.log(`\n${pass}/${pass + fail} core tests passed`);
process.exit(fail ? 1 : 0);
