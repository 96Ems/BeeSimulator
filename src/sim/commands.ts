/**
 * The input contract, owned by the simulation.
 *
 * It lives here rather than in `src/input/` so the dependency arrow points one way: the
 * input layer *produces* this, the simulation *consumes* it, and neither knows about the
 * other. It is also already the shape a network message would take (ARCHITECTURE §5.3),
 * which is what makes adding co-op an addition rather than a rewrite.
 */

/** Continuous stick axes, each normalised to -1..1. */
export type InputCommand = {
  /** Negative pitches the nose down, which is what makes the bee accelerate. */
  pitch: number;
  /** Positive rolls the right wing down. */
  roll: number;
  /** Positive yaws left. */
  yaw: number;
  /** Collective: positive climbs. */
  thrust: number;
  /** Edge-triggered actions, true only on the tick the key went down. */
  sting: boolean;
  dash: boolean;
};

export function neutralCommand(): InputCommand {
  return { pitch: 0, roll: 0, yaw: 0, thrust: 0, sting: false, dash: false };
}
