# BeeSimulator — 3D Assets (Fiend)

> The Fiend scene holds every **hero asset**. Scenery is generated in code, not modelled here.

---

## Scene

| Field | Value |
|---|---|
| Name | `BeeSimulator - Assets` |
| Scene ID | `8f044c13-71e2-45d9-866f-c40d4c60694d` |
| Public read-only | https://anoma.ly/labs/fiend/s/8f044c13-71e2-45d9-866f-c40d4c60694d |
| GLB (whole scene) | https://anoma.ly/labs/fiend/s/8f044c13-71e2-45d9-866f-c40d4c60694d.glb |

### The write secret

Editing the scene requires a 256-bit **edit secret**, returned only at scene creation. It is a
bearer capability: **anyone holding it can rewrite or delete every asset.**

It is therefore **deliberately absent from this repository.** It lives only in
`tools/fiend.config.json`, which is git-ignored — that is the file `npm run assets` reads.
The collaborative edit URL (`...#secret=...`) is likewise not recorded here.

Reading and GLB download never require the secret, so everyone without it can still build,
run, and pull assets.

**If the secret is ever exposed**, re-create the scene from the public ID:
`create_scene({ source_id: "<scene id>", name: "..." })` produces a new scene with a fresh
secret. Update `tools/fiend.config.json` and re-run `npm run assets`.

## Conventions

Contractual — the game code depends on these.

| Convention | Value |
|---|---|
| **Up axis** | `+Y` |
| **Forward axis** | `-Z` (matches Three.js `Object3D.lookAt()`) |
| **Right axis** | `+X` |
| **Units** | metres, **game scale** (not real bee scale) — see `DESIGN.md` §4.3 |
| **Naming** | `{Asset}_{Part}`, e.g. `Hornet_WingL_Mesh`. Consistent, so the loader can find parts by name |
| **Group origins** | Each group's origin **is** its pivot. Groups are never at arbitrary positions |
| **Creature origin** | Body centre, so an entity's position is its centre |
| **Flower origin** | Base, at `y = 0`, so flowers stand on the terrain |
| **Textures** | None. PBR colour only — all detail is geometric |
| **Animation** | **None.** Wings are separate nodes; the game drives the flap |

## Tooling

Assets are **generated from code**, not hand-placed. The scene is a build artifact.

```bash
npm run assets              # rebuild every asset
npm run assets -- Hornet    # rebuild one
npm run assets -- --dry-run # print operation counts, send nothing
npm run verify              # download every GLB and check structure
```

| File | Purpose |
|---|---|
| `tools/build-assets.mjs` | Defines all eight assets procedurally and pushes them to Fiend |
| `tools/verify-assets.mjs` | Downloads the GLBs and asserts the structural invariants below |
| `tools/fiend.config.json` | Scene ID + write secret. **Git-ignored** |

`build-assets.mjs` removes and rebuilds each asset, so it is **idempotent** — re-running it is
always safe and always produces the same result.

### Why generated rather than hand-placed

A 16-petal sunflower is 16 hand-computed sine/cosine pairs. A spider is 8 legs × 3 control
points. Typing those as one-off tool calls means transcription errors nobody can review or
reproduce. As code, they are reviewable, re-runnable, and diffable.

### Invariants enforced by `npm run verify`

These are the failures that are **invisible in a still render** and therefore always reach the
game before anyone notices:

1. Every asset exports as valid glTF v2 with a consistent declared length.
2. Wing pivots are **groups**, not meshes — the game rotates the group so the wing turns about
   the shoulder, not about its own centre.
3. Left and right pivots sit at **equal and opposite** X.
4. Wings **extend opposite ways** — this caught a real bug where a double mirror put both wings
   on the same side (see History below).

## Inventory

All assets are built. Layout positions in the scene are for viewing only; the game positions
entities from simulation state and ignores the root transforms.

### Creatures

