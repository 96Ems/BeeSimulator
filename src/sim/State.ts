/**
 * The complete game state.
 *
 * Plain, serialisable data only: no class instances, no functions, no Three.js objects. That
 * single restriction is what makes saves, replays, deterministic tests, and eventually
 * server-authoritative co-op all cheap (ARCHITECTURE §1 and §4.1).
 */

import { BEE } from "../data/tuning";
import type { Enemy } from "./entities/enemies";
import type { Flower } from "./entities/flower";
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

  /** Seconds of reduced thrust remaining after lifting off a `land`-mode flower. */
  takeoffLock: number;

  /** Pollen carried, and the cap it cannot exceed. */
  pollen: number;
  pollenCapacity: number;

  /** Lives remaining, and the cap. Lives are restored by depositing (DESIGN §8.4). */
  lives: number;
  maxLives: number;
  /** Seconds of invulnerability left after a hit. */
  invulnerable: number;

  /** Flower currently being foraged, if any. */
  foragingFlowerId: number | null;
  /** Progress through that flower's forage, 0..1. Lost entirely if interrupted. */
  forageProgress: number;

  /** Seconds since the last sting, for the attack cooldown. */
  sinceSting: number;
};

export type SimState = {
  /** Fixed-step counter. The authoritative clock for networking later. */
  tick: number;
  /** Simulated seconds. */
  time: number;
  /** Seeded PRNG state, carried in the state so replays agree. */
  rngState: number;
  bee: Bee;
  flowers: Flower[];
  enemies: Enemy[];

  /**
   * Set by the input layer for one step, cleared by the sting. An edge-triggered action
   * rather than a held button, because a sting is a single commitment, not a state.
   */
  stingRequested: boolean;

  /** Seconds of hit feedback remaining. Presentation-only, but derived from sim events. */
  damageFlash: number;
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
    takeoffLock: 0,
    pollen: 0,
    pollenCapacity: BEE.basePollenCapacity,
    lives: 3,
    maxLives: 3,
    invulnerable: 0,
    foragingFlowerId: null,
    forageProgress: 0,
    sinceSting: 999,
  };
}

export function createInitialState(seed = 1337): SimState {
  return {
    tick: 0,
    time: 0,
    rngState: seed >>> 0,
    bee: createBee(),
    flowers: [],
    enemies: [],
    stingRequested: false,
    damageFlash: 0,
  };
}

/**
 * Deep-copy the mutable parts of a bee.
 *
 * The render loop keeps the previous and current state each frame and interpolates between
 * them, so simulation rate and display rate are decoupled — mandatory for a 60 Hz simulation
 * on a 144 Hz monitor (ARCHITECTURE §6.1).
 *
 * Discrete values are copied too, but the interpolator deliberately does not blend them.
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
  out.takeoffLock = source.takeoffLock;
  out.pollen = source.pollen;
  out.pollenCapacity = source.pollenCapacity;
  out.lives = source.lives;
  out.maxLives = source.maxLives;
  out.invulnerable = source.invulnerable;
  out.foragingFlowerId = source.foragingFlowerId;
  out.forageProgress = source.forageProgress;
  out.sinceSting = source.sinceSting;

  return out;
}
