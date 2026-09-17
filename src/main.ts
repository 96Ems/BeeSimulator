import { Vector3 } from "three";
import { CAMERA } from "./data/tuning";
import { DebugCamera } from "./render/debugCamera";
import { createRenderer } from "./render/Renderer";
import { createSceneBundle } from "./render/Scene";

const canvas = document.getElementById("app");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('#app canvas is missing from index.html');
}

const debugElement = document.getElementById("debug");

const renderer = createRenderer(canvas);
const { scene, focusShadows } = createSceneBundle();

const camera = new DebugCamera(
  CAMERA.fov,
  window.innerWidth / window.innerHeight,
  CAMERA.near,
  CAMERA.far,
  new Vector3(CAMERA.startX, CAMERA.startY, CAMERA.startZ),
);
camera.attach(canvas);

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.camera.aspect = width / height;
  camera.camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
resize();

let previousTime = performance.now();
let frameAccumulator = 0;
let frameCount = 0;
let framesPerSecond = 0;

renderer.setAnimationLoop((time: number) => {
  // Clamp the delta so a background tab, a breakpoint, or a stall does not teleport the
  // camera across the world on the next frame.
  const dt = Math.min((time - previousTime) / 1000, 0.1);
  previousTime = time;

  camera.update(dt);
  focusShadows(camera.camera.position.x, camera.camera.position.z);

  renderer.render(scene, camera.camera);

  frameAccumulator += dt;
  frameCount += 1;
  if (frameAccumulator >= 0.5) {
    framesPerSecond = frameCount / frameAccumulator;
    frameAccumulator = 0;
    frameCount = 0;

    if (debugElement) {
      const info = renderer.info;
      debugElement.textContent = [
        `fps      ${framesPerSecond.toFixed(1)}`,
        `frame    ${(1000 / Math.max(framesPerSecond, 1)).toFixed(2)} ms`,
        `draws    ${info.render.calls}`,
        `tris     ${info.render.triangles.toLocaleString("en-US")}`,
        `pos      ${camera.camera.position.x.toFixed(1)} ${camera.camera.position.y.toFixed(1)} ${camera.camera.position.z.toFixed(1)}`,
        ``,
        `drag look  WASD move  QE down/up  shift sprint`,
      ].join("\n");
    }
  }
});
