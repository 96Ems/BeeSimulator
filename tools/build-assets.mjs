/**
 * Fiend asset generator.
 *
 * Defines every "hero" asset procedurally and pushes it to the Fiend scene over MCP.
 * Re-runnable: the assets live in code and are version-controlled, rather than existing only
 * as a sequence of one-off tool calls that nobody can reproduce.
 *
 *   node tools/build-assets.mjs            # build everything
 *   node tools/build-assets.mjs Hornet     # build only the named assets
 *   node tools/build-assets.mjs --dry-run  # print the operation counts, send nothing
 *
 * Requires tools/fiend.config.json (git-ignored, holds the write secret):
 *   { "scene_id": "...", "secret": "fs_..." }
 *
 * Conventions (see docs/ASSETS.md): +Y up, -Z forward, +X right, metres, game scale.
 * Creature bodies are centred on the origin so the entity position is the body centre.
 * Flowers sit with their base at y = 0.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENDPOINT = process.env.FIEND_MCP ?? "https://anoma.ly/labs/fiend/mcp";

/** Max operations per atomic `edit_scene` batch, per the Fiend contract. */
const BATCH_LIMIT = 100;

// ── palette ──────────────────────────────────────────────────────────────────────
// Hue carries meaning in this game: the player must identify a threat at 60 m, so each
// creature gets a distinct, saturated identity rather than realistic earth tones.

const M = {
  hornetBody: { color: "#3a2a12", roughness: 0.75, metalness: 0 },
  hornetBand: { color: "#e8641a", roughness: 0.7, metalness: 0 },
  hornetDark: { color: "#241a0b", roughness: 0.6, metalness: 0 },
  hornetEye: { color: "#5c1f0d", roughness: 0.25, metalness: 0.1 },

  waspBody: { color: "#141210", roughness: 0.55, metalness: 0 },
  waspBand: { color: "#f7d020", roughness: 0.6, metalness: 0 },
  waspEye: { color: "#1a1608", roughness: 0.2, metalness: 0.1 },

  birdBody: { color: "#4a4038", roughness: 0.85, metalness: 0 },
  birdBelly: { color: "#cfc4b0", roughness: 0.9, metalness: 0 },
  birdBeak: { color: "#e8a824", roughness: 0.4, metalness: 0.1 },
  birdEye: { color: "#0a0a0a", roughness: 0.15, metalness: 0.2 },
  birdWing: { color: "#3b332c", roughness: 0.85, metalness: 0 },

  spiderBody: { color: "#1c1410", roughness: 0.8, metalness: 0 },
  spiderMark: { color: "#c92b2b", roughness: 0.6, metalness: 0 },
  spiderLeg: { color: "#2a1f16", roughness: 0.8, metalness: 0 },

  stem: { color: "#5c8a34", roughness: 0.9, metalness: 0 },
  leaf: { color: "#6aa03c", roughness: 0.9, metalness: 0 },
  daisyPetal: { color: "#f7f5ea", roughness: 0.75, metalness: 0 },
  daisyCenter: { color: "#f2c020", roughness: 0.7, metalness: 0 },
  poppyPetal: { color: "#d92626", roughness: 0.7, metalness: 0 },
  poppyCenter: { color: "#1a1208", roughness: 0.6, metalness: 0 },
  sunflowerPetal: { color: "#f2b722", roughness: 0.7, metalness: 0 },
  sunflowerDisc: { color: "#4a3212", roughness: 0.85, metalness: 0 },
  rarePetal: { color: "#e03ce0", emissive: "#a018a0", emissiveIntensity: 0.7, roughness: 0.45, metalness: 0 },
  rareCore: { color: "#fff0ff", emissive: "#ff9cff", emissiveIntensity: 2.2, roughness: 0.3, metalness: 0 },
};

// ── operation builders ───────────────────────────────────────────────────────────

const mesh = (name, parent, geometry, size, opts = {}) => ({
  type: "add_mesh",
  name,
  parent,
  geometry,
  size,
  ...opts,
});

const group = (name, parent, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) => ({
  type: "add_group",
  name,
  parent,
  position,
  rotation,
  scale,
});

const extrusion = (name, parent, points, opts = {}) => ({
  type: "add_extrusion",
  name,
  parent,
  points,
  ...opts,
});

