// ASHFALL PROTOCOL — boot, the fixed-step loop, the round state machine,
// hitscan resolution, the breach-charge objective and the screenshot modes.
// Round flow: buy (15 s, frozen) -> live (100 s) -> end banner -> next.
// First to 7 rounds wins the match (13 at most). The charge carrier is an
// Ember bot at first; if the carrier falls, the nearest Ember operator —
// possibly the player — picks it up.
import * as THREE from 'three';
import { PALETTE, TEAMS } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { Player } from './player.js';
import { Bot, EMBER_NAMES, SABLE_NAMES, updateBot } from './bots.js';
import { WEAPONS, WeaponState, damageAt, buildViewmodel } from './weapons.js';
import { createHud, BUY_ITEMS } from './hud.js';
import { wakeAudio, sfx, vol } from './audio.js';

const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot');
const SEED = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
// deterministic RNG for screenshot poses
let _s = SEED * 7919 + 13;
const srand = () => { _s = (_s * 16807) % 2147483647; return (_s - 1) / 2147483646; };

// --- renderer / scene ---------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 500);
scene.add(camera);

const world = createWorld(scene);
const input = createInput(renderer.domElement);
const player = new Player(world, camera);

// --- actors -------------------------------------------------------------------
const playerActor = {
  isPlayer: true, team: 'ember', name: 'You',
  pos: player.pos, money: 800, kills: 0, deaths: 0,
  weapon: new WeaponState('sparrow'),
  get alive() { return player.alive; },
  get health() { return player.health; },
  eyePos: (out = new THREE.Vector3()) => player.eyePos(out),
  chestPos: (out = new THREE.Vector3()) => out.set(player.pos.x, player.pos.y + 1.15, player.pos.z),
  headPos: (out = new THREE.Vector3()) => out.set(player.pos.x, player.pos.y + 1.66, player.pos.z),
  groundSpeed: () => player.groundSpeed(),
  takeDamage: (dmg, attacker) => {
    const applied = player.takeDamage(dmg);
    if (attacker) {
      // yaw toward the attacker in the same convention as the bots, then
      // rotate the HUD indicator: -rel because screen rotation is clockwise
      const yawTo = Math.atan2(-(attacker.pos.x - player.pos.x), -(attacker.pos.z - player.pos.z));
      let rel = yawTo - player.yaw;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      hud.damageFrom(-rel);
      sfx.hurt(0.8);
    }
    return applied;
  },
};

const bots = [];
{
  const skills = [0.55, 0.62, 0.5, 0.68];
  EMBER_NAMES.forEach((n, i) => bots.push(new Bot('ember', n, skills[i], scene)));
  const eskills = [0.6, 0.66, 0.58, 0.7, 0.64];
  SABLE_NAMES.forEach((n, i) => bots.push(new Bot('sable', n, eskills[i], scene)));
}
const actors = [playerActor, ...bots];

// --- viewmodel ------------------------------------------------------------------
let viewmodel = null;
let vmMuzzle = null;
function setViewmodel(weaponId) {
  if (viewmodel) camera.remove(viewmodel);
  viewmodel = buildViewmodel(weaponId);
  viewmodel.scale.setScalar(0.92);
  viewmodel.position.set(0.27, -0.24, -0.45);
  camera.add(viewmodel);
  vmMuzzle = viewmodel.userData.muzzle;
}
setViewmodel('sparrow');
const flashLight = new THREE.PointLight(0xffb36b, 0, 9, 1.8);
scene.add(flashLight);
// a soft warm fill riding with the camera so the viewmodel reads as a
// shaped object instead of a black silhouette against the dusk
const fillLight = new THREE.PointLight(0xffd9ae, 2.6, 7, 1.6);
fillLight.position.set(0.25, -0.02, 0.15);
camera.add(fillLight);
const flashSprite = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.35, 'rgba(255,170,60,0.85)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  spr.scale.set(0.55, 0.55, 1);
  spr.visible = false;
  scene.add(spr);
  return spr;
})();

// --- tracers + impact puffs (pooled) ---------------------------------------------
const tracerPool = [];
const puffPool = [];
function spawnTracer(a, b, color = 0xffd9a0) {
  let t = tracerPool.find((x) => x.life <= 0);
  if (!t) {
    if (tracerPool.length > 40) return;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(line);
    t = { line, life: 0 };
    tracerPool.push(t);
  }
  const p = t.line.geometry.attributes.position;
  p.setXYZ(0, a.x, a.y, a.z);
  p.setXYZ(1, b.x, b.y, b.z);
  p.needsUpdate = true;
  t.line.material.opacity = 0.75;
  t.life = 0.07;
}
function spawnPuff(at, color = 0xcbbfa8) {
  let s = puffPool.find((x) => x.life <= 0);
  if (!s) {
    if (puffPool.length > 30) return;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashSprite.material.map, transparent: true, opacity: 0, depthWrite: false, color }));
    scene.add(spr);
    s = { spr, life: 0 };
    puffPool.push(s);
  }
  s.spr.position.copy(at);
  s.spr.material.color.set(color);
  s.life = 0.28;
}
function updateFx(dt) {
  for (const t of tracerPool) {
    if (t.life > 0) { t.life -= dt; t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.75; }
  }
  for (const s of puffPool) {
    if (s.life > 0) {
      s.life -= dt;
      const k = 1 - s.life / 0.28;
      s.spr.scale.setScalar(0.25 + k * 0.8);
      s.spr.material.opacity = 0.55 * (1 - k);
    }
  }
  if (flashLight.intensity > 0) flashLight.intensity = Math.max(0, flashLight.intensity - dt * 260);
  if (flashSprite.visible && flashLight.intensity <= 0) flashSprite.visible = false;
}

