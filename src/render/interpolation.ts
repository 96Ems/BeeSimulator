/**
 * Interpolation between simulation snapshots. ARCHITECTURE §6.1.
 *
 * The simulation runs at a fixed 60 Hz; the display may run at 144 Hz or anything else.
 * The renderer therefore keeps the previous and current states and draws a point *between*
 * them, offset by the loop's remainder. Without this, motion visibly stutters on any
 * display that is not an exact multiple of 60 Hz.
 */

import { angleDelta, lerp, type Attitude, type Vec3 } from "../sim/math";
import type { Bee } from "../sim/State";

/** A snapshot of what the renderer needs, decoupled from the simulation's full state. */
export type RenderBee = {
  position: Vec3;
  attitude: Attitude;
  /** Speed in m/s, for the camera's field-of-view boost and the wing flap rate. */
  speed: number;
  pollen: number;
  lives: number;
  invulnerable: boolean;
};

export function createRenderBee(): RenderBee {
  return {
    position: { x: 0, y: 0, z: 0 },
    attitude: { yaw: 0, pitch: 0, roll: 0 },
    speed: 0,
    pollen: 0,
    lives: 0,
    invulnerable: false,
  };
}

/**
 * Blend `previous` and `current` by `alpha` (0..1) into `out`.
 *
 * Yaw is interpolated by the *shortest* signed delta rather than raw lerp. A raw lerp
 * across the +/-PI wrap point spins the bee most of the way around the circle for a
 * one-degree turn, which reads as a violent glitch at exactly the moment the player crosses
 * due south.
 */
export function interpolateBee(
  previous: Bee,
  current: Bee,
  alpha: number,
  out: RenderBee,
): void {
  out.position.x = lerp(previous.position.x, current.position.x, alpha);
  out.position.y = lerp(previous.position.y, current.position.y, alpha);
  out.position.z = lerp(previous.position.z, current.position.z, alpha);

  out.attitude.pitch = lerp(previous.attitude.pitch, current.attitude.pitch, alpha);
  out.attitude.roll = lerp(previous.attitude.roll, current.attitude.roll, alpha);
  out.attitude.yaw =
    previous.attitude.yaw + angleDelta(previous.attitude.yaw, current.attitude.yaw) * alpha;

  const vx = lerp(previous.velocity.x, current.velocity.x, alpha);
  const vy = lerp(previous.velocity.y, current.velocity.y, alpha);
  const vz = lerp(previous.velocity.z, current.velocity.z, alpha);
  out.speed = Math.hypot(vx, vy, vz);

  // Discrete values are taken from the current state, never blended: a half-drawn life or a
  // pollen gauge that lags its own number looks broken.
  out.pollen = current.pollen;
  out.lives = current.lives;
  out.invulnerable = current.invulnerable > 0;
}
