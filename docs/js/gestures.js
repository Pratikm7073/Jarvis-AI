/* ════════════════════════════════════════════════════
   GESTURE CONTROL — webcam hand tracking (MediaPipe)
   production pipeline (see gesture-core.js for the
   signal-processing classes and the WHY of each):

     camera (640×480→320×240 ladder, any aspect)
       → MediaPipe Hands (adaptive FPS pacer)
       → confidence gate (handedness score)
       → interaction box (relaxed reach → full screen)
       → One Euro filter + deadzone (zero jitter, no lag)
       → motion predictor (invisible dropout bridging)
       → calibrated hysteresis gates (pinch/fist)
       → UI actions (identical mapping to v1):
         pinch card=open · pinch×2=close · palm=cursor
         high/low=scroll · fist=turbo · swipe=cycle
         grab Ultron=wrist mirror · two hands=rotate/zoom
════════════════════════════════════════════════════ */
import * as THREE from 'three';
import {
  clamp, PointFilter, HysteresisGate, Calibrator,
  MotionPredictor, AdaptivePacer, InteractionBox,
} from './gesture-core.js';

const lerp = (a, b, t) => a + (b - a) * t;
const MP_HANDS = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240';

export function initGestures({ reactorApi, focusApi, widgets, bg }) {
  const btn = document.getElementById('gestureBtn');
  const hud = document.getElementById('gestureHud');
  const video = document.getElementById('gestureCam');
  const status = document.getElementById('gStatus');
  const cursor = document.getElementById('handCursor');
  if (!btn) return;

  /* ── pipeline instances ── */
  const box = new InteractionBox();                 // camera window → full screen
  const pointF = new PointFilter({ minCutoff: 0.7, beta: 0.007, dCutoff: 1.2, deadzone: 1.5 });
  const predictor = new MotionPredictor({ tau: 0.15, maxMs: 700 });
  const cal = new Calibrator();
  const pinchGate = new HysteresisGate({ enter: .45, exit: .6, framesOn: 2, framesOff: 2, cooldownMs: 250 });
  const fistGate = new HysteresisGate({ enter: .88, exit: .97, framesOn: 3, framesOff: 3, cooldownMs: 0 });
  const pacer = new AdaptivePacer({ budget: 0.5, minInterval: 33, maxInterval: 100 });

  /* ── state ── */
  let active = false, stream = null, hands = null, loopTimer = null, busy = false;
  let smX = innerWidth / 2, smY = innerHeight / 2, scrollVel = 0, scrollRaf = null;
  let lastX = null, lastT = 0, swipeCool = 0, lastSeen = 0, lastPinchAt = 0;
  let seenFrames = 0;               // entry guard: frames since the hand (re)appeared
  let pinchLockX = 0, pinchLockY = 0;   // click uses pinch-START coords (no click drift)
  let twoHand = false, pmx = 0, pmy = 0, pang = 0, pspread = 0, rotX = 0, rotY = 0, rotZ = 0, zoomT = 1;
  let tiltX = 0, tiltY = 0, tiltS = 1;
  let hoverCard = null, cycleIdx = -1;
  let lowLightAdapted = false, lastHandAt = 0;

  /* ── STARK GRAB: mirror the hand's own 3D orientation ── */
  let grab = null, palmHold = 0;
  const gUp = new THREE.Vector3(), gAc = new THREE.Vector3(), gNorm = new THREE.Vector3(), gAxis = new THREE.Vector3();
  const gSmUp = new THREE.Vector3(0, 1, 0), gSmAc = new THREE.Vector3(1, 0, 0);
  const gM = new THREE.Matrix4(), gQ = new THREE.Quaternion(), gQ0inv = new THREE.Quaternion(),
    gQC0 = new THREE.Quaternion(), gQd = new THREE.Quaternion(), gT = new THREE.Quaternion();
  const gEuler = new THREE.Euler();

  function handQuat(lm, reset) {
    /* palm frame in view space: mirror x, flip y (screen-down) and z.
       the basis vectors are themselves low-passed (lerp .45) — rotation
       gets its own smoothing independent of the cursor filter */
    gUp.set(-(lm[9].x - lm[0].x), -(lm[9].y - lm[0].y), -(lm[9].z - lm[0].z)).normalize();
    gAc.set(-(lm[5].x - lm[17].x), -(lm[5].y - lm[17].y), -(lm[5].z - lm[17].z)).normalize();
    if (reset) { gSmUp.copy(gUp); gSmAc.copy(gAc); }
    else { gSmUp.lerp(gUp, .45).normalize(); gSmAc.lerp(gAc, .45).normalize(); }
    gNorm.crossVectors(gSmAc, gSmUp).normalize();
    gAc.crossVectors(gSmUp, gNorm).normalize();
    gM.makeBasis(gAc, gSmUp, gNorm);
    return gQ.setFromRotationMatrix(gM);
  }

  /* the grab target is now the whole thought-field: any EMPTY space
     (not a card, chip, or control) is grabbable in grid view */
  function reactorUnderCursor() {
    if (focusApi.isOpen()) return false;
    const el = document.elementFromPoint(smX, smY);
    return !(el && el.closest('.widget-card, #todayStrip, footer, button, a, input, select, textarea, #gestureHud, #constLegend'));
  }

  /* ── finger-skeleton overlay: every tracked landmark drawn as a
     dot with bone lines (the reference video's fingertip dots) —
     live feedback that also makes aiming visibly more accurate ── */
  const skel = document.createElement('canvas');
  skel.id = 'handSkel';
  document.body.appendChild(skel);
  const skCtx = skel.getContext('2d');
  const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  const TIPS = new Set([4, 8, 12, 16, 20]);
  function sizeSkel() { skel.width = innerWidth; skel.height = innerHeight; }
  sizeSkel(); addEventListener('resize', sizeSkel, { passive: true });
  function drawHands(all) {
    skCtx.clearRect(0, 0, skel.width, skel.height);
    if (!all) return;
    for (const lm of all) {
      const P = lm.map(p => [(1 - p.x) * innerWidth, p.y * innerHeight]);
      skCtx.strokeStyle = 'rgba(92,225,230,.28)';
      skCtx.lineWidth = 1.5;
      skCtx.beginPath();
      for (const [a, b] of BONES) { skCtx.moveTo(P[a][0], P[a][1]); skCtx.lineTo(P[b][0], P[b][1]); }
      skCtx.stroke();
      for (let i = 0; i < 21; i++) {
        const tip = TIPS.has(i);
        skCtx.beginPath();
        skCtx.arc(P[i][0], P[i][1], tip ? 5 : 2.6, 0, 7);
        skCtx.shadowColor = '#5ce1e6';
        skCtx.shadowBlur = tip ? 10 : 0;
        skCtx.fillStyle = tip ? '#eafeff' : 'rgba(92,225,230,.6)';
        skCtx.fill();
        skCtx.shadowBlur = 0;
      }
    }
  }

  function startGrab(mode, lm) {
    gQ0inv.copy(handQuat(lm, true)).invert();
    gQC0.copy(reactorApi.getQuat());
    grab = { mode, target: focusApi.isOpen() ? 'card' : 'reactor' };
    status.textContent = grab.target === 'card'
      ? '🔒 Card grabbed — rotate your hand'
      : '🔒 Grabbed ' + (mode === 'pinch' ? '🤏' : mode === 'fist' ? '✊' : '✋') + ' — rotate your hand';
  }

  function updateGrab(lm) {
    gQd.copy(handQuat(lm, false)).multiply(gQ0inv);
    if (gQd.w < 0) { gQd.x *= -1; gQd.y *= -1; gQd.z *= -1; gQd.w *= -1; }
    if (grab.target === 'card') {
      gEuler.setFromQuaternion(gQd, 'XYZ');
      const deg = 180 / Math.PI;
      focusApi.setTilt(clamp(-gEuler.x * deg * 1.2, -18, 18), clamp(gEuler.y * deg * 1.2, -18, 18), 1);
      return;
    }
    const w = clamp(gQd.w, -1, 1), ang = 2 * Math.acos(w), sn = Math.sqrt(Math.max(1e-9, 1 - w * w));
    gAxis.set(gQd.x / sn, gQd.y / sn, gQd.z / sn);
    gQd.setFromAxisAngle(gAxis, ang * 1.8);    // amplified 1.8x, same axis
    gT.copy(gQd).multiply(gQC0);
    reactorApi.manualQuat(gT);
  }

  function endGrab() {
    if (grab && grab.target === 'card') focusApi.setTilt(0, 0, 1);
    grab = null;
  }

  const loadScript = src => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.crossOrigin = 'anonymous';
    s.onload = res; s.onerror = () => rej(new Error('load fail ' + src));
    document.head.appendChild(s);
  });

  const cards = () => [...document.querySelectorAll('.widget-card')];

  /* fast swipe → grid: highlight + scroll to next/prev card
              → focus: next/prev tab, else next/prev widget */
  function swipeAction(dir) {
    if (focusApi.isOpen()) {
      const w = widgets[focusApi.current()];
      if (w && w.cycleTabs) { w.cycleTabs(dir); status.textContent = '⇄ Tab switched'; }
      else { focusApi.cycle(dir); status.textContent = '⇄ Next widget'; }
      return;
    }
    const cs = cards();
    if (!cs.length) return;
    cycleIdx = (cycleIdx + dir + cs.length) % cs.length;
    const c = cs[cycleIdx];
    c.scrollIntoView({ behavior: 'smooth', block: 'center' });
    cs.forEach(x => x.classList.toggle('g-hover', x === c));
    status.textContent = '⇄ ' + (c.querySelector('.w-title')?.textContent || 'widget');
  }

  /* what a pinch DOES at (px, py) — shared by camera + debug paths.
     coordinates are the pinch-START lock: the hand physically moves
     while closing a pinch, so firing at the CURRENT cursor would
     click ~20-40px away from what the user aimed at */
  function pinchAction(now = performance.now(), px = smX, py = smY) {
    reactorApi.pulse();
    bg && bg.pulse(px / innerWidth, py / innerHeight);   // starfield shockwave
    const el = document.elementFromPoint(px, py);
    const dbl = now - lastPinchAt < 700; lastPinchAt = now;
    if (focusApi.isOpen()) {
      if (dbl) { focusApi.close(); status.textContent = '✕ Widget closed'; return; }
      if (el) {
        const it = el.closest('button, a, .cal-cell, .task-check, .task-item, input, select, textarea, label');
        if (it) {
          if (it.matches('input, select, textarea')) it.focus();
          else it.click();
          status.textContent = '🤏 Selected';
        } else if (!el.closest('.fl-card')) { focusApi.close(); status.textContent = '✕ Widget closed'; }
      }
      return;
    }
    if (el) {
      const it = el.closest('button, a, input, select, textarea');
      const card = el.closest('.widget-card');
      if (it && !it.closest('.widget-card')) { it.click?.(); return; }   // gesture btn, close btn…
      if (it) { if (it.matches('input, select, textarea')) it.focus(); else it.click(); status.textContent = '🤏 Selected'; return; }
      if (card) { focusApi.open(card.dataset.widget); status.textContent = '📂 ' + card.dataset.widget + ' opened · pinch×2 = close'; }
    }
  }

  function scrollLoop() {
    scrollVel *= 0.92;
    if (Math.abs(scrollVel) > .4) {
      if (focusApi.isOpen()) focusApi.scrollBody(scrollVel);
      else scrollBy(0, scrollVel);
    }
    scrollRaf = active ? requestAnimationFrame(scrollLoop) : null;
  }

  function setHover(el) {
    const card = el && el.closest('.widget-card');
    if (card === hoverCard) return;
    hoverCard?.classList.remove('g-hover');
    hoverCard = card;
    hoverCard?.classList.add('g-hover');
  }

  function placeCursor(x, y) {
    smX = x; smY = y;
    cursor.style.display = 'block';
    cursor.style.transform = `translate(${smX}px,${smY}px)`;
  }

  function onResults(r) {
    drawHands(r.multiHandLandmarks?.length ? r.multiHandLandmarks : null);
    const lm = r.multiHandLandmarks && r.multiHandLandmarks[0];
    /* handedness score = MediaPipe's own confidence in this hand.
       below .55 the landmarks are garbage — treat as a dropout. */
    const conf = r.multiHandedness?.[0]?.score ?? 1;
    const now = performance.now();

    if (!lm || conf < 0.55) {
      twoHand = false; endGrab(); palmHold = 0; seenFrames = 0;
      /* dropout bridging: dead-reckon the cursor along its last
         velocity (decaying) so brief tracking losses are invisible */
      const p = predictor.predict(now);
      if (p && now - lastSeen < 700) {
        placeCursor(p.x, p.y);
        cursor.classList.add('lost');
        return;
      }
      scrollVel *= .85;
      cursor.style.display = 'none'; cursor.classList.remove('lost', 'scrollUp', 'scrollDn');
      setHover(null);
      pointF.reset(); predictor.reset();
      status.textContent = 'Show your palm ✋';
      return;
    }
    lastSeen = now; lastHandAt = now; cursor.classList.remove('lost');
    seenFrames++;
    /* entry guard: the first frames after a hand appears are the least
       reliable (motion blur, partial view) — cursor moves immediately,
       but discrete gestures unlock only after ~5 clean frames */
    const entryOk = seenFrames >= 5;
    const confOk = conf >= 0.75;

    /* 🙌 two hands: grid = rotate/twist/zoom the head,
       focus mode = tilt/zoom the focused card. Delta-based. */
    const all = r.multiHandLandmarks;
    if (all.length === 2) {
      let A = all[0][9], B = all[1][9];
      if (A.x < B.x) { const tm = A; A = B; B = tm; }   // stable order (mirrored: left hand first)
      const x1 = 1 - A.x, y1 = A.y, x2 = 1 - B.x, y2 = B.y;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const spread = Math.hypot(x2 - x1, y2 - y1);
      if (!twoHand) { twoHand = true; pmx = mx; pmy = my; pang = ang; pspread = spread; }
      let dA = ang - pang;
      while (dA > Math.PI / 2) dA -= Math.PI; while (dA < -Math.PI / 2) dA += Math.PI;
      if (focusApi.isOpen()) {
        tiltY = clamp(tiltY + (mx - pmx) * 160, -18, 18);
        tiltX = clamp(tiltX - (my - pmy) * 120, -18, 18);
        const k = clamp((spread - 0.16) / 0.55, 0, 1);
        tiltS = lerp(tiltS, 0.9 + k * 0.25, .28);
        focusApi.setTilt(tiltX, tiltY, tiltS);
        status.textContent = `🙌 Tilt · zoom ${Math.round(tiltS * 100)}%`;
      } else {
        rotY += (mx - pmx) * 5.5;
        rotX += (my - pmy) * 4.0;
        rotZ = clamp(rotZ - dA * 1.25, -2.6, 2.6);
        /* zoom is ABSOLUTE: hand distance IS the zoom level */
        const k = clamp((spread - 0.16) / 0.55, 0, 1);
        zoomT = lerp(zoomT, 2.2 - k * (2.2 - 0.5), .28);
        reactorApi.manual(rotX, rotY, rotZ, zoomT);
        status.textContent = `🙌 Rotate · twist · zoom ${Math.round(zoomT * 100)}%`;
      }
      pmx = mx; pmy = my; pang = ang; pspread = spread;
      placeCursor(lerp(smX, mx * innerWidth, .3), lerp(smY, my * innerHeight, .3));
      cursor.classList.remove('scrollUp', 'scrollDn');
      scrollVel *= .85; lastX = null; grab = null; palmHold = 0;
      return;
    }
    twoHand = false;
    status.textContent = confOk ? 'Tracking ✋' : '✋ Hold steady…';

    /* cursor: mirror → interaction box → screen px → One Euro filter.
       the interaction box means screen corners are reachable without
       pushing the hand to the frame edge (where tracking dies) */
    const palm = lm[9];
    const ib = box.map(1 - palm.x, palm.y);
    const f = pointF.filter(ib.x * innerWidth, ib.y * innerHeight, now / 1000);
    placeCursor(f.x, f.y);
    predictor.track(smX, smY, now);
    const nx = ib.x, ny = ib.y;   // box-mapped [0..1] for zones/swipes

    /* parallax: hand steers the head's idle gaze + the starfield */
    reactorApi.setPointer(nx * 2 - 1, ny * 2 - 1);
    bg && bg.setPointer(nx * 2 - 1, ny * 2 - 1);
    setHover(document.elementFromPoint(smX, smY));

    /* hand geometry — every distance is divided by palm width, so all
       thresholds are hand-size- and camera-distance-invariant */
    const hand = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || .1;
    const fold = i => Math.hypot(lm[i].x - lm[9].x, lm[i].y - lm[9].y) / hand;
    const foldAvg = (fold(8) + fold(12) + fold(16) + fold(20)) / 4;
    const palmW = Math.hypot(lm[5].x - lm[17].x, lm[5].y - lm[17].y) || .08;
    const ratio = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / palmW;
    /* pinch vs fist: a pinch holds the thumb-index contact point OUT
       from the wrist, a fist pulls everything in — 'reach' splits them */
    const reach = Math.hypot((lm[4].x + lm[8].x) / 2 - lm[0].x, (lm[4].y + lm[8].y) / 2 - lm[0].y) / palmW;

    /* auto-calibration: learn this user's open/pinched range and move
       the gate thresholds to the proportional sweet spot */
    cal.observe(ratio);
    pinchGate.enter = cal.pinchEnter;
    pinchGate.exit = cal.pinchExit;

    const pinch = pinchGate.update(ratio, now, confOk && entryOk && reach > 1.02);
    const fist = fistGate.update(foldAvg, now, confOk && entryOk && !pinch.active);
    const pinched = pinch.active, isFist = fist.active;
    const overReactor = reactorUnderCursor();
    cursor.classList.toggle('pinch', pinched);

    /* active grab: target mirrors the wrist while the trigger holds */
    if (grab) {
      const alive = grab.mode === 'pinch' ? pinched
        : grab.mode === 'fist' ? (isFist && overReactor)
        : (overReactor && !isFist && !pinched && ny > 0.3 && ny < 0.6);
      if (alive) {
        updateGrab(lm);
        cursor.classList.remove('scrollUp', 'scrollDn');
        scrollVel *= .85; lastX = nx; lastT = now; palmHold = 0;
        return;
      }
      endGrab();
    }

    /* pinch actions: over Ultron = grab him; in focus mode over empty
       card space = grab-tilt the card; elsewhere = click (at the
       pinch-START position — see pinchAction) */
    if (pinch.rose) {
      pinchLockX = smX; pinchLockY = smY;
      cursor.classList.add('burst');
      setTimeout(() => cursor.classList.remove('burst'), 520);
      if (overReactor) {
        startGrab('pinch', lm);
        lastPinchAt = now; lastX = nx; lastT = now;
        return;
      }
      if (focusApi.isOpen()) {
        const el = document.elementFromPoint(pinchLockX, pinchLockY);
        const interactive = el && el.closest('button, a, .cal-cell, .task-check, .task-item, input, select, textarea, label');
        const dbl = now - lastPinchAt < 700;
        if (!interactive && !dbl && el && el.closest('.fl-card')) {
          startGrab('pinch', lm);
          lastPinchAt = now; lastX = nx; lastT = now;
          return;
        }
      }
      pinchAction(now, pinchLockX, pinchLockY);
    }

    /* ✊ fist over Ultron = grab (beats turbo scroll there) */
    if (isFist && !grab && overReactor && ny > 0.3 && ny < 0.6) {
      startGrab('fist', lm); lastX = nx; lastT = now; return;
    }
    /* ✋ open palm resting over Ultron auto-grabs after ~0.25s */
    if (!isFist && !pinched && overReactor && entryOk && ny > 0.34 && ny < 0.55) {
      if (++palmHold >= 4 && !grab) { startGrab('palm', lm); lastX = nx; lastT = now; return; }
    } else palmHold = 0;

    /* scrolling: asymmetric zones with quadratic ease — velocity is
       PROPORTIONAL to how deep the hand is in the zone, and the
       animation loop applies exponential decay for a fling feel.
       ✊ fist = turbo (faster, still capped) */
    let zone = 0;
    if (isFist) {
      status.textContent = '✊ Turbo scroll';
      const d = ny - 0.45;
      const k = Math.min(1, Math.max(0, Math.abs(d) - 0.12) / 0.3);
      scrollVel = lerp(scrollVel, Math.sign(d) * k * k * 45, .18);
      zone = Math.sign(d) * (k > 0 ? 1 : 0);
    } else if (ny < .32) {
      const k = (0.32 - ny) / 0.32;
      scrollVel = lerp(scrollVel, -k * k * 22, .15);
      zone = -1; status.textContent = '⬆ Scrolling';
    } else if (ny > .55) {
      const k = Math.min(1, (ny - 0.55) / 0.3);
      scrollVel = lerp(scrollVel, k * k * 26, .15);
      zone = 1; status.textContent = '⬇ Scrolling';
    } else scrollVel *= .85;
    scrollVel = clamp(scrollVel, -48, 48);
    cursor.classList.toggle('scrollUp', zone < 0);
    cursor.classList.toggle('scrollDn', zone > 0);

    /* fast horizontal swipe → cycle cards / tabs. velocity is computed
       on the box-mapped, filtered x — noise can't fake a swipe — and
       the entry guard stops the "hand entering frame" false swipe */
    if (lastX != null && !isFist && !pinched && entryOk) {
      const vx = (nx - lastX) / Math.max(.001, (now - lastT) / 1000);   // screens/sec
      if (now > swipeCool && Math.abs(vx) > 2.6) { swipeAction(vx > 0 ? 1 : -1); swipeCool = now + 1100; }
    }
    lastX = nx; lastT = now;
  }

  /* adaptive inference loop: measures each hands.send() latency and
     lets the pacer choose the next interval — fast machines run 30fps,
     slow ones degrade to ~12fps on FRESH frames instead of queueing */
  async function tick() {
    if (!active) return;
    if (!document.hidden && !busy && video.readyState >= 2) {
      busy = true;
      const t0 = performance.now();
      try { await hands.send({ image: video }); pacer.record(performance.now() - t0); }
      catch (e) { /* one bad frame — keep going */ }
      busy = false;
      /* lighting fallback: hand not found for 6s straight while the
         camera runs → relax detection confidence once + hint the user */
      if (!lowLightAdapted && lastHandAt && performance.now() - lastHandAt > 6000) {
        lowLightAdapted = true;
        hands.setOptions({ minDetectionConfidence: .4, minTrackingConfidence: .4 });
        status.textContent = '💡 Hard to see — face a light source';
      }
    }
    loopTimer = setTimeout(tick, pacer.interval);
  }

  async function start() {
    btn.disabled = true; status.textContent = 'Loading hand model…'; hud.classList.add('on');
    try {
      if (!window.Hands) await loadScript(`${MP_HANDS}/hands.min.js`);
      /* camera ladder: prefer 640×480@30 (better landmark precision —
         MediaPipe resizes internally so inference cost stays flat),
         fall back to 320×240, then to whatever the device offers */
      const tries = [
        { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' },
        { width: 320, height: 240, facingMode: 'user' },
        true,
      ];
      for (const c of tries) {
        try { stream = await navigator.mediaDevices.getUserMedia({ video: c }); break; }
        catch (e) { if (e.name === 'NotAllowedError' || c === true) throw e; }
      }
      video.srcObject = stream; await video.play();
      hands = new Hands({ locateFile: f => `${MP_HANDS}/${f}` });
      /* modelComplexity 0 = lite model: within ~2% of the full model's
         landmark quality at a fraction of the cost — the filtering
         pipeline recovers the difference and the FPS win is huge */
      hands.setOptions({ maxNumHands: 2, modelComplexity: 0, minDetectionConfidence: .5, minTrackingConfidence: .5 });
      hands.onResults(onResults);
      active = true; btn.classList.add('live'); btn.innerHTML = '<span class="gb-dot"></span>✋ Gestures ON';
      status.textContent = 'Show your palm ✋';
      lastHandAt = performance.now(); lowLightAdapted = false;
      tick();
      scrollRaf = requestAnimationFrame(scrollLoop);
    } catch (err) {
      status.textContent = err.name === 'NotAllowedError' ? 'Camera permission denied' : 'Could not start gestures';
      setTimeout(stop, 2200);
    }
    btn.disabled = false;
  }

  function stop() {
    active = false;
    loopTimer && clearTimeout(loopTimer); loopTimer = null;
    scrollRaf && cancelAnimationFrame(scrollRaf); scrollRaf = null;
    stream && stream.getTracks().forEach(t => t.stop()); stream = null;
    hands && hands.close && hands.close(); hands = null;
    hud.classList.remove('on'); cursor.style.display = 'none';
    cursor.classList.remove('scrollUp', 'scrollDn', 'lost', 'pinch');
    btn.classList.remove('live'); btn.innerHTML = '<span class="gb-dot"></span>✋ Gesture Control';
    reactorApi.releasePointer(); bg && bg.releasePointer(); setHover(null);
    drawHands(null);
    lastX = null; scrollVel = 0; lastSeen = 0; lastPinchAt = 0; seenFrames = 0;
    twoHand = false; grab = null; palmHold = 0;
    pointF.reset(); predictor.reset(); pinchGate.reset(); fistGate.reset();
  }
  btn.addEventListener('click', () => active ? stop() : start());

  /* ?debug=1 — drive the gesture ACTIONS from the keyboard so the
     UI mappings can be tested without a webcam:
       mouse move = cursor · P = pinch · [ / ] = swipe · ↑/↓ = scroll */
  if (new URLSearchParams(location.search).has('debug')) {
    addEventListener('mousemove', e => { smX = e.clientX; smY = e.clientY; }, { passive: true });
    addEventListener('keydown', e => {
      if (e.target.matches('input, textarea, select')) return;
      if (e.key === 'p' || e.key === 'P') pinchAction();
      else if (e.key === ']') swipeAction(1);
      else if (e.key === '[') swipeAction(-1);
      else if (e.key === 'ArrowDown' && e.shiftKey) { focusApi.isOpen() ? focusApi.scrollBody(120) : scrollBy(0, 220); }
      else if (e.key === 'ArrowUp' && e.shiftKey) { focusApi.isOpen() ? focusApi.scrollBody(-120) : scrollBy(0, -220); }
      else return;
      e.preventDefault();
    });
    console.info('[gestures] debug mode: mouse=cursor · P=pinch · [ ]=swipe · shift+↑/↓=scroll');
  }
}
