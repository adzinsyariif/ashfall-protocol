// Bot soldiers: low-poly troopers built from boxes in team colours, and
// the AI that runs them — waypoint navigation over the map graph, line-of-
// sight perception, burst-fire combat with human-like reaction delays and
// aim error, and objective play (the Ember carrier plants the breach
// charge; Sable defenders hold sites and defuse). Difficulty is tuned so
// standing still and aiming beats running and spraying — for both sides.
import * as THREE from 'three';
import { TEAMS } from './palette.js';
import { WeaponState, WEAPONS, buildWorldGun } from './weapons.js';
import { collide, findPath, nearestNode } from './world.js';

export const EMBER_NAMES = ['Vex', 'Onyx', 'Rook', 'Pyre'];
export const SABLE_NAMES = ['Husk', 'Mire', 'Talon', 'Warden', 'Cipher'];

const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a183, roughness: 0.8 });
const bootMat = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.9 });

export function buildBotMesh(teamId) {
  const team = TEAMS[teamId];
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: team.dark, roughness: 0.9 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.8, 0.2), dark);
  legL.position.set(-0.13, 0.4, 0);
  const legR = legL.clone();
  legR.position.x = 0.13;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.3), cloth);
  torso.position.y = 1.14;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.4, 0.36), dark);
  vest.position.y = 1.16;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), skinMat);
  head.position.y = 1.66;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.36), dark);
  helmet.position.y = 1.86;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.2, metalness: 0.6 }));
  visor.position.set(0, 1.68, -0.16);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), cloth);
  armL.position.set(-0.34, 1.18, -0.08);
  armL.rotation.x = -0.7;
  const armR = armL.clone();
  armR.position.x = 0.34;
  g.add(legL, legR, torso, vest, head, helmet, visor, armL, armR);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  g.userData.parts = { legL, legR, torso, head };
  return g;
}

let botSeq = 0;

export class Bot {
  constructor(team, name, skill, scene) {
    this.id = ++botSeq;
    this.isPlayer = false;
    this.team = team;
    this.name = name;
    this.skill = skill;               // 0..1, scales aim error and reaction
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.health = 100;
    this.armor = 0;
    this.hasArmor = false;
    this.alive = true;
    this.money = 800;
    this.weapon = new WeaponState('sparrow');
    this.kills = 0;
    this.deaths = 0;
    this.mesh = buildBotMesh(team);
    this.gunSlot = new THREE.Group();
    this.gunSlot.position.set(0.18, 1.32, -0.3);
    this.mesh.add(this.gunSlot);
    this.setGunMesh();
    scene.add(this.mesh);
    // ai state
    this.path = [];
    this.pathIdx = 0;
    this.target = null;               // current enemy actor
    this.reaction = 0;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.strafeDir = 1;
    this.strafeTimer = 0;
    this.scanTimer = Math.random() * 0.15;
    this.mode = 'advance';            // advance | hold | plant | defuse | engage
    this.holdPos = null;
    this.channel = 0;                 // plant/defuse progress seconds
    this.walkPhase = Math.random() * 6;
    this.deadTimer = 0;
  }

  setGunMesh() {
    while (this.gunSlot.children.length) this.gunSlot.remove(this.gunSlot.children[0]);
    this.gunSlot.add(buildWorldGun(this.weapon.def.kind));
  }

  reset(spawn, yaw, world) {
    this.pos.copy(spawn);
    this.yaw = yaw;
    this.health = 100;
    this.alive = true;
    this.target = null;
    this.path = [];
    this.mode = 'advance';
    this.channel = 0;
    this.deadTimer = 0;
    this.mesh.visible = true;
    this.mesh.rotation.set(0, 0, 0);
    this.syncMesh(0);
    if (world) collide(world.colliders, this.pos, 0.42);
  }

