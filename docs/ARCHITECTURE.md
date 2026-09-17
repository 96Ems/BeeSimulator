# BeeSimulator — Architecture

> Technical reference. Every convention here exists to serve one of the three
> non-negotiable constraints in §1.

---

## 1. The three non-negotiable constraints

These cost almost nothing to respect now and would cost a rewrite later. They apply from the
**first line of gameplay code**, including the flight prototype.

| # | Constraint | Enables | How |
|---|---|---|---|
| 1 | **Simulation is separate from rendering** | Authoritative server simulation later; deterministic tests; clean debugging | Game state lives in plain data (`SimState`). Rendering reads it and copies into Three.js objects. **No game logic ever reads or writes a `Mesh`, `Vector3` owned by a mesh, or any Three.js object** |
| 2 | **Fixed timestep** | Determinism; a *stable* helicopter flight model | An accumulator drives simulation at exactly `1/60 s`. Max 5 catch-up steps per frame; beyond that, time is dropped. Rendering interpolates between the last two states |
| 3 | **No singletons, no global mutable state** | Multiplayer; testability | Every entity carries an `id`. Input becomes **commands**, never raw device reads inside simulation |

### Why constraint 2 is not optional even in single-player

A helicopter model integrates angular velocity into attitude, and attitude into thrust
direction. With a variable `delta`, a frame hitch changes the integration result — the bee
behaves differently at 60 fps and 144 fps, and tuning becomes meaningless. Fixed timestep
is a **flight-quality requirement first**, a netcode requirement second.

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Build | **Vite** | HMR, ES modules, no config overhead |
| Language | **TypeScript**, `strict: true` | No `any` in simulation code |
| Rendering | **Three.js** | r148+ |
| Post-processing | `three/examples/jsm/postprocessing` | Bloom + vignette only |
| Assets | **Fiend** (MCP) → GLB → `GLTFLoader` | Hero assets only |
| Scenery | Procedural, in code | `InstancedMesh`, no external assets |
| Physics | **Custom**, no physics engine | Helicopter flight is bespoke and needs no collider solver |
| Persistence | `localStorage`, versioned | §7 |
| Testing | **Vitest** | Simulation modules are plain functions: trivially testable |

**No physics engine.** The flight model is a bespoke integrator, and collisions are
sphere/AABB tests against a small set of hand-placed colliders. Adding Rapier or Cannon
would cost determinism, bundle size and control, for no benefit.

## 3. Project layout

```
BeeSimulator/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   └── assets/                  # exported GLBs (bee.glb, hornet.glb, ...)
├── src/
│   ├── main.ts                  # bootstrap: canvas, loop, wiring
│   │
│   ├── sim/                     # PURE. No Three.js import. Deterministic.
│   │   ├── State.ts             # SimState type: the entire game state
│   │   ├── step.ts              # step(state, commands, dt) -> state
│   │   ├── flight.ts            # helicopter flight model
│   │   ├── stabilization.ts     # inactivity detection + auto-stab blend
│   │   ├── forage.ts            # pollen accumulation, flower depletion
│   │   ├── entities/
│   │   │   ├── bee.ts
│   │   │   ├── bird.ts
│   │   │   ├── hornet.ts
│   │   │   ├── wasp.ts
│   │   │   └── flower.ts
│   │   ├── world.ts             # biome layout, flower placement (seeded)
│   │   └── rng.ts               # seeded PRNG — never Math.random in sim
│   │
│   ├── input/                   # device -> commands. No Three.js.
│   │   ├── bindings.ts          # event.code mappings, rebinding
│   │   ├── layout.ts            # AZERTY/QWERTY detection (display only)
│   │   ├── mouseStick.ts        # mouse-as-stick scheme
│   │   ├── keyboardStick.ts     # full-keyboard scheme
│   │   └── commands.ts          # InputCommand type
│   │
│   ├── render/                  # Three.js. Reads SimState, never writes it.
│   │   ├── Renderer.ts
│   │   ├── Scene.ts             # tone mapping, fog, lights
│   │   ├── Camera.ts            # 3rd-person follow with lag + collision
│   │   ├── postfx.ts            # bloom + vignette
│   │   ├── interpolation.ts     # blend prev/current sim states
│   │   ├── views/               # one view per entity type
│   │   │   ├── BeeView.ts
│   │   │   ├── BirdView.ts
│   │   │   └── ...
│   │   └── scenery/
│   │       ├── Meadow.ts
│   │       ├── Forest.ts
│   │       ├── Desert.ts
│   │       ├── Beach.ts
│   │       └── instancing.ts    # InstancedMesh helpers
│   │
│   ├── game/                    # glue: owns the loop, wires sim <-> input <-> render
│   │   ├── Game.ts
│   │   ├── Loop.ts              # fixed-timestep accumulator
│   │   └── Session.ts           # 5-min timer, scoring
│   │
│   ├── progression/
│   │   ├── tree.ts              # tree evaluation, tier math
│   │   ├── role.ts              # role ratio computation
│   │   └── save.ts              # localStorage, versioned schema
│   │
│   ├── data/
│   │   ├── tree.json            # skill tree content (grows without code changes)
│   │   ├── flowers.json         # flower type parameters
│   │   └── tuning.ts            # all 🔧 values, in one file
│   │
│   └── ui/
│       ├── hud.ts               # pollen gauge, lives, timer
│       ├── menu.ts              # rebinding, presets
│       └── results.ts           # score screen
└── docs/
```

