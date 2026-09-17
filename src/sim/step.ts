/**
 * The simulation step.
 *
 * One function, one fixed timestep, no rendering, no device input. Everything the game
 * needs to advance by a known amount of time goes through here. Keeping it this small is
 * what makes the simulation testable headlessly and, later, runnable on a server.
 */

import type { InputCommand } from "./commands";
import { integrateFlight } from "./flight";
import type { SimState } from "./State";

/**
 * Advance the whole world by exactly `dt` seconds.
 *
 * Mutates `state` in place rather than returning a new one. The signature in
 * ARCHITECTURE §4.3 returns a new state; in practice the hot path must not allocate, and a
 * mutating step that is *deterministic* gives the same guarantees the tests actually care
 * about. The renderer keeps its own snapshots for interpolation.
 */
export function step(state: SimState, command: InputCommand, dt: number): void {
  integrateFlight(state.bee, command, dt);

  state.tick += 1;
  state.time += dt;
}
