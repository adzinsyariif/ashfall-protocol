// Weapon definitions, per-weapon state (ammo, cooldowns, reloads) and the
// first-person viewmodels. Damage model follows the brief: accuracy counts
// more than speed — spread grows sharply while moving or airborne and
// shrinks to a pinpoint when standing still, and rifles reward the first
// accurate shot more than spray.
import * as THREE from 'three';

export const WEAPONS = {
  sparrow: {
    id: 'sparrow', name: 'P9 Sparrow', kind: 'pistol', price: 0,
    damage: 26, headMult: 2.6, interval: 0.24, auto: false,
    mag: 12, reserveStart: 96, reloadTime: 1.3,
    pellets: 1, spreadHip: 0.9, spreadAds: 0.45, moveSpread: 2.6,
    falloffFrom: 22, falloffTo: 55, falloffMin: 0.55, zoom: 1.15,
  },
  mule: {
    id: 'mule', name: 'Mule-12 Scattergun', kind: 'scatter', price: 1100,
    damage: 11, headMult: 1.6, interval: 0.95, auto: false,
    mag: 6, reserveStart: 30, reloadTime: 2.6,
    pellets: 8, spreadHip: 3.4, spreadAds: 2.8, moveSpread: 2.0,
    falloffFrom: 6, falloffTo: 24, falloffMin: 0.25, zoom: 1.1,
  },
  raptor: {
    id: 'raptor', name: 'Raptor-9 SMG', kind: 'smg', price: 1400,
    damage: 21, headMult: 2.2, interval: 0.075, auto: true,
    mag: 30, reserveStart: 120, reloadTime: 1.9,
    pellets: 1, spreadHip: 1.5, spreadAds: 0.9, moveSpread: 3.2,
    falloffFrom: 16, falloffTo: 45, falloffMin: 0.5, zoom: 1.2,
  },
  longbow: {
    id: 'longbow', name: 'VK-7 Longbow', kind: 'rifle', price: 2700,
    damage: 34, headMult: 3.0, interval: 0.1, auto: true,
    mag: 30, reserveStart: 90, reloadTime: 2.2,
    pellets: 1, spreadHip: 1.1, spreadAds: 0.28, moveSpread: 3.6,
    falloffFrom: 30, falloffTo: 70, falloffMin: 0.7, zoom: 1.35,
  },
  needle: {
    id: 'needle', name: 'Needle Precision Rifle', kind: 'sniper', price: 4750,
    damage: 112, headMult: 2.0, interval: 1.5, auto: false,
    mag: 5, reserveStart: 30, reloadTime: 3.0,
    pellets: 1, spreadHip: 4.5, spreadAds: 0.02, moveSpread: 6.0,
    falloffFrom: 90, falloffTo: 120, falloffMin: 0.95, zoom: 4.2,
  },
};
export const WEAPON_ORDER = ['sparrow', 'mule', 'raptor', 'longbow', 'needle'];
export const ARMOR_PRICE = 650;

export class WeaponState {
  constructor(id) {
    this.def = WEAPONS[id];
    this.id = id;
    this.mag = this.def.mag;
    this.reserve = this.def.reserveStart;
    this.cooldown = 0;
    this.reloadLeft = 0;
  }
  get reloading() { return this.reloadLeft > 0; }
  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        const need = this.def.mag - this.mag;
        const take = Math.min(need, this.reserve);
        this.mag += take;
        this.reserve -= take;
        this.reloadLeft = 0;
      }
    }
  }
  canFire() { return this.cooldown <= 0 && !this.reloading && this.mag > 0; }
  needsReload() { return this.mag === 0 && this.reserve > 0 && !this.reloading; }
  startReload() {
    if (this.reloading || this.mag >= this.def.mag || this.reserve <= 0) return false;
    this.reloadLeft = this.def.reloadTime;
    return true;
  }
  consume() {
    this.mag -= 1;
    this.cooldown = this.def.interval;
  }
}

// Damage after distance falloff for one pellet/bullet.
export function damageAt(def, dist) {
  if (dist <= def.falloffFrom) return def.damage;
  if (dist >= def.falloffTo) return def.damage * def.falloffMin;
  const t = (dist - def.falloffFrom) / (def.falloffTo - def.falloffFrom);
  return def.damage * (1 - t * (1 - def.falloffMin));
}

// --- viewmodels -------------------------------------------------------------
// Low-poly guns built from boxes, parented to the camera. Each returns a
// group whose `userData.muzzle` sits at the barrel tip (flash + tracer
// origin) and whose `userData.adsPos` is the aimed position offset.
const gunMetal = new THREE.MeshStandardMaterial({ color: 0x42474e, roughness: 0.45, metalness: 0.6 });
const gunDark = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.6, metalness: 0.4 });
const gunGrip = new THREE.MeshStandardMaterial({ color: 0x54432c, roughness: 0.85, metalness: 0.05 });
const gunAccent = new THREE.MeshStandardMaterial({ color: 0xe8641e, roughness: 0.5, metalness: 0.3 });

