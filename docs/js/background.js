/* ════════════════════════════════════════════════════
   DEEP-SPACE BACKGROUND — nebula shader + parallax
   starfield behind the whole page, with a SUPERNOVA:
   a burning white-orange core, cross flare, and
   repeating expanding shock rings.
   ported from pratikm7073.github.io and extended.
   API: { setPointer, releasePointer, pulse(cx,cy) }
════════════════════════════════════════════════════ */
import * as THREE from 'three';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function initBackground() {
  const canvas = document.getElementById('bg3d');
  if (!canvas || matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);   // nebula is soft — render small, stretch up
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 120);
  camera.position.z = 16;

  /* fullscreen domain-warped fbm nebula + supernova (behind stars) */
  const uni = {
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uPar: { value: new THREE.Vector2(0, 0) },
    uHue: { value: 0 },
    uPulse: { value: new THREE.Vector4(.5, .5, 0, 0) },   // x,y (uv), strength, age
  };
  const nebula = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: uni, depthWrite: false, depthTest: false,
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.999,1.0);}`,
      fragmentShader: `
        precision highp float;varying vec2 vUv;
        uniform float uTime,uAspect,uHue;uniform vec2 uPar;uniform vec4 uPulse;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
        float fbm(vec2 p){float v=0.,a=.5;mat2 r=mat2(.8,.6,-.6,.8);
          for(int i=0;i<4;i++){v+=a*noise(p);p=r*p*2.02;a*=.5;}return v;}
        vec3 pal(float t){ // cyan → violet → pink, matching site accents
          vec3 cy=vec3(.36,.88,.90),vi=vec3(.545,.427,1.0),pk=vec3(.878,.27,.48);
          t=fract(t);
          return t<.5? mix(cy,vi,smoothstep(0.,.5,t)) : mix(vi,pk,smoothstep(.5,1.,t));}
        void main(){
          vec2 p=(vUv-.5)*vec2(uAspect,1.);
          p+=uPar*.09;
          float t=uTime*.022;
          /* ── SUPERNOVA anchor (upper right, drifts with parallax) ── */
          vec2 snp=vec2(uAspect*.26,.20);
          vec2 dv=p-snp;
          float snd=length(dv);
          vec2 q=vec2(fbm(p*1.5+t),fbm(p*1.5-t*.7+5.2));
          float f=fbm(p*1.9+q*1.8+t*.3);
          f+=exp(-snd*3.1)*.3;                         // clouds ignite near the blast
          /* expanding shockwave ripple (pinch gesture) */
          vec2 pc=(uPulse.xy-.5)*vec2(uAspect,1.);
          float d=distance(p,pc);
          float ring=exp(-34.*abs(d-uPulse.w*.85))*uPulse.z;
          f+=ring*.7;
          float lum=smoothstep(.28,.92,f);
          vec3 col=vec3(.012,.012,.022);
          col=mix(col,pal(f*.6+uHue)*.55,lum);
          col+=pal(f*.6+uHue+.08)*pow(lum,3.)*.55;     // hot cores
          col+=pal(uHue+.45)*ring*.9;                  // ripple glow
          /* ── SUPERNOVA: core + flare + repeating shock rings ── */
          vec3 snCol=vec3(1.,.62,.28),snHot=vec3(1.,.87,.62);
          float core=exp(-snd*9.5)*(.88+.12*sin(uTime*3.7)+.05*sin(uTime*11.3));
          float ang=atan(dv.y,dv.x);
          float rays=pow(abs(cos(ang*2.)),14.)*exp(-snd*3.3)*.4;    // 4-point flare
          float cyc=fract(uTime*.05);
          float rr=cyc*1.15+.04;
          float snRing=exp(-42.*abs(snd-rr))*(1.-cyc)*.8;           // blast wave
          col+=snHot*core*1.15;
          col+=snCol*(rays+snRing);
          col+=pal(uHue+.5)*snRing*.22;
          col*=1.-dot(p,p)*.42;                        // vignette
          gl_FragColor=vec4(col,1.);
        }`
    })
  );
  nebula.frustumCulled = false; nebula.renderOrder = -1;
  scene.add(nebula);

  /* soft round star sprite */
  const sTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  /* three depth layers of drifting stars (real 3D parallax) */
  const group = new THREE.Group(); scene.add(group);
  const layers = [];
  [[520, 26, .10, 0xffffff, .9], [340, 20, .17, 0xbfe9ff, .8], [160, 14, .30, 0xffd9cc, .9]].forEach(([n, spread, size, color, op]) => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - .5) * spread * 2.4;
      pos[i * 3 + 1] = (Math.random() - .5) * spread * 1.5;
      pos[i * 3 + 2] = (Math.random() - .5) * spread - 4;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: sTex, color, size, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    group.add(pts); layers.push({ geo, mat, vel, n, baseOp: op });
  });

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(Math.round(w * .55), Math.round(h * .55), false);   // ~30% of the pixels
    camera.aspect = w / h; camera.updateProjectionMatrix();
    uni.uAspect.value = w / h;
  }
  resize(); addEventListener('resize', resize);

  /* pointer parallax — mouse by default, gesture can override */
  let gestureDrives = false;
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('mousemove', e => {
    if (gestureDrives) return;
    par.tx = (e.clientX / innerWidth - .5) * 2; par.ty = (e.clientY / innerHeight - .5) * 2;
  }, { passive: true });
  addEventListener('deviceorientation', e => {
    if (e.gamma == null || gestureDrives) return;
    par.tx = clamp(e.gamma / 28, -1, 1); par.ty = clamp((e.beta - 48) / 28, -1, 1);
  }, { passive: true });

  let pulseAge = 9, pulseStr = 0, frameFlip = false, impulseUntil = 0;
  const clock = new THREE.Clock();
  const tmpV = new THREE.Vector3();
  function frame() {
    requestAnimationFrame(frame);
    frameFlip = !frameFlip;
    if (frameFlip || document.hidden) return;   // bg runs at 30fps, pauses when hidden
    const dt = Math.min(clock.getDelta(), .1);
    const t = uni.uTime.value += dt;
    const k = 1 - Math.pow(.002, dt);
    par.x = lerp(par.x, par.tx, k); par.y = lerp(par.y, par.ty, k);
    uni.uPar.value.set(par.x, par.y);
    /* scroll = travel through the field + slow hue drift */
    const sc = scrollY / Math.max(1, document.body.scrollHeight - innerHeight);
    uni.uHue.value = sc * .35 + t * .004;
    camera.position.x = par.x * 1.6;
    camera.position.y = -par.y * 1.1 - sc * 2.2;
    camera.lookAt(0, camera.position.y * .9, 0);
    group.rotation.y = t * .006 + par.x * .05;
    group.rotation.z = Math.sin(t * .05) * .02;
    /* star drift + shockwave impulses */
    pulseAge += dt;
    uni.uPulse.value.z = pulseStr * Math.exp(-pulseAge * 1.6);
    uni.uPulse.value.w = pulseAge;
    const impulsing = performance.now() < impulseUntil;
    layers.forEach((L, li) => {
      if (impulsing) {
        const p = L.geo.attributes.position.array;
        for (let i = 0; i < L.n; i++) {
          p[i * 3] += L.vel[i * 3] * dt * 60; p[i * 3 + 1] += L.vel[i * 3 + 1] * dt * 60;
          L.vel[i * 3] *= Math.pow(.5, dt); L.vel[i * 3 + 1] *= Math.pow(.5, dt);
        }
        L.geo.attributes.position.needsUpdate = true;
      }
      L.mat.opacity = L.baseOp * (.82 + Math.sin(t * (1.1 + li * .5)) * .18);
    });
    renderer.render(scene, camera);
  }
  frame();

  return {
    setPointer(nx, ny) { gestureDrives = true; par.tx = clamp(nx, -1, 1); par.ty = clamp(ny, -1, 1); },
    releasePointer() { gestureDrives = false; },
    pulse(cx, cy) {   // cx,cy in [0..1] viewport coords (y down)
      pulseAge = 0; pulseStr = 1;
      uni.uPulse.value.x = cx; uni.uPulse.value.y = 1 - cy;
      /* radial impulse on stars around the pulse point */
      tmpV.set(cx * 2 - 1, -(cy * 2 - 1), .5).unproject(camera).sub(camera.position).normalize();
      const dist = -camera.position.z / tmpV.z || 10;
      const wp = camera.position.clone().addScaledVector(tmpV, Math.abs(dist));
      impulseUntil = performance.now() + 2500;
      layers.forEach(L => {
        const p = L.geo.attributes.position.array;
        for (let i = 0; i < L.n; i++) {
          const dx = p[i * 3] - wp.x, dy = p[i * 3 + 1] - wp.y;
          const d = Math.hypot(dx, dy);
          if (d < 7 && d > .001) { const f = (1 - d / 7) * .5; L.vel[i * 3] += dx / d * f; L.vel[i * 3 + 1] += dy / d * f; }
        }
      });
    },
  };
}
