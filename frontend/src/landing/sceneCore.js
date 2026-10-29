import * as THREE from 'three';

/**
 * Cinematic 3D scene for the NimbusHost landing page.
 *
 * What you see (all real geometry, lights and fog, no flat images):
 *  - a stack of four database platters with glowing edge rings (the "core")
 *  - an icosahedral wireframe shell around it (the "guard")
 *  - two tilted rings with a bead orbiting each (transactions in flight)
 *  - a graph of data nodes joined by edges that morphs between a sphere
 *    (hero) and a flat table-like layout (schema section)
 *  - a drifting particle field for depth
 *
 * Scroll sections call api.setTarget(...); values are damped every frame.
 */

const ACCENT = new THREE.Color('#5ad6ff');
const WARM = new THREE.Color('#ffb454');

const lerp = (a, b, t) => a + (b - a) * t;

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Opaque backdrop used when bloom is on (the bloom composer cannot keep a transparent canvas).
function makeBackgroundTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#05070d';
  g.fillRect(0, 0, 512, 512);
  let grad = g.createRadialGradient(384, 0, 0, 384, 0, 380);
  grad.addColorStop(0, 'rgba(14,32,66,0.95)');
  grad.addColorStop(1, 'rgba(14,32,66,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  grad = g.createRadialGradient(50, 512, 0, 50, 512, 330);
  grad.addColorStop(0, 'rgba(30,16,36,0.9)');
  grad.addColorStop(1, 'rgba(30,16,36,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Deterministic pseudo-random so the layout is identical on every load.
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function fibonacciSphere(n, radius) {
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    pts.push(new THREE.Vector3(Math.cos(th) * r * radius, y * radius, Math.sin(th) * r * radius));
  }
  return pts;
}

function tableLayout(n) {
  const rnd = seeded(7);
  const cols = Math.ceil(Math.sqrt(n * 1.5));
  const rows = Math.ceil(n / cols);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    pts.push(
      new THREE.Vector3(
        (c - (cols - 1) / 2) * 0.62 + (rnd() - 0.5) * 0.12,
        (r - (rows - 1) / 2) * 0.62 + (rnd() - 0.5) * 0.12,
        (rnd() - 0.5) * 0.7,
      ),
    );
  }
  return pts;
}

function nearestEdges(points, perNode) {
  const seen = new Set();
  const edges = [];
  for (let i = 0; i < points.length; i++) {
    const d = [];
    for (let j = 0; j < points.length; j++) {
      if (i !== j) d.push([points[i].distanceToSquared(points[j]), j]);
    }
    d.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < perNode; k++) {
      const j = d[k][1];
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([i, j]);
      }
    }
  }
  return edges;
}