  eyePos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + 1.62, this.pos.z); }
  chestPos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + 1.15, this.pos.z); }
  headPos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + 1.66, this.pos.z); }

  takeDamage(dmg) {
    if (!this.alive) return 0;
    let applied = dmg;
    if (this.hasArmor && this.armor > 0) {
      const absorbed = dmg * 0.45;
      applied = dmg - absorbed;
      this.armor = Math.max(0, this.armor - absorbed);
    }
    this.health -= applied;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      // deaths are counted once, centrally, by the kill feed in main.js
    }
    return applied;
  }

  // Spend money like a sensible player: armour with a rifle first, then
  // the best gun affordable, keeping a small reserve.
  autoBuy() {
    const want = ['longbow', 'raptor', 'mule'];
    if (!this.hasArmor && this.money >= 650 + 1400) {
      this.money -= 650;
      this.hasArmor = true;
      this.armor = 100;
    }
    for (const id of want) {
      if (this.weapon.id !== id && this.money >= WEAPONS[id].price && WEAPONS[id].price > (WEAPONS[this.weapon.id]?.price ?? 0)) {
        this.money -= WEAPONS[id].price;
        this.weapon = new WeaponState(id);
        this.setGunMesh();
        break;
      }
    }
    if (!this.hasArmor && this.money >= 650 && this.weapon.id !== 'sparrow') {
      this.money -= 650;
      this.hasArmor = true;
      this.armor = 100;
    }
    if (this.money >= 4750 && this.skill > 0.72 && this.weapon.id !== 'needle') {
      this.money -= 4750;
      this.weapon = new WeaponState('needle');
      this.setGunMesh();
    }
  }

  setPathTo(world, nodeName) {
    const from = nearestNode(world.waypoints, this.pos);
    this.path = findPath(world.waypoints, from, nodeName);
    this.pathIdx = 0;
    // if the first point is basically where we stand, skip it
    if (this.path.length > 1 && this.path[0].distanceTo(this.pos) < 2) this.pathIdx = 1;
  }

  syncMesh(dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    if (!this.alive) {
      // fall over and sink slightly once settled
      this.mesh.rotation.x = -Math.PI / 2 * Math.min(1, this.deadTimer * 2.2);
      this.mesh.position.y = 0.18 * Math.min(1, this.deadTimer * 2.2);
      return;
    }
    const parts = this.mesh.userData.parts;
    const speed = this._speed ?? 0;
    this.walkPhase += dt * speed * 2.4;
    const swing = Math.sin(this.walkPhase) * 0.5 * Math.min(1, speed / 4);
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = -swing;
  }
}

// --- the brain ---------------------------------------------------------------
// main.js supplies `game`: { world, actors, phase, plantedSite,
// fireHitscan(shooter, origin, dir), tryPlant(bot), tryDefuse(bot) }.
const _ray = new THREE.Raycaster();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export function losClear(world, from, to) {
  _v1.copy(to).sub(from);
  const dist = _v1.length();
  if (dist < 0.01) return true;
  _ray.set(from, _v1.normalize());
  _ray.far = dist - 0.5;
  const hits = _ray.intersectObjects(world.solids, false);
  return hits.length === 0;
}

