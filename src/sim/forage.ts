/**
 * Foraging and depositing. DESIGN §6.
 *
 * The single decision that makes this a game rather than a flying toy: foraging is
 * **progressive and interruptible**. Because leaving early loses the uncollected remainder,
 * every approaching predator forces the same question — "do I finish this flower, or do I
 * run?" — and that question is asked twenty times a session.
 */

import { FLOWER_TYPES, FORAGE_MAX_SPEED } from "../data/flowers";
import { HIVE } from "../data/tuning";
import { depleteFlower, foragePoint, type Flower } from "./entities/flower";
import type { SimEvent } from "./events";
import type { Vec3 } from "./math";
import type { Bee, SimState } from "./State";

/** Seconds of reduced thrust after lifting off a `land`-mode flower. */
export const LAND_TAKEOFF_LOCK = 0.7;

/** Scratch, so the per-step forage check allocates nothing. */
const scratchPoint: Vec3 = { x: 0, y: 0, z: 0 };

/** Advance foraging for one bee, emitting what happened. */
export function updateForaging(state: SimState, dt: number, events: SimEvent[]): void {
  const bee = state.bee;
  const target = findForageTarget(state, bee);

  if (!target) {
    // Leaving range loses the whole remainder. That is the entire point: the progress bar is
    // a wager, and abandoning it is a real cost rather than a pause.
    if (bee.foragingFlowerId !== null) {
      events.push({ kind: "interrupted", flowerId: bee.foragingFlowerId });
      bee.foragingFlowerId = null;
      bee.forageProgress = 0;
    }
    return;
  }

  const type = FLOWER_TYPES[target.typeId];

  if (bee.foragingFlowerId !== target.id) {
    bee.foragingFlowerId = target.id;
    bee.forageProgress = 0;
    events.push({ kind: "started", flowerId: target.id });
  }

  if (bee.pollen >= bee.pollenCapacity) {
    // Already full: foraging would silently waste the flower. Refusing is better than
    // wasting, because silently wasting a rare flower reads as a bug the first time it
    // happens rather than as a rule.
    events.push({ kind: "full" });
    bee.foragingFlowerId = null;
    bee.forageProgress = 0;
    return;
  }

  bee.forageProgress += dt / type.forageSeconds;

  if (bee.forageProgress < 1) {
    events.push({ kind: "progress", flowerId: target.id, progress: bee.forageProgress });
    return;
  }

  const gained = Math.min(type.yield, bee.pollenCapacity - bee.pollen);

  bee.pollen += gained;
  depleteFlower(target);
  bee.foragingFlowerId = null;
  bee.forageProgress = 0;

  // Landing charges a takeoff penalty. This is the entire cost of the high-yield flowers
  // (DESIGN §6.4): the payout is real, and so is the vulnerability immediately after it.
  if (type.mode === "land") {
    bee.takeoffLock = LAND_TAKEOFF_LOCK;
  }

  events.push({ kind: "completed", flowerId: target.id, pollen: gained });
}

/**
 * The best flower this bee could be foraging right now, or null.
 *
 * Nearest-first, so a bee hovering between two flowers commits to the closer one instead of
 * flickering between them — which would reset the progress bar every step and make the flower
 * unfarmable.
 */
function findForageTarget(state: SimState, bee: Bee): Flower | null {
  const speed = Math.hypot(bee.velocity.x, bee.velocity.y, bee.velocity.z);

  let best: Flower | null = null;
  let bestDistance = Infinity;

  for (const flower of state.flowers) {
    if (flower.richness <= 0) continue;

    const type = FLOWER_TYPES[flower.typeId];

    // Landing demands near-stillness; hovering tolerates a slow drift. This is what makes a
    // sunflower a commitment and a daisy a stop-and-go.
    if (speed > FORAGE_MAX_SPEED[type.mode]) continue;

    foragePoint(flower, scratchPoint);
    const distance = Math.hypot(
      bee.position.x - scratchPoint.x,
      bee.position.y - scratchPoint.y,
      bee.position.z - scratchPoint.z,
    );

    if (distance > type.reach) continue;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = flower;
    }
  }

  return best;
}

/**
 * Deposit carried pollen at the hive.
 *
 * Depositing also restores a life (DESIGN §8.4), which is what turns "fly home" into an act
 * of survival rather than bookkeeping. Note that this makes the pollen dilemma and the life
 * dilemma point the *same* way, so the decision stays legible instead of becoming confusing.
 */
export function updateDeposit(state: SimState, events: SimEvent[]): void {
  const bee = state.bee;
  if (bee.pollen <= 0) return;

  const distance = Math.hypot(
    bee.position.x - HIVE.position.x,
    bee.position.z - HIVE.position.z,
  );
  if (distance > HIVE.depositRadius) return;
  if (bee.position.y > HIVE.depositMaxAltitude) return;

  const deposited = bee.pollen;
  bee.pollen = 0;

  let livesRestored = 0;
  if (bee.lives < bee.maxLives) {
    bee.lives += 1;
    livesRestored = 1;
  }

  events.push({ kind: "deposited", pollen: deposited, livesRestored });
}

/** Distance from the hive, used by the HUD and by the swarm's wariness. */
export function distanceFromHive(bee: Bee): number {
  return Math.hypot(bee.position.x - HIVE.position.x, bee.position.z - HIVE.position.z);
}