const tube = (name, parent, points, radius, material) => ({
  type: "add_tube",
  name,
  parent,
  points,
  radius,
  material,
});

/**
 * A ring of petals, fanned around the +Y axis.
 *
 * Angles are computed rather than written down: a 16-petal sunflower is 16 hand-computed
 * sine/cosine pairs otherwise, which is where transcription errors come from.
 */
function petalRing(prefix, parent, { count, radius, y, size, material, tilt = 0, phase = 0 }) {
  const operations = [];
  for (let i = 0; i < count; i += 1) {
    const theta = phase + (i * Math.PI * 2) / count;
    operations.push(
      mesh(`${prefix}${String(i + 1).padStart(2, "0")}`, parent, "box", size, {
        // Euler XYZ applies Z first (tips the petal up/down), then Y (spins it into place).
        position: [Math.cos(theta) * radius, y, Math.sin(theta) * radius],
        rotation: [0, -theta, tilt],
        material,
      }),
    );
  }
  return operations;
}

/** A mirrored pair of wing groups, each with its pivot at the root. */
function wingPair({ prefix, parent, thickness, shoulder, material, outline }) {
  // `outline` is authored extending outward along -X, i.e. as the LEFT wing.
  const left = outline;
  // Mirror for the right wing. The point order must be reversed so the polygon winding —
  // and therefore the face normals — stay consistent. A mirrored outline with the original
  // winding renders inside-out and the wing vanishes.
  const right = outline.map(([x, y]) => [-x, y]).reverse();

  return [
    group(`${prefix}L`, parent, [-shoulder[0], shoulder[1], shoulder[2]]),
    extrusion(`${prefix}L_Mesh`, `${prefix}L`, left, {
      depth: thickness,
      bevel: thickness * 0.3,
      rotation: [Math.PI / 2, 0, 0],
      material,
    }),
    group(`${prefix}R`, parent, [shoulder[0], shoulder[1], shoulder[2]]),
    extrusion(`${prefix}R_Mesh`, `${prefix}R`, right, {
      depth: thickness,
      bevel: thickness * 0.3,
      rotation: [Math.PI / 2, 0, 0],
      material,
    }),
  ];
}

/** Six insect legs, three per side, angled outward and down. */
function insectLegs(prefix, parent, { spread, drop, zOffsets, radius = 0.004 }) {
  const operations = [];
  const sides = [
    { tag: "L", sign: -1 },
    { tag: "R", sign: 1 },
  ];
  for (const { tag, sign } of sides) {
    zOffsets.forEach((z, index) => {
      const n = index + 1;
      operations.push(
        tube(
          `${prefix}_Leg${tag}${n}`,
          parent,
          [
            [sign * 0.012, 0, z * 0.6],
            [sign * spread * 0.55, -drop * 0.5, z],
            [sign * spread, -drop, z + sign * 0.01],
          ],
          radius,
          M.hornetDark,
        ),
      );
    });
  }
  return operations;
}

// ── assets ───────────────────────────────────────────────────────────────────────

/**
 * Hornet — the pollen thief.
 * Bigger, rustier and heavier than the bee so the two never read as the same silhouette.
 * Length ~0.50 m (the bee is ~0.36 m).
 */