// --- the breach charge ------------------------------------------------------------
const chargeMesh = (() => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.22, 0.38),
    new THREE.MeshStandardMaterial({ color: 0x33302a, roughness: 0.5, metalness: 0.4 }));
  body.position.y = 0.11;
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.28),
    new THREE.MeshStandardMaterial({ color: PALETTE.charge, roughness: 0.6 }));
  pack.position.y = 0.26;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 3 }));
  lamp.position.set(0.18, 0.3, 0);
  g.add(body, pack, lamp);
  g.userData.lamp = lamp;
  g.visible = false;
  scene.add(g);
  return g;
})();

// --- game state ---------------------------------------------------------------------
const G = {
  phase: 'menu',        // menu | buy | live | roundEnd | matchEnd
  round: 1,
  score: { ember: 0, sable: 0 },
  phaseT: 0,
  roundTime: 100,
  planted: null,        // { site, fuse, pos }
  carrier: null,        // actor carrying the charge
  targetSite: 'A',
  intel: null,          // site id sable has spotted ember at
  shake: 0,
  adsFactor: 0,
  recoil: 0,
  lossStreak: { ember: 0, sable: 0 },
  buyOpen: false,
  useHeld: false,
  plantChannel: 0,      // player's own plant/defuse progress
  winner: null,
};

const hud = createHud({ onBuy: (id) => buyItem(id) });

// --- economy / buy ---------------------------------------------------------------------
function buyItem(id) {
  if (G.phase !== 'buy') return;
  if (id === 'armor') {
    if (playerActor.money >= 650 && !player.hasArmor) {
      playerActor.money -= 650;
      player.hasArmor = true;
      player.armor = 100;
      sfx.buy();
    }
  } else {
    const def = WEAPONS[id];
    if (def && playerActor.money >= def.price && playerActor.weapon.id !== id) {
      playerActor.money -= def.price;
      playerActor.weapon = new WeaponState(id);
      setViewmodel(id);
      sfx.buy();
    }
  }
  refreshBuy();
}
function refreshBuy() {
  hud.renderBuy({
    money: playerActor.money,
    ownedId: playerActor.weapon.id,
    hasArmor: player.hasArmor,
    timeLeft: G.phaseT,
  });
  hud.setMoney(playerActor.money);
}

// --- hitscan resolution ------------------------------------------------------------------
const _raycaster = new THREE.Raycaster();
const _tmpV = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();

function raySphere(origin, dir, center, r) {
  _tmpV.copy(center).sub(origin);
  const t = _tmpV.dot(dir);
  if (t < 0) return -1;
  const d2 = _tmpV.lengthSq() - t * t;
  if (d2 > r * r) return -1;
  return t - Math.sqrt(r * r - d2);
}

function fireHitscan(shooter, origin, dir, singleRay = false) {
  const def = shooter.weapon.def;
  const pellets = singleRay ? 1 : def.pellets;
  let anyHit = false;
  let anyKill = false;
  for (let p = 0; p < pellets; p++) {
    const d = _tmpV2.copy(dir);
    if (pellets > 1) {
      const cone = def.spreadHip * 0.85 * Math.PI / 180;
      d.x += (Math.random() - 0.5) * 2 * cone;
      d.y += (Math.random() - 0.5) * 2 * cone;
      d.z += (Math.random() - 0.5) * 2 * cone;
      d.normalize();
    }
    _raycaster.set(origin, d);
    _raycaster.far = 220;
    const worldHits = _raycaster.intersectObjects(world.solids, false);
    let bestT = worldHits.length ? worldHits[0].distance : 220;
    let bestActor = null;
    let bestZone = 'body';
    for (const a of actors) {
      if (a === shooter || !a.alive || a.team === shooter.team) continue;
      const th = raySphere(origin, d, a.headPos(new THREE.Vector3()), 0.27);
      if (th > 0 && th < bestT) { bestT = th; bestActor = a; bestZone = 'head'; continue; }
      const tb = raySphere(origin, d, a.chestPos(new THREE.Vector3()), 0.47);
      if (tb > 0 && tb < bestT) { bestT = tb; bestActor = a; bestZone = 'body'; continue; }
      const tl = raySphere(origin, d, _tmpV.set(a.pos.x, a.pos.y + 0.42, a.pos.z), 0.4);
      if (tl > 0 && tl < bestT) { bestT = tl; bestActor = a; bestZone = 'legs'; }
    }
    const end = new THREE.Vector3().copy(d).multiplyScalar(bestT).add(origin);
    // tracer from the gun, not the eye
    const muzzle = shooter.isPlayer && vmMuzzle
      ? vmMuzzle.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(shooter.pos.x, shooter.pos.y + 1.34, shooter.pos.z)
        .addScaledVector(new THREE.Vector3(-Math.sin(shooter.yaw ?? 0), 0, -Math.cos(shooter.yaw ?? 0)), 0.45);
    spawnTracer(muzzle, end, shooter.team === 'ember' ? 0xffd9a0 : 0xa0e8ff);
    if (bestActor) {
      const zoneMult = bestZone === 'head' ? def.headMult : bestZone === 'legs' ? 0.7 : 1;
      const wasAlive = bestActor.alive;
      const applied = bestActor.takeDamage(damageAt(def, bestT) * zoneMult, shooter);
      anyHit = true;
      spawnPuff(end, bestZone === 'head' ? 0xe8b13c : 0xd8cfc0);
      if (wasAlive && !bestActor.alive) {
        anyKill = true;
        onKill(shooter, bestActor, bestZone === 'head');
      }
    } else if (worldHits.length) {
      spawnPuff(end, 0xbfae94);
    }
  }
  // shooter's own feedback
  const distToPlayer = shooter.isPlayer ? 0 : shooter.pos.distanceTo(player.pos);
  sfx.shot(def.kind, shooter.isPlayer ? 1 : vol(distToPlayer));
  if (shooter.isPlayer) {
    if (anyHit) { sfx.hit(0.9); hud.hitmarker(anyKill); }
    if (vmMuzzle) {
      const mp = vmMuzzle.getWorldPosition(new THREE.Vector3());
      flashSprite.position.copy(mp);
      flashSprite.visible = true;
      flashLight.position.copy(mp);
      flashLight.intensity = 26;
    }
    G.recoil = Math.min(1, G.recoil + (def.kind === 'sniper' ? 1 : def.kind === 'scatter' ? 0.7 : 0.34));
    G.shake = Math.min(0.5, G.shake + (def.kind === 'sniper' ? 0.3 : 0.06));
  }
}