function part(group, mat, w, h, d, x, y, z, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx;
  group.add(m);
  return m;
}

export function buildViewmodel(id) {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  if (id === 'sparrow') {
    part(g, gunMetal, 0.075, 0.11, 0.34, 0, 0, -0.1);            // slide
    part(g, gunDark, 0.07, 0.09, 0.2, 0, -0.08, 0.02);           // frame
    part(g, gunGrip, 0.065, 0.17, 0.09, 0, -0.17, 0.09, 0.25);   // grip
    part(g, gunDark, 0.02, 0.035, 0.02, 0, 0.075, -0.26);        // front sight
    muzzle.position.set(0, 0.01, -0.3);
  } else if (id === 'mule') {
    part(g, gunMetal, 0.085, 0.1, 0.62, 0, 0, -0.18);            // receiver+barrel
    part(g, gunGrip, 0.08, 0.07, 0.3, 0, -0.055, -0.28);         // pump
    part(g, gunDark, 0.075, 0.09, 0.22, 0, -0.03, 0.14);         // stock joint
    part(g, gunGrip, 0.07, 0.16, 0.09, 0, -0.15, 0.1, 0.3);      // grip
    part(g, gunAccent, 0.088, 0.03, 0.1, 0, 0.055, -0.3);        // band
    muzzle.position.set(0, 0.01, -0.52);
  } else if (id === 'raptor') {
    part(g, gunMetal, 0.08, 0.12, 0.5, 0, 0, -0.14);             // body
    part(g, gunDark, 0.05, 0.05, 0.24, 0, 0.01, -0.48);          // barrel
    part(g, gunDark, 0.055, 0.2, 0.07, 0, -0.19, -0.08, 0.12);   // mag
    part(g, gunGrip, 0.06, 0.15, 0.08, 0, -0.15, 0.12, 0.3);     // grip
    part(g, gunDark, 0.07, 0.08, 0.16, 0, -0.02, 0.24);          // stock
    part(g, gunAccent, 0.02, 0.03, 0.02, 0, 0.085, -0.3);        // sight dot post
    muzzle.position.set(0, 0.01, -0.62);
  } else if (id === 'needle') {
    part(g, gunMetal, 0.075, 0.11, 0.7, 0, 0, -0.2);             // body
    part(g, gunDark, 0.035, 0.035, 0.5, 0, 0.015, -0.75);        // long barrel
    part(g, gunDark, 0.06, 0.09, 0.34, 0, 0.1, -0.18);           // scope tube base
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.3, 10), gunDark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.115, -0.18);
    g.add(scope);
    part(g, gunDark, 0.05, 0.16, 0.06, 0, -0.17, -0.1, 0.1);     // mag
    part(g, gunGrip, 0.065, 0.15, 0.08, 0, -0.15, 0.14, 0.3);    // grip
    part(g, gunGrip, 0.07, 0.09, 0.3, 0, -0.04, 0.32);           // stock
    muzzle.position.set(0, 0.015, -1.02);
  } else { // longbow rifle
    part(g, gunMetal, 0.082, 0.12, 0.58, 0, 0, -0.18);           // receiver
    part(g, gunDark, 0.045, 0.045, 0.3, 0, 0.01, -0.6);          // barrel
    part(g, gunDark, 0.07, 0.05, 0.34, 0, 0.075, -0.2);          // carry rail
    part(g, gunMetal, 0.018, 0.03, 0.018, 0, 0.11, -0.32);       // front post
    part(g, gunDark, 0.055, 0.21, 0.075, 0, -0.2, -0.06, 0.15);  // mag
    part(g, gunGrip, 0.062, 0.16, 0.085, 0, -0.16, 0.13, 0.3);   // grip
    part(g, gunDark, 0.07, 0.1, 0.24, 0, -0.02, 0.3);            // stock
    part(g, gunMetal, 0.05, 0.07, 0.12, 0, -0.06, -0.42);        // foregrip
    muzzle.position.set(0, 0.01, -0.78);
  }
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  return g;
}

// A simple world-model of a gun for bots to carry (cheaper, no grip detail).
export function buildWorldGun(kind) {
  const g = new THREE.Group();
  const len = kind === 'sniper' ? 1.25 : kind === 'pistol' ? 0.32 : kind === 'scatter' ? 0.85 : 0.95;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, len), gunMetal);
  body.position.z = -len / 2 + 0.15;
  g.add(body);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), gunDark);
  grip.position.set(0, -0.12, 0.08);
  g.add(grip);
  return g;
}