function buildHornet() {
  const ops = [group("Hornet", "Scene")];

  ops.push(
    mesh("Hornet_Abdomen", "Hornet", "icosahedron", [0.105, 0.105, 0.105], {
      scale: [1, 0.9, 1.45],
      position: [0, 0, 0.115],
      material: M.hornetBody,
    }),
    mesh("Hornet_AbdomenBand1", "Hornet", "cylinder", [0.098, 0.098, 0.028], {
      rotation: [Math.PI / 2, 0, 0],
      position: [0, 0, 0.075],
      material: M.hornetBand,
    }),
    mesh("Hornet_AbdomenBand2", "Hornet", "cylinder", [0.082, 0.082, 0.026], {
      rotation: [Math.PI / 2, 0, 0],
      position: [0, 0, 0.158],
      material: M.hornetBand,
    }),
    mesh("Hornet_Stinger", "Hornet", "cone", [0.016, 0.075, 0.016], {
      rotation: [Math.PI / 2, 0, 0],
      position: [0, -0.004, 0.263],
      material: M.hornetDark,
    }),
    mesh("Hornet_Thorax", "Hornet", "sphere", [0.082, 0.082, 0.082], {
      scale: [1, 0.98, 1.1],
      position: [0, 0, -0.045],
      material: M.hornetBand,
    }),
    mesh("Hornet_Waist", "Hornet", "cylinder", [0.026, 0.032, 0.05], {
      rotation: [Math.PI / 2, 0, 0],
      position: [0, -0.006, 0.016],
      material: M.hornetDark,
    }),
    mesh("Hornet_Head", "Hornet", "sphere", [0.062, 0.062, 0.062], {
      scale: [1, 0.92, 1.05],
      position: [0, 0, -0.148],
      material: M.hornetBody,
    }),
    mesh("Hornet_MandibleL", "Hornet", "cone", [0.014, 0.05, 0.014], {
      rotation: [Math.PI / 2, 0.4, 0],
      position: [-0.022, -0.03, -0.2],
      material: M.hornetDark,
    }),
    mesh("Hornet_MandibleR", "Hornet", "cone", [0.014, 0.05, 0.014], {
      rotation: [Math.PI / 2, -0.4, 0],
      position: [0.022, -0.03, -0.2],
      material: M.hornetDark,
    }),
    mesh("Hornet_EyeL", "Hornet", "sphere", [0.026, 0.026, 0.026], {
      scale: [0.8, 1, 1.15],
      position: [-0.042, 0.014, -0.166],
      material: M.hornetEye,
    }),
    mesh("Hornet_EyeR", "Hornet", "sphere", [0.026, 0.026, 0.026], {
      scale: [0.8, 1, 1.15],
      position: [0.042, 0.014, -0.166],
      material: M.hornetEye,
    }),
    tube("Hornet_AntennaL", "Hornet", [[-0.024, 0.03, -0.19], [-0.052, 0.075, -0.24], [-0.062, 0.105, -0.265]], 0.004, M.hornetDark),
    tube("Hornet_AntennaR", "Hornet", [[0.024, 0.03, -0.19], [0.052, 0.075, -0.24], [0.062, 0.105, -0.265]], 0.004, M.hornetDark),
    group("Hornet_Legs", "Hornet", [0, -0.02, -0.045]),
  );

  ops.push(
    ...insectLegs("Hornet", "Hornet_Legs", {
      spread: 0.1,
      drop: 0.11,
      zOffsets: [-0.045, 0, 0.045],
    }),
  );

  // Broad, straighter wings than the bee — visually heavier.
  ops.push(
    ...wingPair({
      prefix: "Hornet_Wing",
      parent: "Hornet",
      thickness: 0.005,
      material: { color: "#e8d6a8", opacity: 0.4, roughness: 0.2, metalness: 0 },
      shoulder: [0.05, 0.062, -0.06],
      outline: [
        [0, 0],
        [-0.05, 0.02],
        [-0.075, 0.07],
        [-0.07, 0.15],
        [-0.04, 0.2],
        [-0.008, 0.19],
        [0.02, 0.13],
        [0.02, 0.055],
        [0.008, 0.018],
      ],
    }),
  );

  return ops;
}

/**
 * Wasp — the swarm unit.
 * Slender and bright yellow with a pinched waist, so it reads as *smaller and sharper*
 * than the hornet at a glance. Length ~0.26 m.
 */
