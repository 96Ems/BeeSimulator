/**
 * Asset verification.
 *
 * Downloads each hero asset's GLB from Fiend and asserts the structural properties the game
 * depends on. Cheap to run and catches the class of bug that is invisible in a still render:
 * a mirrored wing that ended up on the wrong side, a missing shoulder pivot, a collapsed
 * hierarchy.
 *
 *   node tools/verify-assets.mjs
 *
 * Exits non-zero if any check fails.
 */

const SCENE_ID = process.env.FIEND_SCENE ?? "8f044c13-71e2-45d9-866f-c40d4c60694d";
const GLB = (object) =>
  `https://anoma.ly/labs/fiend/s/${SCENE_ID}.glb?object=${encodeURIComponent(object)}`;

/** Assets that must expose a mirrored wing pair with shoulder pivots. */
const FLYERS = ["Bee", "Hornet", "Wasp", "Bird"];

/** Every asset that must export at all. */
const ALL = [...FLYERS, "Spider", "Daisy", "Poppy", "Sunflower", "RareFlower"];

async function loadGltf(object) {
  const response = await fetch(GLB(object));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const magic = buffer.toString("ascii", 0, 4);
  if (magic !== "glTF") throw new Error(`bad magic '${magic}'`);

  const version = buffer.readUInt32LE(4);
  if (version !== 2) throw new Error(`unsupported glTF version ${version}`);

  const declared = buffer.readUInt32LE(8);
  if (declared !== buffer.length) {
    throw new Error(`length mismatch: header ${declared} vs actual ${buffer.length}`);
  }

  const jsonLength = buffer.readUInt32LE(12);
  const gltf = JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength));
  return { gltf, bytes: buffer.length };
}

/**
 * World-space X span of a named mesh, from its accessor bounds plus its own translation and
 * its parent group's translation.
 *
 * The parent term matters: wing meshes sit inside a pivot group, and their geometry is
 * authored in the group's local space. Omitting the parent compares wings in two different
 * frames and reports a correct model as broken.
 */
function xSpan(gltf, name, parentName) {
  const node = (gltf.nodes ?? []).find((n) => n.name === name);
  if (!node || node.mesh === undefined) return null;

  const primitive = gltf.meshes[node.mesh].primitives[0];
  const accessor = gltf.accessors[primitive.attributes.POSITION];
  const own = (node.translation ?? [0, 0, 0])[0];
  const parent = parentName
    ? ((gltf.nodes ?? []).find((n) => n.name === parentName)?.translation ?? [0, 0, 0])[0]
    : 0;
  const offset = own + parent;

  return { lo: accessor.min[0] + offset, hi: accessor.max[0] + offset };
}

const failures = [];

function check(label, condition, detail) {
  const status = condition ? "  ok  " : " FAIL ";
  console.log(`[${status}] ${label}${detail ? "  " + detail : ""}`);
  if (!condition) failures.push(label);
}

console.log("── exports ──────────────────────────────────────────────────────────");
const loaded = new Map();
for (const name of ALL) {
  try {
    const { gltf, bytes } = await loadGltf(name);
    loaded.set(name, gltf);
    const nodes = (gltf.nodes ?? []).length;
    const meshes = (gltf.meshes ?? []).length;
    const materials = (gltf.materials ?? []).length;
    check(
      name.padEnd(11),
      nodes > 1 && meshes > 0,
      `${String(Math.round(bytes / 1024)).padStart(4)} KB  nodes=${String(nodes).padStart(2)} meshes=${String(meshes).padStart(2)} materials=${String(materials).padStart(2)}`,
    );
  } catch (error) {
    check(name.padEnd(11), false, error.message);
  }
}

console.log("\n── wing pivots and mirroring ────────────────────────────────────────");
for (const name of FLYERS) {
  const gltf = loaded.get(name);
  if (!gltf) {
    check(name, false, "not loaded");
    continue;
  }

  const pivotL = (gltf.nodes ?? []).find((n) => n.name === `${name}_WingL`);
  const pivotR = (gltf.nodes ?? []).find((n) => n.name === `${name}_WingR`);

  if (!pivotL || !pivotR) {
    check(`${name} wing pivot groups`, false, "WingL / WingR group node missing");
    continue;
  }

  // The pivot must be a group, not the mesh itself: the game rotates the group so the wing
  // turns about the shoulder rather than about its own centre or the model origin.
  check(
    `${name} wing pivots are groups`,
    pivotL.mesh === undefined && pivotR.mesh === undefined,
    "no mesh on the group node",
  );

  const lx = (pivotL.translation ?? [0, 0, 0])[0];
  const rx = (pivotR.translation ?? [0, 0, 0])[0];
  check(
    `${name} pivots sit on opposite sides`,
    lx < 0 && rx > 0 && Math.abs(lx + rx) < 1e-6,
    `L=${lx.toFixed(3)} R=${rx.toFixed(3)}`,
  );

  const left = xSpan(gltf, `${name}_WingL_Mesh`, `${name}_WingL`);
  const right = xSpan(gltf, `${name}_WingR_Mesh`, `${name}_WingR`);
  if (!left || !right) {
    check(`${name} wing meshes`, false, "mesh node missing");
    continue;
  }

  // The regression this file exists for: both wings extending the same way, which happens if
  // the outline is mirrored twice or not at all.
  check(
    `${name} wings extend opposite ways`,
    left.hi < 0.001 && right.lo > -0.001,
    `L=[${left.lo.toFixed(2)},${left.hi.toFixed(2)}] R=[${right.lo.toFixed(2)},${right.hi.toFixed(2)}]`,
  );
}

console.log("\n── ground contact ───────────────────────────────────────────────────");
for (const name of ["Daisy", "Poppy", "Sunflower", "RareFlower"]) {
  const gltf = loaded.get(name);
  if (!gltf) continue;
  const span = xSpan(gltf, `${name}_Stem`);
  check(`${name.padEnd(11)} has a stem`, span !== null, span ? "" : "missing");
}

console.log("");
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("all checks passed");