| Asset | Size | Notes |
|---|---|---|
| **Bee** | 0.36 m long, 0.17 m wingspan | The player. Hand-authored (predates the generator) |
| **Hornet** | 0.50 m long | Bigger, rustier, heavier than the bee. Mandibles. Body length ≈ 0.36 m — the bee is clearly the smaller |
| **Wasp** | 0.26 m long | Slender with a **pinched waist** and 3 yellow bands. Must read as smaller and brighter than the hornet |
| **Bird** | ≈ 3 m long, **7.76 m wingspan** | The unkillable predator. Dark back / pale belly for silhouette contrast at 60 m |
| **Spider** | 1.4 m body, ≈ 3 m leg span | Forest trap. Raised knees so it reads as a spider, not a beetle |

### Flowers

Distinguishable **at 100 m by silhouette and hue alone** — that is the design requirement
(`DESIGN.md` §6.3), not a nicety.

| Asset | Height | Hue | Role |
|---|---|---|---|
| **Daisy** | 0.7 m | white / yellow | Hover, low yield, fast respawn, sheltered |
| **Poppy** | 1.2 m | red | Hover, medium yield and risk. Cupped petals are its tell |
| **Sunflower** | 4.2 m | gold / brown | Landable, high yield, long forage, wide open |
| **RareFlower** | 2.7 m | **magenta, emissive** | Landable, very high yield, very long forage, heavily exposed. Self-lit so it is visible through fog — the "rich and dangerous" read is the entire point |

### Hierarchy pattern (flyers)

```
Hornet
├── Hornet_Thorax / Head / Eyes / Mandibles / Antennae
├── Hornet_Abdomen / AbdomenBand1 / AbdomenBand2 / Waist / Stinger
├── Hornet_WingL          ← GROUP, pivot at the left shoulder
│   └── Hornet_WingL_Mesh
├── Hornet_WingR          ← GROUP, pivot at the right shoulder
│   └── Hornet_WingR_Mesh
└── Hornet_Legs → 6 legs
```

## Wing flapping

The wings are **not animated in Fiend and never will be** — there is no animation data in the
GLB at all. The game drives them:

```ts
wingL.rotation.z = Math.sin(t * FLAP_RATE) * FLAP_AMPLITUDE;
wingR.rotation.z = -wingL.rotation.z;
```

> **Why procedural:** a bee flaps at ~200 Hz. That is not hand-animatable, and skeletal
> animation would be both wrong and useless. Intentional, not a shortcut.

This only works while `*_WingL` / `*_WingR` stay as **separate group nodes with shoulder
pivots**, which is why `npm run verify` asserts it.

## Export

```bash
curl -L "https://anoma.ly/labs/fiend/s/8f044c13-71e2-45d9-866f-c40d4c60694d.glb?object=Hornet" -o public/assets/hornet.glb
```

Preview lights and cameras are excluded automatically; local transforms and hierarchy are
preserved. The URL follows the **live** scene, so download it for a fixed copy.

## Known issues

### GLB weight

| Asset | Size |
|---|---|
| Hornet | 479 KB |
| Wasp | 475 KB |
| Bee | 459 KB |
| Spider | 427 KB |
| Bird | 179 KB |
| Sunflower | 87 KB |
| RareFlower | 63 KB |
| Daisy | 60 KB |
| Poppy | 55 KB |
| **Total** | **≈ 2.2 MB** |

Reviewed and **accepted**: it is a game, not a mobile web toy, and the weight buys real
silhouette quality on assets the player looks at constantly.

Worth knowing for later: the insects are 6-8× the bird despite being far smaller, because
`add_tube` tessellates a Catmull-Rom spline finely and there is no segment-count parameter.
A wasp costs 475 KB for geometry that could be ~40 KB. **If the download ever becomes a
problem, replace the tube legs and antennae with cylinders and capsules** — that is the single
highest-leverage fix, and it is confined to `build-assets.mjs`.

### Fixed during development

- **Both wings on the same side.** `wingPair` negated the outline for *both* wings instead of
  one, so the left wing rendered on the right. Invisible in a still image; caught by comparing
  X spans. This is the bug `npm run verify` now exists to prevent.
- **Spider abdomen through the floor.** The body was authored at `y ≈ 0.1` while the legs only
  reached `y ≈ 0.02`, burying the body. Body raised to `y ≈ 0.6`.
- **Rare flower parts named `Rare_*`** while every other flower used `${Name}_*`. Renamed to
  `RareFlower_*` so the loader can find parts by convention.
