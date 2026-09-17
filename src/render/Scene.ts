import { Color, DirectionalLight, Fog, HemisphereLight, Scene } from "three";
import { PALETTE } from "../data/tuning";
import { createMeadow } from "./scenery/Meadow";

/** Half-width of the sun's orthographic shadow box, in metres. */
const SHADOW_EXTENT = 24;

export type SceneBundle = {
  scene: Scene;
  /** The sun. Exposed so later systems can drive time-of-day from one place. */
  sun: DirectionalLight;
  /** Recentre the sun's shadow frustum on a point. Call as the camera moves. */
  focusShadows: (x: number, z: number) => void;
};

/**
 * Build the world scene with the lighting and atmosphere stack.
 *
 * The three cheap techniques that carry most of the perceived quality (ARCHITECTURE §6.2):
 *
 *   - Fog tinted to the sky colour, so distant geometry dissolves into the horizon rather
 *     than ending at a hard line. Also a gameplay tool: it hides the far end of the world.
 *   - A hemisphere light for blue-tinted ambient fill, so shadows read as sky-lit rather
 *     than black.
 *   - A single directional sun with a *tight* shadow camera. One well-framed shadow beats
 *     three lights, and a tight frustum is what keeps the shadow edges crisp.
 */
export function createSceneBundle(): SceneBundle {
  const scene = new Scene();

  const sky = new Color(PALETTE.sky);
  scene.background = sky;
  scene.fog = new Fog(sky, PALETTE.fogNear, PALETTE.fogFar);

  const ambient = new HemisphereLight(PALETTE.skyLight, PALETTE.groundBounce, 1.5);
  scene.add(ambient);

  const sun = new DirectionalLight(PALETTE.sun, 2.8);
  sun.position.set(28, 42, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;

  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -SHADOW_EXTENT;
  shadowCamera.right = SHADOW_EXTENT;
  shadowCamera.top = SHADOW_EXTENT;
  shadowCamera.bottom = -SHADOW_EXTENT;
  shadowCamera.near = 1;
  shadowCamera.far = 160;
  shadowCamera.updateProjectionMatrix();

  scene.add(sun);
  scene.add(sun.target);

  scene.add(createMeadow());

  // A directional light's shadow frustum is positioned in world space, so it must follow
  // the viewer or shadows vanish as soon as the player flies away from the origin.
  const offset = { x: 28, y: 42, z: 18 };
  const focusShadows = (x: number, z: number): void => {
    sun.target.position.set(x, 0, z);
    sun.target.updateMatrixWorld();
    sun.position.set(x + offset.x, offset.y, z + offset.z);
  };

  return { scene, sun, focusShadows };
}
