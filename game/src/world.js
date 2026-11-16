// The compound: an ash-dusted industrial yard at dusk, built from boxes
// with canvas-painted textures (no external assets). Every solid registers
// an AABB collider for movement and a mesh for bullet raycasts. The layout
// is a classic three-lane tactical map: a main street through mid, a north
// lane into the warehouse (Site A) and a south lane into the container
// yard (Site B), with the defenders spawning close to both sites.
import * as THREE from 'three';
import { PALETTE, TEAMS } from './palette.js';

function canvasTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function speckle(ctx, w, h, n, colors, alpha) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    ctx.globalAlpha = alpha * (0.4 + Math.random() * 0.6);
    const s = 1 + Math.random() * 3;
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

function makeMaterials() {
  const concrete = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8d8578'; ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 2600, ['#7c7565', '#9c9587', '#6e675c'], 0.5);
    ctx.strokeStyle = 'rgba(60,55,48,0.35)'; ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = 'rgba(70,64,55,0.18)';
    ctx.fillRect(0, h * 0.72, w, h * 0.28);
  }, 2, 2);
  const asphalt = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#776e5f'; ctx.fillRect(0, 0, w, h);
    // large soft ash drifts and oil stains so the ground is not one flat tone
    for (let i = 0; i < 9; i++) {
      const gx = Math.random() * w, gy = Math.random() * h, gr = 30 + Math.random() * 70;
      const grad = ctx.createRadialGradient(gx, gy, 2, gx, gy, gr);
      const dark = Math.random() < 0.5;
      grad.addColorStop(0, dark ? 'rgba(52,46,38,0.35)' : 'rgba(196,178,148,0.30)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }
    speckle(ctx, w, h, 3200, ['#665e52', '#877e6e', '#584f44'], 0.55);
    ctx.strokeStyle = 'rgba(48,43,36,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += (Math.random() - 0.5) * 70; y += (Math.random() - 0.5) * 70; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, 20, 20);
  const metal = (base, rib) => canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rib;
    for (let x = 0; x < w; x += 32) ctx.fillRect(x, 0, 7, h);
    speckle(ctx, w, h, 900, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.10)'], 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(0, h - 26, w, 26);
  }, 3, 1);
  const wood = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8a6b45'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(90,64,32,0.55)';
    for (let y = 30; y < h; y += 52) ctx.fillRect(0, y, w, 5);
    ctx.strokeStyle = 'rgba(70,50,24,0.8)'; ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, w - 14, h - 14);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.moveTo(w, 0); ctx.lineTo(0, h);
    ctx.stroke();
    speckle(ctx, w, h, 500, ['rgba(60,40,18,0.4)'], 0.4);
  });
  const sand = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#7a6f52'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(94,84,58,0.9)';
    for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 64) {
      ctx.beginPath(); ctx.ellipse(x + 32, y + 16, 30, 13, 0, 0, Math.PI * 2); ctx.fill();
    }
    speckle(ctx, w, h, 700, ['#6a6046', '#8a7f60'], 0.5);
  }, 2, 1);
  const hazard = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#c9a227'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#26241f';
    for (let i = -1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 64, h); ctx.lineTo(i * 64 + 32, h); ctx.lineTo(i * 64 + 96, 0); ctx.lineTo(i * 64 + 64, 0);
      ctx.fill();
    }
  }, 4, 1);
  const std = (map, rough = 0.92) => new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: 0.04 });
  return {
    concrete: std(concrete),
    concreteDark: new THREE.MeshStandardMaterial({ color: PALETTE.concreteDark, roughness: 0.95 }),
    asphalt: std(asphalt, 1),
    steel: std(metal('#707880', 'rgba(40,44,48,0.35)')),
    containerEmber: std(metal('#a34d16', 'rgba(60,28,8,0.4)')),
    containerSable: std(metal('#20655e', 'rgba(10,40,36,0.4)')),
    containerGrey: std(metal('#5d6468', 'rgba(30,32,34,0.4)')),
    wood: std(wood),
    sand: std(sand),
    hazard: std(hazard),
    rust: new THREE.MeshStandardMaterial({ color: PALETTE.rust, roughness: 0.85, metalness: 0.25 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.6, metalness: 0.5 }),
  };
}

