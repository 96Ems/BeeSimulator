/**
 * Helicopter flight model. DESIGN §4, ARCHITECTURE §4.4.
 *
 * The whole point of this file is a *feel*: the bee is not a plane and not a drone. It
 * behaves like a helicopter, which means:
 *
 *   - Thrust acts along the body's up axis, so the nose must dip for the bee to gain
 *     forward speed. There is no "forward" key.
 *   - Momentum carries. Releasing the stick does not stop the bee.
 *   - Hovering is native and costs time, not a resource.
 *
 * Everything here is deterministic and allocation-free: the same inputs at the same
 * timestep give the same result, always. That is required by the tests, by replays, and by
 * a server-authoritative co-op mode later.
 */

import { BEE, FLIGHT, WORLD } from "../data/tuning";
import type { InputCommand } from "./commands";
import { approach, clamp, rotateUp, smoothstep, type Attitude, type Vec3 } from "./math";
import type { Bee } from "./State";

/**
 * Seconds per simulation step. A constant, deliberately, so no caller can pass a frame
 * delta by accident: a variable timestep changes the integration result between a 60 Hz and
 * a 144 Hz display and makes the tuning meaningless (AGENTS.md §4, constraint 2).
 */
export const FLIGHT_STEP = 1 / 60;

/** The floor the bee rests on. Bee `position.y` is its body centre (ASSETS.md). */
const GROUND_HEIGHT = BEE.minAltitude;

// Module-level scratch: reused every step so the hot path allocates nothing.
// This is the one place module-level mutable state is acceptable — pure scratch that holds
// no information between calls, so it cannot leak state across entities.
const scratchUp: Vec3 = { x: 0, y: 0, z: 0 };
const scratchLevel: Attitude = { yaw: 0, pitch: 0, roll: 0 };

/**
 * Advance one bee by one fixed step, mutating it in place.
 *
 * Order matters and is not arbitrary: attitude must be integrated before thrust is derived
 * from it, and velocity before it is used to integrate position.
 */
export function integrateFlight(bee: Bee, command: InputCommand, dt: number): void {
  updateStabilization(bee, command, dt);
  updateAttitude(bee, command, dt);
  updateVelocity(bee, command, dt);
  updatePosition(bee, dt);

  bee.invulnerable = Math.max(0, bee.invulnerable - dt);
  bee.takeoffLock = Math.max(0, bee.takeoffLock - dt);
  bee.sinceSting += dt;
}

/**
 * Track how long the player has been off the pitch and roll controls.
 *
 * This is the answer to "how do we know the player let go?" — mouse movement has no release
 * event. Inactivity is the honest signal, and because both input schemes feed this same
 * timer, one mechanism serves mouse and keyboard identically (DESIGN §4.2).
 */
function updateStabilization(bee: Bee, command: InputCommand, dt: number): void {
  const handOnStick =
    Math.abs(command.pitch) > FLIGHT.inputDeadzone ||
    Math.abs(command.roll) > FLIGHT.inputDeadzone;

  bee.idleTime = handOnStick ? 0 : bee.idleTime + dt;
}

/**
 * How much corrective assistance to apply right now: 0 (none) to 1 (full).
 *
 * Smoothstepped so the handover has zero derivative at both ends. A linear ramp produces a
 * visible kick the instant assistance engages, which reads as a bug rather than as help.
 */
function stabilizationBlend(idleTime: number): number {
  return smoothstep(
    FLIGHT.stabilityDelay,
    FLIGHT.stabilityDelay + FLIGHT.stabilityRamp,
    idleTime,
  );
}

