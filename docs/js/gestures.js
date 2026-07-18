/* ════════════════════════════════════════════════════
   GESTURE CONTROL — webcam hand tracking (MediaPipe)
   ported from pratikm7073.github.io with the couplings
   swapped for the dashboard:
     heroApi      → reactorApi   (grab/rotate the reactor)
     projModalApi → focusApi     (widget focus mode)
     .work-row    → .widget-card (pinch a card to open it)
     jumpSection  → cycle cards / tabs
   every tuned constant is preserved: 700ms tracking-loss
   grace, 250ms pinch cooldown, ratio<.5 && reach>1.05
   pinch-vs-fist test, quadratic scroll easing, 66ms loop.
════════════════════════════════════════════════════ */
import * as THREE from 'three';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MP_HANDS = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240';

export function initGestures({ reactorApi, focusApi, widgets, bg }) {
  const btn = document.getElementById('gestureBtn');
  const hud = document.getElementById('gestureHud');
  const video = document.getElementById('gestureCam');
  const status = document.getElementById('gStatus');
  const cursor = document.getElementById('handCursor');
  if (!btn) return;

  let active = false, stream = null, hands = null, loopTimer = null, busy = false;
  let smX = innerWidth / 2, smY = innerHeight / 2, scrollVel = 0, scrollRaf = null;
  let pinched = false, lastX = null, lastT = 0, swipeCool = 0, lastSeen = 0, pinchCool = 0, lastPinchAt = 0;
  let twoHand = false, pmx = 0, pmy = 0, pang = 0, pspread = 0, rotX = 0, rotY = 0, rotZ = 0, zoomT = 1;
  let tiltX = 0, tiltY = 0, tiltS = 1;      // focus-mode two-hand tilt state
  let hoverCard = null, cycleIdx = -1;

  /* ── STARK GRAB: mirror the hand's own 3D orientation ── */
  let grab = null, palmHold = 0;
  const gUp = new THREE.Vector3(), gAc = new THREE.Vector3(), gNorm = new THREE.Vector3(), gAxis = new THREE.Vector3();
  const gSmUp = new THREE.Vector3(0, 1, 0), gSmAc = new THREE.Vector3(1, 0, 0);
  const gM = new THREE.Matrix4(), gQ = new THREE.Quaternion(), gQ0inv = new THREE.Quaternion(),
    gQC0 = new THREE.Quaternion(), gQd = new THREE.Quaternion(), gT = new THREE.Quaternion();
  const gEuler = new THREE.Euler();

  function handQuat(lm, reset) {
    /* palm frame in view space: mirror x, flip y (screen-down) and z */
    gUp.set(-(lm[9].x - lm[0].x), -(lm[9].y - lm[0].y), -(lm[9].z - lm[0].z)).normalize();
    gAc.set(-(lm[5].x - lm[17].x), -(lm[5].y - lm[17].y), -(lm[5].z - lm[17].z)).normalize();
    if (reset) { gSmUp.copy(gUp); gSmAc.copy(gAc); }
    else { gSmUp.lerp(gUp, .45).normalize(); gSmAc.lerp(gAc, .45).normalize(); }
    gNorm.crossVectors(gSmAc, gSmUp).normalize();
    gAc.crossVectors(gSmUp, gNorm).normalize();
    gM.makeBasis(gAc, gSmUp, gNorm);
    return gQ.setFromRotationMatrix(gM);
  }

  function reactorUnderCursor() {
    if (focusApi.isOpen()) return false;
    const rc = reactorApi.el.getBoundingClientRect();
    if (rc.bottom < 60) return false;
    return smX >= rc.left && smX <= rc.right && smY >= Math.max(0, rc.top) && smY <= Math.min(rc.bottom, innerHeight);
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

  /* what a pinch DOES at (smX, smY) — shared by camera + debug paths */
  function pinchAction(now = performance.now()) {
    reactorApi.pulse();
    bg && bg.pulse(smX / innerWidth, smY / innerHeight);   // starfield shockwave
    const el = document.elementFromPoint(smX, smY);
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

  function onResults(r) {
    busy = false;
    const lm = r.multiHandLandmarks && r.multiHandLandmarks[0];
    const now = performance.now();
    if (!lm) {
      twoHand = false; endGrab(); palmHold = 0;
      /* grace window: tracking drops for a few frames constantly
         (especially with the hand low in the camera frame) — keep the
         cursor up AND keep the current scroll velocity going so a
         downward scroll doesn't die the moment the hand dips out */
      if (now - lastSeen < 700) { cursor.classList.add('lost'); return; }
      scrollVel *= .85;
      cursor.style.display = 'none'; cursor.classList.remove('lost', 'scrollUp', 'scrollDn');
      setHover(null);
      status.textContent = 'Show your palm ✋';
      return;
    }
    lastSeen = now; cursor.classList.remove('lost');

    /* 🙌 two hands: grid = rotate/twist/zoom the reactor,
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
      smX = lerp(smX, mx * innerWidth, .3); smY = lerp(smY, my * innerHeight, .3);
      cursor.style.display = 'block';
      cursor.style.transform = `translate(${smX}px,${smY}px)`;
      cursor.classList.remove('scrollUp', 'scrollDn');
      scrollVel *= .85; lastX = null; grab = null; palmHold = 0;
      return;
    }
    twoHand = false;
    status.textContent = 'Tracking ✋';

    /* palm centre (middle-finger MCP), mirrored */
    const palm = lm[9];
    const nx = 1 - palm.x, ny = palm.y;
    smX = lerp(smX, nx * innerWidth, .3); smY = lerp(smY, ny * innerHeight, .3);
    cursor.style.display = 'block';
    cursor.style.transform = `translate(${smX}px,${smY}px)`;
    /* parallax: hand steers the head's idle gaze + the starfield */
    reactorApi.setPointer(nx * 2 - 1, ny * 2 - 1);
    bg && bg.setPointer(nx * 2 - 1, ny * 2 - 1);
    setHover(document.elementFromPoint(smX, smY));

    /* hand geometry: size + how folded each finger is */
    const hand = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || .1;
    const fold = i => Math.hypot(lm[i].x - lm[9].x, lm[i].y - lm[9].y) / hand;
    const foldAvg = (fold(8) + fold(12) + fold(16) + fold(20)) / 4;
    /* pinch vs fist: both bring thumb & index tips together, but a
       pinch holds the contact point OUT from the wrist while a fist
       pulls everything in — 'reach' tells them apart reliably */
    const palmW = Math.hypot(lm[5].x - lm[17].x, lm[5].y - lm[17].y) || .08;
    const ratio = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / palmW;
    const reach = Math.hypot((lm[4].x + lm[8].x) / 2 - lm[0].x, (lm[4].y + lm[8].y) / 2 - lm[0].y) / palmW;
    const pinchPose = ratio < .5 && reach > 1.05;
    const isFist = foldAvg < 0.9 && !pinchPose;
    const overReactor = reactorUnderCursor();

    /* pinch state machine (what a pinch DOES is decided below) */
    let pinchStart = false;
    if (pinchPose && !pinched && now > pinchCool) { pinched = true; pinchCool = now + 250; pinchStart = true; }
    else if ((ratio > .7 || reach < 0.95) && pinched) { pinched = false; cursor.classList.remove('pinch'); }

    /* active grab: target mirrors the wrist while the trigger holds */
    if (grab) {
      const alive = grab.mode === 'pinch' ? pinched
        : grab.mode === 'fist' ? (isFist && overReactor)
        : (overReactor && !isFist && !pinchPose && ny > 0.3 && ny < 0.6);
      if (alive) {
        updateGrab(lm);
        cursor.classList.remove('scrollUp', 'scrollDn');
        scrollVel *= .85; lastX = nx; lastT = now; palmHold = 0;
        return;
      }
      endGrab();
    }

    /* pinch actions: over the reactor = grab it; in focus mode over
       empty card space = grab-tilt the card; elsewhere = click */
    if (pinchStart) {
      cursor.classList.add('pinch', 'burst');
      setTimeout(() => cursor.classList.remove('burst'), 520);
      if (overReactor) {
        startGrab('pinch', lm);
        lastPinchAt = now; lastX = nx; lastT = now;
        return;
      }
      if (focusApi.isOpen()) {
        const el = document.elementFromPoint(smX, smY);
        const interactive = el && el.closest('button, a, .cal-cell, .task-check, .task-item, input, select, textarea, label');
        const dbl = now - lastPinchAt < 700;
        if (!interactive && !dbl && el && el.closest('.fl-card')) {
          startGrab('pinch', lm);
          lastPinchAt = now; lastX = nx; lastT = now;
          return;
        }
      }
      pinchAction(now);
    }

    /* ✊ fist over the reactor = grab (beats turbo scroll there) */
    if (isFist && !grab && overReactor && ny > 0.3 && ny < 0.6) {
      startGrab('fist', lm); lastX = nx; lastT = now; return;
    }
    /* ✋ open palm resting over the reactor auto-grabs after ~0.25s */
    if (!isFist && !pinchPose && overReactor && ny > 0.34 && ny < 0.55) {
      if (++palmHold >= 4 && !grab) { startGrab('palm', lm); lastX = nx; lastT = now; return; }
    } else palmHold = 0;

    /* scrolling: asymmetric zones — the DOWN zone starts just below
       centre (holding a hand at the bottom edge of a webcam frame
       loses tracking, so never require it). Quadratic ease, capped.
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

    /* fast horizontal swipe → cycle cards / tabs (not while fist) */
    if (lastX != null && !isFist) {
      const vx = (nx - lastX) / Math.max(.001, (now - lastT) / 1000);   // screens/sec
      if (now > swipeCool && Math.abs(vx) > 2.6) { swipeAction(vx > 0 ? 1 : -1); swipeCool = now + 1100; }
    }
    lastX = nx; lastT = now;
  }

  async function start() {
    btn.disabled = true; status.textContent = 'Loading hand model…'; hud.classList.add('on');
    try {
      if (!window.Hands) await loadScript(`${MP_HANDS}/hands.min.js`);
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' } });
      video.srcObject = stream; await video.play();
      hands = new Hands({ locateFile: f => `${MP_HANDS}/${f}` });
      hands.setOptions({ maxNumHands: 2, modelComplexity: 0, minDetectionConfidence: .5, minTrackingConfidence: .5 });
      hands.onResults(onResults);
      active = true; btn.classList.add('live'); btn.innerHTML = '<span class="gb-dot"></span>✋ Gestures ON';
      status.textContent = 'Show your palm ✋';
      loopTimer = setInterval(async () => {
        if (busy || video.readyState < 2) return;
        busy = true;
        try { await hands.send({ image: video }); } catch (e) { busy = false; }
      }, 66);   // ~15fps: smooth + cheap
      scrollRaf = requestAnimationFrame(scrollLoop);
    } catch (err) {
      status.textContent = err.name === 'NotAllowedError' ? 'Camera permission denied' : 'Could not start gestures';
      setTimeout(stop, 2200);
    }
    btn.disabled = false;
  }

  function stop() {
    active = false;
    loopTimer && clearInterval(loopTimer); loopTimer = null;
    scrollRaf && cancelAnimationFrame(scrollRaf); scrollRaf = null;
    stream && stream.getTracks().forEach(t => t.stop()); stream = null;
    hands && hands.close && hands.close(); hands = null;
    hud.classList.remove('on'); cursor.style.display = 'none';
    cursor.classList.remove('scrollUp', 'scrollDn', 'lost', 'pinch');
    btn.classList.remove('live'); btn.innerHTML = '<span class="gb-dot"></span>✋ Gesture Control';
    reactorApi.releasePointer(); bg && bg.releasePointer(); setHover(null);
    lastX = null; pinched = false; scrollVel = 0; lastSeen = 0; pinchCool = 0; lastPinchAt = 0;
    twoHand = false; grab = null; palmHold = 0;
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
