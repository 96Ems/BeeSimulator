/**
 * The simulation step.
 *
 * One function, one fixed timestep, no rendering, no device input. Everything the game needs
 * to advance by a known amount of time goes through here. Keeping it this small is what makes
 * the simulation testable headlessly and, later, runnable on a server.
 *
 * Order matters and is not arbitrary:
 *
 *   1. flight    — the bee moves, which everything else observes
 *   2. enemies   — react to the bee's new position and pollen load, emitting hits
 *   3. damage    — resolves those hits, granting invulnerability
 *   4. sting     — the player's answer, resolved after damage so a trade is possible
 *   5. forage    — depends on where the bee ended up, and on being alive
 *   6. deposit   — depends on pollen gained this step
 *   7. flowers   — respawn clocks tick last, so a flower taken this step is not refilled by
 *                  the same step
 */

import { HIVE } from "../data/tuning";
import type { InputCommand } from "./commands";
import { updateEnemies, updateSting } from "./entities/enemies";
import { updateFlower } from "./entities/flower";
import type { SimEvent } from "./events";
import { integrateFlight } from "./flight";
import { updateDeposit, updateForaging } from "./forage";
import type { SimState } from "./State";

/**
 * Advance the whole world by exactly `dt` seconds.
 *
 * Mutates `state` in place rather than returning a new one. ARCHITECTURE §4.3 gives the
 * signature as returning a new state; in practice the hot path must not allocate, and a
 * mutating step that stays *deterministic* gives the tests the same guarantees they actually
 * rely on. The renderer keeps its own snapshots for interpolation.
 *
 * `events` is appended to rather than allocated, so a caller can reuse one array.
 */
export function step(
  state: SimState,
  command: InputCommand,
  dt: number,
  events: SimEvent[] = [],
): void {
  integrateFlight(state.bee, command, dt);

  // Edge-triggered actions are latched onto the state for this step only. This keeps
  // `integrateFlight` and the enemy code free of any knowledge of input devices.
  state.stingRequested = command.sting;

  updateEnemies(state, dt, events);
  applyHits(state, events);

  updateSting(state, dt, events);
  state.stingRequested = false;

  updateForaging(state, dt, events);
  updateDeposit(state, events);

  for (const flower of state.flowers) {
    updateFlower(flower, dt);
  }

  state.damageFlash = Math.max(0, state.damageFlash - dt);
  state.tick += 1;
  state.time += dt;
}

/**
 * Resolve hits on the bee. The single entry point for damage.
 *
 * With three enemies each able to harm the bee, resolving damage inside the enemy code would
 * mean three places that could each forget the invulnerability check — and forgetting it
 * turns a swarm into an instant kill.
 *
 * The cost model is the important part (DESIGN §8.4): a hit removes a third of the *carried*
 * pollen. That makes the punishment proportional to how much risk the player chose to carry,
 * rather than a flat penalty that punishes the cautious exactly as hard as the greedy.
 *
 * `events` is iterated in order and the invulnerability is checked *before* each hit, so the
 * first hit of a step lands and every later one in the same step is ignored. That is what
 * stops a swarm of thirty wasps arriving in one frame from removing thirty lives.
 */
function applyHits(state: SimState, events: SimEvent[]): void {
  const bee = state.bee;

  for (const event of events) {
    if (event.kind !== "beeHit") continue;
    if (bee.invulnerable > 0) continue;

    bee.lives -= event.damage;
    bee.invulnerable = 1.2;
    state.damageFlash = 0.4;

    bee.pollen = Math.floor(bee.pollen * 0.66);

    // A hit cancels a forage in progress, so a dive genuinely punishes greed rather than
    // merely costing time.
    bee.foragingFlowerId = null;
    bee.forageProgress = 0;

    if (bee.lives <= 0) {
      // Downed away from the hive: the carried pollen is lost, anything already banked is
      // safe. Lives reset rather than ending the session — the session timer is what ends a
      // run (DESIGN §10.1), and a hard fail state would fight it.
      bee.lives = bee.maxLives;
      bee.pollen = 0;
      bee.invulnerable = 2.5;
      bee.position.x = HIVE.position.x;
      bee.position.y = HIVE.spawnAltitude;
      bee.position.z = HIVE.position.z + HIVE.spawnRadius;
      bee.velocity.x = 0;
      bee.velocity.y = 0;
      bee.velocity.z = 0;
      bee.attitude.pitch = 0;
      bee.attitude.roll = 0;
    }
  }
}