function onKill(shooter, victim, headshot) {
  shooter.kills += 1;
  victim.deaths += 1;
  if (shooter.money !== undefined) shooter.money += 300;
  hud.killfeed(shooter, victim, shooter.weapon.def.name, headshot);
  if (victim === G.carrier) {
    // the charge passes to the nearest living Ember operator
    let best = null, bestD = Infinity;
    for (const a of actors) {
      if (a.team !== 'ember' || !a.alive || a === victim) continue;
      const d = a.pos.distanceTo(victim.pos);
      if (d < bestD) { bestD = d; best = a; }
    }
    G.carrier = best;
    if (best?.isPlayer) hud.banner('YOU HAVE THE CHARGE', 'Get to a site and hold E to plant', 2400, '#ffcf3f');
    else if (best) hud.banner('CHARGE RECOVERED', `${best.name} carries the charge now`, 1800);
  }
  if (victim.isPlayer) {
    hud.banner('YOU ARE DOWN', 'Your team fights on — watch the round out', 3000, '#e23b2e');
  }
  checkRoundEnd();
}

// --- round / match flow ---------------------------------------------------------------------
function aliveCount(team) { return actors.filter((a) => a.team === team && a.alive).length; }

function checkRoundEnd() {
  if (G.phase !== 'live') return;
  const emb = aliveCount('ember');
  const sbl = aliveCount('sable');
  if (sbl === 0) return endRound('ember', G.planted ? 'Sable Guard eliminated' : 'Sable Guard eliminated');
  if (emb === 0 && !G.planted) return endRound('sable', 'Ember Watch eliminated');
}

function endRound(winner, reason) {
  if (G.phase !== 'live') return;
  G.phase = 'roundEnd';
  G.phaseT = 4.6;
  G.score[winner] += 1;
  const loser = winner === 'ember' ? 'sable' : 'ember';
  G.lossStreak[winner] = 0;
  G.lossStreak[loser] += 1;
  const objectiveWin = /charge|defus|detonat/i.test(reason);
  for (const a of actors) {
    if (a.money === undefined) continue;
    if (a.team === winner) a.money += objectiveWin ? 3500 : 3250;
    else a.money += 1900 + Math.min(1000, (G.lossStreak[loser] - 1) * 500);
    if (G.planted && a.team === 'ember' && winner !== 'ember') a.money += 800; // planted but lost
    a.money = Math.min(16000, a.money);
  }
  const mine = winner === 'ember';
  hud.banner(
    mine ? 'ROUND WON' : 'ROUND LOST',
    `${TEAMS[winner].name} — ${reason} · ${G.score.ember} : ${G.score.sable}`,
    4200,
    mine ? '#7dc95e' : '#e23b2e',
  );
  if (player.alive) { if (mine) sfx.roundWin(); else sfx.roundLose(); }
  hud.setScore(G.score.ember, G.score.sable, G.round);
  hud.plantBar(null);
  chargeMesh.visible = false;
}

function startMatch() {
  G.score = { ember: 0, sable: 0 };
  G.round = 1;
  G.lossStreak = { ember: 0, sable: 0 };
  for (const a of actors) {
    a.money = 800;
    a.kills = 0;
    a.deaths = 0;
    if (a.isPlayer) {
      a.weapon = new WeaponState('sparrow');
      player.hasArmor = false;
      player.armor = 0;
    } else {
      a.weapon = new WeaponState('sparrow');
      a.hasArmor = false;
      a.armor = 0;
      a.setGunMesh();
    }
  }
  setViewmodel('sparrow');
  startRound();
}

