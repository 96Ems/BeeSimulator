/**
 * Entry point: builds the world, wires input -> simulation -> rendering, and runs the loop.
 *
 * The wiring is deliberately explicit and in one place. The three layers must not know about
 * each other (ARCHITECTURE §1):
 *
 *     input  ->  InputCommand  ->  sim.step()  ->  SimState  ->  render
 *
 * The only module aware of all three is this one. Progression sits alongside: it *reads* the
 * simulation (through events) and *writes* only the bee's stat block, never the world.
 */

import { BEE, FLIGHT, HIVE, SESSION } from "./data/tuning";
import { ENEMIES } from "./data/enemies";
import { AudioEngine } from "./audio/AudioEngine";
import { createSessionStats, onDeposit, onHit, pollenPerMinute, resetSession } from "./game/Session";
import { FixedStepLoop } from "./game/Loop";
import { InputManager } from "./input/InputManager";
import {
  loadProgression,
  loadRecords,
  loadSettings,
  mergeSession,
  saveProgression,
  saveSettings,
  type Progression,
  type Records,
} from "./progression/save";
import { computeRole } from "./progression/role";
import { foldInvestment } from "./progression/tree";
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
import { applyStats, copyBee, createBee, createInitialState } from "./sim/State";
import { step } from "./sim/step";
import { createWorld } from "./sim/world";
import { Hud } from "./ui/hud";
import { FlashOverlay, installFlashStyles } from "./ui/flash";
import { ResultsScreen, installResultsStyles } from "./ui/results";
import { SettingsPanel } from "./ui/settingsPanel";
import { installSettingsStyles } from "./ui/settingsStyles";
import { TreePanel, installTreePanelStyles } from "./ui/treePanel";

const canvas = document.getElementById("app");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("#app canvas is missing");

const hudElement = document.getElementById("debug");
if (!hudElement) throw new Error("#debug element is missing");

const hud = new Hud(hudElement);

// ── progression ──────────────────────────────────────────────────────────────────

const progression: Progression = loadProgression();
let records: Records = loadRecords();

/** The folded skill tree. Recomputed only when the investment changes. */
let stats = buildStats();

function buildStats(): ReturnType<typeof foldInvestment> {
  return foldInvestment(
    {
      pollenCapacity: BEE.basePollenCapacity,
      maxLives: 3,
      stingReach: ENEMIES.stingReach,
    },
    progression.investment,
  );
}

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

const session = createSessionStats();

function respawn(atHive = true): void {
  const bee = state.bee;

  if (atHive) {
    bee.position.x = HIVE.position.x;
    bee.position.y = HIVE.spawnAltitude;
    bee.position.z = HIVE.position.z + HIVE.spawnRadius;

    // Facing away from the hive, out over the meadow: the direction play should start in.
    bee.attitude.yaw = Math.PI;
  }

  bee.velocity.x = 0;
  bee.velocity.y = 0;
  bee.velocity.z = 0;
  bee.attitude.pitch = 0;
  bee.attitude.roll = 0;
  bee.angular.yaw = 0;
  bee.angular.pitch = 0;
  bee.angular.roll = 0;
  bee.idleTime = 0;
  bee.foragingFlowerId = null;
  bee.forageProgress = 0;

  // Skill tree effects are baked in on respawn rather than every step, so the hot path reads
  // only the bee and an upgrade lands when the player is back at the hive - which is where
  // they earn it anyway.
  applyStats(bee, stats);
  bee.lives = bee.maxLives;
  bee.pollen = 0;

  copyBee(bee, previousBee);
}

// `respawn` deliberately does not touch the camera: it is called before the camera exists
// (initial spawn) and from the results screen. Callers that can reset the camera do so.
respawn();

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

// ── ui ───────────────────────────────────────────────────────────────────────────

installTreePanelStyles();
installResultsStyles();
installFlashStyles();
installSettingsStyles();

const flash = new FlashOverlay(document.body);

/** Set by a completed forage, decayed each frame. Presentation only. */
let rewardFlash = 0;

const treePanel = new TreePanel(document.body, {
  onPurchase: (nodeId, cost) => {
    progression.pollen -= cost;
    progression.investment[nodeId] = (progression.investment[nodeId] ?? 0) + 1;

    // Persist immediately. A player who invests and then closes the tab must not lose the
    // spend, and there is no other save point inside the panel.
    saveProgression(progression);
    stats = buildStats();
    treePanel.setState(progression.investment, progression.pollen);
    applyStats(state.bee, stats);
  },
});