function buildWasp() {
  const ops = [group("Wasp", "Scene")];

  ops.push(
    mesh("Wasp_Abdomen", "Wasp", "icosahedron", [0.042, 0.042, 0.042], {
      scale: [1, 0.82, 1.7],
      position: [0, 0, 0.085],
      material: M.waspBand,
    }),
    mesh("Wasp_AbdomenBand1", "Wasp", "cylinder", [0.039, 0.039, 0.016], {
      rotation: [Math.PI / 2, 0, 0],
      position: [0, 0, 0.055],
      material: M.waspBody,
    }),
    mesh("Wasp_AbdomenBand2", "Wasp", "cylinder", [0.036, 0.036, 0.016], {
      rotation: [Math.PI / 2, 0, 0],
      position: [0, 0, 0.098],
      material: M.waspBody,
    }),
    mesh("Wasp_AbdomenBand3", "Wasp", "cylinder", [0.03, 0.03, 0.014], {
      rotation: [Math.PI / 2, 0, 0],
      position: [0, 0, 0.134],
      material: M.waspBody,
    }),
    mesh("Wasp_Stinger", "Wasp", "cone", [0.008, 0.05, 0.008], {
      rotation: [Math.PI / 2, 0, 0],
      position: [0, -0.002, 0.185],
      material: M.waspBody,
    }),
    // The pinched waist is the wasp's signature silhouette.
    mesh("Wasp_Waist", "Wasp", "cylinder", [0.012, 0.026, 0.045], {
      rotation: [Math.PI / 2, 0, 0],
      position: [0, -0.004, 0.022],
      material: M.waspBody,
    }),
    mesh("Wasp_Thorax", "Wasp", "sphere", [0.038, 0.038, 0.038], {
      scale: [1, 0.96, 1.15],
      position: [0, 0, -0.018],
      material: M.waspBody,
    }),
    mesh("Wasp_Head", "Wasp", "sphere", [0.031, 0.031, 0.031], {
      scale: [1, 0.9, 1.05],
      position: [0, 0.002, -0.072],
      material: M.waspBody,
    }),
    mesh("Wasp_EyeL", "Wasp", "sphere", [0.014, 0.014, 0.014], {
      scale: [0.8, 1, 1.2],
      position: [-0.021, 0.008, -0.083],
      material: M.waspEye,
    }),
    mesh("Wasp_EyeR", "Wasp", "sphere", [0.014, 0.014, 0.014], {
      scale: [0.8, 1, 1.2],
      position: [0.021, 0.008, -0.083],
      material: M.waspEye,
    }),
    tube("Wasp_AntennaL", "Wasp", [[-0.012, 0.018, -0.098], [-0.03, 0.05, -0.132], [-0.036, 0.072, -0.15]], 0.0024, M.waspBody),
    tube("Wasp_AntennaR", "Wasp", [[0.012, 0.018, -0.098], [0.03, 0.05, -0.132], [0.036, 0.072, -0.15]], 0.0024, M.waspBody),
    group("Wasp_Legs", "Wasp", [0, -0.01, -0.018]),
  );

  ops.push(
    ...insectLegs("Wasp", "Wasp_Legs", {
      spread: 0.055,
      drop: 0.075,
      zOffsets: [-0.024, 0, 0.024],
      radius: 0.0022,
    }),
  );

  ops.push(
    ...wingPair({
      prefix: "Wasp_Wing",
      parent: "Wasp",
      thickness: 0.003,
      material: { color: "#e8f4ff", opacity: 0.34, roughness: 0.15, metalness: 0 },
      shoulder: [0.026, 0.03, -0.026],
      outline: [
        [0, 0],
        [-0.026, 0.012],
        [-0.038, 0.04],
        [-0.034, 0.082],
        [-0.02, 0.108],
        [-0.004, 0.1],
        [0.01, 0.06],
        [0.008, 0.024],
        [0.004, 0.008],
      ],
    }),
  );

  return ops;
}

/**
 * Bird — the unkillable predator.
 * Sized to feel enormous against a 0.36 m bee: ~3 m long, ~8 m wingspan. Readability at
 * 60 m is the acceptance test, so the silhouette is broad and the colours are high contrast
 * (dark back, pale belly) rather than naturalistically mottled.
 */
