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
let seed = 42;
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

console.log(`\n${pass}/${pass + fail} core tests passed`);
process.exit(fail ? 1 : 0);
