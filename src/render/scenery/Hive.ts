/**
 * The hive. DESIGN §7.1 — the centre of the world, and the player's landmark.
 *
 * Built from primitives rather than modelled in Fiend, on purpose: it is large, it is
 * scenery, and it needs to be visible from every direction at 150 m. That is a silhouette
 * problem, not a detail problem, and a code-generated form iterates in seconds.
 *
 * The functional requirement for M1 is simply that the player has something to orient
 * against. Depositing and the skill-tree chamber arrive at M2 and M4.
 */

import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from "three";
import { HIVE, PALETTE } from "../../data/tuning";

export function createHive(): Group {
  const hive = new Group();
  hive.name = "Hive";

  const wax = new MeshStandardMaterial({
    color: PALETTE.hive,
    roughness: 0.85,
    metalness: 0,
  });
  const shadowed = new MeshStandardMaterial({
    color: PALETTE.hiveDark,
    roughness: 0.95,
    metalness: 0,
  });

  // Stacked rings, tapering upward — the classic cartoon skep, and readable as "hive" from
  // a single silhouette at any distance.
  const rings = [
    { radius: 3.0, height: 1.1, y: 0.55 },
    { radius: 2.55, height: 0.95, y: 1.55 },
    { radius: 2.05, height: 0.85, y: 2.4 },
    { radius: 1.5, height: 0.75, y: 3.15 },
  ];

  for (const ring of rings) {
    const mesh = new Mesh(new CylinderGeometry(ring.radius, ring.radius + 0.12, ring.height, 16), wax);
    mesh.position.y = ring.y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    hive.add(mesh);
  }

  const cap = new Mesh(new ConeGeometry(1.5, 1.1, 16), shadowed);
  cap.position.y = 4.05;
  cap.castShadow = true;
  hive.add(cap);

  // Entrance. Placed off-centre and dark, so the player can tell which way the hive faces
  // without a marker.
  const entrance = new Mesh(new SphereGeometry(0.85, 16, 12), shadowed);
  entrance.position.set(0, 0.75, 2.9);
  entrance.scale.set(1, 0.8, 0.5);
  hive.add(entrance);

  // A raised platform, so the hive reads as sitting *on* the meadow rather than intersecting it.
  const base = new Mesh(new CylinderGeometry(3.6, 4.0, 0.3, 16), shadowed);
  base.position.y = 0.15;
  base.receiveShadow = true;
  hive.add(base);

  hive.position.set(HIVE.position.x, HIVE.position.y, HIVE.position.z);

  return hive;
}
