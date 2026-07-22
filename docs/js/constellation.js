/* ════════════════════════════════════════════════════
   THOUGHT FIELD — the dashboard's living background
   (reference: "Topologies of Thoughts" hand-tracked
   knowledge graph). Your REAL data — today's tasks,
   workout, events, markets, headlines — floats as
   monospace notes clustered around accent-colored
   [TOPIC] labels, drifting in 3D parallax over black.

   Two layouts, animated between on demand (legend chip):
     · decentralized — notes in clusters by topic
     · distributed   — notes connected by edges

   Exposes the same seam the old reactor did, so the
   gesture engine keeps working unchanged:
     { el, manual, manualQuat, getQuat, pulse,
       setPointer, releasePointer, toggleMode }
════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { store, todayKey, DOW } from './store.js';
import { getNews } from './api.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const trunc = (s, n = 30) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/* crisp text → sprite (painted once, GPU thereafter) */
function textSprite(text, { color = '#c9d1d9', px = 22, weight = 400, glow = false } = {}) {
  const pad = 14, c = document.createElement('canvas');
  const x = c.getContext('2d');
  const font = `${weight} ${px}px "Geist Mono", monospace`;
  x.font = font;
  const w = Math.ceil(x.measureText(text).width) + pad * 2;
  c.width = w * 2; c.height = (px + pad) * 2;          // 2x for retina crispness
  const g = c.getContext('2d');
  g.scale(2, 2);
  g.font = font;
  g.textBaseline = 'middle';
  if (glow) { g.shadowColor = color; g.shadowBlur = 12; }
  g.fillStyle = color;
  g.fillText(text, pad, (px + pad) / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const k = 0.0075;
  spr.scale.set(w * k, (px + pad) * k, 1);
  return spr;
}

/* ── gather the user's actual thoughts ── */
async function gatherNotes() {
  const N = [];
  const push = (cluster, text) => text && N.push({ cluster, text: trunc(String(text)) });

  const tasks = (store.get('tasks')[todayKey()] || []).slice(0, 6);
  tasks.forEach(t => push('tasks', t.text));
  if (!tasks.length) ['capture the day', 'one mission at a time'].forEach(t => push('tasks', t));

  const gym = store.get('gym').schedule[DOW[new Date().getDay()]];
  push('training', gym.title);
  (gym.items || []).slice(0, 3).forEach(i => push('training', i));

  const today = todayKey();
  const evs = store.get('calendar').events.filter(e => e.date >= today)
    .sort((a, b) => a.date < b.date ? -1 : 1).slice(0, 4);
  evs.forEach(e => push('schedule', `${e.date.slice(5)} · ${e.title}`));
  if (!evs.length) push('schedule', 'clear runway ahead');

  const wl = store.get('watchlist');
  [...wl.in.slice(0, 2), ...wl.us.slice(0, 3), ...wl.crypto.slice(0, 2)]
    .forEach(s => push('markets', s.toUpperCase()));

  try {
    const news = await Promise.race([getNews('general'), new Promise(r => setTimeout(() => r(null), 900))]);
    (news?.items || []).slice(0, 5).forEach(a => push('signals', a.title));
  } catch (e) { }
  return N;
}

/* clusters pushed toward the outer margins (x ≈ ±4) so notes live in
   the screen's empty side-gutters, framing the widget grid rather than
   hiding behind it */
const CLUSTERS = {
  tasks:    { label: '[Tasks & Missions]',   color: '#5ce1e6', center: new THREE.Vector3(-4.1, 1.5, -1.0) },
  training: { label: '[Training Protocol]',  color: '#8dff5c', center: new THREE.Vector3(4.0, 1.9, -1.8) },
  schedule: { label: '[Timeline]',           color: '#8b6dff', center: new THREE.Vector3(-4.0, -1.6, -1.8) },
  markets:  { label: '[Capital Flows]',      color: '#4dd6a9', center: new THREE.Vector3(4.2, -1.4, -1.0) },
  signals:  { label: '[Signals & Media]',    color: '#ffc45c', center: new THREE.Vector3(0, 2.7, -2.6) },
};

export async function initConstellation(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x050507, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050507, 5.5, 11);
  const camera = new THREE.PerspectiveCamera(50, 1, .1, 40);
  camera.position.z = 5.2;

  const field = new THREE.Group();
  scene.add(field);

  /* nodes */
  const notes = await gatherNotes();
  const nodes = [];
  const rnd = () => (Math.random() - .5);
  notes.forEach((n, i) => {
    const cl = CLUSTERS[n.cluster];
    const spr = textSprite(n.text, { color: '#aeb6c2', px: 19 });
    spr.material.opacity = .0;                        // fades in on boot
    const clusterPos = cl.center.clone().add(new THREE.Vector3(rnd() * 1.5, rnd() * 1.5, rnd() * 1.4));
    /* distributed layout: loose fibonacci shell */
    const t = i / notes.length, ga = i * 2.39996;
    const r = 2.9 + rnd() * .6, y = (t * 2 - 1) * 2.0;
    const netPos = new THREE.Vector3(Math.cos(ga) * r * Math.sqrt(1 - (t * 2 - 1) ** 2) * .9, y, Math.sin(ga) * r * Math.sqrt(1 - (t * 2 - 1) ** 2) - 1.6);
    field.add(spr);
    nodes.push({ spr, clusterPos, netPos, cur: clusterPos.clone(), ph: Math.random() * 7, dot: null, cl });
    /* companion dot */
    const dot = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTex(cl.color), transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    dot.scale.setScalar(.07);
    field.add(dot);
    nodes[nodes.length - 1].dot = dot;
  });
  const labels = Object.values(CLUSTERS).map(cl => {
    const spr = textSprite(cl.label, { color: cl.color, px: 26, weight: 600, glow: true });
    spr.position.copy(cl.center);
    spr.material.opacity = 0;
    field.add(spr);
    return { spr, cl };
  });

  function dotTex(color) {
    const c = document.createElement('canvas'); c.width = c.height = 48;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(24, 24, 2, 24, 24, 24);
    g.addColorStop(0, '#fff'); g.addColorStop(.35, color); g.addColorStop(1, 'transparent');
    x.fillStyle = g; x.fillRect(0, 0, 48, 48);
    return new THREE.CanvasTexture(c);
  }

  /* edges (visible in distributed mode; faint spokes in cluster mode) */
  const edgePairs = [];
  nodes.forEach((n, i) => {
    const near = nodes.map((m, j) => ({ j, d: n.netPos.distanceTo(m.netPos) }))
      .filter(x => x.j !== i).sort((a, b) => a.d - b.d).slice(0, 2);
    near.forEach(x => i < x.j && edgePairs.push([i, x.j]));
  });
  const edgeGeo = new THREE.BufferGeometry();
  const edgeArr = new Float32Array(edgePairs.length * 6);
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgeArr, 3));
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x8fd8dc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
  field.add(new THREE.LineSegments(edgeGeo, edgeMat));

  /* ── legend chip (the video's minimap caption) ── */
  const legend = document.createElement('button');
  legend.id = 'constLegend';
  legend.setAttribute('aria-label', 'Toggle thought-field layout');
  document.body.appendChild(legend);
  let mode = 0, modeMix = 0;                          // 0 clusters · 1 network
  function legendText() {
    legend.innerHTML = mode === 0
      ? 'mode: <b>decentralized</b><span>notes in different clusters by topic</span>'
      : 'mode: <b>distributed</b><span>notes connected by relationships via edges</span>';
  }
  legendText();
  const toggleMode = () => { mode = 1 - mode; legendText(); };
  legend.addEventListener('click', toggleMode);

  /* ── pose control (same contract as the old reactor) ── */
  let manualRot = null, manualAt = 0, zoomCur = 1;
  const quatTarget = new THREE.Quaternion(); let quatAt = -1e9;
  let px = 0, py = 0, tx = 0, ty = 0, pointerHeld = false, pulseT = 9;
  addEventListener('mousemove', e => {
    if (pointerHeld) return;
    tx = (e.clientX / innerWidth - .5); ty = (e.clientY / innerHeight - .5);
  }, { passive: true });

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  resize(); addEventListener('resize', resize);

  let tabVis = !document.hidden;
  document.addEventListener('visibilitychange', () => { tabVis = !document.hidden; if (tabVis) clock.getDelta(); });

  const clock = new THREE.Clock();
  let t = 0, born = 0;
  const tmp = new THREE.Vector3();
  function frame() {
    requestAnimationFrame(frame);
    if (!tabVis) return;
    const dt = Math.min(clock.getDelta(), .05);
    t += dt;
    if (born < 1) born = Math.min(1, born + dt / 1.8);
    modeMix = lerp(modeMix, mode, 1 - Math.pow(.06, dt));
    px = lerp(px, tx, 1 - Math.pow(.001, dt)); py = lerp(py, ty, 1 - Math.pow(.001, dt));

    /* pose: wrist grab wins, then two-hand manual, then idle drift */
    const nowMs = performance.now();
    const qAge = nowMs - quatAt, mAge = manualRot ? nowMs - manualAt : 1e9;
    if (qAge < 4000 && qAge < mAge) {
      field.quaternion.slerp(quatTarget, 1 - Math.pow(qAge < 300 ? .0005 : .05, dt));
    } else {
      const useManual = mAge < 4000;
      const kR = 1 - Math.pow(mAge < 250 ? .0005 : useManual ? .05 : .001, dt);
      field.rotation.x = lerp(field.rotation.x, useManual ? manualRot.rx : py * .22, kR);
      field.rotation.y = lerp(field.rotation.y, useManual ? manualRot.ry : px * .34 + Math.sin(t * .05) * .1, kR);
      field.rotation.z = lerp(field.rotation.z, useManual ? manualRot.rz : 0, kR);
      zoomCur = lerp(zoomCur, useManual ? manualRot.sc : 1, kR);
    }
    field.scale.setScalar(zoomCur);

    /* nodes drift between layouts, bob, and ripple on pulse */
    pulseT += dt;
    nodes.forEach((n, i) => {
      tmp.lerpVectors(n.clusterPos, n.netPos, modeMix);
      n.cur.lerp(tmp, 1 - Math.pow(.02, dt));
      const bob = Math.sin(t * .7 + n.ph) * .05;
      const ripple = Math.exp(-Math.pow(pulseT - i * .015, 2) * 14) * .35;
      n.spr.position.set(n.cur.x, n.cur.y + bob, n.cur.z);
      n.spr.material.opacity = born * (.72 + .22 * Math.sin(t * .5 + n.ph) ** 2) + ripple;
      n.dot.position.set(n.cur.x - n.spr.scale.x / 2 - .09, n.cur.y + bob, n.cur.z);
      n.dot.scale.setScalar(.07 + ripple * .12);
    });
    labels.forEach(L => {
      L.spr.material.opacity = born * lerp(1, .35, modeMix);
      L.spr.position.y = L.cl.center.y + Math.sin(t * .4 + L.cl.center.x) * .06;
    });
    edgePairs.forEach(([a, b], k) => {
      const A = nodes[a], B = nodes[b];
      edgeArr[k * 6] = A.cur.x; edgeArr[k * 6 + 1] = A.cur.y; edgeArr[k * 6 + 2] = A.cur.z;
      edgeArr[k * 6 + 3] = B.cur.x; edgeArr[k * 6 + 4] = B.cur.y; edgeArr[k * 6 + 5] = B.cur.z;
    });
    edgeGeo.attributes.position.needsUpdate = true;
    edgeMat.opacity = modeMix * .28 * born;

    renderer.render(scene, camera);
  }
  frame();

  return {
    el: canvas,
    manual(rx, ry, rz, sc) { manualRot = { rx, ry, rz, sc: clamp(sc, .6, 1.6) }; manualAt = performance.now(); },
    manualQuat(q) { quatTarget.copy(q); quatAt = performance.now(); },
    getQuat() { return field.quaternion; },
    pulse() { pulseT = 0; },
    setPointer(nx, ny) { pointerHeld = true; tx = nx * .5; ty = ny * .5; },
    releasePointer() { pointerHeld = false; },
    toggleMode,
  };
}
