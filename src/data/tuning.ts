/**
 * Every tunable value in the game lives here.
 *
 * Rationale: balancing is a playtesting activity. Keeping the numbers in one file means
 * tuning is editing data, not hunting through logic. Values marked "provisional" have not
 * been validated by a single playtest — see docs/DESIGN.md §12 (Open questions).
 *
 * Units: meters, seconds, radians. See docs/DESIGN.md §4.3 for game scale.
 */

/** The rendered world and its scenery. */
export const WORLD = {
  /** Radius of the flightable world. DESIGN §7.2: ~150 m. */
  playableRadius: 150,

  /** Radius over which decorative grass is scattered. */
  grassRadius: 70,

  /** Grass blade count. Raise until the frame-rate target is threatened, then stop. */
  grassCount: 20_000,

  /** Grass blade dimensions. Roughly bee-height at game scale — deliberate. */
  grassMinHeight: 0.22,
  grassMaxHeight: 0.46,
  grassMinWidth: 0.008,
  grassMaxWidth: 0.018,
} as const;

/** Camera framing. ARCHITECTURE §6.4. */
export const CAMERA = {
  fov: 62,
  near: 0.02,
  far: 600,
  startX: 0,
  startY: 4,
  startZ: 11,
} as const;

/** All colours in one place, so the palette stays coherent. */
export const PALETTE = {
  /** Sky colour. Also used for the fog, which is what makes the horizon dissolve. */
  sky: 0x8fc4e2,
  fogNear: 45,
  fogFar: 200,

  ground: 0x6f9e46,
  grassLow: 0x5d8a3a,
  grassHigh: 0x86b354,

  sun: 0xfff2dc,
  skyLight: 0xbcd9ff,
  groundBounce: 0x6b5a3a,
} as const;
