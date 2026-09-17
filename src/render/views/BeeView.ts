/**
 * The player bee's visual representation.
 *
 * Two things here are worth knowing:
 *
 *   1. **The wings are animated here, not in the model.** There is no animation data in the
 *      GLB at all. A bee flaps around 200 Hz, which is neither hand-animatable nor useful as
 *      skeletal animation, so it is driven procedurally from the shoulder pivot groups
 *      (docs/ASSETS.md). This only works because `Bee_WingL` / `Bee_WingR` are separate
 *      group nodes — which `npm run verify` asserts.
 *   2. **The GLB's root transform is reset on load.** The Fiend scene positions each asset
 *      in a layout so they can be viewed side by side, and the export preserves a selected
 *      object's own transform. Without this reset the bee loads 32 metres off to the side.
 */

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Group, Mesh, Object3D } from "three";
import { BEE } from "../../data/tuning";
import type { RenderBee } from "../interpolation";

/** Wing flap rate at a standstill, in radians per second of phase. */
const FLAP_RATE_IDLE = 130;
/** Extra flap rate at full speed. */
const FLAP_RATE_SPEED = 90;
/** Flap amplitude in radians. */
const FLAP_AMPLITUDE = 0.62;

export class BeeView {
  readonly root: Group;

  private wingLeft: Object3D | null = null;
  private wingRight: Object3D | null = null;
  private flapPhase = 0;

  private constructor(root: Group) {
    this.root = root;
  }

  static async load(url: string): Promise<BeeView> {
    const gltf = await new GLTFLoader().loadAsync(url);

    // Find the named asset group rather than trusting the scene root, then neutralise the
    // layout transform the Fiend scene applied for viewing.
    const asset = gltf.scene.getObjectByName("Bee") ?? gltf.scene;
    asset.position.set(0, 0, 0);
    asset.rotation.set(0, 0, 0);
    asset.scale.set(1, 1, 1);

    asset.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = false;
      }
    });

    const view = new BeeView(gltf.scene);
    view.wingLeft = asset.getObjectByName("Bee_WingL") ?? null;
    view.wingRight = asset.getObjectByName("Bee_WingR") ?? null;

    if (!view.wingLeft || !view.wingRight) {
      // Loud, because the fallback is a bee that flies with rigid wings and the cause is
      // invisible in the rendered frame.
      console.warn(
        "[BeeView] wing pivot groups not found in the GLB; wings will not flap. " +
          "Run `npm run verify` — the exporter must preserve Bee_WingL / Bee_WingR as groups.",
      );
    }

    return view;
  }

  /** Apply an interpolated transform and advance the wing flap. */
  update(bee: RenderBee, dt: number): void {
    this.root.position.set(bee.position.x, bee.position.y, bee.position.z);

    // Three.js 'YXZ' matches the simulation's intrinsic yaw-pitch-roll convention exactly,
    // so no conversion is needed here. The model faces -Z, which is also Three.js's default
    // forward, so the attitude maps straight through.
    this.root.rotation.set(bee.attitude.pitch, bee.attitude.yaw, bee.attitude.roll, "YXZ");

    const speedRatio = Math.min(bee.speed / 16, 1);
    this.flapPhase += (FLAP_RATE_IDLE + FLAP_RATE_SPEED * speedRatio) * dt;

    const flap = Math.sin(this.flapPhase) * FLAP_AMPLITUDE;
    // Opposite signs on the two groups: both wings extend along +/-X from their pivots, so a
    // matching sign would tilt them in opposite directions rather than beating together.
    if (this.wingLeft) this.wingLeft.rotation.z = -flap;
    if (this.wingRight) this.wingRight.rotation.z = flap;
  }

  /** Half the body length, for placing the camera and (later) the sting hitbox. */
  static get halfLength(): number {
    return BEE.length / 2;
  }
}
