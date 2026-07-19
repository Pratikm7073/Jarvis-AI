/* ════════════════════════════════════════════════════
   EARTH — holographic globe with a live avatar
   Snap-Map energy, Stark execution:
   · real NASA textures on a Three.js globe, floating
     transparently in the dashboard's own starfield
   · cyan holo-graticule + fresnel atmosphere
   · 📍 FLY TO ME: precise browser geolocation (falls
     back to the saved city) → cinematic fly-in
   · at close zoom a dark holo-styled street map (free
     OpenStreetMap tiles, recolored) fades in under a
     glowing hologram avatar with a name tag
   · drag = rotate · wheel/pinch = zoom · dbl-click =
     fly home. Zero API keys, no new libraries.
   three.js loads lazily so a CDN outage can never
   break the rest of the dashboard.
════════════════════════════════════════════════════ */
import { store } from '../store.js';
import { esc } from '../ui.js';

const TEX = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets';
let engine = null, engineFailed = false;

const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

async function buildEngine() {
  const THREE = await import('three');
  const wrap = document.createElement('div');
  wrap.className = 'earth-wrap';
  wrap.innerHTML = `
    <canvas class="earth-canvas" aria-label="Interactive 3D Earth"></canvas>
    <div class="earth-status" role="status">🌍 EARTH VIEW · drag to rotate</div>
    <div class="earth-ui">
      <button class="pill-btn solid earth-fly">📍 Fly to me</button>
      <button class="pill-btn earth-reset">🌍 Full view</button>
    </div>`;
  const canvas = wrap.querySelector('.earth-canvas');
  const statusEl = wrap.querySelector('.earth-status');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 50);
  let dist = 3.4;
  camera.position.set(0, 0, dist);

  /* even, holographic lighting — the sun never leaves half the
     planet unreadable */
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x0a0c14, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(4, 2, 4); scene.add(key);

  const earthG = new THREE.Group(); scene.add(earthG);

  /* globe — NASA textures; if the CDN is unreachable we fall back
     to a pure wireframe hologram (still beautiful, never broken) */
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const tex = u => new Promise((res, rej) => loader.load(u, res, undefined, rej));
  let globeMat;
  try {
    const [map, normalMap, specularMap] = await Promise.all([
      tex(`${TEX}/earth_atmos_2048.jpg`), tex(`${TEX}/earth_normal_2048.jpg`), tex(`${TEX}/earth_specular_2048.jpg`),
    ]);
    map.colorSpace = THREE.SRGBColorSpace;
    globeMat = new THREE.MeshPhongMaterial({
      map, normalMap, specularMap,
      normalScale: new THREE.Vector2(.85, .85),
      specular: new THREE.Color(0x7fb3d5), shininess: 16,
    });
  } catch (e) {
    globeMat = new THREE.MeshBasicMaterial({ color: 0x0d2233, wireframe: true, transparent: true, opacity: .9 });
    statusEl.textContent = '🌍 HOLO MODE (textures offline)';
  }
  earthG.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), globeMat));

  /* holo-graticule: clean lat/lon rings (not a noisy wireframe) */
  const gratPts = [];
  const push = v => gratPts.push(v.x, v.y, v.z);
  for (let lat = -75; lat <= 75; lat += 15) {
    const r = Math.cos(lat * Math.PI / 180) * 1.004, y = Math.sin(lat * Math.PI / 180) * 1.004;
    for (let a = 0; a < 360; a += 4) {
      const a1 = a * Math.PI / 180, a2 = (a + 4) * Math.PI / 180;
      push({ x: Math.cos(a1) * r, y, z: Math.sin(a1) * r }); push({ x: Math.cos(a2) * r, y, z: Math.sin(a2) * r });
    }
  }
  for (let lon = 0; lon < 360; lon += 15) {
    const t = lon * Math.PI / 180;
    for (let a = -88; a < 88; a += 4) {
      const p1 = (90 - a) * Math.PI / 180, p2 = (90 - a - 4) * Math.PI / 180;
      push({ x: Math.sin(p1) * Math.cos(t) * 1.004, y: Math.cos(p1) * 1.004, z: Math.sin(p1) * Math.sin(t) * 1.004 });
      push({ x: Math.sin(p2) * Math.cos(t) * 1.004, y: Math.cos(p2) * 1.004, z: Math.sin(p2) * Math.sin(t) * 1.004 });
    }
  }
  const gratGeo = new THREE.BufferGeometry();
  gratGeo.setAttribute('position', new THREE.Float32BufferAttribute(gratPts, 3));
  earthG.add(new THREE.LineSegments(gratGeo,
    new THREE.LineBasicMaterial({ color: 0x5ce1e6, transparent: true, opacity: .10, blending: THREE.AdditiveBlending })));

  /* atmosphere: cyan fresnel shell */
  earthG.add(new THREE.Mesh(new THREE.SphereGeometry(1.07, 48, 48), new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
    vertexShader: `varying vec3 vN,vV;void main(){vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vN,vV;void main(){float f=pow(1.-abs(dot(vN,vV)),2.4);gl_FragColor=vec4(vec3(.36,.88,.9)*f,f*.55);}`,
  })));

  const latLonToVec3 = (lat, lon, r) => {
    const phi = (90 - lat) * Math.PI / 180, theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
  };

  /* ── location beacon + hologram avatar + holo street map ── */
  const siteG = new THREE.Group(); earthG.add(siteG);
  const addMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.012, .002, 8, 40), addMat(0x5ce1e6, .9));
  siteG.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.0025, .006, .09, 12, 1, true), addMat(0x5ce1e6, .3));
  beam.rotation.x = Math.PI / 2; beam.position.z = .045; siteG.add(beam);

  /* hologram avatar (procedural, ~"standing on the map" scale) */
  const avatar = new THREE.Group();
  const holo = addMat(0x8ff4f8, .85);
  const holoDim = addMat(0x5ce1e6, .55);
  const leg1 = new THREE.Mesh(new THREE.CylinderGeometry(.0035, .0032, .020, 8), holoDim); leg1.position.set(-.005, .010, 0);
  const leg2 = leg1.clone(); leg2.position.x = .005;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.0085, .016, 4, 10), holo); torso.position.y = .033;
  const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(.0028, .0026, .018, 8), holoDim);
  arm1.position.set(-.0125, .036, 0); arm1.rotation.z = .35;
  const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(.0028, .0026, .018, 8), holoDim);
  arm2.position.set(.0125, .042, 0); arm2.rotation.z = -2.4;      // waving 👋
  const head = new THREE.Mesh(new THREE.SphereGeometry(.0068, 16, 16), holo); head.position.y = .055;
  avatar.add(leg1, leg2, torso, arm1, arm2, head);
  /* name tag sprite */
  const tagCanvas = document.createElement('canvas'); tagCanvas.width = 512; tagCanvas.height = 96;
  const tagTex = new THREE.CanvasTexture(tagCanvas);
  function drawTag() {
    const name = (store.get('settings').name || 'ME').toUpperCase();
    const x = tagCanvas.getContext('2d');
    x.clearRect(0, 0, 512, 96);
    x.fillStyle = 'rgba(5,8,14,.82)'; x.strokeStyle = 'rgba(92,225,230,.8)'; x.lineWidth = 3;
    x.beginPath(); x.roundRect(60, 12, 392, 72, 36); x.fill(); x.stroke();
    x.fillStyle = '#8ff4f8'; x.font = '600 34px "Geist Mono", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(`${name} · LIVE`, 256, 50);
    tagTex.needsUpdate = true;
  }
  drawTag();
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthWrite: false, opacity: 0 }));
  tag.scale.set(.048, .009, 1);
  tag.position.set(0, .0335, .045);   // floats above the avatar's head (site space)
  siteG.add(tag);
  avatar.rotation.x = Math.PI / 2;      // stand along the site's outward +z
  avatar.scale.setScalar(0);            // revealed on arrival
  siteG.add(avatar);

  /* holo street map: 3×3 OSM tiles, recolored dark-cyan, round mask */
  const mapCanvas = document.createElement('canvas'); mapCanvas.width = mapCanvas.height = 768;
  const mapTex = new THREE.CanvasTexture(mapCanvas);
  mapTex.colorSpace = THREE.SRGBColorSpace;
  const mapMat = new THREE.MeshBasicMaterial({ map: mapTex, transparent: true, opacity: 0, depthWrite: false });
  const mapPlane = new THREE.Mesh(new THREE.PlaneGeometry(.11, .11), mapMat);
  mapPlane.position.z = .0015; siteG.add(mapPlane);
  let tilesLoaded = false, done = 0;
  function loadTiles(lat, lon) {
    if (tilesLoaded) return; tilesLoaded = true;
    const z = 15, n = 2 ** z;
    const xt = Math.floor((lon + 180) / 360 * n);
    const latR = lat * Math.PI / 180;
    const yt = Math.floor((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n);
    const x2 = mapCanvas.getContext('2d');
    let settled = 0;
    const finish = () => {
      /* circular holo-projection mask — applied once every tile has
         either loaded or failed (missing tiles just stay dark) */
      if (++settled !== 9) return;
      const g = x2.createRadialGradient(384, 384, 240, 384, 384, 384);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x2.globalCompositeOperation = 'destination-in';
      x2.fillStyle = g; x2.fillRect(0, 0, 768, 768);
      x2.globalCompositeOperation = 'source-over';
      mapTex.needsUpdate = true;
    };
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        /* recolor to the dashboard's dark holo palette */
        x2.filter = 'invert(1) hue-rotate(185deg) saturate(1.4) brightness(.8)';
        x2.drawImage(img, (dx + 1) * 256, (dy + 1) * 256, 256, 256);
        x2.filter = 'none';
        done++;
        mapTex.needsUpdate = true;   // progressive reveal, tile by tile
        finish();
      };
      img.onerror = finish;
      img.src = `https://tile.openstreetmap.org/${z}/${xt + dx}/${yt + dy}.png`;
    }
  }

  function placeSite(lat, lon) {
    const p = latLonToVec3(lat, lon, 1.001);
    siteG.position.copy(p);
    siteG.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.clone().normalize());
  }

  /* ── interaction: drag rotate (inertia) · wheel/pinch zoom ── */
  let dragging = false, px = 0, py = 0, vx = 0, vy = 0, lastInput = 0;
  const pointers = new Map(); let pinchD = 0;
  canvas.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, e); canvas.setPointerCapture(e.pointerId);
    dragging = true; px = e.clientX; py = e.clientY; vx = vy = 0; lastInput = performance.now();
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, e); lastInput = performance.now();
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (pinchD) dist = Math.min(4.5, Math.max(1.16, dist * pinchD / d));
      pinchD = d; return;
    }
    if (!dragging) return;
    vx = (e.clientX - px) * .005; vy = (e.clientY - py) * .005;
    px = e.clientX; py = e.clientY;
    earthG.rotation.y += vx;
    earthG.rotation.x = Math.min(1.2, Math.max(-1.2, earthG.rotation.x + vy));
  }, { passive: true });
  const endPtr = e => { pointers.delete(e.pointerId); if (!pointers.size) { dragging = false; pinchD = 0; } };
  canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('wheel', e => {
    e.preventDefault(); lastInput = performance.now();
    dist = Math.min(4.5, Math.max(1.16, dist * (1 + e.deltaY * .0011)));
  }, { passive: false });
  canvas.addEventListener('dblclick', () => flyTo());

  /* ── cinematic fly-to ── */
  let flight = null, here = { ...store.get('settings').location, precise: false };
  function flyTo(target = here) {
    placeSite(target.lat, target.lon);
    loadTiles(target.lat, target.lon);
    /* exact landing rotations (order XYZ ⇒ Ry then Rx is applied to
       the globe): ry spins the target's meridian to face the camera,
       rx = latitude lifts it to dead centre. Derived, not decomposed —
       quaternion→Euler loses the roll and lands hundreds of km off. */
    const theta = (target.lon + 180) * Math.PI / 180;
    const ry1 = Math.atan2(Math.cos(theta), Math.sin(theta));
    const rx1 = target.lat * Math.PI / 180;
    /* wall-clock driven: lands in dur seconds on ANY frame rate
       (frame-delta accumulation crawls on slow GPUs) */
    flight = {
      start: performance.now(), dur: 2.6,
      rx0: earthG.rotation.x, ry0: earthG.rotation.y, d0: dist,
      rx1, ry1, d1: 1.24,
    };
    /* unwrap ry so the globe takes the short way around */
    while (flight.ry1 - flight.ry0 > Math.PI) flight.ry1 -= 2 * Math.PI;
    while (flight.ry1 - flight.ry0 < -Math.PI) flight.ry1 += 2 * Math.PI;
    statusEl.textContent = `📍 ${(target.name || 'MY LOCATION').toUpperCase()} · ${target.lat.toFixed(2)}° ${target.lon.toFixed(2)}°${target.precise ? ' · GPS' : ''}`;
  }
  wrap.querySelector('.earth-fly').addEventListener('click', () => {
    statusEl.textContent = '🛰 Locating…';
    if (!navigator.geolocation) return flyTo();
    navigator.geolocation.getCurrentPosition(
      pos => { here = { name: 'my location', lat: pos.coords.latitude, lon: pos.coords.longitude, precise: true }; drawTag(); flyTo(here); },
      () => { here = { ...store.get('settings').location, precise: false }; flyTo(here); },
      { timeout: 8000, maximumAge: 60000 });
  });
  wrap.querySelector('.earth-reset').addEventListener('click', () => {
    flight = { start: performance.now(), dur: 1.6, rx0: earthG.rotation.x, ry0: earthG.rotation.y, d0: dist, rx1: .35, ry1: earthG.rotation.y, d1: 3.4 };
    statusEl.textContent = '🌍 EARTH VIEW · drag to rotate';
  });

  placeSite(here.lat, here.lon);

  /* ── render loop: paused when off-screen or tab hidden ── */
  let vis = true;
  new IntersectionObserver(es => { vis = es[0].isIntersecting; }, { threshold: .05 }).observe(canvas);
  new ResizeObserver(() => {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }).observe(wrap);

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    if (!vis || document.hidden) return;
    const dt = Math.min(clock.getDelta(), .05);
    const t = performance.now() / 1000;
    if (flight) {
      const p = Math.min(1, (performance.now() - flight.start) / (flight.dur * 1000));
      const k = easeInOut(p);
      earthG.rotation.x = flight.rx0 + (flight.rx1 - flight.rx0) * k;
      earthG.rotation.y = flight.ry0 + (flight.ry1 - flight.ry0) * k;
      dist = flight.d0 + (flight.d1 - flight.d0) * k;
      if (p >= 1) flight = null;
    } else if (!dragging) {
      earthG.rotation.y += vx; earthG.rotation.x = Math.min(1.2, Math.max(-1.2, earthG.rotation.x + vy));
      vx *= .95; vy *= .95;                                    // drag inertia
      if (performance.now() - lastInput > 3000 && dist > 2.4)
        earthG.rotation.y += dt * .05;                          // idle spin
    }
    camera.position.z = dist;
    /* close-zoom choreography: beacon breathes, avatar + street
       map materialize as you descend */
    const close = Math.min(1, Math.max(0, (1.75 - dist) / .45));
    ring.scale.setScalar(1 + Math.sin(t * 3) * .18);
    ring.material.opacity = (.55 + Math.sin(t * 3) * .3) * (1 - close * .55);
    beam.material.opacity = .32 * (1 - close * .85);
    avatar.scale.setScalar(close * .7);
    avatar.position.z = .001 + Math.sin(t * 1.8) * .0015 * close;   // gentle hover-bob
    tag.material.opacity = close;
    mapMat.opacity = close * .92;
    renderer.render(scene, camera);
  }
  frame();

  /* introspection hook (harmless in prod, used by the test suite) */
  canvas.__dbg = () => ({ rx: earthG.rotation.x, ry: earthG.rotation.y, dist, inFlight: !!flight, tiles: done, mapOp: +mapMat.opacity.toFixed(2) });

  return { dom: wrap, refreshTag: drawTag };
}

async function mountInto(el) {
  if (!el) return;
  if (engineFailed) { el.innerHTML = '<div class="empty-note">Earth view needs the 3D engine (CDN unreachable).</div>'; return; }
  if (!engine) {
    el.innerHTML = '<div class="empty-note" style="padding-top:60px">🌍 Spinning up the planet…</div>';
    try { engine = await buildEngine(); }
    catch (e) {
      console.warn('earth: engine failed', e);
      engineFailed = true;
      el.innerHTML = '<div class="empty-note">Earth view needs the 3D engine (CDN unreachable).</div>';
      return;
    }
  }
  el.innerHTML = '';
  el.appendChild(engine.dom);   // the WebGL context survives re-parenting
}

export default {
  id: 'earth', title: 'Earth', icon: '🌍',
  refreshInterval: null,
  mount(el) { mountInto(el); },
  expand(el) { mountInto(el); },
  refresh() { engine?.refreshTag(); },
  destroy() { },
};
