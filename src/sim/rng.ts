/**
 * Seeded pseudo-random number generation.
 *
 * `Math.random` is banned inside `src/sim/`. A deterministic, reproducible sequence is
 * required for three separate reasons:
 *
 *   1. Fixed-timestep simulation must produce identical results from identical inputs.
 *   2. Tests need reproducible scenarios.
 *   3. Networked play needs the server and client to agree (ARCHITECTURE §9).
 *
 * The state is a plain 32-bit integer, so it serialises with `SimState` for free.
 */

/** A function that yields successive values in `[0, 1)`. */
export type Rng = () => number;

/**
 * mulberry32 — small, fast, and good enough for gameplay scatter.
 * Chosen over an LCG because it passes the obvious spectral tests, and over a
 * cryptographic PRNG because determinism and speed matter more than unpredictability here.
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Uniformly distributed value in `[min, max)`. */
export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/**
 * Uniformly distributed point inside a disc of the given radius.
 *
 * Uses the square-root transform on the radius. Without it, points bunch towards the
 * centre — area grows with r^2, so a uniform radius is not a uniform area.
 */
export function pointInDisc(rng: Rng, radius: number): { x: number; z: number } {
  const angle = rng() * Math.PI * 2;
  const r = Math.sqrt(rng()) * radius;
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
}