function buildBird() {
  const ops = [group("Bird", "Scene")];

  ops.push(
    mesh("Bird_Body", "Bird", "icosahedron", [0.46, 0.46, 0.46], {
      scale: [1, 0.92, 1.75],
      position: [0, 0, 0],
      material: M.birdBody,
    }),
    mesh("Bird_Belly", "Bird", "sphere", [0.4, 0.4, 0.4], {
      scale: [1, 0.7, 1.5],
      position: [0, -0.16, 0.02],
      material: M.birdBelly,
    }),
    mesh("Bird_Neck", "Bird", "cylinder", [0.2, 0.26, 0.36], {
      rotation: [Math.PI / 2.4, 0, 0],
      position: [0, 0.2, -0.62],
      material: M.birdBody,
    }),
    mesh("Bird_Head", "Bird", "sphere", [0.25, 0.25, 0.25], {
      scale: [0.94, 0.9, 1.05],
      position: [0, 0.36, -0.82],
      material: M.birdBody,
    }),
    mesh("Bird_Beak", "Bird", "cone", [0.09, 0.34, 0.09], {
      rotation: [-Math.PI / 2, 0, 0],
      position: [0, 0.32, -1.06],
      material: M.birdBeak,
    }),
    mesh("Bird_EyeL", "Bird", "sphere", [0.052, 0.052, 0.052], {
      position: [-0.17, 0.43, -0.92],
      material: M.birdEye,
    }),
    mesh("Bird_EyeR", "Bird", "sphere", [0.052, 0.052, 0.052], {
      position: [0.17, 0.43, -0.92],
      material: M.birdEye,
    }),
    // A fanned tail doubles as a strong long-range silhouette cue.
    mesh("Bird_Tail", "Bird", "box", [0.66, 0.05, 0.92], {
      rotation: [0.12, 0, 0],
      position: [0, 0.05, 1.14],
      material: M.birdWing,
    }),
    mesh("Bird_FootL", "Bird", "capsule", [0.05, 0.3, 0.05], {
      rotation: [0.6, 0, 0.2],
      position: [-0.14, -0.34, 0.16],
      material: M.birdBeak,
    }),
    mesh("Bird_FootR", "Bird", "capsule", [0.05, 0.3, 0.05], {
      rotation: [0.6, 0, -0.2],
      position: [0.14, -0.34, 0.16],
      material: M.birdBeak,
    }),
  );

  ops.push(
    ...wingPair({
      prefix: "Bird_Wing",
      parent: "Bird",
      thickness: 0.09,
      material: M.birdWing,
      shoulder: [0.34, 0.16, -0.16],
      // Long, swept, slightly pointed — a soaring wing, not a wingtip-feathered one.
      outline: [
        [0, 0],
        [-0.55, 0.06],
        [-1.35, 0.16],
        [-2.2, 0.2],
        [-3.05, 0.1],
        [-3.5, -0.08],
        [-3.25, -0.34],
        [-2.35, -0.46],
        [-1.35, -0.4],
        [-0.55, -0.2],
      ],
    }),
  );

  return ops;
}

/**
 * Spider — the Forest trap.
 * Static, so it never moves and needs no flight model. Body ~1.4 m, leg span ~3.5 m.
 */
function buildSpider() {
  const ops = [group("Spider", "Scene")];

  ops.push(
    mesh("Spider_Abdomen", "Spider", "icosahedron", [0.52, 0.52, 0.52], {
      scale: [1, 0.86, 1.18],
      position: [0, 0.62, 0.62],
      material: M.spiderBody,
    }),
    mesh("Spider_Marking", "Spider", "sphere", [0.3, 0.3, 0.3], {
      scale: [1, 0.5, 1.4],
      position: [0, 0.96, 0.6],
      material: M.spiderMark,
    }),
    mesh("Spider_Cephalothorax", "Spider", "sphere", [0.38, 0.38, 0.38], {
      scale: [1, 0.85, 1.1],
      position: [0, 0.5, -0.06],
      material: M.spiderLeg,
    }),
    mesh("Spider_EyeL", "Spider", "sphere", [0.06, 0.06, 0.06], {
      position: [-0.16, 0.68, -0.4],
      material: M.spiderMark,
    }),
    mesh("Spider_EyeR", "Spider", "sphere", [0.06, 0.06, 0.06], {
      position: [0.16, 0.68, -0.4],
      material: M.spiderMark,
    }),
    mesh("Spider_FangL", "Spider", "cone", [0.055, 0.3, 0.055], {
      rotation: [Math.PI / 2.2, 0, 0.15],
      position: [-0.12, 0.26, -0.36],
      material: M.spiderBody,
    }),
    mesh("Spider_FangR", "Spider", "cone", [0.055, 0.3, 0.055], {
      rotation: [Math.PI / 2.2, 0, -0.15],
      position: [0.12, 0.26, -0.36],
      material: M.spiderBody,
    }),
  );

  // Eight legs, four per side. Each rises to a knee above the body then drops to the ground:
  // the raised knee is what makes it read as a spider rather than a beetle. The body must sit
  // high enough that the feet reach y = 0, or the abdomen sinks through the floor.
  const legZ = [-0.42, -0.18, 0.12, 0.42];
  for (const sign of [-1, 1]) {
    const tag = sign < 0 ? "L" : "R";
    legZ.forEach((z, index) => {
      const n = index + 1;
      const reach = 1.5 - Math.abs(index - 1.5) * 0.16;
      ops.push(
        tube(
          `Spider_Leg${tag}${n}`,
          "Spider",
          [
            [sign * 0.24, 0.46, z],
            [sign * (0.24 + reach * 0.45), 1.12, z + sign * 0.06],
            [sign * (0.24 + reach * 0.95), 0.07, z + sign * 0.34],
          ],
          0.055,
          M.spiderLeg,
        ),
      );
    });
  }

  return ops;
}