export function createWorld(scene) {
  const mats = makeMaterials();
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const solids = [];    // meshes bullets can hit
  const root = new THREE.Group();
  scene.add(root);

  function box(x, z, w, d, h, mat, { y = 0, collide = true, name = '' } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    if (name) m.name = name;
    root.add(m);
    if (collide) {
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      solids.push(m);
    }
    return m;
  }
  function cylinder(x, z, r, h, mat, seg = 14) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
    solids.push(m);
    return m;
  }

  // --- sky, light, ground -------------------------------------------------
  const skyGeo = new THREE.SphereGeometry(400, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyHigh) },
      bottom: { value: new THREE.Color(PALETTE.sky) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float t = clamp(normalize(vP).y * 1.6 + 0.25, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  scene.fog = new THREE.Fog(PALETTE.fog, 60, 210);

  const hemi = new THREE.HemisphereLight(0xe8c9a0, 0x4a4238, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.5);
  sun.position.set(-60, 42, -25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -75; sun.shadow.camera.right = 75;
  sun.shadow.camera.top = 75; sun.shadow.camera.bottom = -75;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x77644e, 0.65));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(124, 124), mats.asphalt);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);
  solids.push(ground);

  // distant mesas silhouettes outside the walls
  const mesaMat = new THREE.MeshStandardMaterial({ color: 0x54432e, roughness: 1 });
  [[-120, -40, 90, 26], [110, 30, 80, 34], [0, -130, 160, 22], [30, 125, 120, 28], [-110, 70, 70, 18]]
    .forEach(([x, z, w, h]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 30), mesaMat);
      m.position.set(x, h / 2 - 1, z);
      root.add(m);
    });

  // --- perimeter ----------------------------------------------------------
  box(0, -59, 120, 2, 7, mats.concrete);
  box(0, 59, 120, 2, 7, mats.concrete);
  box(-59, 0, 2, 120, 7, mats.concrete);
  box(59, 0, 2, 120, 7, mats.concrete);

  // --- mid plaza ----------------------------------------------------------
  box(0, 0, 7, 7, 4.2, mats.concreteDark);                    // monument block
  box(0, 0, 8.4, 8.4, 0.5, mats.hazard, { collide: false });  // hazard skirt
  box(-11, -9, 2.4, 2.4, 2.4, mats.wood);
  box(-11, -9, 2.4, 2.4, 1.2, mats.wood, { y: 2.4 });
  box(11, 9, 2.4, 2.4, 2.4, mats.wood);
  box(11, -9, 4.6, 1.1, 1.1, mats.sand);                       // sandbag lines
  box(-11, 9, 4.6, 1.1, 1.1, mats.sand);
  cylinder(13, 12, 0.7, 1.3, mats.rust);
  cylinder(14.2, 12.4, 0.7, 1.3, mats.rust);
  cylinder(-13, -12.5, 0.7, 1.3, mats.darkMetal);

  // --- lane blocks (buildings that carve the three lanes) -----------------
  box(-16, -17, 34, 10, 5.5, mats.concrete);   // north-west block
  box(22, -15, 18, 14, 6.5, mats.steel);       // north-east block
  box(-16, 17, 34, 10, 5.5, mats.concrete);    // south-west block
  box(22, 15, 18, 14, 6.5, mats.steel);        // south-east block
  box(-45, -15, 14, 10, 5, mats.concreteDark); // west flank north
  box(-45, 15, 14, 10, 5, mats.concreteDark);  // west flank south
  box(-45, 0, 10, 8, 3.4, mats.wood, { collide: true }); // spawn cover stack (low building)
  box(47, -13, 12, 8, 5, mats.concreteDark);   // defender A-side cover
  box(47, 13, 12, 8, 5, mats.concreteDark);    // defender B-side cover

  // --- Site A: the warehouse (north-east) ---------------------------------
  // walls with two door gaps: west door at z -38..-34, south door at x 36..40
  box(26, -43.5, 1.6, 13, 6, mats.steel);
  box(26, -27.5, 1.6, 7, 6, mats.steel);
  box(31, -24, 10, 1.6, 6, mats.steel);
  box(46, -24, 12, 1.6, 6, mats.steel);
  box(39, -50.5, 27, 1.6, 6, mats.steel);
  box(52.5, -37, 1.6, 27, 6, mats.steel);
  // roof beams (visual only, high above play space)
  for (let i = 0; i < 4; i++) box(39, -48 + i * 7.5, 27, 0.8, 0.5, mats.darkMetal, { y: 6, collide: false });
  cylinder(47, -45, 3, 9.5, mats.rust);                          // silo
  box(33, -42, 2.4, 2.4, 2.4, mats.wood);
  box(33, -42, 2.4, 2.4, 1.2, mats.wood, { y: 2.4 });
  box(43, -31, 2.4, 2.4, 2.4, mats.wood);
  box(36, -33, 4.6, 1.1, 1.1, mats.sand);
  box(30.5, -30, 1.1, 4.6, 1.1, mats.sand);

  // --- Site B: the container yard (south-east) ----------------------------
  const cont = (x, z, alongX, mat, stack = false) => {
    if (alongX) box(x, z, 11, 2.6, 2.6, mat, stack ? { y: 2.6 } : {});
    else box(x, z, 2.6, 11, 2.6, mat, stack ? { y: 2.6 } : {});
    if (!stack && Math.random() > -1) { /* single level only unless stacked */ }
  };
  cont(32, 29, true, mats.containerEmber);
  cont(32, 29, true, mats.containerGrey, true);
  cont(47, 31, false, mats.containerSable);
  cont(30, 45, false, mats.containerSable);
  cont(46, 45, true, mats.containerEmber);
  cont(39, 40, true, mats.containerGrey);
  box(35, 34, 2.4, 2.4, 2.4, mats.wood);
  box(43, 41, 4.6, 1.1, 1.1, mats.sand);
  cylinder(28, 38, 0.7, 1.3, mats.rust);
  cylinder(29.2, 38.6, 0.7, 1.3, mats.rust);

  // --- guard tower between mid and B --------------------------------------
  const towerMat = mats.darkMetal;
  [[23, 21], [27, 21], [23, 25], [27, 25]].forEach(([x, z]) => box(x, z, 0.5, 0.5, 7, towerMat));
  box(25, 23, 6, 6, 0.4, mats.wood, { y: 7 });
  box(25, 23, 6.4, 6.4, 0.3, mats.rust, { y: 9.2, collide: false });
  box(25, 20.4, 6, 0.3, 2, towerMat, { y: 7.2, collide: false });
  colliders.push({ minX: 22.5, maxX: 27.5, minZ: 20.5, maxZ: 25.5 });

  // lamp posts (visual): warm points of light for the dusk mood
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.6, metalness: 0.6 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffc37a, emissive: 0xffa845, emissiveIntensity: 2.2 });
  [[-30, -6], [8, 8], [-6, -28], [18, 30], [44, -8], [-38, 24]].forEach(([x, z]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.4, 8), lampMat);
    pole.position.set(x, 2.7, z);
    pole.castShadow = true;
    root.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), bulbMat);
    bulb.position.set(x, 5.5, z);
    root.add(bulb);
    colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25 });
  });

  // --- sites ---------------------------------------------------------------
  function siteRing(cx, cz, letter, colorHex) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(7.2, 8, 40),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.06, cz);
    g.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(7.2, 40),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.10, side: THREE.DoubleSide }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(cx, 0.05, cz);
    g.add(disc);
    const letterTex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#f2ede4';
      ctx.font = '900 190px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, w / 2, h / 2 + 8);
    });
    const letterMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshBasicMaterial({ map: letterTex, transparent: true, opacity: 0.9 }),
    );
    letterMesh.rotation.x = -Math.PI / 2;
    letterMesh.position.set(cx, 0.07, cz);
    g.add(letterMesh);
    root.add(g);
    return { id: letter, center: new THREE.Vector3(cx, 0, cz), radius: 8, ring };
  }
  const sites = [
    siteRing(39, -37, 'A', PALETTE.hazard),
    siteRing(39, 37, 'B', PALETTE.hazard),
  ];

  // --- spawns ---------------------------------------------------------------
  const spawns = {
    ember: [
      [-50, 0], [-51, -4], [-51, 4], [-47, -3], [-47, 3],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    sable: [
      [50, 0], [51, -4], [51, 4], [47, -3], [47, 3],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
  };

  // --- waypoint graph -------------------------------------------------------
  const wp = {};
  function node(name, x, z, links) { wp[name] = { name, pos: new THREE.Vector3(x, 0, z), links }; }
  node('e_spawn', -44, 0, ['e_stage']);
  node('e_stage', -34, 0, ['e_spawn', 'mid_w', 'n_w', 's_w']);
  node('mid_w', -18, 0, ['e_stage', 'mid_n', 'mid_s']);
  node('mid_n', -2, -11, ['mid_w', 'mid_e', 'link_n']);
  node('mid_s', -2, 11, ['mid_w', 'mid_e', 'link_s']);
  node('mid_e', 14, 0, ['mid_n', 'mid_s', 'e_a', 'e_b', 'd_stage']);
  node('link_n', -6, -24, ['mid_n', 'n_m']);
  node('link_s', -6, 24, ['mid_s', 's_m']);
  node('n_w', -36, -31, ['e_stage', 'n_m']);
  node('n_m', -10, -31, ['n_w', 'n_e', 'link_n']);
  node('n_e', 12, -31, ['n_m', 'a_door_w']);
  node('a_door_w', 23, -36, ['n_e', 'a_site']);
  node('a_site', 39, -37, ['a_door_w', 'a_door_s']);
  node('a_door_s', 38, -20, ['a_site', 'e_a']);
  node('e_a', 26, -13, ['mid_e', 'a_door_s']);
  node('s_w', -36, 31, ['e_stage', 's_m']);
  node('s_m', -10, 31, ['s_w', 's_e', 'link_s']);
  node('s_e', 12, 31, ['s_m', 'b_west']);
  node('b_west', 27, 37, ['s_e', 'b_site', 'e_b']);
  node('b_site', 39, 37, ['b_west', 'd_b']);
  node('e_b', 26, 13, ['mid_e', 'b_west']);
  node('d_stage', 34, 0, ['mid_e', 'd_spawn', 'd_a', 'd_b']);
  node('d_spawn', 44, 0, ['d_stage']);
  node('d_a', 44, -14, ['d_stage', 'a_door_s']);
  node('d_b', 44, 20, ['d_stage', 'b_site']);

  return {
    colliders,
    solids,
    sites,
    spawns,
    waypoints: wp,
    mats,
  };
}

// Resolve a circle (x,z,radius) out of every AABB collider; returns the
// corrected position. Used by the player and every bot each step.
export function collide(colliders, pos, radius) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // centre inside the box: push out along the smallest penetration
        const left = pos.x - c.minX, right = c.maxX - pos.x;
        const top = pos.z - c.minZ, bottom = c.maxZ - pos.z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = c.minX - radius;
        else if (m === right) pos.x = c.maxX + radius;
        else if (m === top) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  pos.x = Math.max(-57.4, Math.min(57.4, pos.x));
  pos.z = Math.max(-57.4, Math.min(57.4, pos.z));
  return pos;
}

// BFS shortest path over the waypoint graph; returns a list of positions.
export function findPath(waypoints, fromName, toName) {
  if (fromName === toName) return [waypoints[toName].pos.clone()];
  const prev = new Map([[fromName, null]]);
  const queue = [fromName];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of waypoints[cur].links) {
      if (!prev.has(next)) {
        prev.set(next, cur);
        if (next === toName) {
          const path = [];
          let n = toName;
          while (n) { path.unshift(waypoints[n].pos.clone()); n = prev.get(n); }
          return path;
        }
        queue.push(next);
      }
    }
  }
  return [waypoints[toName].pos.clone()];
}

export function nearestNode(waypoints, pos) {
  let best = null;
  let bestD = Infinity;
  for (const name of Object.keys(waypoints)) {
    const d = waypoints[name].pos.distanceToSquared(pos);
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}
