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
import { Group, Mesh, MeshStandardMaterial, Object3D, SphereGeometry } from "three";
import { BEE, FLIGHT } from "../../data/tuning";
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

  /**
   * The pollen load, drawn on the abdomen.
   *
   * DESIGN §6.1 promises pollen "visible on the bee's body", and it earns its place: it is the
   * only channel that communicates *how much you are carrying* without asking the player to
   * check a gauge. That matters because the wasp swarm's aggression scales with exactly this
   * value (DESIGN §8.3) - so the thing that makes you a target is the thing you can watch
   * growing on yourself.
   */
  private pollenSac: Mesh | null = null;
  private pollenMaterial: MeshStandardMaterial | null = null;

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

    view.buildPollenSac(asset);

    return view;
  }

  /**
   * Add the pollen sac as a child of the abdomen, so it inherits the body's transform without
   * needing to be positioned every frame.
   */
  private buildPollenSac(asset: Object3D): void {
    const abdomen = asset.getObjectByName("Bee_Abdomen") ?? asset;

    const material = new MeshStandardMaterial({
      color: 0xf5c518,
      roughness: 0.62,
      metalness: 0,
      emissive: 0x6b4a00,
      emissiveIntensity: 0.25,
    });

    // One lobe rather than a sphere pair. Real bees carry pollen in baskets on the hind legs,
    // but at this camera distance a single offset lobe under the abdomen reads clearly as
    // cargo, where two small ones read as noise.
    const sac = new Mesh(new SphereGeometry(0.055, 12, 8), material);
    sac.position.set(0, -0.05, 0.05);
    sac.castShadow = true;
    sac.visible = false;

    abdomen.add(sac);

    this.pollenSac = sac;
    this.pollenMaterial = material;
  }

  /**
   * Grow the pollen sac with the load.
   *
   * Scaling rather than swapping geometry keeps this free, and the visible growth is what
   * communicates "you are becoming a target" without a word of UI.
   */
  private updatePollenSac(ratio: number): void {
    if (!this.pollenSac || !this.pollenMaterial) return;

    // Hidden entirely when empty: a speck visible at zero load would make the bee look
    // permanently loaded and destroy the signal.
    const visible = ratio > 0.02;
    this.pollenSac.visible = visible;
    if (!visible) return;

    const scale = 0.4 + ratio * 0.95;
    this.pollenSac.scale.set(scale, scale * 0.85, scale * 1.2);

    // Glows harder as it fills, so a nearly-full bee is conspicuous even against a busy meadow.
    this.pollenMaterial.emissiveIntensity = 0.2 + ratio * 0.55;
  }

  /** Apply an interpolated transform and advance the wing flap. */
  update(bee: RenderBee, dt: number, pollenRatio: number): void {
    this.root.position.set(bee.position.x, bee.position.y, bee.position.z);

    // Three.js 'YXZ' matches the simulation's intrinsic yaw-pitch-roll convention exactly,
    // so no conversion is needed here. The model faces -Z, which is also Three.js's default
    // forward, so the attitude maps straight through.
    this.root.rotation.set(bee.attitude.pitch, bee.attitude.yaw, bee.attitude.roll, "YXZ");

    const speedRatio = Math.min(bee.speed / FLIGHT.maxHorizontalSpeed, 1);
    this.flapPhase += (FLAP_RATE_IDLE + FLAP_RATE_SPEED * speedRatio) * dt;

    const flap = Math.sin(this.flapPhase) * FLAP_AMPLITUDE;
    // Opposite signs on the two groups: both wings extend along +/-X from their pivots, so a
    // matching sign would tilt them in opposite directions rather than beating together.
    if (this.wingLeft) this.wingLeft.rotation.z = -flap;
    if (this.wingRight) this.wingRight.rotation.z = flap;

    this.updatePollenSac(pollenRatio);
  }

  /** Half the body length, for placing the camera and (later) the sting hitbox. */
  static get halfLength(): number {
    return BEE.length / 2;
  }
}
