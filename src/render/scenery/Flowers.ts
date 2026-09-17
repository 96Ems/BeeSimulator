/**
 * The flower field. DESIGN §6.3.
 *
 * Rendered as `InstancedMesh` — one draw call per mesh per flower type — because there are
 * roughly 270 flowers and drawing them as individual object hierarchies would be hundreds of
 * draw calls and an unshippable frame rate (ARCHITECTURE §6.2).
 *
 * A depleted flower is scaled to (almost) nothing rather than removed. That keeps every
 * instance count fixed, so the buffer never has to be reallocated mid-session, and it makes
 * the respawn a visible pop — which is useful information, since the player is tracking which
 * rich flowers are coming back.
 */

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { type BufferGeometry, InstancedMesh, type Material, Matrix4, type Object3D, Quaternion, Vector3 } from "three";
import { FLOWER_TYPE_IDS, FLOWER_TYPES, type FlowerTypeId } from "../../data/flowers";
import type { Flower } from "../../sim/entities/flower";

/** Scale applied to a depleted flower. Not exactly zero, which can produce degenerate matrices. */
const DEPLETED_SCALE = 0.001;

type TypeSlot = {
  typeId: FlowerTypeId;
  /** The flowers of this type, in the order the instance buffers expect them. */
  flowers: Flower[];
  meshes: InstancedMesh[];
};

export class FlowerField {
  private readonly slots: TypeSlot[] = [];

  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly scale = new Vector3();

  private constructor(slots: TypeSlot[]) {
    this.slots = slots;
  }

  static async load(flowers: Flower[]): Promise<FlowerField> {
    const loader = new GLTFLoader();
    const slots: TypeSlot[] = [];

    for (const typeId of FLOWER_TYPE_IDS) {
      const type = FLOWER_TYPES[typeId];
      const owned = flowers.filter((flower) => flower.typeId === typeId);
      if (owned.length === 0) continue;

      const gltf = await loader.loadAsync(`/assets/${type.asset}`);
      gltf.scene.updateMatrixWorld(true);

      const meshes: InstancedMesh[] = [];

      // One instanced mesh per source mesh. A sunflower is 24 meshes, so this is ~24 draw
      // calls for the whole species rather than 24 per flower.
      gltf.scene.traverse((child) => {
        const source = child as Object3D & { geometry?: BufferGeometry; material?: Material };
        if (!source.geometry || !source.material) return;

        const instanced = new InstancedMesh(source.geometry, source.material, owned.length);
        instanced.castShadow = true;
        instanced.receiveShadow = false;
        instanced.name = `${typeId}_${child.name}`;

        // The Fiend scene applies a layout transform to the root; reset it so instances land
        // where the simulation says they are rather than 26 m off to one side.
        instanced.userData.localMatrix = child.matrixWorld.clone();

        meshes.push(instanced);
      });

      slots.push({ typeId, flowers: owned, meshes });
    }

    const field = new FlowerField(slots);
    field.update(flowers);
    return field;
  }

  /** The objects to add to the scene. */
  get objects(): InstancedMesh[] {
    return this.slots.flatMap((slot) => slot.meshes);
  }

  /**
   * Refresh every instance from the current simulation state.
   *
   * Called once per frame. At 270 flowers this is a few hundred matrix writes, which is far
   * cheaper than the draw calls it saves.
   */
  update(flowers: Flower[]): void {
    void flowers;

    for (const slot of this.slots) {
      for (let i = 0; i < slot.flowers.length; i += 1) {
        const flower = slot.flowers[i];
        if (!flower) continue;

        const alive = flower.richness > 0;
        const scale = alive ? 1 : DEPLETED_SCALE;

        this.position.set(flower.position.x, flower.position.y, flower.position.z);
        this.scale.set(scale, scale, scale);
        this.matrix.compose(this.position, this.quaternion, this.scale);

        for (const mesh of slot.meshes) {
          // Local mesh transform first, then the flower's world placement.
          const local = mesh.userData.localMatrix as Matrix4;
          const combined = new Matrix4().multiplyMatrices(this.matrix, local);
          mesh.setMatrixAt(i, combined);
        }
      }

      for (const mesh of slot.meshes) {
        mesh.instanceMatrix.needsUpdate = true;
        // The default bounding sphere is computed from a single flower's geometry, so the
        // whole field would be culled the moment one flower left the frustum.
        mesh.computeBoundingSphere();
      }
    }
  }
}
