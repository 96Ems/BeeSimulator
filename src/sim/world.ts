/**
 * World generation. DESIGN §7.
 *
 * The world is a disc centred on the hive, divided into four 90° biome sectors. Vertical
 * generation is a `y = 0` plane in v1 — the Meadow **is** the baseline biome (DESIGN §7.3),
 * and the other three sectors are deliberately left unpopulated until the loop is proven.
 *
 * Generation is seeded rather than random, so the world is identical on every load. That
 * matters for more than tidiness: a co-op client and server must agree on where the flowers
 * are, and a bug report is only reproducible against a known world.
 */

import { FLOWER_TYPE_IDS, FLOWER_TYPES, type FlowerTypeId } from "../data/flowers";
import { WORLD } from "../data/tuning";
import { createFlower, type Flower } from "./entities/flower";
import type { Vec3 } from "./math";
import { createRng, type Rng } from "./rng";

/** Where the hive sits. Duplicated from tuning to keep `sim/` free of presentation imports. */
const HIVE_CENTRE = { x: 0, z: 0 };

/**
 * How many of each type to scatter, and the radial band they occupy.
 *
 * Density falls with distance while value rises: the far meadow is emptier but each flower
 * there is worth the trip. That is the risk curve of DESIGN §7.1 expressed as two numbers,
 * and it is why the player's heading is a difficulty choice without any menu.
 */
const SPAWN_PLAN: Record<
  FlowerTypeId,
  { count: number; minRadius: number; maxRadius: number }
> = {
  daisy: { count: 150, minRadius: 14, maxRadius: 90 },
  poppy: { count: 80, minRadius: 22, maxRadius: 110 },
  sunflower: { count: 34, minRadius: 40, maxRadius: 130 },
  rare: { count: 10, minRadius: 70, maxRadius: 140 },
};

export type World = {
  flowers: Flower[];
};

export function createWorld(seed = 20250917): World {
  const rng = createRng(seed);
  const flowers: Flower[] = [];
  let nextId = 1;

  for (const typeId of FLOWER_TYPE_IDS) {
    const plan = SPAWN_PLAN[typeId];

    for (let i = 0; i < plan.count; i += 1) {
      const position = scatter(rng, plan.minRadius, plan.maxRadius);
      flowers.push(createFlower(nextId, typeId, position));
      nextId += 1;
    }
  }

  // Keep the hive area clear: flowers inside the hive's footprint would be unreachable and
  // would clutter the one landmark the player navigates by.
  return { flowers };
}

/**
 * Uniform sample from an annulus.
 *
 * Uses the square-root transform on the radius, the same as `pointInDisc`. Sampling radius
 * linearly within a band produces a visible build-up of flowers against the inner edge,
 * because area grows with the square of the radius.
 */
function scatter(rng: Rng, minRadius: number, maxRadius: number): Vec3 {
  const angle = rng() * Math.PI * 2;
  const minSq = minRadius * minRadius;
  const maxSq = maxRadius * maxRadius;
  const radius = Math.sqrt(minSq + rng() * (maxSq - minSq));

  return {
    x: HIVE_CENTRE.x + Math.cos(angle) * radius,
    y: 0,
    z: HIVE_CENTRE.z + Math.sin(angle) * radius,
  };
}

/** Clamp any flower that generation somehow placed outside the playable disc. */
export function validateWorld(world: World): string[] {
  const problems: string[] = [];

  for (const flower of world.flowers) {
    const distance = Math.hypot(flower.position.x, flower.position.z);
    if (distance > WORLD.playableRadius) {
      problems.push(`flower ${flower.id} outside the world at ${distance.toFixed(1)} m`);
    }
    if (!(flower.typeId in FLOWER_TYPES)) {
      problems.push(`flower ${flower.id} has unknown type ${flower.typeId}`);
    }
  }

  return problems;
}