/** Daisy — hovering flower, low yield, fast respawn, sheltered. */
function buildDaisy() {
  const ops = [group("Daisy", "Scene")];
  ops.push(
    mesh("Daisy_Stem", "Daisy", "cylinder", [0.02, 0.03, 0.5], { position: [0, 0.25, 0], material: M.stem }),
    mesh("Daisy_LeafL", "Daisy", "box", [0.14, 0.008, 0.06], { rotation: [0, 0.5, 0.35], position: [-0.08, 0.26, 0], material: M.leaf }),
    mesh("Daisy_LeafR", "Daisy", "box", [0.14, 0.008, 0.06], { rotation: [0, -0.5, -0.35], position: [0.08, 0.34, 0], material: M.leaf }),
    mesh("Daisy_Center", "Daisy", "sphere", [0.06, 0.06, 0.06], { scale: [1, 0.55, 1], position: [0, 0.51, 0], material: M.daisyCenter }),
  );
  ops.push(
    ...petalRing("Daisy_Petal", "Daisy", {
      count: 9,
      radius: 0.075,
      y: 0.505,
      size: [0.13, 0.014, 0.048],
      material: M.daisyPetal,
    }),
  );
  return ops;
}

/** Poppy — hovering flower, medium yield/risk. Broad cupped petals, unmistakably red. */
function buildPoppy() {
  const ops = [group("Poppy", "Scene")];
  ops.push(
    mesh("Poppy_Stem", "Poppy", "cylinder", [0.025, 0.04, 1.05], { position: [0, 0.52, 0], material: M.stem }),
    mesh("Poppy_LeafL", "Poppy", "box", [0.22, 0.01, 0.09], { rotation: [0, 0.7, 0.4], position: [-0.13, 0.42, 0], material: M.leaf }),
    mesh("Poppy_LeafR", "Poppy", "box", [0.22, 0.01, 0.09], { rotation: [0, -0.7, -0.4], position: [0.13, 0.68, 0], material: M.leaf }),
    mesh("Poppy_Center", "Poppy", "sphere", [0.075, 0.075, 0.075], { scale: [1, 0.5, 1], position: [0, 1.06, 0], material: M.poppyCenter }),
  );
  ops.push(
    ...petalRing("Poppy_Petal", "Poppy", {
      count: 6,
      radius: 0.13,
      y: 1.1,
      size: [0.22, 0.03, 0.16],
      material: M.poppyPetal,
      tilt: 0.32, // cupped upward, which is the poppy's tell
    }),
  );
  return ops;
}

/** Sunflower — landable, high yield, long forage, slow respawn, wide open. Tall: ~4 m. */
function buildSunflower() {
  const ops = [group("Sunflower", "Scene")];
  ops.push(
    mesh("Sunflower_Stem", "Sunflower", "cylinder", [0.09, 0.15, 3.5], { position: [0, 1.75, 0], material: M.stem }),
    mesh("Sunflower_LeafL", "Sunflower", "box", [0.7, 0.03, 0.3], { rotation: [0, 0.6, 0.5], position: [-0.42, 1.15, 0], material: M.leaf }),
    mesh("Sunflower_LeafR", "Sunflower", "box", [0.7, 0.03, 0.3], { rotation: [0, -0.6, -0.5], position: [0.42, 2.0, 0], material: M.leaf }),
    // The disc faces -Z, the bee's forward axis, so a sunflower "looks at" an approaching bee.
    mesh("Sunflower_Disc", "Sunflower", "cylinder", [0.6, 0.6, 0.16], { rotation: [Math.PI / 2, 0, 0], position: [0, 3.6, 0], material: M.sunflowerDisc }),
    mesh("Sunflower_Core", "Sunflower", "sphere", [0.5, 0.5, 0.5], { scale: [1, 0.35, 1], rotation: [Math.PI / 2, 0, 0], position: [0, 3.6, -0.1], material: M.sunflowerDisc }),
  );
  ops.push(
    ...petalRing("Sunflower_Petal", "Sunflower", {
      count: 18,
      radius: 0.66,
      y: 3.6,
      size: [0.42, 0.05, 0.22],
      material: M.sunflowerPetal,
      tilt: 0.12,
      phase: Math.PI / 2, // start at the front so a petal is never absent from head-on
    }),
  );
  return ops;
}