function startRound() {
  G.phase = 'buy';
  G.phaseT = 15;
  G.roundTime = 100;
  G.planted = null;
  G.intel = null;
  G.plantChannel = 0;
  G.targetSite = Math.random() < 0.5 ? 'A' : 'B';
  // survivors keep their kit; the fallen re-kit to a sidearm
  for (const a of actors) {
    if (!a.alive) {
      if (a.isPlayer) {
        a.weapon = new WeaponState('sparrow');
        player.hasArmor = false;
        player.armor = 0;
        setViewmodel('sparrow');
      } else {
        a.weapon = new WeaponState('sparrow');
        a.hasArmor = false;
        a.armor = 0;
        a.setGunMesh();
      }
    }
  }
  // spawns
  const eSpawns = world.spawns.ember;
  const sSpawns = world.spawns.sable;
  player.reset(eSpawns[0], -Math.PI / 2);
  input.state.yaw = -Math.PI / 2;
  input.state.pitch = 0;
  let ei = 1, si = 0;
  for (const b of bots) {
    if (b.team === 'ember') { b.reset(eSpawns[ei++ % eSpawns.length], -Math.PI / 2, world); }
    else { b.reset(sSpawns[si++ % sSpawns.length], Math.PI / 2, world); }
  }
  // the charge goes to a random Ember bot (the player escorts)
  const emberBots = bots.filter((b) => b.team === 'ember');
  G.carrier = emberBots[(Math.random() * emberBots.length) | 0];
  // bot shopping + routes
  for (const b of bots) {
    b.autoBuy();
    planBot(b);
  }
  chargeMesh.visible = false;
  hud.setScore(G.score.ember, G.score.sable, G.round);
  hud.setChargeTag(false);
  hud.banner(`ROUND ${G.round}`, `Ember Watch attacks Site ${G.targetSite} · buy phase — press B`, 3400);
  hud.setObjective(`<b>Buy phase.</b> Spend wisely — press <b>B</b>. Ember attacks <b>Site ${G.targetSite}</b> this round.`);
  openBuy();
}

// Per-bot round plan: which site, which lane, which guard post.
function planBot(b) {
  const siteNode = G.targetSite === 'A' ? 'a_site' : 'b_site';
  if (b.team === 'ember') {
    b.plan = { site: G.targetSite };
    b.setPathTo(world, siteNode);
  } else {
    // defenders: 2 to A, 2 to B, 1 mid — by roster order
    const idx = bots.filter((x) => x.team === 'sable').indexOf(b);
    const post = ['a_site', 'a_site', 'b_site', 'b_site', 'mid_e'][idx] ?? 'mid_e';
    b.plan = { site: post === 'a_site' ? 'A' : post === 'b_site' ? 'B' : 'MID', post };
    b.setPathTo(world, post);
  }
}

// What bots.js asks each step: where to go, or what to channel.
const _siteCenter = new THREE.Vector3();
function objectiveFor(bot) {
  if (G.phase === 'buy' || G.phase === 'roundEnd' || G.phase === 'menu') {
    return { pos: bot.pos.clone() };
  }
  const siteOf = (id) => world.sites.find((s) => s.id === id);
  if (G.planted) {
    const site = G.planted.site;
    _siteCenter.copy(site.center);
    if (bot.team === 'ember') {
      // hold a ring around the planted charge
      const ang = (bot.id % 5) * 1.7 + 0.6;
      return { pos: new THREE.Vector3(site.center.x + Math.cos(ang) * 6.5, 0, site.center.z + Math.sin(ang) * 6.5), faceYaw: Math.atan2(-(site.center.x - bot.pos.x), -(site.center.z - bot.pos.z)) };
    }
    // sable: converge and defuse
    const inSite = bot.pos.distanceTo(site.center) < site.radius;
    if (inSite) {
      const enemiesNear = actors.some((a) => a.team === 'ember' && a.alive && a.pos.distanceTo(bot.pos) < 9);
      if (!enemiesNear) {
        return {
          pos: bot.pos.clone(), channel: 'defuse', channelTime: 5,
          inRange: () => true,
          done: () => { G.planted = null; endRound('sable', 'Charge defused'); },
        };
      }
    }
    if (!bot.pathSite || bot.pathSite !== site.id) {
      bot.pathSite = site.id;
      bot.setPathTo(world, site.id === 'A' ? 'a_site' : 'b_site');
    }
    return { pos: site.center.clone() };
  }
  if (bot.team === 'ember') {
    const site = siteOf(G.targetSite);
    if (bot === G.carrier) {
      const inSite = bot.pos.distanceTo(site.center) < site.radius - 1;
      if (inSite) {
        return {
          pos: site.center.clone(), channel: 'plant', channelTime: 4,
          inRange: () => bot.pos.distanceTo(site.center) < site.radius,
          done: () => doPlant(bot, site),
        };
      }
      return { pos: site.center.clone() };
    }
    // escorts take cover positions a few units short of the site heart
    const ang = (bot.id % 4) * 1.9 + 0.4;
    return { pos: new THREE.Vector3(site.center.x + Math.cos(ang) * 5.2, 0, site.center.z + Math.sin(ang) * 5.2) };
  }
  // sable, no plant yet: guard the assigned post; rotate on intel
  const post = G.intel && bot.plan?.post === 'mid_e' ? (G.intel === 'A' ? 'a_site' : 'b_site') : bot.plan?.post ?? 'mid_e';
  if (bot.pathSite !== post) {
    bot.pathSite = post;
    bot.setPathTo(world, post);
  }
  const node = world.waypoints[post];
  return { pos: node ? node.pos.clone() : bot.pos.clone(), faceYaw: bot.team === 'sable' ? Math.PI / 2 : -Math.PI / 2 };
}

