import { describe, expect, it } from "vitest";
import { FLOWER_TYPES } from "../data/flowers";
import { BEE, HIVE } from "../data/tuning";
import { neutralCommand, type InputCommand } from "./commands";
import { createEnemies } from "./entities/enemies";
import type { SimEvent } from "./events";
import { FLIGHT_STEP } from "./flight";
import { createRng } from "./rng";
import { createBee, createInitialState, type SimState } from "./State";
import { step } from "./step";
import { createWorld, validateWorld } from "./world";

/** Build a state with a generated world, as the game does. */
function makeState(): SimState {
  const state = createInitialState();
  state.flowers = createWorld().flowers;
  state.enemies = createEnemies(createRng(99));
  return state;
}

/**
 * A state with no predators.
 *
 * Foraging tests must not share a world with enemies: a bird that happens to dive mid-test
 * removes a third of the pollen and the assertion fails for a reason that has nothing to do
 * with foraging. Isolating the system under test is worth the extra helper.
 */
function makeQuietState(): SimState {
  const state = createInitialState();
  state.flowers = createWorld().flowers;
  state.enemies = [];
  return state;
}

/** Park the bee at a flower's forage point, stationary. */
function placeAtFlower(state: SimState, typeId: keyof typeof FLOWER_TYPES): number {
  const flower = state.flowers.find((candidate) => candidate.typeId === typeId);
  if (!flower) throw new Error(`no ${typeId} in the generated world`);

  const type = FLOWER_TYPES[flower.typeId];
  state.bee.position.x = flower.position.x;
  state.bee.position.y = flower.position.y + type.headHeight;
  state.bee.position.z = flower.position.z;
  state.bee.velocity.x = 0;
  state.bee.velocity.y = 0;
  state.bee.velocity.z = 0;
  return flower.id;
}

/** Run the simulation with a still bee and hands off the stick. */
function hover(state: SimState, seconds: number, command: InputCommand = neutralCommand()): SimEvent[] {
  const events: SimEvent[] = [];
  const steps = Math.round(seconds / FLIGHT_STEP);
  for (let i = 0; i < steps; i += 1) {
    events.length = 0;
    step(state, command, FLIGHT_STEP, events);
  }
  return events;
}

describe("world generation", () => {
  it("is deterministic for a given seed", () => {
    const a = createWorld(1234);
    const b = createWorld(1234);
    expect(a.flowers.map((f) => [f.typeId, f.position.x, f.position.z])).toEqual(
      b.flowers.map((f) => [f.typeId, f.position.x, f.position.z]),
    );
  });

  it("produces different worlds for different seeds", () => {
    const a = createWorld(1);
    const b = createWorld(2);
    expect(a.flowers[0]?.position.x).not.toBe(b.flowers[0]?.position.x);
  });

  it("keeps every flower inside the playable world", () => {
    // Nothing generated may be unreachable, because an unreachable flower is invisible in
    // code review and only shows up as a player who cannot find the last rare flower.
    expect(validateWorld(createWorld())).toEqual([]);
  });

  it("places the rich flowers farther out than the cheap ones", () => {
    // This is the whole risk curve of DESIGN §7.1 expressed as a test: the reward and the
    // danger must share a location, or heading choice stops being a difficulty choice.
    const world = createWorld();
    const meanRadius = (typeId: string): number => {
      const subset = world.flowers.filter((f) => f.typeId === typeId);
      return subset.reduce((sum, f) => sum + Math.hypot(f.position.x, f.position.z), 0) / subset.length;
    };

    expect(meanRadius("rare")).toBeGreaterThan(meanRadius("daisy"));
    expect(meanRadius("sunflower")).toBeGreaterThan(meanRadius("poppy"));
  });

  it("keeps the hive footprint clear", () => {
    const tooClose = createWorld().flowers.filter(
      (f) => Math.hypot(f.position.x, f.position.z) < HIVE.depositRadius + 2,
    );
    expect(tooClose).toEqual([]);
  });
});

