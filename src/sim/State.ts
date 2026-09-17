/**
 * The complete game state.
 *
 * Plain, serialisable data only: no class instances, no functions, no Three.js objects.
 * That single restriction is what makes saves, replays, deterministic tests, and eventually
 * server-authoritative co-op all cheap (ARCHITECTURE §1 and §4.1).
 */

import type { Attitude, Vec3 } from "./math";
import { vec3 } from "./math";

export type Bee = {
  readonly id: number;
  position: Vec3;
  velocity: Vec3;
  attitude: Attitude;
  /** Angular velocity per axis, rad/s. */
  angular: Attitude;

  /**
   * Seconds since the last pitch or roll input. Drives auto-stabilization (DESIGN §4.2).
   * Stored in the state, not in the input layer, so the simulation stays deterministic and
   * can run headless.
   */
  idleTime: number;

  /** True while resting on the ground, which blocks lateral thrust. */
  grounded: boolean;

  /** Pollen carried. Capped by the tree's capacity stat once progression exists (M4). */
  pollen: number;

  /** Remaining lives. DESIGN §8.4. */
  lives: number;

  /** Seconds of invulnerability left after a hit. */
  invulnerable: number;
};

export type SimState = {
  /** Fixed-step counter. The authoritative clock for networking later. */
  tick: number;
  /** Simulated seconds. */
  time: number;
  /** Seeded PRNG state, carried in the state so replays agree. */
  rngState: number;
  bee: Bee;
};

export function createBee(id = 1): Bee {
  return {
    id,
    position: vec3(0, 0, 0),
    velocity: vec3(),
    attitude: { yaw: 0, pitch: 0, roll: 0 },
    angular: { yaw: 0, pitch: 0, roll: 0 },
    idleTime: 0,
    grounded: false,
    pollen: 0,
    lives: 3,
    invulnerable: 0,
  };
}

export function createInitialState(seed = 1337): SimState {
  return {
    tick: 0,
    time: 0,
    rngState: seed >>> 0,
    bee: createBee(),
  };
}

/**
 * Deep-copy the mutable parts of a bee.
 *
 * The render loop keeps the previous and current state each frame and interpolates between
 * them, so simulation rate and display rate are decoupled — mandatory for a 60 Hz
 * simulation on a 144 Hz monitor (ARCHITECTURE §6.1).
 */
export function copyBee(source: Bee, out: Bee): Bee {
  out.position.x = source.position.x;
  out.position.y = source.position.y;
  out.position.z = source.position.z;

  out.velocity.x = source.velocity.x;
  out.velocity.y = source.velocity.y;
  out.velocity.z = source.velocity.z;

  out.attitude.yaw = source.attitude.yaw;
  out.attitude.pitch = source.attitude.pitch;
  out.attitude.roll = source.attitude.roll;

  out.angular.yaw = source.angular.yaw;
  out.angular.pitch = source.angular.pitch;
  out.angular.roll = source.angular.roll;

  out.idleTime = source.idleTime;
  out.grounded = source.grounded;
  out.pollen = source.pollen;
  out.lives = source.lives;
  out.invulnerable = source.invulnerable;

  return out;
}
