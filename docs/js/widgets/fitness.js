/* ════════════════════════════════════════════════════
   FITNESS — real-time step counter + heart rate
   · Steps: the phone's accelerometer (DeviceMotion)
     with peak-detection — counts while the page is
     open in your pocket. iOS asks permission first.
   · Heart rate: any Bluetooth LE monitor (chest strap,
     many watches) via Web Bluetooth's standard
     heart_rate service (Chrome/Edge/Android — Apple
     blocks Web Bluetooth on iPhones).
   · Apple Health/Fitness has NO public web API — a
     website cannot read it. Manual entry is the honest
     bridge; a native iOS app would be the real fix.
════════════════════════════════════════════════════ */
import { store, todayKey } from '../store.js';
import { esc } from '../ui.js';

let root = null;
let tracking = false, hrDevice = null, hrLive = null;

/* ── pedometer: high-passed accel magnitude peaks ── */
let ema = 9.8, lastStepAt = 0, armed = true, unsaved = 0;
function onMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null) return;
  const mag = Math.hypot(a.x, a.y, a.z);
  ema = ema * 0.9 + mag * 0.1;              // slow baseline (gravity + posture)
  const hp = mag - ema;                     // high-pass: the step impulse
  const now = performance.now();
  if (armed && hp > 1.6 && now - lastStepAt > 280) {
    lastStepAt = now; armed = false;
    addSteps(1); unsaved++;
    if (unsaved >= 5) { unsaved = 0; render(); }
  } else if (hp < 0.4) armed = true;        // re-arm after the peak passes
}

function addSteps(n) {
  store.update('fitness', f => {
    f.steps[todayKey()] = (f.steps[todayKey()] || 0) + n;
    const days = Object.keys(f.steps).sort();
    while (days.length > 90) delete f.steps[days.shift()];
    return f;
  });
}

async function toggleTracking() {
  if (tracking) {
    removeEventListener('devicemotion', onMotion);
    tracking = false; render(); return;
  }
  try {
    // iOS 13+: motion sensors need explicit user-gesture permission
    if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
      const p = await DeviceMotionEvent.requestPermission();
      if (p !== 'granted') throw new Error('denied');
    }
    addEventListener('devicemotion', onMotion);
    tracking = true;
  } catch (e) {
    alert('Motion sensor unavailable — on a laptop there is no accelerometer; open this page on your phone.');
  }
  render();
}

/* ── heart rate over Web Bluetooth (standard service) ── */
async function connectHR() {
  if (hrDevice) {
    hrDevice.gatt.connected && hrDevice.gatt.disconnect();
    hrDevice = null; hrLive = null; render(); return;
  }
  if (!navigator.bluetooth) {
    alert('Web Bluetooth is not supported in this browser (Apple blocks it on iPhone). Use Chrome/Edge on desktop or Android, or log your pulse manually.');
    return;
  }
  try {
    const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
    const server = await dev.gatt.connect();
    const svc = await server.getPrimaryService('heart_rate');
    const ch = await svc.getCharacteristic('heart_rate_measurement');
    await ch.startNotifications();
    ch.addEventListener('characteristicvaluechanged', e => {
      const v = e.target.value;
      const hr = (v.getUint8(0) & 1) ? v.getUint16(1, true) : v.getUint8(1);
      hrLive = hr;
      store.update('fitness', f => { f.hr = { last: hr, at: Date.now() }; return f; });
      const el = root && root.querySelector('.fit-hr-val');
      if (el) el.textContent = hr;
    });
    dev.addEventListener('gattserverdisconnected', () => { hrDevice = null; hrLive = null; render(); });
    hrDevice = dev;
  } catch (e) { /* user cancelled the chooser */ }
  render();
}

function ring(steps, goal) {
  const pct = Math.min(1, steps / goal);
  const R = 52, C = 2 * Math.PI * R;
  return `<svg class="fit-ring" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="${R}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="9"/>
    <circle cx="60" cy="60" r="${R}" fill="none" stroke="${pct >= 1 ? 'var(--lime)' : 'var(--ac)'}" stroke-width="9"
      stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"
      transform="rotate(-90 60 60)"/>
    <text x="60" y="56" text-anchor="middle" class="fit-ring-n">${steps.toLocaleString()}</text>
    <text x="60" y="76" text-anchor="middle" class="fit-ring-l">/ ${goal.toLocaleString()} steps</text>
  </svg>`;
}

function render() {
  if (!root) return;
  const f = store.get('fitness');
  const steps = f.steps[todayKey()] || 0;
  const hr = hrLive ?? f.hr.last;
  const hrAge = f.hr.at ? Math.round((Date.now() - f.hr.at) / 60000) : null;
  root.innerHTML = `
    <div class="fit-top">
      ${ring(steps, f.goal)}
      <div class="fit-side">
        <div class="fit-hr">💓 <span class="fit-hr-val">${hr ?? '—'}</span> <span class="fit-hr-u">bpm</span></div>
        <div class="fit-hr-meta">${hrLive != null ? '<span class="up">● live</span>' : hr ? `last ${hrAge < 60 ? hrAge + 'm' : Math.round(hrAge / 60) + 'h'} ago` : 'no reading yet'}</div>
        <button class="pill-btn ${tracking ? 'solid' : ''} fit-track">${tracking ? '👣 counting… stop' : '👣 count my steps'}</button>
        <button class="pill-btn ${hrDevice ? 'solid' : ''} fit-ble">${hrDevice ? '💓 connected · disconnect' : '💓 connect HR monitor'}</button>
      </div>
    </div>
    <form class="fit-manual">
      <input type="number" name="steps" placeholder="add steps (e.g. from Apple Health)" min="1" max="100000">
      <input type="number" name="hr" placeholder="pulse" min="30" max="220" style="width:84px">
      <button class="pill-btn solid" type="submit">＋</button>
    </form>
    <div class="mkt-note">📱 steps count from this device's accelerometer while the page is open — Apple Fitness/Health has no public web API, so paste your Health number here to sync manually. Heart rate connects to any Bluetooth LE monitor (not supported by iPhone browsers).</div>`;

  root.querySelector('.fit-track').addEventListener('click', toggleTracking);
  root.querySelector('.fit-ble').addEventListener('click', connectHR);
  root.querySelector('.fit-manual').addEventListener('submit', e => {
    e.preventDefault();
    const s = parseInt(e.target.elements.steps.value, 10);
    const h = parseInt(e.target.elements.hr.value, 10);
    if (s > 0) addSteps(s);
    if (h > 0) store.update('fitness', f2 => { f2.hr = { last: h, at: Date.now() }; return f2; });
    render();
  });
}

export default {
  id: 'fitness', title: 'Fitness', icon: '🏃',
  refreshInterval: null,
  mount(el) { root = el; render(); },
  expand(el) { root = el; render(); },
  refresh() { render(); },
  destroy() { root = null; },
};