const resultsScreen = new ResultsScreen(document.body);

// ── audio ────────────────────────────────────────────────────────────────────────

const audio = new AudioEngine();

// Browsers refuse to start audio outside a user gesture, so the context is created on the
// first click or keypress rather than at load.
const startAudio = (): void => {
  void audio.start();
};
window.addEventListener("pointerdown", startAudio, { once: true });
window.addEventListener("keydown", startAudio, { once: true });

// Silence the continuous voices when the tab is hidden: a bee buzz droning from a background
// tab is the kind of thing that makes people close a game permanently.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) audio.silence();
});

// ── input ────────────────────────────────────────────────────────────────────────

const input = new InputManager(canvas);
input.attach();

// Settings live under their own storage key, so a corrupt save can never cost the player their
// keybindings (see progression/save.ts).
const settings = loadSettings();
if (settings.bindings) input.restoreBindings(settings.bindings);
input.setScheme(settings.scheme);

const settingsPanel = new SettingsPanel(document.body, input, {
  onBindingsChanged: () => {
    settings.bindings = input.snapshotBindings();
    saveSettings(settings);
  },
  onSchemeChanged: (scheme) => {
    settings.scheme = scheme;
    saveSettings(settings);
  },
});

let command = neutralCommand();

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;

  // Developer and menu hotkeys are handled as events rather than through the binding table:
  // routing them through bindings would clutter the rebinding menu with keys nobody wants to
  // remap, and would let a player unbind respawn.
  if (event.code === "KeyT") {
    treePanel.toggle(progression.investment, progression.pollen);
    if (treePanel.isOpen) input.releaseAll();
    return;
  }

  if (event.code === "KeyO") {
    settingsPanel.toggle();
    return;
  }

  if (event.code === "Escape") {
    if (settingsPanel.isOpen) settingsPanel.close();
    else if (treePanel.isOpen) treePanel.close();
    else if (resultsScreen.isOpen) resultsScreen.close();
    return;
  }

  if (event.code === "Enter" && resultsScreen.isOpen) {
    endSession();
    return;
  }

  if (treePanel.isOpen || resultsScreen.isOpen || settingsPanel.isOpen) return;

  if (event.code === "KeyR") {
    respawn();
    followCamera.reset(renderBee);
  } else if (event.code === "KeyM") {
    input.setScheme(input.currentScheme === "mouse" ? "keyboard" : "mouse");
  } else if (event.code === "KeyN") {
    audio.toggleMute();
  }
});

/** Reset for a fresh five minutes, keeping progression. */
function endSession(): void {
  resultsScreen.close();
  resetSession(session);

  for (const flower of state.flowers) {
    flower.richness = 1;
    flower.respawnTimer = 0;
  }

  respawn();
  followCamera.reset(renderBee);
}

// ── loop ─────────────────────────────────────────────────────────────────────────

/** Reused so the per-step event collection allocates nothing. */
const events: SimEvent[] = [];

const loop = new FixedStepLoop(FLIGHT_STEP, (dt) => {
  if (session.over) return;

  // Snapshot *before* stepping. With several steps in one frame this ends up holding the
  // state before the last step, which is exactly the pair the renderer interpolates between.
  copyBee(state.bee, previousBee);

  events.length = 0;
  step(state, command, dt, events);
  consume(events);
  audio.playEvents(events);

  session.elapsed += dt;
  if (session.elapsed >= SESSION.durationSeconds) finish();
});

function consume(list: readonly SimEvent[]): void {
  let banked = 0;

  for (const event of list) {
    switch (event.kind) {
      case "deposited":
        onDeposit(session, event.pollen);
        // Deposited pollen is the spendable currency. Banked immediately so a crash mid-session
        // cannot lose it.
        progression.pollen += event.pollen;
        progression.lifetime += event.pollen;
        banked += event.pollen;
        rewardFlash = 1;
        break;
      case "completed":
        rewardFlash = 0.6;
        break;
      case "beeHit":
        onHit(session);
        break;
      default:
        break;
    }
  }

  if (banked > 0) saveProgression(progression);
}