/**
 * Rare flower — landable, very high yield, very long forage, heavily exposed.
 * The read is "valuable and dangerous", so it is tall, magenta, and self-lit by an emissive
 * core: visible across the meadow in fog, which is the whole point (DESIGN §6.3).
 */
function buildRareFlower() {
  const ops = [group("RareFlower", "Scene")];
  ops.push(
    mesh("RareFlower_Stem", "RareFlower", "cylinder", [0.06, 0.11, 2.1], { position: [0, 1.05, 0], material: M.stem }),
    mesh("RareFlower_LeafL", "RareFlower", "box", [0.46, 0.025, 0.2], { rotation: [0, 0.9, 0.55], position: [-0.28, 0.6, 0], material: M.leaf }),
    mesh("RareFlower_LeafR", "RareFlower", "box", [0.46, 0.025, 0.2], { rotation: [0, -0.9, -0.55], position: [0.28, 1.15, 0], material: M.leaf }),
    mesh("RareFlower_LeafBack", "RareFlower", "box", [0.42, 0.025, 0.18], { rotation: [0, 2.6, 0.5], position: [0.06, 1.6, -0.26], material: M.leaf }),
    mesh("RareFlower_Calyx", "RareFlower", "cone", [0.24, 0.34, 0.24], { position: [0, 2.14, 0], material: M.stem }),
    mesh("RareFlower_Core", "RareFlower", "sphere", [0.2, 0.2, 0.2], { position: [0, 2.46, 0], material: M.rareCore }),
  );
  // Six long, pointed petals in a star — a silhouette nothing else in the palette shares.
  ops.push(
    ...petalRing("RareFlower_Petal", "RareFlower", {
      count: 6,
      radius: 0.3,
      y: 2.44,
      size: [0.72, 0.04, 0.19],
      material: M.rarePetal,
      tilt: -0.5, // swept back and up, like a lily
      phase: Math.PI / 6,
    }),
  );
  return ops;
}

// ── driver ───────────────────────────────────────────────────────────────────────

const ASSETS = {
  Hornet: buildHornet,
  Wasp: buildWasp,
  Bird: buildBird,
  Spider: buildSpider,
  Daisy: buildDaisy,
  Poppy: buildPoppy,
  Sunflower: buildSunflower,
  RareFlower: buildRareFlower,
};

/**
 * Where each asset sits in the workshop scene.
 *
 * Purely for viewing and editing — the scene doubles as the review surface, so nothing may
 * overlap. The game ignores these root transforms: entities are positioned from simulation
 * state at load time.
 */
const LAYOUT = {
  Bee: [-32, 0, 0],
  Hornet: [-21, 0, 0],
  Wasp: [-13, 0, 0],
  Bird: [1, 0, 0],
  Spider: [17, 0, 0],
  Daisy: [-13, 0, 26],
  Poppy: [-5, 0, 26],
  Sunflower: [7, 0, 26],
  RareFlower: [19, 0, 26],
};

/**
 * Local filename for each asset, under `public/assets/`.
 *
 * Written out rather than derived, so renaming an in-repo file is a deliberate, visible edit
 * rather than a silent consequence of renaming a scene object.
 */
const LOCAL_FILENAMES = {
  Bee: "bee.glb",
  Hornet: "hornet.glb",
  Wasp: "wasp.glb",
  Bird: "bird.glb",
  Spider: "spider.glb",
  Daisy: "daisy.glb",
  Poppy: "poppy.glb",
  Sunflower: "sunflower.glb",
  RareFlower: "rare-flower.glb",
};

/**
 * Download the exported GLBs into `public/assets/`.
 *
 * The Fiend URL always serves the *current* scene, so a local copy is what pins the game to
 * a known asset revision. Re-run after any edit, or the game silently keeps the old geometry.
 */