**Enforced dependency direction** — this is what keeps constraint 1 honest:

```
sim/  ←  game/  →  render/
          ↑
       input/
```

- `sim/` imports **nothing** from `render/`, `ui/`, or Three.js.
- `render/` reads `SimState` and never mutates it.
- `input/` produces `InputCommand` objects; it does not know the simulation exists.
- `game/` is the only module that knows about all three.

A lint rule (`no-restricted-imports`) should enforce that `sim/` cannot import `three`.

## 4. Simulation model

### 4.1 SimState

`SimState` is a **plain serializable object**. It contains no class instances, no functions,
no Three.js types. This is what makes save, replay, network sync and testing all trivial.

```ts
type SimState = {
  tick: number;            // fixed-step counter
  time: number;            // simulated seconds
  rngState: number;        // seeded PRNG state
  entities: Entity[];      // flat, id-indexed
  nextEntityId: number;
};
```

### 4.2 Entities

Every entity has `id`, `kind`, `position`, `velocity`, `orientation`, and kind-specific data.
Positions are `{ x, y, z }` plain objects, **not** `THREE.Vector3`.

### 4.3 The step function

```ts
function step(state: SimState, commands: Map<EntityId, InputCommand>, dt: number): SimState
```

Pure, deterministic, no allocation in the hot path (reuse scratch objects). Same inputs →
same outputs, always. This is what makes the flight model testable and the netcode possible.

### 4.4 Flight model (helicopter)

The integrator, per fixed step:

1. **Input** → target pitch/roll rates and collective. Mouse/keyboard give a *rate* for
   the mouse-stick scheme and a *target attitude* for the keyboard scheme; both normalize
   to the same internal representation.
2. **Auto-stab blend** (§4.5) mixes the player target with a leveling target.
3. **Angular integration**: torque toward target attitude, with angular damping. Clamp
   pitch/roll to the operating envelope.
4. **Thrust vector**: forward thrust is proportional to the sine of the nose-down angle.
   Collective gives vertical thrust. Lateral motion arises from roll.
5. **Linear damping**: air resistance, stronger on the vertical axis (a bee does not
   fall fast).
6. **Collision**: sphere tests against world colliders. Ground contact has no gravity
   death; the bee simply cannot descend below the floor.
7. **Greedy coupling**: pollen load adds mass — a loaded bee accelerates slower and
   climbs worse. This makes the return trip *mechanically* heavier, which is exactly the
   fiction the design promises.

### 4.5 Stabilization

```
inactivityMs = now - lastPitchRollInputTime

if inactivityMs < 200:      blend = 0            // full manual
else:                       blend = smoothstep(200, 600, inactivityMs)
```

`blend` mixes the player's target attitude with the level-flight target. Smoothstep
guarantees no snap. Both input schemes feed `lastPitchRollInputTime`, which is why the
mechanism works identically for mouse and keyboard.

**This is inert data in `SimState`** (`lastPitchRollInputTime` is updated from the command),
so the simulation stays deterministic and headless.

## 5. Input system

### 5.1 Physical-position binding

