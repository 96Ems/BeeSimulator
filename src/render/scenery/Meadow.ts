import {
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { PALETTE, WORLD } from "../../data/tuning";
import { createRng, pointInDisc, range } from "../../sim/rng";
import { createInstances } from "./instancing";

/**
 * The meadow: ground plus instanced grass.
 *
 * Deliberately sparse and flat. This is the M0 skeleton — a lit surface at the right scale
 * to judge flight against. The real meadow (flower field, hive, biome variation) is M2.
 *
 * Scenery is seeded rather than random so the world is identical on every load. Same reason
 * as `sim/rng.ts`: reproducibility, and eventually server/client agreement.
 */
export function createMeadow(seed = 1337): Group {
  const group = new Group();
  group.name = "Meadow";

  group.add(createGround());
  group.add(createGrass(seed));

  return group;
}

function createGround(): Mesh {
  // A circle rather than a plane: the world is a disc around the hive (DESIGN §7.1), and a
  // round ground reads as "the world has an edge" instead of "the plane was too small".
  const geometry = new CircleGeometry(WORLD.playableRadius, 96);
  geometry.rotateX(-Math.PI / 2);

  const material = new MeshStandardMaterial({
    color: PALETTE.ground,
    roughness: 1,
    metalness: 0,
  });

  const ground = new Mesh(geometry, material);
  ground.name = "Ground";
  ground.receiveShadow = true;
  return ground;
}

function createGrass(seed: number): Mesh {
  const rng = createRng(seed);

  // A 3-sided tapered prism: two triangles per side, so 6 triangles per blade. Reads as a
  // blade at distance, and the taper gives it a point so it does not look like a stick.
  // The unit height is scaled per instance, so one geometry serves every blade size.
  const blade = new CylinderGeometry(WORLD.grassMinWidth, WORLD.grassMaxWidth, 1, 3, 1, false);
  blade.translate(0, 0.5, 0); // move the origin to the base, so scaling grows upwards

  // White base colour: the per-instance colour multiplies it, so the real hue lives in the
  // instance buffer. This is how one draw call gets thousands of individually tinted blades.
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0,
  });

  const grass = createInstances(blade, material, WORLD.grassCount);
  grass.name = "Grass";
  grass.castShadow = false; // blades are far too small to justify shadow-casting cost

  const dummy = new Object3D();
  const low = new Color(PALETTE.grassLow);
  const high = new Color(PALETTE.grassHigh);
  const tint = new Color();

  for (let i = 0; i < WORLD.grassCount; i += 1) {
    const { x, z } = pointInDisc(rng, WORLD.grassRadius);
    const height = range(rng, WORLD.grassMinHeight, WORLD.grassMaxHeight);
    const width = range(rng, WORLD.grassMinWidth, WORLD.grassMaxWidth) / WORLD.grassMinWidth;

    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, rng() * Math.PI * 2, range(rng, -0.12, 0.12));
    dummy.scale.set(width, height, width);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);

    // Per-instance hue variation. A uniform crowd reads as an asset; a varied one reads as
    // nature. This is the cheapest large visual win available (ARCHITECTURE §6.2).
    tint.copy(low).lerp(high, rng());
    grass.setColorAt(i, tint);
  }

  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) {
    grass.instanceColor.needsUpdate = true;
  }

  // The default bounding sphere is computed from the single blade geometry, so the whole
  // field would be culled the moment that one blade leaves the frustum.
  grass.computeBoundingSphere();

  return grass;
}