describe("foraging", () => {
  it("accrues pollen progressively and completes at the flower's yield", () => {
    const state = makeQuietState();
    placeAtFlower(state, "daisy");

    // Halfway through a daisy's forage there should be partial progress and no pollen yet.
    hover(state, FLOWER_TYPES.daisy.forageSeconds * 0.5);
    expect(state.bee.pollen).toBe(0);
    expect(state.bee.forageProgress).toBeGreaterThan(0.3);
    expect(state.bee.forageProgress).toBeLessThan(0.8);

    hover(state, FLOWER_TYPES.daisy.forageSeconds);
    expect(state.bee.pollen).toBe(FLOWER_TYPES.daisy.yield);
  });

  it("loses the remainder when the bee leaves early", () => {
    // The design promise of DESIGN §6.2: foraging is a wager, not a pause. If interrupting
    // were free, the predator dilemma would evaporate.
    const state = makeQuietState();
    placeAtFlower(state, "daisy");
    hover(state, FLOWER_TYPES.daisy.forageSeconds * 0.7);

    const partial = state.bee.forageProgress;
    expect(partial).toBeGreaterThan(0.5);

    // Fly away.
    state.bee.position.y += 40;
    hover(state, 0.1);

    expect(state.bee.pollen).toBe(0);
    expect(state.bee.forageProgress).toBe(0);
    expect(state.bee.foragingFlowerId).toBeNull();
  });

  it("refuses to forage when already full rather than wasting the flower", () => {
    const state = makeQuietState();
    state.bee.pollen = state.bee.pollenCapacity;
    const flowerId = placeAtFlower(state, "rare");

    hover(state, FLOWER_TYPES.rare.forageSeconds + 0.5);

    const flower = state.flowers.find((f) => f.id === flowerId);
    expect(flower?.richness).toBe(1);
    expect(state.bee.pollen).toBe(BEE.basePollenCapacity);
  });

  it("depletes the flower and respawns it after its timer", () => {
    const state = makeQuietState();
    const flowerId = placeAtFlower(state, "daisy");
    hover(state, FLOWER_TYPES.daisy.forageSeconds + 0.2);

    const flower = state.flowers.find((f) => f.id === flowerId);
    expect(flower?.richness).toBe(0);

    // Move away so the bee does not simply re-forage it, then wait out the respawn.
    state.bee.position.y += 40;
    hover(state, FLOWER_TYPES.daisy.respawnSeconds + 0.5);
    expect(flower?.richness).toBe(1);
  });

  it("charges a takeoff penalty after landing, and not after hovering", () => {
    // The entire cost of the high-yield flowers (DESIGN §6.4). Without it, landing is
    // strictly better than hovering and the flower types collapse into one.
    const landed = makeQuietState();
    placeAtFlower(landed, "sunflower");
    expect(FLOWER_TYPES.sunflower.mode).toBe("land");
    hover(landed, FLOWER_TYPES.sunflower.forageSeconds + 0.2);
    expect(landed.bee.takeoffLock).toBeGreaterThan(0);

    const hovered = makeQuietState();
    placeAtFlower(hovered, "daisy");
    expect(FLOWER_TYPES.daisy.mode).toBe("hover");
    hover(hovered, FLOWER_TYPES.daisy.forageSeconds + 0.2);
    expect(hovered.bee.takeoffLock).toBe(0);
  });
});

describe("depositing", () => {
  it("banks pollen at the hive and restores a life", () => {
    const state = makeQuietState();
    state.bee.pollen = 60;
    state.bee.lives = 1;
    state.bee.position.x = HIVE.position.x;
    state.bee.position.y = 1.5;
    state.bee.position.z = HIVE.position.z;

    const events: SimEvent[] = [];
    step(state, neutralCommand(), FLIGHT_STEP, events);

    expect(state.bee.pollen).toBe(0);
    expect(state.bee.lives).toBe(2);
    expect(events.some((event) => event.kind === "deposited")).toBe(true);
  });

  it("does not bank pollen from far away or from high altitude", () => {
    const state = makeQuietState();
    state.bee.pollen = 60;

    state.bee.position.x = HIVE.position.x;
    state.bee.position.z = HIVE.position.z + 40;
    state.bee.position.y = 1.5;
    hover(state, 0.1);
    expect(state.bee.pollen).toBe(60);

    // Hovering above the hive must not count either, or depositing would be a fly-by.
    state.bee.position.z = HIVE.position.z;
    state.bee.position.y = 40;
    hover(state, 0.1);
    expect(state.bee.pollen).toBe(60);
  });
});