```ts
type Binding = string;      // KeyboardEvent.code, e.g. "KeyW", "Digit4"
```

Never `event.key`. A single binding table works on AZERTY and QWERTY because physical
key positions are identical across layouts.

### 5.2 Layout detection (display only)

Heuristic: on `keydown`, if `event.code === "KeyQ"` and `event.key === "a"`, the layout is
AZERTY. Cache the result; it only affects which **label** the rebinding UI draws.

### 5.3 Two schemes, one command type

Both `mouseStick.ts` and `keyboardStick.ts` produce the same output:

```ts
type InputCommand = {
  entityId: EntityId;
  pitch: number;    // -1..1
  roll: number;     // -1..1
  yaw: number;      // -1..1
  thrust: number;   // -1..1
  actions: ActionFlags;   // sting, dash, skill1..3 (edge-triggered bits)
  source: "mouse" | "keyboard";
};
```

`source` exists only so the stabilization logic can apply the correct deadzone semantics —
the simulation itself treats both identically.

### 5.4 Pointer lock

The mouse-stick scheme requires pointer lock. Enter on click, exit on `Esc`. Raw movement
deltas (`movementX`/`movementY`) accumulate into the pitch/roll command, with a per-frame
sensitivity setting.

### 5.5 Rebinding persistence

Stored under `settings.bindings` in the save. Defaults ship as three presets
(`azerty`, `qwerty`, `arrows`). A preset is applied by copying its table; individual
rebinds then override it.

## 6. Rendering

### 6.1 Interpolation

The renderer keeps the previous and current `SimState` snapshots and interpolates by the
accumulator remainder. This decouples simulation rate from display rate — mandatory for
144 Hz monitors with a 60 Hz simulation.

### 6.2 Visual quality stack

Ordered by impact per line of code:

| Technique | Purpose | Notes |
|---|---|---|
| **ACES Filmic tone mapping + sRGB output** | The single setting that makes the difference between "tech demo" and "game" | 2 lines |
| **Fog, colored as the sky** | Depth, atmosphere, and a sense of vastness. Also a **gameplay tool**: at ~180 m it hides the far end of the meadow so the player never knows what is coming | 3 lines |
| **Hemisphere + directional light with a tight shadow camera** | Raking afternoon sun, blue fill in shadows. **One well-framed shadow beats three lights** | ~15 lines |
| **`InstancedMesh`** | Thousands of grass blades and hundreds of flowers in one draw call | Mandatory for density at 144 fps |
| **Per-instance variation** (hue ±8%, scale ±15%, rotation) | A uniform crowd reads as "asset"; a varied crowd reads as "nature" | ~5 lines |
| **Bloom (subtle) + vignette** | Makes pollen, sun and wings glow; vignette centers the eye | Post FX pass |

### 6.3 Readability rules (hard constraints)

- **No depth of field.** The player must resolve a hornet at 60 m.
- **No strong bloom on enemies.** Their silhouette must stay crisp.
- **Fog is tuned conservatively** — depth without hiding threats.
- **Enemies get silhouette-first design**: distinct shape at distance, before any detail.

A beautiful frame in which the player dies without understanding why is a *bad* frame.

### 6.4 Camera

Close third person, following with a lag. Implementation notes:

- Follow target = a point behind and above the bee, in the bee's yaw frame (not roll — a
  rolling camera is nauseating).
- Spring-damper follow, so fast direction changes trail visibly (this sells speed).
- **Camera collision**: raycast from bee to camera; pull the camera in when geometry
  intervenes. Otherwise the camera clips through the forest canopy.
- FOV widens slightly with speed. Cheap, large perceived-speed payoff.

### 6.5 Asset pipeline (Fiend)

**Hero assets** are modeled in Fiend and exported as GLB:

| Group | Contents | Notes |
|---|---|---|
| `Bee` | `Bee_Body`, `Bee_WingL`, `Bee_WingR`, `Bee_Legs` | Wings are **separate objects with the pivot at the shoulder** — our code animates the flap |
| `Hornet` | body + 2 wings | |
| `Wasp` | body + 2 wings | Visually distinct from hornet: smaller, brighter, sharper |
| `Bird` | body + 2 wings | |
| `Spider` | body + legs | |
| `Flowers` | `Daisy`, `Poppy`, `Sunflower`, `RareFlower` | Silhouette and hue must be distinguishable at 100 m |

