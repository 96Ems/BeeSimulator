/**
 * Flower types. DESIGN §6.3.
 *
 * The governing rule is `yield ∝ risk × time`: a flower that pays more must cost more time
 * to harvest and be more exposed while you do it. That is what makes "should I take one more
 * flower?" a real question rather than an obvious yes.
 *
 * The player is meant to learn four flowers, not four abstract rules, so each type differs on
 * every axis at once — mode, payout, duration, respawn — and its identity is readable from
 * the silhouette alone (docs/ASSETS.md).
 *
 * Every number here is provisional; none has survived a balance pass.
 */

export type FlowerTypeId = "daisy" | "poppy" | "sunflower" | "rare";

export type ForageMode = "hover" | "land";

export type FlowerType = {
  id: FlowerTypeId;
  label: string;
  /** Filename under `public/assets/`. */
  asset: string;
  /**
   * `hover` can be foraged while drifting slowly.
   * `land` demands near-total stillness *and* charges a takeoff penalty afterwards, which is
   * the whole risk of the high-yield flowers (DESIGN §6.4).
   */
  mode: ForageMode;
  /** Pollen granted for a complete forage. */
  yield: number;
  /** Seconds of uninterrupted proximity required. */
  forageSeconds: number;
  /** Seconds before the flower refills. */
  respawnSeconds: number;
  /** Height of the flower head above the base, in metres — the point the bee must reach. */
  headHeight: number;
  /** Radius around the head within which foraging is possible. */
  reach: number;
};

export const FLOWER_TYPES: Record<FlowerTypeId, FlowerType> = {
  daisy: {
    id: "daisy",
    label: "Daisy",
    asset: "daisy.glb",
    mode: "hover",
    yield: 8,
    forageSeconds: 0.9,
    respawnSeconds: 10,
    headHeight: 0.55,
    reach: 0.7,
  },
  poppy: {
    id: "poppy",
    label: "Poppy",
    asset: "poppy.glb",
    mode: "hover",
    yield: 16,
    forageSeconds: 1.6,
    respawnSeconds: 18,
    headHeight: 1.1,
    reach: 0.8,
  },
  sunflower: {
    id: "sunflower",
    label: "Sunflower",
    asset: "sunflower.glb",
    mode: "land",
    yield: 45,
    forageSeconds: 3.0,
    respawnSeconds: 32,
    headHeight: 3.6,
    reach: 1.4,
  },
  rare: {
    id: "rare",
    label: "Rare flower",
    asset: "rare-flower.glb",
    mode: "land",
    // One rare flower very nearly fills an entire pollen load: the "rich and dangerous" read
    // in DESIGN §6.3 is only true if the payout is genuinely dramatic.
    yield: 120,
    forageSeconds: 4.5,
    respawnSeconds: 75,
    headHeight: 2.45,
    reach: 1.5,
  },
};

export const FLOWER_TYPE_IDS = Object.keys(FLOWER_TYPES) as FlowerTypeId[];

/**
 * How fast the bee may be travelling to start foraging, per mode.
 *
 * Landing has to be a real commitment: if it allowed the same drift as hovering, the takeoff
 * penalty would be the only cost and the choice would be trivial.
 */
export const FORAGE_MAX_SPEED: Record<ForageMode, number> = {
  hover: 1.4,
  land: 0.35,
};