function doPlant(by, site) {
  G.planted = { site, fuse: 40, pos: site.center.clone() };
  if (by.money !== undefined) by.money += 300;
  chargeMesh.position.copy(site.center);
  chargeMesh.visible = true;
  sfx.planted();
  hud.banner('CHARGE PLANTED', `Site ${site.id} — detonation in 40 seconds`, 2600, '#ffcf3f');
  hud.setObjective('<b>Charge planted!</b> Ember: hold the site. It blows in <b>40 s</b>.');
  for (const b of bots) b.pathSite = null;
}

// --- buy phase UI --------------------------------------------------------------------------
function openBuy() {
  G.buyOpen = true;
  refreshBuy();
  hud.showBuy({ money: playerActor.money, ownedId: playerActor.weapon.id, hasArmor: player.hasArmor, timeLeft: G.phaseT });
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeBuy() {
  G.buyOpen = false;
  hud.hideBuy();
}

// --- player actions ----------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE') G.useHeld = true;
  if (e.code === 'Tab') hud.showScoreboard(actors, `ASHFALL PROTOCOL — ROUND ${G.round}`);
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyE') G.useHeld = false;
  if (e.code === 'Tab') hud.hideScoreboard();
});

let prevFiring = false;
let prevReload = false;
const _camDir = new THREE.Vector3();
const _origin = new THREE.Vector3();

function currentSpreadDeg(def) {
  const move = player.groundSpeed() / 5.3;
  let deg = THREE.MathUtils.lerp(def.spreadHip, def.spreadAds, G.adsFactor);
  deg += def.moveSpread * move;
  if (player.airborne()) deg += 2.4;
  if (player.crouching) deg *= 0.55;
  else if (input.state.walk) deg *= 0.75;
  return deg;
}

function playerShoot() {
  const w = playerActor.weapon;
  const def = w.def;
  camera.getWorldDirection(_camDir);
  const spread = currentSpreadDeg(def) * Math.PI / 180;
  const right = new THREE.Vector3().crossVectors(_camDir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, _camDir).normalize();
  for (let p = 0; p < def.pellets; p++) {
    const d = _camDir.clone();
    const a = (Math.random() - 0.5) * 2 * spread;
    const b = (Math.random() - 0.5) * 2 * spread;
    d.addScaledVector(right, a).addScaledVector(up, b).normalize();
    player.eyePos(_origin);
    fireHitscan(playerActor, _origin.clone(), d, true);
  }
  w.consume();
}

function stepPlayer(dt) {
  const w = playerActor.weapon;
  w.update(dt);
  const canAct = G.phase === 'live' && player.alive && input.state.locked;
  // ADS
  const wantAds = canAct && input.state.aiming;
  G.adsFactor += ((wantAds ? 1 : 0) - G.adsFactor) * Math.min(1, dt * 11);
  // reload
  if (canAct && input.state.reload && !prevReload) {
    if (w.startReload()) sfx.reload();
  }
  prevReload = input.state.reload;
  // fire
  const firing = canAct && input.state.firing;
  if (firing) {
    if (w.canFire() && (w.def.auto || !prevFiring)) {
      playerShoot();
      if (w.mag === 0 && w.reserve > 0) w.startReload();
    } else if (w.mag === 0 && !w.reloading && prevFiring === false) {
      sfx.dryFire();
      if (w.reserve > 0) w.startReload();
    }
  }
  prevFiring = input.state.firing;
  // (planting is handled in step(), which owns the phase timers)
  // movement
  player.syncLook(input.state);
  player.update(dt, input.state, G.phase !== 'live' || !input.state.locked);
  if (player.footstep && G.phase === 'live') sfx.step(0.7);
  if (!player.alive) {
    camera.position.y = player.pos.y + 0.45;
    camera.rotation.z = 0.32;
  }
  // camera recoil + shake
  G.recoil = Math.max(0, G.recoil - dt * 5.2);
  G.shake = Math.max(0, G.shake - dt * 2.4);
  camera.rotation.x += G.recoil * 0.028;
  if (G.shake > 0.01) {
    camera.rotation.z += (Math.random() - 0.5) * G.shake * 0.03;
    camera.rotation.x += (Math.random() - 0.5) * G.shake * 0.02;
  }
  // viewmodel pose
  if (viewmodel) {
    const def = w.def;
    const scoped = def.kind === 'sniper' && G.adsFactor > 0.72;
    viewmodel.visible = !scoped && player.alive;
    const bobT = performance.now() / 1000;
    const spd = player.groundSpeed();
    const bobA = Math.min(1, spd / 5) * 0.012;
    const hip = { x: 0.27, y: -0.24, z: -0.45 };
    const ads = { x: 0, y: -0.163, z: -0.38 };
    const t = G.adsFactor;
    viewmodel.position.set(
      THREE.MathUtils.lerp(hip.x, ads.x, t) + Math.sin(bobT * 7.2) * bobA,
      THREE.MathUtils.lerp(hip.y, ads.y, t) + Math.abs(Math.cos(bobT * 7.2)) * bobA * 0.7 - (w.reloading ? Math.sin(Math.min(1, 1 - w.reloadLeft / def.reloadTime) * Math.PI) * 0.16 : 0),
      THREE.MathUtils.lerp(hip.z, ads.z, t) + G.recoil * 0.07,
    );
    viewmodel.rotation.x = G.recoil * 0.14 - (w.reloading ? Math.sin(Math.min(1, 1 - w.reloadLeft / def.reloadTime) * Math.PI) * 0.45 : 0);
    const targetFov = 74 / THREE.MathUtils.lerp(1, def.zoom, G.adsFactor);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
      camera.updateProjectionMatrix();
    }
    hud.setScope(scoped);
    hud.setCrosshairVisible(!scoped && player.alive);
  }
}

