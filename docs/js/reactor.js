/* ════════════════════════════════════════════════════
   ARC REACTOR — Three.js centerpiece
   trimmed port of the portfolio's AI core: metal
   housing + copper coils + segment rotor + palladium
   core + fresnel shell + gyro rings + heartbeat.
   Exposes reactorApi — the same seam the gesture
   engine grabs onto (manual / manualQuat / getQuat).
════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const lerp = (a, b, t) => a + (b - a) * t;

function studioEnv(renderer) {
  const s = new THREE.Scene();
  const box = (w, h, x, y, z, rx, ry, i, c = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c }));
    m.material.color.multiplyScalar(i); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m);
  };
  box(40, 30, 0, 0, -20, 0, 0, 0.6, 0x404a5a);
  box(30, 20, -18, 16, 8, -Math.PI / 3, Math.PI / 8, 3.0);
  box(22, 28, 24, 6, -2, 0, -Math.PI / 2.4, 1.3, 0xcdd8ff);
  box(26, 10, 0, -4, -18, Math.PI / 8, 0, 0.9, 0xffd0c0);
  box(3, 24, -12, 8, 12, 0, 0, 3.5); box(3, 24, 12, 8, 12, 0, 0, 3.5);
  const pm = new THREE.PMREMGenerator(renderer);
  return pm.fromScene(s, 0.03).texture;
}

function makeCore(env) {
  const g = new THREE.Group();
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 2, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.25, 'rgba(92,225,230,.55)');
    gr.addColorStop(.6, 'rgba(139,109,255,.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();

  /* fresnel energy shell */
  const shellMat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { uBoost: { value: 0 } },
    vertexShader: `varying vec3 vN,vV;void main(){vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vN,vV;uniform float uBoost;
      void main(){float f=pow(1.-abs(dot(vN,vV)),2.2);
      vec3 col=mix(vec3(.36,.88,.9),vec3(.55,.43,1.),f);
      gl_FragColor=vec4(col*(1.+uBoost*1.4),f*(.8+uBoost)+.07);}`
  });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1.05, 48, 48), shellMat));

  /* reactor: housing ring, copper coil wraps, rotor, core */
  const reactorG = new THREE.Group(); g.add(reactorG);
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: .9, roughness: .28, envMap: env, envMapIntensity: 1.3 });
  const metalDark = new THREE.MeshStandardMaterial({ color: 0x1c2028, metalness: .85, roughness: .4, envMap: env, envMapIntensity: .9 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: .9, roughness: .32, envMap: env, envMapIntensity: 1.1 });
  const slitMat = new THREE.MeshBasicMaterial({ color: 0x9ff2f6, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xcffdff, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

  reactorG.add(new THREE.Mesh(new THREE.TorusGeometry(.95, .13, 20, 72), metal));
  const Z = new THREE.Vector3(0, 0, 1), T = new THREE.Vector3();
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(.145, .038, 10, 18, Math.PI * 1.35), copper);
    wrap.position.set(Math.cos(a) * .95, Math.sin(a) * .95, 0);
    T.set(-Math.sin(a), Math.cos(a), 0);
    wrap.quaternion.setFromUnitVectors(Z, T);
    reactorG.add(wrap);
  }
  const rotor = new THREE.Group(); reactorG.add(rotor);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const seg = new THREE.Mesh(new RoundedBoxGeometry(.34, .2, .12, 2, .03), metalDark);
    seg.position.set(Math.cos(a) * .62, Math.sin(a) * .62, 0);
    seg.rotation.z = a + Math.PI / 2;
    rotor.add(seg);
    const b = (i + .5) / 10 * Math.PI * 2;
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(.09, .22), slitMat);
    slit.position.set(Math.cos(b) * .62, Math.sin(b) * .62, 0);
    slit.rotation.z = b + Math.PI / 2;
    rotor.add(slit);
  }
  reactorG.add(new THREE.Mesh(new THREE.TorusGeometry(.38, .055, 14, 48), metal));
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(.38, .02, 8, 48), slitMat);
  glowRing.position.z = .05; reactorG.add(glowRing);
  const coreDisc = new THREE.Mesh(new THREE.CircleGeometry(.3, 48), coreMat);
  coreDisc.position.z = .03; reactorG.add(coreDisc);
  const coreBack = new THREE.Mesh(new THREE.CircleGeometry(.3, 48), coreMat);
  coreBack.rotation.y = Math.PI; coreBack.position.z = -.03; reactorG.add(coreBack);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: .85, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(3.4); g.add(halo);

  /* gyroscopic rings + partial arc */
  const rMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(1.55, .012, 8, 128), rMat(0x5ce1e6, .6)); g.add(r1);
  const r2 = new THREE.Mesh(new THREE.TorusGeometry(1.8, .01, 8, 128), rMat(0x8b6dff, .5)); g.add(r2);
  const arcG = new THREE.Group(); g.add(arcG);
  arcG.add(new THREE.Mesh(new THREE.TorusGeometry(1.66, .022, 8, 64, Math.PI * .66), rMat(0xe0457b, .75)));
  arcG.rotation.x = 1.05;

  /* orbiting data particles */
  const PN = 100, pGeo = new THREE.BufferGeometry(), pArr = new Float32Array(PN * 3), pMeta = [];
  for (let i = 0; i < PN; i++) {
    pMeta.push({ r: 1.5 + Math.random() * 1.1, a: Math.random() * Math.PI * 2, s: (.2 + Math.random() * .5) * (Math.random() < .5 ? 1 : -1), y: (Math.random() - .5) * .5, ph: Math.random() * 7 });
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
  g.add(new THREE.Points(pGeo, new THREE.PointsMaterial({ map: glowTex, color: 0x8be9ff, size: .075, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false })));

  /* expanding scan pulse */
  const pulseMesh = new THREE.Mesh(new THREE.TorusGeometry(1.3, .014, 8, 96), rMat(0x5ce1e6, 0));
  g.add(pulseMesh);

  return { group: g, shellMat, reactorG, rotor, coreMat, slitMat, halo, r1, r2, arcG, pGeo, pArr, pMeta, PN, pulseMesh };
}

