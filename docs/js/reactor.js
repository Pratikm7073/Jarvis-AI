/* ════════════════════════════════════════════════════
   ULTRON CORE — Three.js centerpiece
   a stylized chrome Ultron head: skull plates, brow,
   angular jaw, glowing red eyes + mouth slit, inside
   a crimson fresnel shell with gyro rings, embers and
   a scan pulse. The heartbeat drives the eye glow.
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
    gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.25, 'rgba(255,70,90,.6)');
    gr.addColorStop(.6, 'rgba(180,30,50,.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();

  /* crimson fresnel energy shell */
  const shellMat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { uBoost: { value: 0 } },
    vertexShader: `varying vec3 vN,vV;void main(){vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vN,vV;uniform float uBoost;
      void main(){float f=pow(1.-abs(dot(vN,vV)),2.2);
      vec3 col=mix(vec3(.85,.24,.28),vec3(1.,.5,.32),f);
      gl_FragColor=vec4(col*(1.+uBoost*1.4),f*(.7+uBoost)+.06);}`
  });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1.12, 48, 48), shellMat));

  /* ── THE HEAD: chrome skull, gunmetal jaw, red glow ── */
  const headG = new THREE.Group(); g.add(headG);
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc4cad6, metalness: .85, roughness: .25, envMap: env, envMapIntensity: 1.7 });
  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x2c313b, metalness: .8, roughness: .4, envMap: env, envMapIntensity: 1.1 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2b3d, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0xff4d61, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

  /* cranium + plate seams (share the same squash) — pulled BACK so the
     face features at z≈.6 sit proud of the shell, not inside it */
  const skull = new THREE.Group(); skull.scale.set(1, 1.18, 0.86); skull.position.set(0, .28, -.08); headG.add(skull);
  skull.add(new THREE.Mesh(new THREE.SphereGeometry(.72, 48, 32), chrome));
  const seamSag = new THREE.Mesh(new THREE.TorusGeometry(.725, .014, 8, 64), gunmetal);
  seamSag.rotation.y = Math.PI / 2; skull.add(seamSag);
  const seamBand = new THREE.Mesh(new THREE.TorusGeometry(.725, .014, 8, 64), gunmetal);
  seamBand.rotation.x = Math.PI / 2; skull.add(seamBand);

  /* faceplate bridging brow → jaw, then the brow ridge on top */
  const face = new THREE.Mesh(new RoundedBoxGeometry(.58, .52, .14, 2, .06), chrome);
  face.position.set(0, .14, .5); face.rotation.x = .06; headG.add(face);
  const brow = new THREE.Mesh(new RoundedBoxGeometry(1.05, .15, .25, 2, .05), gunmetal);
  brow.position.set(0, .46, .5); brow.rotation.x = -.12; headG.add(brow);

  /* eyes: horizontal glowing capsules + halo sprites */
  const eyeSprites = [];
  [-1, 1].forEach(s => {
    const eye = new THREE.Mesh(new THREE.CapsuleGeometry(.06, .2, 4, 12), eyeMat);
    eye.rotation.z = Math.PI / 2;
    eye.position.set(s * .27, .3, .64); headG.add(eye);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: .85, depthWrite: false, blending: THREE.AdditiveBlending }));
    spr.scale.setScalar(.52); spr.position.set(s * .27, .3, .7);
    headG.add(spr); eyeSprites.push(spr);
  });

  /* cheek plates */
  [-1, 1].forEach(s => {
    const cheek = new THREE.Mesh(new RoundedBoxGeometry(.15, .42, .22, 2, .04), chrome);
    cheek.position.set(s * .5, .02, .38);
    cheek.rotation.y = -s * .4; cheek.rotation.z = s * .1;
    headG.add(cheek);
  });

  /* jaw + chin + mouth slit */
  const jaw = new THREE.Mesh(new RoundedBoxGeometry(.6, .4, .46, 2, .08), gunmetal);
  jaw.position.set(0, -.28, .22); headG.add(jaw);
  const chin = new THREE.Mesh(new RoundedBoxGeometry(.24, .2, .2, 2, .05), chrome);
  chin.position.set(0, -.42, .42); headG.add(chin);
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(.28, .03), mouthMat);
  mouth.position.set(0, -.2, .47); headG.add(mouth);

  /* neck segments */
  const neck1 = new THREE.Mesh(new THREE.CylinderGeometry(.18, .21, .12, 24), gunmetal);
  neck1.position.y = -.56; headG.add(neck1);
  const neck2 = new THREE.Mesh(new THREE.CylinderGeometry(.22, .26, .12, 24), chrome);
  neck2.position.y = -.68; headG.add(neck2);

  /* side vents */
  [-1, 1].forEach(s => {
    for (let i = 0; i < 2; i++) {
      const vent = new THREE.Mesh(new RoundedBoxGeometry(.05, .16, .26, 1, .02), gunmetal);
      vent.position.set(s * (.64 + i * .05), .2 - i * .06, .05);
      vent.rotation.z = s * .22;
      headG.add(vent);
    }
  });
  headG.scale.setScalar(.85);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(3.2); g.add(halo);

  /* gyroscopic rings + partial arc — crimson + silver */
  const rMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(1.55, .012, 8, 128), rMat(0xff4d61, .5)); g.add(r1);
  const r2 = new THREE.Mesh(new THREE.TorusGeometry(1.8, .01, 8, 128), rMat(0xc0c6d4, .35)); g.add(r2);
  const arcG = new THREE.Group(); g.add(arcG);
  arcG.add(new THREE.Mesh(new THREE.TorusGeometry(1.66, .022, 8, 64, Math.PI * .66), rMat(0xff2b3d, .75)));
  arcG.rotation.x = 1.05;

  /* orbiting ember particles */
  const PN = 100, pGeo = new THREE.BufferGeometry(), pArr = new Float32Array(PN * 3), pMeta = [];
  for (let i = 0; i < PN; i++) {
    pMeta.push({ r: 1.5 + Math.random() * 1.1, a: Math.random() * Math.PI * 2, s: (.2 + Math.random() * .5) * (Math.random() < .5 ? 1 : -1), y: (Math.random() - .5) * .5, ph: Math.random() * 7 });
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
  g.add(new THREE.Points(pGeo, new THREE.PointsMaterial({ map: glowTex, color: 0xff9b7d, size: .075, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false })));

  /* expanding scan pulse */
  const pulseMesh = new THREE.Mesh(new THREE.TorusGeometry(1.3, .014, 8, 96), rMat(0xff4d61, 0));
  g.add(pulseMesh);

  return { group: g, shellMat, headG, eyeMat, mouthMat, eyeSprites, halo, r1, r2, arcG, pGeo, pArr, pMeta, PN, pulseMesh };
}

