/**
 * Predator rendering. DESIGN §8.
 *
 * One cloned model per enemy, hidden when dead. At 37 enemies a pool of clones is cheaper to
 * reason about than instancing, and the whole point is that each one has a distinct,
 * readable silhouette — a bird must be identifiable at 60 m with no detail visible at all.
 *
 * The `dead` state is a lie for wasps: they recycle. So hiding is driven by the state rather
 * than by removal, and the swarm visibly thins and refills, which is exactly the "subscription"
 * feel DESIGN §8.1 asks for.
 */

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Group, Mesh, type Object3D } from "three";
import type { Enemy, EnemyKind } from "../../sim/entities/enemies";

/** Local file per enemy kind, matching `tools/build-assets.mjs`. */
const MODELS: Record<EnemyKind, string> = {
  bird: "bird.glb",
  hornet: "hornet.glb",
  wasp: "wasp.glb",
};

type KindPool = {
  kind: EnemyKind;
  template: Object3D;
  /** Instances, indexed by the order the enemies of this kind appear in the state. */
  instances: Object3D[];
};

export class EnemyField {
  private readonly root = new Group();
  private readonly pools = new Map<EnemyKind, KindPool>();
  /** Bumped each frame so a wing flap is continuous across recycled wasps. */
  private phase = 0;

  private constructor() {
    this.root.name = "Predators";
  }

  static async load(enemies: Enemy[]): Promise<EnemyField> {
    const field = new EnemyField();
    const loader = new GLTFLoader();

    const kinds: EnemyKind[] = ["bird", "hornet", "wasp"];

    for (const kind of kinds) {
      const count = enemies.filter((enemy) => enemy.kind === kind).length;
      if (count === 0) continue;

      const gltf = await loader.loadAsync(`/assets/${MODELS[kind]}`);
      const template = gltf.scene.getObjectByName(capitalise(kind)) ?? gltf.scene;

      // Neutralise the Fiend layout transform, exactly as the bee view does.
      template.position.set(0, 0, 0);
      template.rotation.set(0, 0, 0);
      template.scale.set(1, 1, 1);

      template.traverse((child) => {
        if (child instanceof Mesh) {
          child.castShadow = true;
          child.receiveShadow = false;
        }
      });

      const instances: Object3D[] = [];
      for (let i = 0; i < count; i += 1) {
        const clone = template.clone(true);
        clone.visible = false;
        instances.push(clone);
        field.root.add(clone);
      }

      field.pools.set(kind, { kind, template, instances });
    }

    return field;
  }

  get objects(): Object3D[] {
    return [this.root];
  }

  update(enemies: Enemy[], dt: number): void {
    this.phase += dt * 160;

    // Index per kind, so a recycled wasp always reuses the same instance rather than
    // allocating a new one.
    const cursors = new Map<EnemyKind, number>();

    for (const enemy of enemies) {
      const pool = this.pools.get(enemy.kind);
      if (!pool) continue;

      const index = cursors.get(enemy.kind) ?? 0;
      cursors.set(enemy.kind, index + 1);

      const instance = pool.instances[index];
      if (!instance) continue;

      const visible = enemy.state !== "dead";
      instance.visible = visible;
      if (!visible) continue;

      instance.position.set(enemy.position.x, enemy.position.y, enemy.position.z);
      instance.rotation.set(enemy.attitude.pitch, enemy.attitude.yaw, 0, "YXZ");

      // Wings are separate pivot groups in the GLB and are driven procedurally, never baked
      // (docs/ASSETS.md). Each instance gets a phase offset so the flock does not beat in
      // unison, which reads as a single animated object rather than as many creatures.
      const offset = index * 0.7;
      const flap = Math.sin(this.phase + offset) * 0.5;
      applyWingFlap(instance, capitalise(enemy.kind), flap);
    }
  }
}

function applyWingFlap(instance: Object3D, prefix: string, flap: number): void {
  const left = instance.getObjectByName(`${prefix}_WingL`);
  const right = instance.getObjectByName(`${prefix}_WingR`);
  if (left) left.rotation.z = -flap;
  if (right) right.rotation.z = flap;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