// --- the simulation step ---------------------------------------------------------------------------
const gameAPI = {
  world,
  actors,
  get phase() { return G.phase; },
  get plantedSite() { return G.planted?.site ?? null; },
  fireHitscan,
  objectiveFor,
};

let beepT = 0;
let minimapT = 0;

function step(dt) {
  // phase timers
  if (G.phase === 'buy') {
    G.phaseT -= dt;
    if (G.buyOpen) refreshBuy();
    if (input.consumePress('KeyB')) { if (G.buyOpen) closeBuy(); else openBuy(); }
    if (G.buyOpen) {
      for (const item of BUY_ITEMS) if (input.consumePress(item.key)) buyItem(item.id);
    }
    if (G.phaseT <= 0) {
      G.phase = 'live';
      closeBuy();
      hud.setObjective(`<b>Round live.</b> Ember Watch attacks <b>Site ${G.targetSite}</b> — eliminate the Sable Guard or plant the charge.`);
      if (!input.state.locked && !SHOT) hud.banner('CLICK TO TAKE CONTROL', 'The round is live — your team is moving', 0);
    }
  } else if (G.phase === 'live') {
    if (!G.planted) {
      G.roundTime -= dt;
      if (G.roundTime <= 0) { G.roundTime = 0; endRound('sable', 'Time expired — the sites held'); }
    } else {
      G.planted.fuse -= dt;
      beepT -= dt;
      const interval = G.planted.fuse > 20 ? 1 : G.planted.fuse > 10 ? 0.5 : 0.25;
      if (beepT <= 0) {
        beepT = interval;
        sfx.plantBeep(vol(player.pos.distanceTo(G.planted.pos)) * 0.9 + 0.15);
        chargeMesh.userData.lamp.material.emissiveIntensity = 4;
      }
      chargeMesh.userData.lamp.material.emissiveIntensity = Math.max(0.6, chargeMesh.userData.lamp.material.emissiveIntensity - dt * 9);
      if (G.planted.fuse <= 0) {
        const at = G.planted.pos.clone();
        G.planted = null;
        sfx.explosion(1);
        flashLight.position.copy(at).y = 2;
        flashLight.intensity = 300;
        G.shake = Math.min(1.2, 26 / Math.max(6, player.pos.distanceTo(at)));
        spawnPuff(at, 0xff9a3c);
        endRound('ember', 'Charge detonated');
      }
    }
    // player planting with E
    if (G.carrier === playerActor && player.alive && !G.planted) {
      const site = world.sites.find((s) => s.id === G.targetSite);
      const inSite = site && player.pos.distanceTo(site.center) < site.radius;
      if (inSite && G.useHeld && input.state.locked) {
        G.plantChannel += dt;
        hud.plantBar('PLANTING CHARGE…', G.plantChannel / 4);
        if (G.plantChannel >= 4) {
          G.plantChannel = 0;
          doPlant(playerActor, site);
        }
      } else {
        G.plantChannel = Math.max(0, G.plantChannel - dt * 2);
        if (inSite) hud.plantBar('HOLD E TO PLANT', 0);
      }
    }
    // sable intel: any defender with eyes on an attacker marks the site
    for (const b of bots) {
      if (b.team === 'sable' && b.target && !G.intel) {
        G.intel = b.target.pos.z < 0 ? 'A' : 'B';
      }
    }
  } else if (G.phase === 'roundEnd') {
    G.phaseT -= dt;
    if (G.phaseT <= 0) {
      if (G.score.ember >= 7 || G.score.sable >= 7 || G.round >= 13) {
        G.phase = 'matchEnd';
        G.winner = G.score.ember > G.score.sable ? 'ember' : 'sable';
        document.exitPointerLock?.();
        document.getElementById('end-title').textContent =
          G.winner === 'ember' ? 'VICTORY — COMPOUND TAKEN' : 'DEFEAT — COMPOUND HELD';
        document.getElementById('end-sub').textContent =
          `Final score Ember Watch ${G.score.ember} : ${G.score.sable} Sable Guard · You: ${playerActor.kills} kills, ${playerActor.deaths} deaths.`;
        document.getElementById('endscreen').style.display = 'grid';
      } else {
        G.round += 1;
        startRound();
      }
    }
  }

  // actors
  if (G.phase !== 'menu' && G.phase !== 'matchEnd') {
    stepPlayer(dt);
    for (const b of bots) updateBot(b, dt, gameAPI);
  }
  updateFx(dt);

  // HUD refresh
  if (G.phase !== 'menu') {
    hud.setVitals(player.health, player.armor, player.hasArmor);
    hud.setWeapon(playerActor.weapon.def.name, playerActor.weapon.mag, playerActor.weapon.reserve,
      playerActor.weapon.reloading, playerActor.weapon.mag === 0 && playerActor.weapon.reserve > 0);
    hud.setMoney(playerActor.money);
    if (G.phase === 'buy') hud.setTimer(G.phaseT, 'buy');
    else if (G.planted) hud.setTimer(G.planted.fuse, 'planted');
    else hud.setTimer(G.roundTime, 'live');
    hud.setCrosshairSpread(currentSpreadDeg(playerActor.weapon.def));
    hud.setChargeTag(G.carrier === playerActor && player.alive && !G.planted);
    minimapT -= dt;
    if (minimapT <= 0) {
      minimapT = 0.12;
      hud.drawMinimap(world, actors, player, G.planted?.site.id ?? null);
    }
  }
}