function yawToward(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

function turnToward(bot, targetYaw, dt, rate = 10) {
  let d = targetYaw - bot.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  bot.yaw += d * Math.min(1, rate * dt);
}

export function updateBot(bot, dt, game) {
  const world = game.world;
  if (!bot.alive) {
    bot.deadTimer += dt;
    bot._speed = 0;
    bot.syncMesh(dt);
    return;
  }
  bot.weapon.update(dt);
  if (bot.weapon.needsReload()) bot.weapon.startReload();

  // --- perception -----------------------------------------------------------
  bot.scanTimer -= dt;
  if (bot.scanTimer <= 0) {
    bot.scanTimer = 0.12 + Math.random() * 0.06;
    let best = null;
    let bestD = 68;
    const eye = bot.eyePos(_v2);
    for (const a of game.actors) {
      if (a === bot || !a.alive || a.team === bot.team) continue;
      const d = a.pos.distanceTo(bot.pos);
      if (d > bestD) continue;
      if (losClear(world, eye, a.chestPos(new THREE.Vector3()))) {
        best = a;
        bestD = d;
      }
    }
    if (best && bot.target !== best) {
      bot.target = best;
      bot.reaction = THREE.MathUtils.lerp(0.55, 0.26, bot.skill) * (0.8 + Math.random() * 0.5);
      bot.seenFor = 0;
    } else if (!best) {
      bot.target = null;
    }
  }
  if (bot.target && !bot.target.alive) bot.target = null;
  if (bot.target) bot.seenFor = (bot.seenFor ?? 0) + dt;

  let moveX = 0, moveZ = 0, speed = 0;

  if (bot.target && game.phase === 'live') {
    // --- combat: face the enemy, strafe, fire in bursts ---------------------
    const t = bot.target;
    turnToward(bot, yawToward(bot.pos, t.pos), dt, 12);
    bot.strafeTimer -= dt;
    if (bot.strafeTimer <= 0) {
      bot.strafeTimer = 0.6 + Math.random() * 0.9;
      bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
      if (Math.random() < 0.25) bot.strafeDir = 0;
    }
    const dist = t.pos.distanceTo(bot.pos);
    const ideal = bot.weapon.def.kind === 'sniper' ? 34 : bot.weapon.def.kind === 'scatter' ? 11 : 19;
    const away = dist < ideal - 5 ? -1 : dist > ideal + 7 ? 1 : 0;
    const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
    const rx = Math.cos(bot.yaw), rz = -Math.sin(bot.yaw);
    moveX = rx * bot.strafeDir + fx * away;
    moveZ = rz * bot.strafeDir + fz * away;
    speed = 2.3;

    if (bot.reaction > 0) bot.reaction -= dt;
    else if (bot.weapon.canFire()) {
      if (bot.burstLeft <= 0) {
        if (bot.burstPause > 0) {
          bot.burstPause -= dt;
        } else {
          const kind = bot.weapon.def.kind;
          bot.burstLeft = kind === 'smg' ? 4 + (Math.random() * 5 | 0)
            : kind === 'rifle' ? 3 + (Math.random() * 3 | 0)
            : 1 + (Math.random() * 2 | 0);
          if (kind === 'sniper' || kind === 'scatter' || kind === 'pistol') bot.burstLeft = 1;
        }
      }
      if (bot.burstLeft > 0 && bot.burstPause <= 0) {
        // aim: chest mostly, sometimes head; error shrinks the longer the
        // target has been tracked and grows with distance and target speed
        const aimHead = Math.random() < 0.22;
        const aim = aimHead ? t.headPos(new THREE.Vector3()) : t.chestPos(new THREE.Vector3());
        const settle = bot.seenFor > 0.45 ? 0.55 : 1;
        let errDeg = THREE.MathUtils.lerp(3.4, 1.15, bot.skill) * settle;
        if ((t.groundSpeed ? t.groundSpeed() : 0) > 1.2) errDeg += 0.9;
        if (dist > 42) errDeg += 0.6;
        const err = errDeg * Math.PI / 180;
        const dir = aim.sub(bot.eyePos(new THREE.Vector3())).normalize();
        const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).cross(dir).normalize();
        if (axis.lengthSq() > 0.01) dir.applyAxisAngle(axis, err * (0.4 + Math.random() * 0.8));
        bot.weapon.consume();
        game.fireHitscan(bot, bot.eyePos(new THREE.Vector3()), dir);
        bot.burstLeft -= 1;
        if (bot.burstLeft <= 0) bot.burstPause = THREE.MathUtils.lerp(0.75, 0.38, bot.skill) * (0.7 + Math.random() * 0.6);
      }
    }
    bot.channel = 0;
  } else if (game.phase === 'live' || game.phase === 'buy') {
    // --- objective movement ---------------------------------------------------
    const objective = game.objectiveFor(bot);
    if (objective?.channel && objective.inRange(bot)) {
      bot.channel += dt;
      bot.mode = objective.channel;
      if (bot.channel >= objective.channelTime) {
        objective.done(bot);
        bot.channel = 0;
      }
    } else {
      bot.channel = 0;
      const dest = objective?.pos;
      if (dest) {
        const d = Math.hypot(dest.x - bot.pos.x, dest.z - bot.pos.z);
        if (d > 1.4) {
          // follow the waypoint path if one is set, else steer direct
          let targetPos = dest;
          if (bot.path && bot.pathIdx < bot.path.length) {
            targetPos = bot.path[bot.pathIdx];
            if (Math.hypot(targetPos.x - bot.pos.x, targetPos.z - bot.pos.z) < 1.6) {
              bot.pathIdx += 1;
              targetPos = bot.path[bot.pathIdx] ?? dest;
            }
          }
          const tyaw = yawToward(bot.pos, targetPos);
          turnToward(bot, tyaw, dt, 8);
          moveX = -Math.sin(bot.yaw);
          moveZ = -Math.cos(bot.yaw);
          speed = game.phase === 'buy' ? 0 : 4.7;
          bot.mode = 'advance';
        } else {
          bot.mode = 'hold';
          // idle scan: slowly sweep the most likely approach
          if (objective.faceYaw !== undefined) turnToward(bot, objective.faceYaw, dt, 2.5);
        }
      }
    }
  }

  // --- integrate movement -----------------------------------------------------
  const ml = Math.hypot(moveX, moveZ);
  if (ml > 0.01 && speed > 0) {
    bot.pos.x += (moveX / ml) * speed * dt;
    bot.pos.z += (moveZ / ml) * speed * dt;
    bot._speed = speed;
  } else {
    bot._speed = 0;
  }
  // separation from other actors so bots never stack inside each other
  for (const a of game.actors) {
    if (a === bot || !a.alive) continue;
    const dx = bot.pos.x - a.pos.x;
    const dz = bot.pos.z - a.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 0.64 && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      bot.pos.x += (dx / d) * (0.8 - d) * 0.5;
      bot.pos.z += (dz / d) * (0.8 - d) * 0.5;
    }
  }
  collide(world.colliders, bot.pos, 0.42);
  bot.syncMesh(dt);
}