**One Fiend scene, all assets in it.** Fiend exports per group (`?object=Bee`), so a single
working scene keeps everything at a **consistent scale** — the fastest way to notice that
the hornet is bigger than the bird. Nine separate scenes would hide exactly that error.

**Scenery is NOT modeled in Fiend.** Hills, trees, rocks, grass and water are generated
procedurally with `InstancedMesh` — density demands it and consistency is not a concern
for background geometry.

**Procedural animation only.** No skeletal animation in GLB. The wing flap is
`wing.rotation.z = sin(t * flapRate)` — a bee flaps at ~200 Hz, which is not hand-animatable
and must be procedural anyway.

## 7. Persistence

```ts
type SaveV1 = {
  version: 1;
  pollen: number;                         // unspent pollen
  unlockedNodes: Record<NodeId, number>;  // node id -> tier
  records: { bestTrip: number; bestPollenPerMin: number; cleanTrips: number };
  settings: { bindings: Bindings; scheme: "mouse" | "keyboard"; sensitivity: number };
  lastSession?: { at: number; pollen: number };
};
```

- Written on every deposit and on session end.
- The `version` field exists from day one; migrations are additive.
- **Settings and progression are separate keys** so a corrupt save never destroys keybindings.

## 8. Skill tree architecture

### 8.1 Data-driven

`data/tree.json` describes branches, nodes, tiers, prerequisites, effects and node kinds.
The code imposes **no** structural limit — 3 branches × 20 nodes × 5 tiers is fully
supported. The shipped file simply starts smaller.

### 8.2 Effects are declarative

Each tier emits a list of effect descriptors applied to a derived stat block:

```ts
type Effect =
  | { kind: "capacity_add"; value: number }
  | { kind: "speed_mul"; value: number }
  | { kind: "lives_add"; value: number }
  | { kind: "harassment_mul"; value: number }
  | { kind: "unlock_skill"; skillId: string };
```

`progression/tree.ts` folds all unlocked tiers into a single `StatBlock`. **Nothing else in
the codebase reads the tree directly** — the simulation only ever sees the final `StatBlock`.
This keeps balance changes in data and out of the simulation.

### 8.3 Role computation

`progression/role.ts` computes the investment ratio per branch and maps it to a displayed
profile. Purely presentational, plus a marker on the bee model. It never gates mechanics.

## 9. Networking readiness

No netcode in v1. The architecture is shaped so it *can* be added without a rewrite:

1. **Server authority**: the server owns `SimState` and runs `step()` at 60 Hz. Clients
   send `InputCommand`s (`{ tick, entityId, pitch, roll, yaw, thrust, actions }`) and receive
   snapshots.
2. **Determinism**: the fixed step and seeded PRNG mean server and client can replay the
   same inputs and agree.
3. **Client-side prediction**: the client applies its own command locally immediately, then
   reconciles against the authoritative snapshot. This is *why* `step()` must be pure and
   `SimState` serializable.
4. **Entity ownership**: because every entity has an `id` and there are no singletons,
   multiple bee entities in one world is a data change, not an architectural one.

The three constraints in §1 are what make points 2 and 3 possible. Skipping them "for now"
is what makes netcode a rewrite instead of an addition.

## 10. Performance targets

| Target | Value |
|---|---|
| Frame rate | 144 fps on a mid-range discrete GPU; 60 fps floor on integrated |
| Simulation | Always 60 Hz fixed, regardless of display rate |
| Draw calls | < 150 total |
| Enemies on screen | Up to 40 (wasp swarm) without frame loss |
| Instanced scenery | 10 000+ instances |
| Bundle | < 1 MB JS (excluding GLBs) |
| GLB budget | < 150 KB per hero asset, < 600 KB total at v1 |

## 11. Conventions

- **English** for all identifiers, comments and UI source strings.
- `const` by default; `let` only when mutation is required.
- No `any`. Use `unknown` + narrowing.
- Simulation code allocates **nothing** in the hot path — scratch objects are module-level
  and reused. (This is the one place module-level state is acceptable: it is immutable
  scratch space, not game state.)
- Public functions in `sim/` and `progression/` are pure and unit-tested.
- Prefer plain data over classes in `sim/`. Classes appear only in `render/views/`.
