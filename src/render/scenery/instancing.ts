import { type BufferGeometry, DynamicDrawUsage, InstancedMesh, type Material } from "three";

/**
 * Instancing helpers.
 *
 * A meadow needs tens of thousands of grass blades and hundreds of flowers. Drawn as
 * individual meshes that is thousands of draw calls and an unshippable frame rate. As
 * `InstancedMesh` it is one draw call each — this is not an optimisation, it is the
 * precondition for having a meadow at all (ARCHITECTURE §6.2).
 */

/**
 * Allocate an instanced mesh.
 *
 * The instance matrices are marked dynamic because callers fill them after construction.
 * For genuinely static scatter, upload once and the driver keeps it in one buffer.
 */
export function createInstances(
  geometry: BufferGeometry,
  material: Material,
  count: number,
  dynamic = false,
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, count);
  if (dynamic) {
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
