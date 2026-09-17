/**
 * Vector and angle maths for the simulation.
 *
 * Deliberately free of Three.js: `src/sim/` must stay a pure, portable, testable data
 * layer (ARCHITECTURE §1, constraint 1). The lint config enforces that, and these types
 * are plain objects so they serialise for free — which is what makes save, replay, and
 * eventually server-authoritative simulation straightforward.
 */

export type Vec3 = { x: number; y: number; z: number };

/**
 * Orientation as intrinsic Yaw-Pitch-Roll (the same order as Three.js `'YXZ'`).
 *
 * Euler angles rather than a quaternion on purpose: this is a helicopter, and the
 * stabilization loop needs to level the *pitch and roll* specifically. Extracting those
 * from a quaternion every frame would be more code for no benefit, and the envelope clamps
 * below keep the gimbal case out of reach.
 *
 * Convention, matching a bee whose nose points down -Z at rest:
 *   yaw   > 0  turns left
 *   pitch > 0  nose up   (brake / reverse)
 *   pitch < 0  nose down (accelerate) — this is the core of the flight feel
 *   roll  > 0  right wing down
 */
export type Attitude = { yaw: number; pitch: number; roll: number };

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function copyVec3(source: Vec3, out: Vec3): Vec3 {
  out.x = source.x;
  out.y = source.y;
  out.z = source.z;
  return out;
}

export function setVec3(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Hermite smoothstep. Used for the stabilization blend so the assistance fades in with
 * zero derivative at both ends — the difference between a smooth handover and a visible
 * snap. ARCHITECTURE §4.5.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent smoothing factor. See the note in `approach`. */
export function dampFactor(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/**
 * Move `current` toward `target` at a rate that does not depend on the frame rate.
 *
 * The naive `current += (target - current) * rate * dt` overshoots when `rate * dt > 1`,
 * which at 60 Hz means any rate above 60 starts to oscillate. The exponential form is
 * exact for any timestep.
 */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, dampFactor(rate, dt));
}

export function vecLength(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Rotate a vector by an intrinsic Yaw-Pitch-Roll attitude: `Ry * Rx * Rz * v`.
 *
 * Written out rather than composed from matrices because it is called several times per
 * fixed step for every entity, and this avoids both the allocation and the indirection.
 * `rotateUp` and `rotateForward` below are the two callers that matter, and they are
 * verified against this general form in the tests.
 */
export function rotateByAttitude(v: Vec3, attitude: Attitude, out: Vec3): Vec3 {
  const { yaw, pitch, roll } = attitude;

  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);

  // Rz
  const x1 = v.x * cr - v.y * sr;
  const y1 = v.x * sr + v.y * cr;
  const z1 = v.z;

  // Rx
  const x2 = x1;
  const y2 = y1 * cp - z1 * sp;
  const z2 = y1 * sp + z1 * cp;

  // Ry
  out.x = x2 * cy + z2 * sy;
  out.y = y2;
  out.z = -x2 * sy + z2 * cy;
  return out;
}

/**
 * The body's local up axis in world space — the direction the wings push.
 *
 * This is what makes the model a *helicopter*: thrust follows attitude, so pitching the
 * nose down tips the thrust vector forward and the bee accelerates. There is no throttle
 * key that adds forward speed.
 */
export function rotateUp(attitude: Attitude, out: Vec3): Vec3 {
  const { yaw, pitch, roll } = attitude;
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);

  const x1 = -sr;
  const y1 = cr;
  const z1 = 0;

  const y2 = y1 * cp - z1 * sp;
  const z2 = y1 * sp + z1 * cp;

  out.x = x1 * cy + z2 * sy;
  out.y = y2;
  out.z = -x1 * sy + z2 * cy;
  return out;
}

/**
 * The body's local forward axis in world space.
 *
 * The bee model faces **-Z** (verified in the exported GLB: head at z = -0.13, stinger at
 * z = +0.17), which also matches the Three.js convention that objects look down -Z. So this
 * is `(0, 0, -1)` rotated by the attitude.
 *
 * Getting this sign wrong makes the bee fly backwards, which is subtle enough to look like
 * a tuning problem rather than a maths one. It is asserted in the tests.
 *
 * Roll drops out: `(0, 0, -1)` is invariant under Rz.
 */
export function rotateForward(attitude: Attitude, out: Vec3): Vec3 {
  const cp = Math.cos(attitude.pitch);
  const sp = Math.sin(attitude.pitch);
  const cy = Math.cos(attitude.yaw);
  const sy = Math.sin(attitude.yaw);

  // Through Rx: (0, sp, -cp). Through Ry: (-cp*sy, sp, -cp*cy).
  out.x = -cp * sy;
  out.y = sp;
  out.z = -cp * cy;
  return out;
}

/** Shortest signed angular difference, in (-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Scale a vector toward a maximum magnitude, preserving direction. */
export function limitLength(v: Vec3, max: number): void {
  const length = vecLength(v);
  if (length > max && length > 0) {
    const scale = max / length;
    v.x *= scale;
    v.y *= scale;
    v.z *= scale;
  }
}