function updateAttitude(bee: Bee, command: InputCommand, dt: number): void {
  const { attitude, angular } = bee;

  // Command conventions, from the player's point of view:
  //   pitch > 0  nose up      (brake)
  //   roll  > 0  bank right
  //   yaw   > 0  turn left
  const manualPitch = command.pitch * FLIGHT.pitchRate;
  const manualYaw = command.yaw * FLIGHT.yawRate;

  // Roll needs its sign flipped, and this is the *only* place that conversion belongs.
  //
  // `attitude.roll` is the raw Three.js Z rotation. A *positive* rotation about +Z raises
  // the right wing — the right wing sits at +X, and Rz(+theta) rotates +X toward +Y — which
  // banks the bee LEFT. So "bank right" is a negative Z rotation.
  //
  // Verified against Three.js rather than reasoned about: at roll = +0.5 the world-space up
  // vector is (-0.479, 0.878, 0), i.e. thrust points along -X, which is the bee's left.
  // Getting this backwards makes D steer left, which reads as "the controls are broken"
  // long before it reads as "the sign is wrong".
  const manualRoll = -command.roll * FLIGHT.rollRate;

  const blend = stabilizationBlend(bee.idleTime);

  // What "level flight" wants: pitch and roll driven back to zero. Sign-agnostic, so no
  // conversion is needed here.
  scratchLevel.pitch = -attitude.pitch * FLIGHT.stabilityGain;
  scratchLevel.roll = -attitude.roll * FLIGHT.stabilityGain;

  const targetPitch = manualPitch + (scratchLevel.pitch - manualPitch) * blend;
  const targetRoll = manualRoll + (scratchLevel.roll - manualRoll) * blend;
  // Yaw is never assisted *toward a heading*: auto-turning would fight the player's intent
  // far more than it would help. Stabilization only kills residual yaw rate.
  const targetYaw = manualYaw * (1 - blend);

  angular.pitch = approach(angular.pitch, targetPitch, FLIGHT.attitudeResponse, dt);
  angular.roll = approach(angular.roll, targetRoll, FLIGHT.attitudeResponse, dt);
  angular.yaw = approach(angular.yaw, targetYaw, FLIGHT.attitudeResponse, dt);

  attitude.pitch += angular.pitch * dt;
  attitude.roll += angular.roll * dt;
  attitude.yaw += angular.yaw * dt;

  // Clamp the envelope, and kill the rate at the limit so the bee does not stick to the
  // ceiling and then spring back the moment the player reverses.
  if (attitude.pitch > FLIGHT.maxPitch) {
    attitude.pitch = FLIGHT.maxPitch;
    angular.pitch = Math.min(angular.pitch, 0);
  } else if (attitude.pitch < -FLIGHT.maxPitch) {
    attitude.pitch = -FLIGHT.maxPitch;
    angular.pitch = Math.max(angular.pitch, 0);
  }

  if (attitude.roll > FLIGHT.maxRoll) {
    attitude.roll = FLIGHT.maxRoll;
    angular.roll = Math.min(angular.roll, 0);
  } else if (attitude.roll < -FLIGHT.maxRoll) {
    attitude.roll = -FLIGHT.maxRoll;
    angular.roll = Math.max(angular.roll, 0);
  }

  // Keep yaw in (-PI, PI] so it cannot drift into a large magnitude over a long session.
  if (attitude.yaw > Math.PI) attitude.yaw -= Math.PI * 2;
  else if (attitude.yaw <= -Math.PI) attitude.yaw += Math.PI * 2;
}

