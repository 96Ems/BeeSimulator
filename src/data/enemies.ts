/** Predator tuning. DESIGN §8. Every value is provisional. */
export const ENEMIES = {
  /**
   * The bird. **Unkillable**, repelled instead (DESIGN §8.2).
   *
   * The killability rule is the size ratio, which makes it self-explanatory: you cannot kill
   * something a thousand times your size. It is also the only rule that keeps the game from
   * becoming a shooter, because if birds could be killed the optimal strategy would become
   * "clear the meadow, then forage in peace".
   */
  bird: {
    count: 3,
    /** Radius of the lazy circuit it flies when nothing has its attention. */
    patrolRadius: 70,
    patrolAltitude: 34,
    patrolSpeed: 9,
    /** How far it can notice a bee. */
    detectRadius: 46,
    /** Plunge speed. Deliberately much faster than the bee's 5.4 m/s. */
    diveSpeed: 26,
    /** Seconds between dives, so it is a pressure rather than a machine gun. */
    diveCooldown: 6.5,
    /** Telegraph time before it commits, so the player can react. A dive you cannot see
     *  coming is not difficulty, it is a bug. */
    diveTelegraph: 0.9,
    /** Harassment meter. Filling it drives the bird off; it then returns. */
    harassmentMax: 100,
    harassmentPerHit: 34,
    /** How long it hunts elsewhere once driven off. Long enough to matter, short enough
     *  that the player never feels safe. */
    fleeSeconds: 26,
    /** Seconds it flounders after a missed dive, belly exposed — the co-op window. */
    recoverSeconds: 1.6,
    damage: 1,
    hitRadius: 2.6,
  },

  /**
   * The hornet. Killable, and it steals pollen rather than lives (DESIGN §8.3).
   *
   * Its rhythm is a *one-off cost*: fragile, flees after the first hit, permanently solved
   * once killed. Contrast the bird's permanent tax and the wasp's subscription.
   */
  hornet: {
    count: 8,
    minRadius: 40,
    maxRadius: 140,
    patrolRadius: 26,
    patrolSpeed: 6,
    detectRadius: 28,
    pursueSpeed: 7.4,
    /** Three hits to kill, but it flees after the first. */
    health: 3,
    fleeSeconds: 9,
    /** Fraction of the bee's *carried* pollen stolen per contact. */
    pollenSteal: 0.3,
    contactRadius: 1.3,
    /** Seconds before it can steal again from the same bee, so a single pass is one hit. */
    stealCooldown: 2.5,
  },

  /**
   * The wasp. Killable in one hit, but there are thirty of them (DESIGN §8.3).
   *
   * The critical detail is that their **aggression radius grows with the pollen you carry**,
   * which makes the richest return the most dangerous one — using a resource the player
   * already understands, so it needs no tutorial.
   */
  wasp: {
    count: 26,
    /** They orbit the hive, which is where the player must go. */
    orbitRadius: 20,
    orbitAltitude: 6,
    /** Rings rotate with gaps, so there is a way through. */
    orbitalSpeed: 0.45,
    radiusJitter: 5,
    /** Aggression radius with empty pollen, and at a full load. */
    aggroRadiusEmpty: 4,
    aggroRadiusFull: 20,
    chaseSpeed: 7,
    /** One hit kills, which is what makes clearing them a treadmill rather than a battle. */
    health: 1,
    /** Seconds before a killed wasp is replaced by the swarm. */
    respawnSeconds: 14,
    contactRadius: 0.9,
  },

  /** How far ahead of the bee the sting hitbox reaches, in metres. */
  stingReach: 1.7,
  /** Cooldown between stings, seconds. */
  stingCooldown: 0.6,
} as const;