describe("predators", () => {
  it("generates the configured roster", () => {
    const state = makeState();
    const count = (kind: string): number =>
      state.enemies.filter((enemy) => enemy.kind === kind).length;

    expect(count("bird")).toBe(3);
    expect(count("hornet")).toBeGreaterThan(0);
    expect(count("wasp")).toBeGreaterThan(20);
  });

  it("puts the swarm on the hive, which is where the player must go", () => {
    // DESIGN §8.3: the reward and the danger share a location. If the swarm drifted away from
    // the hive the whole mechanism would stop working.
    const state = makeState();
    const wasps = state.enemies.filter((enemy) => enemy.kind === "wasp");

    for (const wasp of wasps) {
      const distanceFromHive = Math.hypot(
        wasp.position.x - HIVE.position.x,
        wasp.position.z - HIVE.position.z,
      );
      expect(distanceFromHive).toBeLessThan(45);
    }
  });

  it("never lets a bird be killed, however many times it is stung", () => {
    // DESIGN §8.2. If this ever regresses, the optimal strategy becomes "clear the meadow,
    // then forage in peace" and the game turns into a shooter.
    const state = makeState();
    const bird = state.enemies.find((enemy) => enemy.kind === "bird");
    if (!bird) throw new Error("no bird generated");

    for (let i = 0; i < 50; i += 1) {
      state.bee.position.x = bird.position.x;
      state.bee.position.y = bird.position.y;
      state.bee.position.z = bird.position.z;
      state.bee.sinceSting = 99;
      state.stingRequested = true;
      step(state, { ...neutralCommand(), sting: true }, FLIGHT_STEP, []);
    }

    expect(bird.state).not.toBe("dead");
  });

  it("kills a hornet in three stings, and makes it flee after the first", () => {
    const state = makeState();
    const hornet = state.enemies.find((enemy) => enemy.kind === "hornet");
    if (!hornet) throw new Error("no hornet generated");

    const sting = (): void => {
      // The sting tip reaches `stingReach` ahead of the body, and the bee faces -Z at yaw 0.
      // So the bee must sit *behind* the target for the tip to land on it — placing the bee
      // on top of the hornet aims 1.7 m past it.
      state.bee.attitude.yaw = 0;
      state.bee.position.x = hornet.position.x;
      state.bee.position.y = hornet.position.y;
      state.bee.position.z = hornet.position.z + 1.7;
      state.bee.sinceSting = 99;
      step(state, { ...neutralCommand(), sting: true }, FLIGHT_STEP, []);
    };

    sting();
    expect(hornet.health).toBe(2);
    // It flees after the first hit, so killing one costs three separate engagements.
    expect(hornet.state).toBe("flee");

    // Let it return to patrolling before finishing it.
    hornet.state = "patrol";
    sting();
    hornet.state = "patrol";
    sting();

    expect(hornet.state).toBe("dead");
  });

  it("kills a wasp in a single sting", () => {
    const state = makeState();
    const wasp = state.enemies.find((enemy) => enemy.kind === "wasp");
    if (!wasp) throw new Error("no wasp generated");

    // Behind the wasp, so the sting tip lands on it. See the hornet test above.
    state.bee.attitude.yaw = 0;
    state.bee.position.x = wasp.position.x;
    state.bee.position.y = wasp.position.y;
    state.bee.position.z = wasp.position.z + 1.7;
    state.bee.sinceSting = 99;
    step(state, { ...neutralCommand(), sting: true }, FLIGHT_STEP, []);

    expect(wasp.state).toBe("dead");
  });

  it("removes at most one life per step, however many enemies touch at once", () => {
    // The regression guard for damage resolution. If the invulnerability window is not
    // applied between hits in the same step, a swarm of thirty wasps arriving together
    // removes thirty lives in one frame.
    const state = makeState();
    state.bee.lives = 5;
    state.bee.maxLives = 5;
    state.bee.invulnerable = 0;
    state.bee.position.y = 6;

    const wasps = state.enemies.filter((enemy) => enemy.kind === "wasp").slice(0, 8);
    for (const wasp of wasps) {
      wasp.position.x = state.bee.position.x;
      wasp.position.y = state.bee.position.y;
      wasp.position.z = state.bee.position.z;
      wasp.state = "attack";
    }

    const events: SimEvent[] = [];
    step(state, neutralCommand(), FLIGHT_STEP, events);

    expect(state.bee.lives).toBe(4);
  });

  it("shows aggression that grows with the pollen carried", () => {
    // The best emergent rule in the design (DESIGN §8.3): your cargo is your bait, so the
    // richest return is the most dangerous one. It only works if a loaded bee is genuinely
    // noticed from further away.
    const engaged = (load: number): boolean => {
      const state = makeState();
      state.bee.pollen = load;

      // A wasp sitting at a fixed distance from the bee, well outside the empty-load radius.
      const wasp = state.enemies.find((enemy) => enemy.kind === "wasp");
      if (!wasp) throw new Error("no wasp");
      state.bee.position.y = 12;
      wasp.position.x = state.bee.position.x + 12;
      wasp.position.y = state.bee.position.y;
      wasp.position.z = state.bee.position.z;
      wasp.state = "patrol";

      step(state, neutralCommand(), FLIGHT_STEP, []);

      // Widened deliberately: TypeScript narrowed `state` to "patrol" at the assignment
      // above and does not account for `step` having mutated it.
      const after: string = wasp.state;
      return after === "attack";
    };

    expect(engaged(0)).toBe(false);
    expect(engaged(state0Capacity())).toBe(true);
  });
});

function state0Capacity(): number {
  return BEE.basePollenCapacity;
}

describe("determinism of the full step", () => {
  it("produces identical worlds from identical inputs", () => {
    // The property that makes replays, reproducible bug reports, and server-authoritative
    // co-op possible (ARCHITECTURE §9). It also catches any stray Math.random or Date.now
    // that creeps into the simulation.
    const run = (): string => {
      const state = makeState();
      const command = { ...neutralCommand(), pitch: -0.8, roll: 0.4, yaw: 0.3, thrust: 0.2 };
      for (let i = 0; i < 600; i += 1) step(state, command, FLIGHT_STEP, []);
      return JSON.stringify({
        bee: state.bee.position,
        attitude: state.bee.attitude,
        pollen: state.bee.pollen,
        enemies: state.enemies.map((e) => [e.kind, e.state, e.position.x, e.position.z]),
      });
    };

    expect(run()).toBe(run());
  });
});

void createBee;
void hover;
