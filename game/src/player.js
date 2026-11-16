// The local player: capsule movement with AABB collision, gravity and a
// small jump, crouch/walk/run speeds, health and armour. Shooting lives in
// main.js; this file owns where the eye is and how fast it is moving,
// which the accuracy model reads every shot.
import * as THREE from 'three';
import { collide } from './world.js';

const RADIUS = 0.42;
const GRAVITY = 22;
const JUMP_VEL = 7.2;

export class Player {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;
    this.pos = new THREE.Vector3(-50, 0, 0); // feet position
    this.vel = new THREE.Vector3();
    this.yaw = -Math.PI / 2;  // facing +x (toward mid) at spawn
    this.pitch = 0;
    this.onGround = true;
    this.crouching = false;
    this.health = 100;
    this.armor = 0;           // 0 or 100 while armoured
    this.hasArmor = false;
    this.alive = true;
    this.team = 'ember';
    this.speedNow = 0;
    this.stepTimer = 0;
  }

  reset(spawn, yaw) {
    this.pos.copy(spawn);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.health = 100;
    this.alive = true;
    this.crouching = false;
  }

  eyeHeight() { return this.crouching ? 1.12 : 1.62; }
  eyePos(out) {
    out.copy(this.pos);
    out.y += this.eyeHeight();
    return out;
  }
  groundSpeed() { return this.speedNow; }
  airborne() { return !this.onGround; }

  // dmg already scaled by hit zone; armour absorbs 45% while it lasts.
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
    }
    return applied;
  }

  update(dt, input, frozen) {
    this.crouching = !!input.crouch && this.onGround;
    const speedBase = this.crouching ? 2.1 : input.walk ? 3.1 : 5.3;
    let f = 0, r = 0;
    if (!frozen && this.alive) {
      if (input.forward) f += 1;
      if (input.back) f -= 1;
      if (input.right) r += 1;
      if (input.left) r -= 1;
    }
    const len = Math.hypot(f, r) || 1;
    f /= len; r /= len;
    // three.js yaw around Y: forward = (-sin, 0, -cos), right = (cos, 0, -sin)
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = -sin * f + cos * r;
    const wz = -cos * f - sin * r;
    const targetVx = wx * speedBase;
    const targetVz = wz * speedBase;
    const accel = this.onGround ? 14 : 2.2;
    this.vel.x += (targetVx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (targetVz - this.vel.z) * Math.min(1, accel * dt);

    if (!frozen && this.alive && input.jump && this.onGround) {
      this.vel.y = JUMP_VEL;
      this.onGround = false;
    }
    this.vel.y -= GRAVITY * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.vel.y = 0;
      this.onGround = true;
    }
    collide(this.world.colliders, this.pos, RADIUS);
    this.speedNow = Math.hypot(this.vel.x, this.vel.z);

    // footsteps cadence for main.js to sonify
    this.stepTimer -= dt * this.speedNow;
    if (this.onGround && this.speedNow > 0.6 && this.stepTimer <= 0) {
      this.stepTimer = 2.6;
      this.footstep = true;
    } else {
      this.footstep = false;
    }

    // camera (yaw/pitch were synced from the input state by syncLook)
    const eye = this.eyePos(new THREE.Vector3());
    this.camera.position.copy(eye);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
  }

  // Mouse look is applied by main.js from input deltas into yaw/pitch;
  // input.js already accumulates yaw/pitch on its own state, so main.js
  // copies those in before calling update().
  syncLook(input) {
    this.yaw = input.yaw;
    this.pitch = input.pitch;
  }
}