export function initScene(canvas, { mobile = false, reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !mobile,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05070d, 0.032);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 80);
  camera.position.set(0, 0, 9.2);

  // ---- lights ----
  scene.add(new THREE.AmbientLight(0x1a2740, 0.9));
  const key = new THREE.DirectionalLight(0x9fd8ff, 1.3);
  key.position.set(4, 6, 5);
  scene.add(key);
  const coreLight = new THREE.PointLight(ACCENT, 23, 14, 2);
  coreLight.position.set(0, 0, 3);
  scene.add(coreLight);
  const rim = new THREE.PointLight(WARM, 17, 14, 2);
  rim.position.set(-4, -2, -3);
  scene.add(rim);

  const world = new THREE.Group();
  scene.add(world);

  const glowTex = makeGlowTexture();

  // ---- core: stack of database platters ----
  const core = new THREE.Group();
  world.add(core);
  const discMat = new THREE.MeshStandardMaterial({ color: 0x0b1424, metalness: 0.85, roughness: 0.32 });
  const DISC_R = 2.00; // platter radius (width)
  const DISC_H = 0.75; // platter thickness
  const DISC_GAP = 0.3; // empty space between platters
  const DISC_STEP = DISC_H + DISC_GAP;
  const discGeo = new THREE.CylinderGeometry(DISC_R, DISC_R, DISC_H, 64, 1);
  const edgeGeo = new THREE.TorusGeometry(DISC_R + 0.005, 0.014, 12, 96);
  const trackGeo = new THREE.RingGeometry(0.42, 0.44, 64);
  const accentMat = new THREE.MeshBasicMaterial({ color: ACCENT });
  const warmMat = new THREE.MeshBasicMaterial({ color: WARM });
  const trackMat = new THREE.MeshBasicMaterial({
    color: ACCENT,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  });
  for (let k = 0; k < 4; k++) {
    const y = (k - 1.5) * DISC_STEP;
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.y = y;
    core.add(disc);
    const edge = new THREE.Mesh(edgeGeo, k === 3 ? warmMat : accentMat);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = y;
    core.add(edge);
    const track = new THREE.Mesh(trackGeo, trackMat);
    track.rotation.x = -Math.PI / 2;
    track.position.y = y + DISC_H / 2 + 0.001;
    core.add(track);
  }

  // halo behind the core (cheap bloom substitute)
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: ACCENT,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.scale.set(9, 9, 1);
  halo.position.z = -1.5;
  world.add(halo);

  // ---- guard shell ----
  const shellMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.14 });
  const shellGeo = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.5, 1));
  const shell = new THREE.LineSegments(shellGeo, shellMat);
  world.add(shell);

  // ---- orbit rings with beads ----
  const ringGeos = [new THREE.TorusGeometry(2.1, 0.008, 8, 200), new THREE.TorusGeometry(2.9, 0.006, 8, 240)];
  const ringMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.35 });
  const beadGeo = new THREE.SphereGeometry(0.07, 16, 16);
  const orbits = [
    { radius: 2.1, tilt: [1.1, 0.3], speed: 0.55, mat: warmMat, geo: ringGeos[0] },
    { radius: 2.9, tilt: [-0.7, -0.5], speed: -0.35, mat: accentMat, geo: ringGeos[1] },
  ].map((o) => {
    const tilt = new THREE.Group();
    tilt.rotation.set(o.tilt[0], o.tilt[1], 0);
    const spin = new THREE.Group();
    spin.add(new THREE.Mesh(o.geo, ringMat));
    const bead = new THREE.Mesh(beadGeo, o.mat);
    bead.position.x = o.radius;
    spin.add(bead);
    tilt.add(spin);
    world.add(tilt);
    return { spin, speed: o.speed };
  });

  // ---- data-node graph ----
  const nodeCount = mobile ? 34 : 60;
  const layoutA = fibonacciSphere(nodeCount, 3.5);
  const layoutB = tableLayout(nodeCount);
  const edges = nearestEdges(layoutA, 2);

  const nodeGeo = new THREE.IcosahedronGeometry(0.075, 0);
  const nodeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const nodes = new THREE.InstancedMesh(nodeGeo, nodeMat, nodeCount);
  const tmpColor = new THREE.Color();
  for (let i = 0; i < nodeCount; i++) {
    nodes.setColorAt(i, tmpColor.copy(i % 7 === 0 ? WARM : ACCENT));
  }
  nodes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  nodes.frustumCulled = false;
  world.add(nodes);

  const haloPositions = new Float32Array(nodeCount * 3);
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const haloPoints = new THREE.Points(
    haloGeo,
    new THREE.PointsMaterial({
      map: glowTex,
      color: ACCENT,
      size: 0.45,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  haloPoints.frustumCulled = false;
  world.add(haloPoints);

  const linePositions = new Float32Array(edges.length * 6);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage));
  const lineMat = new THREE.LineBasicMaterial({
    color: ACCENT,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  world.add(lines);

  // ---- particles ----
  const particleCount = mobile ? 220 : 600;
  const prnd = seeded(42);
  const pPos = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const r = 6 + prnd() * 10;
    const th = prnd() * Math.PI * 2;
    const ph = Math.acos(2 * prnd() - 1);
    pPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pPos[i * 3 + 1] = r * Math.cos(ph);
    pPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      color: 0x9fb8d0,
      size: 0.04,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(particles);

  // ---- state (targets are set by scroll sections, values are damped) ----
  const target = { x: 0, z: 9.2, ry: 0, morph: 0, shell: 0.14, spin: 0.12, glow: 0.5 };
  const cur = { ...target };
  const pointer = { x: 0, y: 0, px: 0, py: 0 };

  const dummy = new THREE.Object3D();
  const tmp = new THREE.Vector3();
  const motion = reduced ? 0.2 : 1;

  function updateGraph(t, morph) {
    for (let i = 0; i < nodeCount; i++) {
      tmp.lerpVectors(layoutA[i], layoutB[i], morph);
      tmp.x += Math.sin(t * 0.6 + i) * 0.06 * motion;
      tmp.y += Math.cos(t * 0.5 + i * 1.3) * 0.06 * motion;
      dummy.position.copy(tmp);
      dummy.scale.setScalar(1 + 0.25 * Math.sin(t * 2 + i) * motion);
      dummy.updateMatrix();
      nodes.setMatrixAt(i, dummy.matrix);
      haloPositions[i * 3] = tmp.x;
      haloPositions[i * 3 + 1] = tmp.y;
      haloPositions[i * 3 + 2] = tmp.z;
    }
    nodes.instanceMatrix.needsUpdate = true;
    haloGeo.attributes.position.needsUpdate = true;

    for (let e = 0; e < edges.length; e++) {
      const a = edges[e][0] * 3;
      const b = edges[e][1] * 3;
      const o = e * 6;
      linePositions[o] = haloPositions[a];
      linePositions[o + 1] = haloPositions[a + 1];
      linePositions[o + 2] = haloPositions[a + 2];
      linePositions[o + 3] = haloPositions[b];
      linePositions[o + 4] = haloPositions[b + 1];
      linePositions[o + 5] = haloPositions[b + 2];
    }
    lineGeo.attributes.position.needsUpdate = true;
  }

  // ---- optional bloom (desktop only, loaded lazily; falls back silently) ----
  let composer = null;
  let bgTex = null;
  let disposed = false;
  if (!mobile && !reduced) {
    Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
    ])
      .then(([ec, rp, ub, op]) => {
        if (disposed) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const c = new ec.EffectComposer(renderer);
        c.setPixelRatio(renderer.getPixelRatio());
        c.setSize(w, h);
        c.addPass(new rp.RenderPass(scene, camera));
        c.addPass(new ub.UnrealBloomPass(new THREE.Vector2(w, h), 0.4, 0.6, 0.22));
        c.addPass(new op.OutputPass());
        bgTex = makeBackgroundTexture();
        scene.background = bgTex;
        composer = c;
      })
      .catch((err) => console.warn('Bloom unavailable, using plain rendering:', err));
  }

  // ---- sizing ----
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    if (composer) composer.setSize(w, h);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  function onPointer(e) {
    if (reduced || e.pointerType !== 'mouse') return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  }
  window.addEventListener('pointermove', onPointer, { passive: true });

  // ---- loop ----
  let raf = 0;
  let last = performance.now();
  let time = 0;
  let running = true;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden || !running) {
      last = now;
      return;
    }
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    time += dt;

    const k = 1 - Math.exp(-dt * 2.6);
    for (const key2 of Object.keys(target)) cur[key2] = lerp(cur[key2], target[key2], k);
    const pk = 1 - Math.exp(-dt * 4);
    pointer.px = lerp(pointer.px, pointer.x, pk);
    pointer.py = lerp(pointer.py, pointer.y, pk);

    // world transform: scroll offset + mouse parallax + slow spin
    world.position.x = cur.x;
    world.rotation.y = cur.ry + pointer.px * 0.35 + time * cur.spin * motion;
    world.rotation.x = pointer.py * 0.18;
    camera.position.z = cur.z;
    camera.position.x = pointer.px * 0.4;
    camera.position.y = -pointer.py * 0.25;
    camera.lookAt(world.position.x * 0.3, 0, 0);

    core.rotation.y = time * 0.25 * motion;
    core.position.y = Math.sin(time * 0.8) * 0.12 * motion;
    shell.rotation.y = -time * 0.06 * motion;
    shell.rotation.x = time * 0.04 * motion;
    shellMat.opacity = cur.shell;
    halo.material.opacity = cur.glow * 0.75;
    particles.rotation.y = time * 0.015 * motion;
    for (const o of orbits) o.spin.rotation.z = time * o.speed * motion;

    updateGraph(time, cur.morph);
    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    setTarget(next) {
      Object.assign(target, next);
    },
    pause() {
      running = false;
    },
    resume() {
      running = true;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      if (composer) composer.dispose();
      if (bgTex) bgTex.dispose();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
      glowTex.dispose();
      renderer.dispose();
    },
  };
}