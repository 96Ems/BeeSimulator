/**
 * Every tunable value in the game lives here.
 *
 * Rationale: balancing is a playtesting activity. Keeping the numbers in one file means
 * tuning is editing data, not hunting through logic. Nothing here has been validated by a
 * playtest yet — see docs/DESIGN.md §12 (Open questions).
 *
 * Units: metres, seconds, radians. See docs/DESIGN.md §4.3 for game scale.
 */

/** Rendered world and its scenery. */
export const WORLD = {
  /** Radius of the flightable world. DESIGN §7.2. */
  playableRadius: 150,

  /** Radius over which decorative grass is scattered. */
  grassRadius: 80,

  /** Grass blade count. Raise until the frame budget is threatened, then stop. */
  grassCount: 20_000,

  /** Grass blade dimensions. Roughly bee-height at game scale — deliberate. */
  grassMinHeight: 0.22,
  grassMaxHeight: 0.46,
  grassMinWidth: 0.008,
  grassMaxWidth: 0.018,
} as const;

/** The player bee. */
export const BEE = {
  /** Body length in metres, matching the exported model. */
  length: 0.36,

  /**
   * Minimum altitude above the ground. The bee cannot crash into the floor in v1: the
   * design has no fall damage, and a floor that kills would be a second, unrelated
   * failure mode competing with the predators.
   */
  minAltitude: 0.35,

  /**
   * Pollen capacity, before any skill-tree bonuses. DESIGN §3: the cap is the engine of the
   * entire risk model, not a balance knob — without it there is no reason to return,
   * therefore no exposure to danger, therefore no game.
   *
   * Tuned so a single rare flower very nearly fills the bee, two sunflowers fill it, and a
   * daisy run takes fifteen. Safe flowers are slow; rich flowers are a full commitment.
   */
  basePollenCapacity: 120,

  /** Seconds between stings. */
  stingCooldown: 0.6,
} as const;

/**
 * Helicopter flight model. DESIGN §4.
 *
 * The feel target: momentum carries you, the nose must dip to gain speed, and hovering is
 * pleasant enough to forage from. Every value here is provisional.
 *
 * First playtest feedback, and what it changed: the bee was "crazy fast", the auto-hold took
 * "very long", and it "glided too far". Measured cause — after releasing the stick the bee
 * needed ~2.5 s and tens of metres to settle. Top speed, damping, and the stabilization ramp
 * are all cut accordingly.
 */