function finish(): void {
  session.over = true;

  const summary = {
    deposited: session.deposited,
    bestTrip: session.bestTrip,
    pollenPerMinute: pollenPerMinute(session),
    trips: session.trips,
    hitsTaken: session.hitsTaken,
  };

  const newRecords: string[] = [];
  if (summary.bestTrip > records.bestTrip) newRecords.push("best trip");
  if (summary.deposited > records.bestSession) newRecords.push("best session");
  if (summary.pollenPerMinute > records.bestPollenPerMinute) newRecords.push("pollen/minute");

  const before = { ...records };
  records = mergeSession(records, summary);
  saveProgression(progression);

  resultsScreen.show({
    ...summary,
    cleanTrips: session.cleanTrips,
    bestPollenPerMinute: before.bestPollenPerMinute,
    bestSession: before.bestSession,
    pollenBanked: progression.pollen,
    newRecords,
  });

  input.releaseAll();
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
  // Clamp the frame delta: a backgrounded tab or a breakpoint can produce seconds of delta,
  // and the loop's catch-up cap handles what is left.
  const frameSeconds = Math.min((time - previousTime) / 1000, 0.1);
  previousTime = time;

  const paused = treePanel.isOpen || resultsScreen.isOpen || settingsPanel.isOpen;
  command = paused ? neutralCommand() : input.sample(frameSeconds);

  loop.advance(frameSeconds);

  interpolateBee(previousBee, state.bee, loop.alpha, renderBee);
  const load = state.bee.pollenCapacity > 0 ? state.bee.pollen / state.bee.pollenCapacity : 0;
  beeView.update(renderBee, frameSeconds, load);

  // Overlays decay here rather than in the loop so they are tied to *display* time, not to
  // simulation steps — a hidden tab would otherwise burn through the flash before it is seen.
  rewardFlash = Math.max(0, rewardFlash - frameSeconds * 1.6);
  flash.setDamage(state.damageFlash / 0.4);
  flash.setReward(rewardFlash);

  flowerField.update(state.flowers);
  enemyField.update(state.enemies, frameSeconds);

  followCamera.update(renderBee, frameSeconds);
  focusShadows(renderBee.position.x, renderBee.position.z);

  updateAudio();

  renderer.render(scene, followCamera.camera);

  // HUD at 5 Hz. Rewriting the DOM every frame costs more than it looks, and the numbers are
  // unreadable at 144 Hz anyway.
  const instantFps = 1 / Math.max(frameSeconds, 1e-6);
  smoothedFps += (instantFps - smoothedFps) * 0.1;
  hudAccumulator += frameSeconds;

  if (hudAccumulator >= 0.2 && !paused) {
    hudAccumulator = 0;
    updateHud();
  }
});

function updateHud(): void {
  const bee = state.bee;
  const nearest = nearestThreat(state.enemies, bee.position);
  const role = computeRole(progression.investment);

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
    pollenPerMinute: pollenPerMinute(session),

    threatDistance: nearest?.distance ?? null,
    threatLabel: nearest?.label ?? null,

    banked: progression.pollen,
    roleLabel: role.label,

    scheme: input.currentScheme,
    pointerLocked: input.isPointerLocked,
  });
}

const THREAT_LABELS: Record<Enemy["kind"], string> = {
  bird: "BIRD",
  hornet: "HORNET",
  wasp: "WASPS",
};

/** Feed the audio engine the continuous state it needs. One-shots come from events. */
function updateAudio(): void {
  const bee = state.bee;
  const paused = treePanel.isOpen || resultsScreen.isOpen || settingsPanel.isOpen;

  if (paused) {
    audio.silence();
    return;
  }

  const speed = Math.hypot(bee.velocity.x, bee.velocity.z);
  const load = bee.pollenCapacity > 0 ? bee.pollen / bee.pollenCapacity : 0;
  audio.updateBee(speed, FLIGHT.maxHorizontalSpeed, load);

  const threat = nearestThreat(state.enemies, bee.position);
  audio.updateThreat(
    threat
      ? {
          kind: threat.kind,
          distance: threat.distance,
          position: threat.position,
        }
      : null,
    { position: bee.position, yaw: bee.attitude.yaw },
  );
}

function nearestThreat(
  enemies: readonly Enemy[],
  position: { x: number; y: number; z: number },
): { distance: number; label: string; kind: Enemy["kind"]; position: { x: number; y: number; z: number } } | null {
  let best: {
    distance: number;
    label: string;
    kind: Enemy["kind"];
    position: { x: number; y: number; z: number };
  } | null = null;

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
      best = {
        distance,
        label: THREAT_LABELS[enemy.kind],
        kind: enemy.kind,
        position: enemy.position,
      };
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