export function initReactor(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const env = studioEnv(renderer);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.3, 7.2);
  const lookTarget = new THREE.Vector3(0, 0.2, 0);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    camera.lookAt(lookTarget);
  }
  resize(); addEventListener('resize', resize);

  const AI = makeCore(env);
  const core = AI.group;
  core.position.y = 0.2;
  core.scale.setScalar(0.001);              // ignition ramp-up
  scene.add(core);

  /* pose control: cursor-follow by default; gestures take over via
     manual()/manualQuat() and the pose HOLDS 4s after release */
  let manualRot = null, manualAt = 0, zoomCur = 1;
  const quatTarget = new THREE.Quaternion(); let quatAt = -1e9;
  let px = 0, py = 0, tx = 0, ty = 0, pointerHeld = false;
  let pulseT = 9;

  addEventListener('mousemove', e => {
    if (pointerHeld) return;
    tx = (e.clientX / innerWidth - 0.5); ty = (e.clientY / innerHeight - 0.5);
  }, { passive: true });

  let vis = true, tabVis = !document.hidden;
  new IntersectionObserver(es => { vis = es[0].isIntersecting; }, { threshold: 0.1 }).observe(canvas);
  document.addEventListener('visibilitychange', () => {
    tabVis = !document.hidden;
    if (tabVis) clock.getDelta();           // swallow the away-time delta
  });

  const clock = new THREE.Clock();
  let t = 0, born = 0;
  const easeOutBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (vis && tabVis) {
      t += dt;
      if (born < 1) born = Math.min(1, born + dt / 1.1);
      px = lerp(px, tx, 1 - Math.pow(0.001, dt)); py = lerp(py, ty, 1 - Math.pow(0.001, dt));

      const nowMs = performance.now();
      const qAge = nowMs - quatAt, mAge = manualRot ? nowMs - manualAt : 1e9;
      if (qAge < 4000 && qAge < mAge) {
        /* Stark grab: mirror the wrist quaternion (snappy while held,
           gentle during the 4s pose-hold after release) */
        core.quaternion.slerp(quatTarget, 1 - Math.pow(qAge < 300 ? 0.0005 : 0.05, dt));
      } else {
        const useManual = mAge < 4000;
        const kR = 1 - Math.pow(mAge < 250 ? 0.0005 : useManual ? 0.05 : 0.001, dt);
        core.rotation.x = lerp(core.rotation.x, useManual ? manualRot.rx : py * 0.35, kR);
        core.rotation.y = lerp(core.rotation.y, useManual ? manualRot.ry : px * 0.55, kR);
        core.rotation.z = lerp(core.rotation.z, useManual ? manualRot.rz : 0, kR);
        zoomCur = lerp(zoomCur, useManual ? manualRot.sc : 1, kR);
      }
      core.scale.setScalar(Math.max(0.001, easeOutBack(Math.min(1, born)) * 0.85 * zoomCur));
      core.position.y = 0.2 + Math.sin(t * 1.1) * 0.05;

      AI.r1.rotation.x = t * 0.7; AI.r1.rotation.y = t * 0.33;
      AI.r2.rotation.y = -t * 0.48; AI.r2.rotation.x = Math.sin(t * 0.4) * 0.8;
      AI.arcG.rotation.y = t * 1.15;

      /* arc-reactor heartbeat: lub-dub every 4s */
      const hb = t % 4;
      const boost = Math.exp(-Math.pow(hb - 0.12, 2) / 0.004) + 0.55 * Math.exp(-Math.pow(hb - 0.42, 2) / 0.005);
      AI.shellMat.uniforms.uBoost.value = boost * 0.9;
      AI.rotor.rotation.z = t * 0.45;
      AI.reactorG.rotation.x = Math.sin(t * 0.31) * 0.14;
      AI.reactorG.rotation.y = Math.sin(t * 0.23) * 0.1;
      AI.coreMat.opacity = 0.72 + boost * 0.28;
      AI.slitMat.opacity = 0.5 + boost * 0.5 + Math.sin(t * 2.1) * 0.08;
      AI.halo.material.opacity = 0.65 + boost * 0.35 + Math.sin(t * 1.7) * 0.08;
      AI.halo.scale.setScalar(3.4 + boost * 0.7);

      for (let i = 0; i < AI.PN; i++) {
        const m = AI.pMeta[i]; m.a += m.s * dt;
        AI.pArr[i * 3] = Math.cos(m.a) * m.r;
        AI.pArr[i * 3 + 1] = m.y + Math.sin(t * 1.4 + m.ph) * 0.1;
        AI.pArr[i * 3 + 2] = Math.sin(m.a) * m.r;
      }
      AI.pGeo.attributes.position.needsUpdate = true;

      /* scan pulse: fired by api.pulse(), else every ~7s */
      pulseT += dt;
      const pk = pulseT < 1.4 ? pulseT / 1.4 : null;
      if (pk !== null) {
        AI.pulseMesh.scale.setScalar(0.6 + pk * 1.9);
        AI.pulseMesh.material.opacity = (1 - pk) * 0.55;
        AI.pulseMesh.rotation.x = core.rotation.x; AI.pulseMesh.rotation.y = core.rotation.y;
      } else {
        AI.pulseMesh.material.opacity = 0;
        if (pulseT > 7) pulseT = 0;
      }

      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    el: canvas,
    manual(rx, ry, rz, sc) { manualRot = { rx, ry, rz, sc }; manualAt = performance.now(); },
    manualQuat(q) { quatTarget.copy(q); quatAt = performance.now(); },
    getQuat() { return core.quaternion; },
    pulse() { pulseT = 0; },
    setPointer(nx, ny) { pointerHeld = true; tx = nx * 0.5; ty = ny * 0.5; },
    releasePointer() { pointerHeld = false; },
  };
}