export const FLIGHT = {
  /** Downward acceleration. */
  gravity: 9.81,

  /**
   * Collective authority in m/s² either side of hover, so the rotor can produce
   * `gravity + collectiveRange` upwards. Sets how aggressively the bee can climb.
   */
  collectiveRange: 11,

  /**
   * Speed caps. Horizontal is separated from vertical so a dive cannot trade all its
   * altitude for horizontal speed, which reads as a teleport.
   *
   * 7 m/s is 25 km/h. At game scale that still crosses the 150 m world quickly, but it is
   * slow enough to read the meadow and react to a threat.
   */
  maxHorizontalSpeed: 7,
  maxVerticalSpeed: 4.5,

  /**
   * Air resistance per second, applied as exact exponential decay.
   *
   * Raised from 0.55: the bee used to coast for seconds after the stick was released. Higher
   * damping also lowers the natural terminal speed, so the cap becomes a safety net rather
   * than the thing the player constantly slams into.
   */
  horizontalDamping: 1.35,
  verticalDamping: 2.4,

  /**
   * Extra damping applied while the player pulls *against* their own momentum.
   *
   * This is the "opposite key stops you" request: pitching up while still travelling forward
   * should feel like a brake, not like a slow complaint. Pure reverse thrust is enough in
   * theory but takes too long to bite, so the counter-input gets direct help.
   */
  brakeDamping: 3.4,

  /** Angular rate ceilings in rad/s, at full stick deflection. */
  pitchRate: 1.8,
  rollRate: 2.4,
  yawRate: 1.5,

  /** How fast angular velocity chases the commanded rate. Higher = crisper, less floaty. */
  attitudeResponse: 11.0,

  /** Attitude envelope. Stops the bee from tumbling past the point of recovery. */
  maxPitch: 0.85,
  maxRoll: 1.2,

  /**
   * Auto-stabilization, DESIGN §4.2. There is no "mouse released" event, so the trigger is
   * *input inactivity*. Both input schemes feed the same idle timer, which is why this works
   * identically for mouse and keyboard.
   *
   * The delay and ramp were halved and the damping nearly tripled after the first playtest:
   * "the auto hold is very long". Settling time is now roughly a third of a second instead
   * of two and a half.
   */
  stabilityDelay: 0.1,
  stabilityRamp: 0.15,
  stabilityGain: 9.0,
  /** Velocity damping applied while stabilized, so hovering actually holds position. */
  stabilityDamping: 4.5,

  /** Below this stick deflection, the input counts as "no input" for stabilization. */
  inputDeadzone: 0.02,

  /**
   * Thrust multiplier while the takeoff lock is active after harvesting a `land`-mode flower.
   * DESIGN §6.4: landing pays more, and this is what it costs — the bee is briefly heavy and
   * cannot escape, which is the whole reason to check the sky before committing to a sunflower.
   */
  takeoffThrustScale: 0.35,
} as const;

/** Input feel. */
export const INPUT = {
  /**
   * Mouse-as-stick sensitivity in radians of commanded rate per pixel of mouse movement.
   * The mouse commands a *rate*, not an attitude: that is what makes it a stick.
   */
  mouseSensitivity: 0.0042,

  /** How fast the virtual stick returns to centre once the mouse stops moving. */
  mouseStickReturn: 6.0,

  /** How fast the keyboard stick follows a held key (units per second, 0..1 scale). */
  keyboardStickAttack: 4.5,
  keyboardStickRelease: 8.0,
} as const;

/** The hive, and the player's spawn point. */
export const HIVE = {
  /** The hive sits at the centre of the world. DESIGN §7.1. */
  position: { x: 0, y: 0, z: 0 },
  /** Entrances face outward; the player spawns just outside. */
  spawnRadius: 6,
  spawnAltitude: 3.2,
  /** Horizontal distance within which pollen is deposited. */
  depositRadius: 4.2,
  /** Depositing requires the bee to be near the ground, so it cannot be done mid-flight. */
  depositMaxAltitude: 3.0,
} as const;

/** The session: five minutes, per DESIGN §10.1. */
export const SESSION = {
  durationSeconds: 300,
} as const;

/** Camera framing. ARCHITECTURE §6.4. */
export const CAMERA = {
  fov: 62,
  near: 0.02,
  far: 600,

  /** Offset behind and above the bee, in the bee's yaw frame (not roll — rolling is sickening). */
  offsetBack: 1.5,
  offsetUp: 0.55,
  lookAhead: 2.6,

  /** Spring damping. Lower = the camera trails further behind, which sells speed. */
  positionResponse: 6.5,
  targetResponse: 12.0,

  /** Field of view added at top speed, for a cheap sense of velocity. */
  speedFovBoost: 10,
} as const;

/** All colours in one place, so the palette stays coherent. */
export const PALETTE = {
  /** Sky colour. Also the fog colour, which is what makes the horizon dissolve. */
  sky: 0x8fc4e2,
  fogNear: 45,
  fogFar: 200,

  ground: 0x6f9e46,
  grassLow: 0x5d8a3a,
  grassHigh: 0x86b354,

  sun: 0xfff2dc,
  skyLight: 0xbcd9ff,
  groundBounce: 0x6b5a3a,

  hive: 0xc9a35c,
  hiveDark: 0x8a6a34,
} as const;
