/**
 * Entry point: builds the world, wires input -> simulation -> rendering, and runs the loop.
 *
 * The wiring is deliberately explicit and in one place. The three layers must not know about
 * each other (ARCHITECTURE §1):
 *
 *     input  ->  InputCommand  ->  sim.step()  ->  SimState  ->  render
 *
 * The only module aware of all three is this one.
 */

import { FLIGHT, HIVE, SESSION } from "./data/tuning";
import { FixedStepLoop } from "./game/Loop";
import { InputManager } from "./input/InputManager";
import { FollowCamera } from "./render/Camera";
import { createRenderer } from "./render/Renderer";
import { createSceneBundle } from "./render/Scene";
import { FlowerField } from "./render/scenery/Flowers";
import { createHive } from "./render/scenery/Hive";
import { BeeView } from "./render/views/BeeView";
import { EnemyField } from "./render/views/EnemyField";
import { createRenderBee, interpolateBee } from "./render/interpolation";
import { neutralCommand } from "./sim/commands";
import { createEnemies } from "./sim/entities/enemies";
import type { Enemy } from "./sim/entities/enemies";
import type { SimEvent } from "./sim/events";
import { FLIGHT_STEP } from "./sim/flight";
import { createRng } from "./sim/rng";
import { copyBee, createBee, createInitialState } from "./sim/State";
import { step } from "./sim/step";
import { createWorld } from "./sim/world";
import { Hud } from "./ui/hud";

const canvas = document.getElementById("app");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("#app canvas is missing");

const hudElement = document.getElementById("debug");
if (!hudElement) throw new Error("#debug element is missing");

const hud = new Hud(hudElement);

// ── rendering ────────────────────────────────────────────────────────────────────

const renderer = createRenderer(canvas);
const { scene, focusShadows } = createSceneBundle();
scene.add(createHive());

// ── simulation ───────────────────────────────────────────────────────────────────

const SEED = 20250917;
const state = createInitialState(SEED);

// One seeded generator feeds both generators, so the world and the predators are reproducible
// together. A co-op client and server must agree on both.
const rng = createRng(SEED + 1);
state.flowers = createWorld(SEED).flowers;
state.enemies = createEnemies(rng);

/** Pre-step snapshot, so the renderer can interpolate between two simulation states. */
const previousBee = createBee();

function respawn(): void {
  const bee = state.bee;
  bee.position.x = HIVE.position.x;
  bee.position.y = HIVE.spawnAltitude;
  bee.position.z = HIVE.position.z + HIVE.spawnRadius;

  bee.velocity.x = 0;
  bee.velocity.y = 0;
  bee.velocity.z = 0;

  // Facing away from the hive, out over the meadow — the direction play should start in.
  bee.attitude.yaw = Math.PI;
  bee.attitude.pitch = 0;
  bee.attitude.roll = 0;

  bee.angular.yaw = 0;
  bee.angular.pitch = 0;
  bee.angular.roll = 0;
  bee.idleTime = 0;
  bee.foragingFlowerId = null;
  bee.forageProgress = 0;

  copyBee(bee, previousBee);
}

respawn();

// Session accounting. Kept outside `SimState` because it is derived from a stream of events
// rather than simulated — the simulation does not need to know that a score exists.
const session = {
  elapsed: 0,
  deposited: 0,
  trips: 0,
  bestTrip: 0,
  tripStart: 0,
};

// ── models ───────────────────────────────────────────────────────────────────────

const beeView = await BeeView.load("/assets/bee.glb");
scene.add(beeView.root);

const flowerField = await FlowerField.load(state.flowers);
for (const object of flowerField.objects) scene.add(object);

const enemyField = await EnemyField.load(state.enemies);
for (const object of enemyField.objects) scene.add(object);

// ── camera ───────────────────────────────────────────────────────────────────────

const renderBee = createRenderBee();
interpolateBee(previousBee, state.bee, 0, renderBee);

const followCamera = new FollowCamera(window.innerWidth / window.innerHeight);
followCamera.setAspect(window.innerWidth / window.innerHeight);
followCamera.reset(renderBee);

// ── input ────────────────────────────────────────────────────────────────────────

const input = new InputManager(canvas);
input.attach();

let command = neutralCommand();

// Developer hotkeys are handled as events rather than through the binding table. They are
// conveniences, not player actions: routing them through the bindings would clutter the
// rebinding menu with keys nobody wants to remap, and would let a player unbind respawn.
window.addEventListener("keydown", (event) => {
  if (event.repeat) return;

  if (event.code === "KeyR") {
    respawn();
    followCamera.reset(renderBee);
  } else if (event.code === "KeyM") {
    input.setScheme(input.currentScheme === "mouse" ? "keyboard" : "mouse");
  }
});

// ── loop ─────────────────────────────────────────────────────────────────────────

/** Reused so the per-step event collection allocates nothing. */
const events: SimEvent[] = [];