async function pullAssets(sceneId, names) {
  const directory = join(HERE, "..", "public", "assets");
  await mkdir(directory, { recursive: true });

  for (const name of names) {
    const filename = LOCAL_FILENAMES[name];
    if (!filename) continue;

    const response = await fetch(
      `https://anoma.ly/labs/fiend/s/${sceneId}.glb?object=${encodeURIComponent(name)}`,
    );
    if (!response.ok) throw new Error(`${name} download -> HTTP ${response.status}`);

    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(join(directory, filename), bytes);
    console.log(`${filename.padEnd(16)} ${String(Math.round(bytes.length / 1024)).padStart(4)} KB`);
  }
}

async function callTool(name, args) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "User-Agent": "kn9t-mcp/1.0",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${name} -> HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  const parsed = JSON.parse(text);
  if (parsed.error) {
    throw new Error(`${name} -> ${JSON.stringify(parsed.error)}`);
  }

  const payload = parsed.result?.content?.[0]?.text;
  const data = payload ? JSON.parse(payload) : parsed.result;
  if (data && data.error) {
    throw new Error(`${name} -> ${JSON.stringify(data.error)}`);
  }
  return data;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const pullOnly = argv.includes("--pull-only");
  const requested = argv.filter((a) => !a.startsWith("--"));

  // `--pull-only` skips the build entirely: the scene is already correct and only the local
  // copies are stale. Useful, and it avoids burning 9 revisions to refresh 9 files.
  const names = pullOnly
    ? Object.keys(LOCAL_FILENAMES)
    : requested.length > 0
      ? requested
      : Object.keys(ASSETS);

  for (const name of names) {
    if (!(name in ASSETS) && !(name in LOCAL_FILENAMES)) {
      throw new Error(`Unknown asset '${name}'. Known: ${Object.keys(ASSETS).join(", ")}`);
    }
  }

  if (dryRun) {
    let total = 0;
    for (const name of names) {
      const ops = ASSETS[name]();
      total += ops.length;
      console.log(`${name.padEnd(12)} ${String(ops.length).padStart(3)} operations`);
    }
    console.log(`${"TOTAL".padEnd(12)} ${String(total).padStart(3)} operations`);
    return;
  }

  const config = JSON.parse(
    // Strip a UTF-8 BOM. PowerShell's Set-Content and most Windows editors add one, and
    // JSON.parse rejects it — a failure that looks like a malformed config but is not.
    (await readFile(join(HERE, "fiend.config.json"), "utf8")).replace(/^\uFEFF/, ""),
  );
  const { scene_id: sceneId, secret } = config;
  if (!sceneId || !secret) {
    throw new Error("tools/fiend.config.json must contain scene_id and secret");
  }

  if (pullOnly) {
    console.log("pulling existing exports into public/assets/");
    await pullAssets(sceneId, names);
    return;
  }

  // Build each asset in its own batch so a failure is isolated and identifiable.
  for (const name of names) {
    const ops = ASSETS[name]();

    // Replace any previous version so the script is idempotent on re-run.
    await callTool("remove_object", { scene_id: sceneId, secret, object: name }).catch(() => {});

    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
      const slice = ops.slice(i, i + BATCH_LIMIT);
      const result = await callTool("edit_scene", {
        scene_id: sceneId,
        secret,
        operations: slice,
      });
      console.log(
        `${name.padEnd(12)} batch ${i / BATCH_LIMIT + 1}  +${slice.length} ops  revision ${result.revision}`,
      );
    }
  }

  const scene = await callTool("inspect_scene", { scene_id: sceneId });
  console.log(`\nscene now holds ${scene.storage.bytes} bytes, revision ${scene.revision}`);

  // Lay the assets out so they do not all sit on top of each other. An unviewable scene is
  // an uneditable one, and this scene is also the design review surface.
  const layoutOps = Object.entries(LAYOUT)
    .filter(([name]) => names.includes(name) || name === "Bee")
    .map(([name, position]) => ({ type: "transform", object: name, position }));

  if (layoutOps.length > 0) {
    const result = await callTool("edit_scene", {
      scene_id: sceneId,
      secret,
      operations: layoutOps,
    });
    console.log(`layout       +${layoutOps.length} ops  revision ${result.revision}`);
  }

  // Pin the game to this exact revision by refreshing the local copies. Skipping this is the
  // quiet failure mode: the scene changes, the game keeps loading last week's geometry.
  console.log("\npulling exports into public/assets/");
  await pullAssets(
    sceneId,
    names.filter((name) => name in LOCAL_FILENAMES || name === "Bee"),
  );
}

await main();