// --- UI wiring -----------------------------------------------------------------------------------
document.getElementById('play-btn').addEventListener('click', () => {
  wakeAudio();
  document.getElementById('startscreen').style.display = 'none';
  startMatch();
  input.lock();
});
document.getElementById('again-btn').addEventListener('click', () => {
  wakeAudio();
  document.getElementById('endscreen').style.display = 'none';
  startMatch();
  input.lock();
});
document.addEventListener('pointerlockchange', () => {
  if (input.state.locked) {
    if (hud.els.banner.textContent === 'CLICK TO TAKE CONTROL') hud.hideBanner();
  } else if (G.phase === 'live' && !SHOT) {
    hud.banner('CLICK TO TAKE CONTROL', 'The round is live — your team is moving', 0);
  }
});
renderer.domElement.addEventListener('click', () => {
  wakeAudio();
  if ((G.phase === 'live' || G.phase === 'roundEnd') && !input.state.locked) input.lock();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- screenshot modes ------------------------------------------------------------------------------
// Deterministic posed frames for the kit's shots.json: ?shot=start|play|buy|end&seed=N.
// The simulation never runs; actors are placed by hand, a few frames render,
// then window.__shotReady tells the capture tool the frame is final.
function poseBot(bot, x, z, yaw, alive = true) {
  bot.reset(new THREE.Vector3(x, 0, z), yaw, world);
  bot.alive = alive;
  if (!alive) { bot.deadTimer = 2.5; }
  bot.syncMesh(0.1);
}
function posePlayer(x, z, yaw, pitch = 0) {
  player.reset(new THREE.Vector3(x, 0, z), yaw);
  player.pitch = pitch;
  input.state.yaw = yaw;
  input.state.pitch = pitch;
  player.syncLook(input.state);
  player.update(0.016, { forward: false, back: false, left: false, right: false, jump: false, crouch: false, walk: false, reload: false }, true);
}

let shotRefresh = null;
function setupShot(mode) {
  document.getElementById('startscreen').style.display = 'none';
  G.phase = 'shot';
  const ember = bots.filter((b) => b.team === 'ember');
  const sable = bots.filter((b) => b.team === 'sable');
  if (mode === 'start') {
    setViewmodel('longbow');
    posePlayer(-23, 0, -Math.PI / 2);
    poseBot(ember[0], -13, -4, -Math.PI / 2);
    poseBot(ember[1], -11, 3.5, -Math.PI / 2);
    poseBot(ember[2], -16, 7.5, -Math.PI / 2);
    poseBot(ember[3], -17, -8, -Math.PI / 2);
    poseBot(sable[0], 6, -6, Math.PI / 2);
    poseBot(sable[1], 10, 4, Math.PI / 2);
    poseBot(sable[2], 2, 12, Math.PI / 2);
    poseBot(sable[3], 14, -2, Math.PI / 2);
    poseBot(sable[4], 4, -14, Math.PI / 2);
    hud.setScore(0, 0, 1);
    hud.setTimer(100, 'live');
    hud.setVitals(100, 0, false);
    hud.setWeapon('VK-7 Longbow', 30, 90, false, false);
    hud.setMoney(800);
    hud.setObjective('<b>Round live.</b> Ember Watch attacks <b>Site A</b> — eliminate the Sable Guard or plant the charge.');
  } else if (mode === 'play') {
    setViewmodel('longbow');
    playerActor.weapon = new WeaponState('longbow');
    posePlayer(17, 3, Math.atan2(-(29 - 17), -(-3 - 3)), -0.02);
    player.health = 68;
    player.hasArmor = true;
    player.armor = 55;
    poseBot(sable[3], 29, -3, Math.atan2(-(17 - 29), -(3 + 3)));      // Warden, firing at the player
    poseBot(sable[0], 44, -26, Math.PI / 2);
    poseBot(sable[1], 37, 6, Math.PI * 0.65);
    poseBot(sable[2], 39, 30, Math.PI / 2);
    poseBot(sable[4], 6, -22, Math.PI * 0.4);
    poseBot(ember[0], 12, 9.5, -Math.PI / 2.4);
    poseBot(ember[1], 6, -2, -Math.PI / 2);
    poseBot(ember[2], -6, 16, -Math.PI / 2);
    poseBot(ember[3], 20, 22, -Math.PI / 1.6);
    // the firefight, frozen: Warden's tracer + muzzle flash sprite (a light
    // at this range would blow the bot out to white, so the sprite sells it)
    const gunAt = new THREE.Vector3(29 - Math.sin(sable[3].yaw) * 0.5, 1.34, -3 - Math.cos(sable[3].yaw) * 0.5);
    spawnTracer(gunAt, new THREE.Vector3(17.8, 1.25, 2.2), 0xa0e8ff);
    flashSprite.position.copy(gunAt);
    flashSprite.visible = true;
    flashLight.position.copy(gunAt);
    flashLight.intensity = 7;
    hud.pinHitmarker(false);
    // re-applied on the last frame before capture: the feed entries expire
    // on wall-clock timers, and a slow first render could age them out
    shotRefresh = () => {
      hud.killfeed({ name: 'Vex', team: 'ember' }, { name: 'Husk', team: 'sable' }, 'VK-7 Longbow', false);
      hud.killfeed({ name: 'Talon', team: 'sable' }, { name: 'Rook', team: 'ember' }, 'Raptor-9 SMG', true);
      hud.pinHitmarker(false);
    };
    hud.setScore(3, 2, 6);
    hud.setTimer(47, 'live');
    hud.setVitals(68, 55, true);
    hud.setWeapon('VK-7 Longbow', 24, 90, false, false);
    hud.setMoney(3450);
    hud.setCrosshairSpread(1.4);
    hud.setObjective('<b>Round live.</b> Contact at mid — Sable Guard holds Sites <b>A</b> and <b>B</b>.');
    hud.drawMinimap(world, actors, player, null);
  } else if (mode === 'buy') {
    setViewmodel('sparrow');
    posePlayer(-38, 0, -Math.PI / 2);
    ember.forEach((b, i) => poseBot(b, -49 + (i % 2) * 3, -4 + i * 2.4, -Math.PI / 2));
    sable.forEach((b, i) => poseBot(b, 49, -4 + i * 2, Math.PI / 2));
    hud.setScore(4, 3, 8);
    hud.setTimer(9, 'buy');
    hud.setVitals(100, 100, true);
    hud.setWeapon('P9 Sparrow', 12, 96, false, false);
    hud.setMoney(4200);
    hud.showBuy({ money: 4200, ownedId: 'sparrow', hasArmor: false, timeLeft: 9 });
    hud.setObjective('<b>Buy phase.</b> Ember leads 4 : 3 — a rifle round wins this.');
    hud.drawMinimap(world, actors, player, null);
  } else { // end
    setViewmodel('longbow');
    posePlayer(2, 10, Math.atan2(-(16 - 2), -(0 - 10)));
    poseBot(ember[0], 6, -3, -Math.PI / 2);
    poseBot(ember[1], 11, 11, -Math.PI / 1.8);
    poseBot(ember[2], 15, 3, -Math.PI / 2.2);
    poseBot(ember[3], 12, -6, -Math.PI / 2);
    poseBot(sable[0], 14, -2, Math.PI / 2, false);
    poseBot(sable[1], 18, 7, Math.PI / 2, false);
    poseBot(sable[2], 11, 12, Math.PI / 2, false);
    poseBot(sable[3], 22, -8, Math.PI / 2, false);
    poseBot(sable[4], 16, 1, Math.PI / 2, false);
    hud.setScore(6, 4, 11);
    hud.setTimer(0, 'live');
    hud.setVitals(42, 20, true);
    hud.setWeapon('VK-7 Longbow', 17, 60, false, false);
    hud.setMoney(5650);
    hud.banner('ROUND WON', 'Sable Guard eliminated · Ember Watch 6 : 4 Sable Guard', 0, '#7dc95e');
    hud.setObjective('<b>Match point next round.</b> One more and the compound falls.');
    hud.drawMinimap(world, actors, player, null);
  }
  if (mode === 'start') hud.drawMinimap(world, actors, player, null);
}

// --- boot + loop --------------------------------------------------------------------------------------
if (SHOT) {
  setupShot(SHOT);
  let frames = 0;
  (function shotLoop() {
    renderer.render(scene, camera);
    frames += 1;
    if (frames === 3 && shotRefresh) shotRefresh();
    if (frames >= 4) { window.__shotReady = true; return; }
    requestAnimationFrame(shotLoop);
  })();
} else {
  // menu backdrop: posed spawns + a slow overlook of mid
  bots.forEach((b, i) => {
    const s = b.team === 'ember' ? world.spawns.ember[i % 5] : world.spawns.sable[i % 5];
    b.reset(s, b.team === 'ember' ? -Math.PI / 2 : Math.PI / 2, world);
  });
  player.pos.set(-53, 0, 0);
  let last = performance.now();
  let acc = 0;
  (function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (G.phase === 'menu') {
      const t = now / 1000;
      camera.position.set(Math.sin(t * 0.05) * 6 - 2, 8.5, 26 + Math.cos(t * 0.04) * 3);
      camera.lookAt(12, 0.5, -8);
      for (const b of bots) b.syncMesh(dt);
    } else {
      acc += dt;
      const STEP = 1 / 60;
      let n = 0;
      while (acc >= STEP && n < 5) { step(STEP); acc -= STEP; n += 1; }
      if (n === 5) acc = 0;
    }
    renderer.render(scene, camera);
  })(performance.now());
}
