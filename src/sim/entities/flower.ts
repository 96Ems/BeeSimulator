/**
 * Flower entities and the pollen economy. DESIGN Â§6.
 *
 * A flower's state is deliberately tiny â€” it is a position, a type, and two timers. All the
 * behaviour lives in `forage.ts`, and all the numbers live in `data/flowers.ts`, so
 * rebalancing is editing data.
 */

import { FLOWER_TYPES, type FlowerTypeId } from "../../data/flowers";
import type { Vec3 } from "../math";

export type Flower = {
  readonly id: number;
  readonly typeId: FlowerTypeId;
  /** Base of the flower, sitting on the ground. */
  position: Vec3;
  /**
   * Pollen still available, 0..1. Shared between all bees, so in co-op two players cannot
   * double-dip the same flower (DESIGN Â§11.1).
   */
  richness: number;
  /** Seconds until refill. Ignored while `richness > 0`. */
  respawnTimer: number;
};

export function createFlower(
  id: number,
  typeId: FlowerTypeId,
  position: Vec3,
): Flower {
  return {
    id,
    typeId,
    position,
    richness: 1,
    respawnTimer: 0,
  };
}

/** World-space point the bee must reach to forage. */
export function foragePoint(flower: Flower, out: Vec3): Vec3 {
  const type = FLOWER_TYPES[flower.typeId];
  out.x = flower.position.x;
  out.y = flower.position.y + type.headHeight;
  out.z = flower.position.z;
  return out;
}

/**
 * Advance a flower's respawn timer.
 *
 * Refills in one step rather than gradually: a partially-refilled flower would show a
 * half-open bloom, and the player would have no way to tell how much was left. The binary
 * available/depleted read is worth more than the gradual one.
 */
export function updateFlower(flower: Flower, dt: number): void {
  if (flower.richness > 0) return;

  flower.respawnTimer -= dt;
  if (flower.respawnTimer <= 0) {
    flower.richness = 1;
    flower.respawnTimer = 0;
  }
}

/** Deplete a flower and start its respawn clock. */
export function depleteFlower(flower: Flower): void {
  flower.richness = 0;
  flower.respawnTimer = FLOWER_TYPES[flower.typeId].respawnSeconds;
}