function updateVelocity(bee: Bee, command: InputCommand, dt: number): void {
  const { velocity, attitude } = bee;

  // Thrust along the body's up axis. This single line is what makes the model a helicopter:
  // pitching the nose down tips the thrust vector forward, so attitude *is* the throttle.
  rotateUp(attitude, scratchUp);

  // A bee that just harvested a `land`-mode flower is heavy and slow to lift. This is the
  // entire cost of the high-yield flowers (DESIGN §6.4) — without it, landing would be a
  // strictly better choice than hovering and the flower types would collapse into one.
  const loaded = bee.takeoffLock > 0 ? FLIGHT.takeoffThrustScale : 1;
  const collective = (FLIGHT.gravity + command.thrust * FLIGHT.collectiveRange) * loaded;

  velocity.x += scratchUp.x * collective * dt;
  velocity.y += (scratchUp.y * collective - FLIGHT.gravity) * dt;
  velocity.z += scratchUp.z * collective * dt;

  // Air resistance as exact exponential decay, which is frame-rate independent.
  // Vertical is damped harder than horizontal: a bee falling like a stone is both wrong and
  // unplayable, whereas some horizontal glide is the point of the model.
  const horizontalDecay = Math.exp(-FLIGHT.horizontalDamping * dt);
  velocity.y *= Math.exp(-FLIGHT.verticalDamping * dt);
  velocity.x *= horizontalDecay;
  velocity.z *= horizontalDecay;

  // Braking: the player is pulling *against* their own momentum, so help them stop.
  //
  // Reverse thrust alone is technically enough, but it takes too long to bite: the first
  // playtest asked for the opposite key to "instant stop" rather than to complain slowly.
  // Measured against the yaw frame rather than the pitched one, because at a steep nose-up
  // the body's forward axis points skyward and stops meaning "the way I am travelling".
  const { yaw } = attitude;
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);

  const forwardSpeed = velocity.x * forwardX + velocity.z * forwardZ;
  const lateralSpeed = velocity.x * rightX + velocity.z * rightZ;

  // Nose-up opposes forward travel; banking opposes the way you are sliding.
  const brakingForward = command.pitch * forwardSpeed > 0.05;
  const brakingLateral = command.roll * lateralSpeed < -0.05;

  if (brakingForward || brakingLateral) {
    const brakeDecay = Math.exp(-FLIGHT.brakeDamping * dt);
    velocity.x *= brakeDecay;
    velocity.z *= brakeDecay;
  }

  // Stabilization also bleeds off momentum the player is no longer managing. Without this,
  // "hover" would mean drifting forever at whatever speed you happened to arrive with.
  const blend = stabilizationBlend(bee.idleTime);
  if (blend > 0) {
    const stabilityDecay = Math.exp(-FLIGHT.stabilityDamping * blend * dt);
    velocity.x *= stabilityDecay;
    velocity.z *= stabilityDecay;
    velocity.y *= stabilityDecay;
  }

  // Cap horizontal and vertical separately. One combined cap would let a steep dive trade
  // all of its altitude for horizontal speed, which reads as a teleport.
  const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
  if (horizontalSpeed > FLIGHT.maxHorizontalSpeed) {
    const scale = FLIGHT.maxHorizontalSpeed / horizontalSpeed;
    velocity.x *= scale;
    velocity.z *= scale;
  }
  velocity.y = clamp(velocity.y, -FLIGHT.maxVerticalSpeed, FLIGHT.maxVerticalSpeed);
}

function updatePosition(bee: Bee, dt: number): void {
  const { position, velocity } = bee;

  position.x += velocity.x * dt;
  position.y += velocity.y * dt;
  position.z += velocity.z * dt;

  // Ground. Landing is a soft stop, not a crash: v1 has no fall damage (DESIGN §8.4), and a
  // floor that kills would compete with the predators for the player's attention.
  if (position.y <= GROUND_HEIGHT) {
    position.y = GROUND_HEIGHT;
    if (velocity.y < 0) velocity.y = 0;
    bee.grounded = true;
    // Settle the wobble so the bee rests level rather than jittering on the ground.
    bee.angular.pitch *= 0.7;
    bee.angular.roll *= 0.7;
  } else {
    bee.grounded = false;
  }

  // World boundary. A soft push rather than a wall: being decelerated outward reads as
  // "there is nothing that way", whereas hitting an invisible wall at speed is disorienting.
  const distance = Math.hypot(position.x, position.z);
  if (distance > WORLD.playableRadius) {
    const scale = WORLD.playableRadius / distance;
    position.x *= scale;
    position.z *= scale;
    velocity.x *= 0.7;
    velocity.z *= 0.7;
  }
}
