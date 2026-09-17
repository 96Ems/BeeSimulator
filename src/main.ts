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

import { FLIGHT, HIVE } from "./data/tuning";
import { FixedStepLoop } from "./game/Loop";
import { InputManager } from "./input/InputManager";
import { FollowCamera } from "./render/Camera";
import { createRenderer } from "./render/Renderer";
import { createSceneBundle } from "./render/Scene";
import { createHive } from "./render/scenery/Hive";
import { BeeView } from "./render/views/BeeView";
import { createRenderBee, interpolateBee } from "./render/interpolation";
import { neutralCommand } from "./sim/commands";
import { FLIGHT_STEP } from "./sim/flight";
import { copyBee, createBee, createInitialState } from "./sim/State";
import { step } from "./sim/step";
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

const state = createInitialState();

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

  copyBee(bee, previousBee);
}

respawn();

// ── the bee model ────────────────────────────────────────────────────────────────

const beeView = await BeeView.load("/assets/bee.glb");
scene.add(beeView.root);

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

const loop = new FixedStepLoop(FLIGHT_STEP, (dt) => {
  // Snapshot *before* stepping. With several steps in one frame this ends up holding the
  // state before the last step, which is exactly the pair the renderer interpolates between.
  copyBee(state.bee, previousBee);
  step(state, command, dt);
});

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
  // Clamp the frame delta: a backgrounded tab or a breakpoint can produce a delta of
  // seconds, and the loop's catch-up cap handles what is left.
  const frameSeconds = Math.min((time - previousTime) / 1000, 0.1);
  previousTime = time;

  command = input.sample(frameSeconds);

  loop.advance(frameSeconds);

  interpolateBee(previousBee, state.bee, loop.alpha, renderBee);
  beeView.update(renderBee, frameSeconds);

  followCamera.update(renderBee, frameSeconds);
  focusShadows(renderBee.position.x, renderBee.position.z);

  renderer.render(scene, followCamera.camera);

  // HUD at 5 Hz. Rewriting the DOM every frame costs more than it looks, and the numbers
  // are unreadable at 144 Hz anyway.
  const instantFps = 1 / Math.max(frameSeconds, 1e-6);
  smoothedFps += (instantFps - smoothedFps) * 0.1;
  hudAccumulator += frameSeconds;

  if (hudAccumulator >= 0.2) {
    hudAccumulator = 0;

    const bee = state.bee;
    hud.update({
      fps: smoothedFps,
      frameMs: 1000 / Math.max(smoothedFps, 1),
      draws: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      simSteps: loop.steps,

      speed: Math.hypot(bee.velocity.x, bee.velocity.z),
      verticalSpeed: bee.velocity.y,
      altitude: bee.position.y,
      distanceFromHive: Math.hypot(
        bee.position.x - HIVE.position.x,
        bee.position.z - HIVE.position.z,
      ),

      yaw: bee.attitude.yaw,
      pitch: bee.attitude.pitch,
      roll: bee.attitude.roll,
      stabilized: bee.idleTime > FLIGHT.stabilityDelay,

      scheme: input.currentScheme,
      pointerLocked: input.isPointerLocked,
      layout: input.keyboardLayout,
    });
  }
});