export function initReactor(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const env = studioEnv(renderer);
  const scene = new THREE.Scene();
  /* direct lights so the chrome reads even over a bright background */
  scene.add(new THREE.HemisphereLight(0x9fb4d8, 0x11080a, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2.5, 3, 4); scene.add(key);
  const rim = new THREE.PointLight(0xff2b3d, 14, 12); rim.position.set(-2.2, -1, 2.5); scene.add(rim);
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

      /* menace heartbeat: lub-dub every 4s drives the red glow */
      const hb = t % 4;
      const boost = Math.exp(-Math.pow(hb - 0.12, 2) / 0.004) + 0.55 * Math.exp(-Math.pow(hb - 0.42, 2) / 0.005);
      AI.shellMat.uniforms.uBoost.value = boost * 0.9;
      /* slow predatory look-around (idle only — additive wobble) */
      AI.headG.rotation.x = 0.05 + Math.sin(t * 0.31) * 0.09;
      AI.headG.rotation.y = Math.sin(t * 0.23) * 0.12;
      AI.eyeMat.opacity = 0.78 + boost * 0.22;
      AI.mouthMat.opacity = 0.45 + boost * 0.5 + Math.sin(t * 2.1) * 0.08;
      AI.eyeSprites.forEach(s => s.scale.setScalar(0.52 + boost * 0.2));
      AI.halo.material.opacity = 0.55 + boost * 0.4 + Math.sin(t * 1.7) * 0.07;
      AI.halo.scale.setScalar(3.2 + boost * 0.7);

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