const loop = new FixedStepLoop(FLIGHT_STEP, (dt) => {
  // Snapshot *before* stepping. With several steps in one frame this ends up holding the
  // state before the last step, which is exactly the pair the renderer interpolates between.
  copyBee(state.bee, previousBee);

  events.length = 0;
  step(state, command, dt, events);
  consume(events);
  session.elapsed += dt;
});

function consume(list: readonly SimEvent[]): void {
  for (const event of list) {
    switch (event.kind) {
      case "deposited": {
        session.deposited += event.pollen;
        session.trips += 1;
        session.bestTrip = Math.max(session.bestTrip, event.pollen);
        session.tripStart = session.elapsed;
        break;
      }
      case "completed":
      case "enemyKilled":
      case "enemyRepelled":
        break;
      default:
        break;
    }
  }
}

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  followCamera.setAspect(width / height);
}

window.addEventListener("resize", resize);
resize();

// ── frame ────────────────────────────────────────────────────────────────────────

let previousTime = performance.now();
let smoothedFps = 60;
let hudAccumulator = 0;

renderer.setAnimationLoop((time: number) => {
  // Clamp the frame delta: a backgrounded tab or a breakpoint can produce a delta of seconds,
  // and the loop's catch-up cap handles what is left.
  const frameSeconds = Math.min((time - previousTime) / 1000, 0.1);
  previousTime = time;

  command = input.sample(frameSeconds);

  loop.advance(frameSeconds);

  interpolateBee(previousBee, state.bee, loop.alpha, renderBee);
  beeView.update(renderBee, frameSeconds);

  flowerField.update(state.flowers);
  enemyField.update(state.enemies, frameSeconds);

  followCamera.update(renderBee, frameSeconds);
  focusShadows(renderBee.position.x, renderBee.position.z);

  renderer.render(scene, followCamera.camera);

  // HUD at 5 Hz. Rewriting the DOM every frame costs more than it looks, and the numbers are
  // unreadable at 144 Hz anyway.
  const instantFps = 1 / Math.max(frameSeconds, 1e-6);
  smoothedFps += (instantFps - smoothedFps) * 0.1;
  hudAccumulator += frameSeconds;

  if (hudAccumulator >= 0.2) {
    hudAccumulator = 0;
    updateHud();
  }
});

function updateHud(): void {
  const bee = state.bee;
  const nearest = nearestThreat(state.enemies, bee.position);
  const elapsedMinutes = Math.max(session.elapsed, 1) / 60;

  hud.update({
    fps: smoothedFps,
    draws: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    simSteps: loop.steps,

    speed: Math.hypot(bee.velocity.x, bee.velocity.z),
    altitude: bee.position.y,
    distanceFromHive: Math.hypot(bee.position.x, bee.position.z),
    pitch: bee.attitude.pitch,
    roll: bee.attitude.roll,
    stabilized: bee.idleTime > FLIGHT.stabilityDelay,

    pollen: bee.pollen,
    pollenCapacity: bee.pollenCapacity,
    lives: bee.lives,
    maxLives: bee.maxLives,

    forageProgress: bee.foragingFlowerId === null ? null : bee.forageProgress,
    forageLabel: forageLabel(bee.foragingFlowerId),

    timeLeft: Math.max(0, SESSION.durationSeconds - session.elapsed),
    deposited: session.deposited,
    trips: session.trips,
    pollenPerMinute: session.deposited / elapsedMinutes,

    threatDistance: nearest?.distance ?? null,
    threatLabel: nearest?.label ?? null,

    scheme: input.currentScheme,
    pointerLocked: input.isPointerLocked,
  });
}

const THREAT_LABELS: Record<Enemy["kind"], string> = {
  bird: "BIRD",
  hornet: "HORNET",
  wasp: "WASPS",
};

function nearestThreat(
  enemies: readonly Enemy[],
  position: { x: number; y: number; z: number },
): { distance: number; label: string } | null {
  let best: { distance: number; label: string } | null = null;

  for (const enemy of enemies) {
    if (enemy.state === "dead") continue;
    // Only threats that are actually hunting you are worth a warning. A patrolling hornet two
    // hundred metres away shouting "HORNET" would be noise, and noise destroys the signal.
    if (enemy.kind !== "bird" && enemy.state === "patrol") continue;

    const distance = Math.hypot(
      enemy.position.x - position.x,
      enemy.position.y - position.y,
      enemy.position.z - position.z,
    );

    if (best === null || distance < best.distance) {
      best = { distance, label: THREAT_LABELS[enemy.kind] };
    }
  }

  return best;
}

function forageLabel(flowerId: number | null): string | null {
  if (flowerId === null) return null;
  const flower = state.flowers.find((candidate) => candidate.id === flowerId);
  if (!flower) return null;
  return flower.typeId.toUpperCase();
}
