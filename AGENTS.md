# Resume context — BeeSimulator

> **Read this first.** This file summarizes the project state for an agent session starting
> with no history. It points to the detailed docs.

---

## 1. The project

**BeeSimulator** — a 3D bee simulator running in the browser. The player pilots a bee
(**helicopter-style flight**) in an open world centered on its hive, forages flowers to
accumulate pollen, flies back to deposit it while avoiding predators, and invests that pollen
into a **skill tree that doubles as the class system** (Tank / Offense / Speed).
5-minute sessions, persistent progression, co-op with several bees in the same hive.

**Repository**: https://github.com/96Ems/BeeSimulator — **public**. See §8 before committing
anything.

**Status**: design and architecture locked. **M0 and the hero assets are complete.** No
gameplay yet — M1 (flight) is the next and is the project's gate.

Requires **Git LFS**; the `.glb` assets are stored there.

## 2. Where to read what

| Need | File |
|---|---|
| The game: rules, values, decisions | [`docs/DESIGN.md`](docs/DESIGN.md) |
| The code: stack, patterns, pipeline | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| What to do and in what order | [`docs/PLAN.md`](docs/PLAN.md) |
| 3D assets, Fiend scene, export commands | [`docs/ASSETS.md`](docs/ASSETS.md) |

## 3. The 10 structural decisions (do not relitigate without reason)

1. **Stack**: Three.js + Vite + TypeScript strict.
2. **Camera**: close third person, follows with lag (no first-person view).
3. **Flight**: true helicopter — pitch the nose down to accelerate, pitch up to brake.
   Full inertia while the player is actively flying.
4. **Auto-stabilization**: triggered by **input inactivity (~200 ms)**, then a progressive
   righting (~400 ms). There is no "mouse released" event — this is inactivity detection.
5. **Input**: bound by **physical position** (`event.code`), so AZERTY/QWERTY work
   automatically. Rebinding menu + presets + persistence.
6. **Loop**: pollen has a **limited capacity**, foraging is **progressive and interruptible**,
   pollen is **visible on the bee's body**. Limited capacity is what creates the risk.
7. **World**: hive **at the center**, 4 biomes in 90° sectors (Meadow, Forest, Desert, Beach).
   Going farther = richer **and** more dangerous. Scale: ~150 m radius from the hive.
8. **Dangers**: Bird (**unkillable**, repelled via a harassment meter), Hornet (**killable**,
   steals pollen), Wasp (**killable in one hit**, swarm at the hive, **attracted to your pollen**).
9. **Skill tree**: 1 universal branch (Foraging) + 3 role branches (Hardiness / Offense /
   Mobility). The **role emerges from the investment ratio**; it is not chosen. Data-driven
   architecture supporting 3 × 20 nodes × 2-5 tiers; shipped content starts smaller.
10. **Co-op**: several bees in the **same hive**. Shared flowers, faster foraging with more
    bees, shared threats, **reviving a downed teammate**.

## 4. Technical constraints never to violate

These three rules cost almost nothing now and would cost a rewrite later. They are
**mandatory from the first line of gameplay code**.

| Rule | Why | How |
|---|---|---|
| **Simulation ≠ rendering** | Enables authoritative server simulation later. Also cleaner for debugging | State lives in `SimState` (plain data). Rendering reads `sim.position` and does `mesh.position.copy(...)`. **No game logic ever reads a `Mesh`** |
| **Fixed timestep** | Otherwise non-deterministic, and the helicopter flight model becomes unstable. Required for netcode **and** for flight stability | Accumulator at `1/60 s`, max 5 catch-up steps per frame. Rendering interpolates |
| **No singletons, no global state** | Required for multiplayer. Also required for testability | Every entity has an `id`. Input is turned into **commands** (`{ entityId, pitch, roll, yaw, thrust }`), never read directly by the simulation |

## 5. Known traps (mistakes already identified during design)

- ❌ **Binding on `event.key`** → breaks on half of all machines. Use `event.code`.
- ❌ **Waiting for a "mouse released" event** → that event does not exist for mouse movement.
  Use inactivity detection.
- ❌ **Requiring a dead-still hover to forage** → tedious. This is what motivated auto-stab.
- ❌ **Making birds killable** → would turn the game into a shooter. Birds are repelled,
  never killed (1000:1 size ratio).
- ❌ **Writing all 60 tree nodes now** → 180 values to balance blind, before a single data
  point exists. Full architecture, incremental content.
- ❌ **DOF / strong bloom on enemies** → in this game, readability beats beauty. The player
  must spot a hornet at 60 m.
- ❌ **Project risk #1**: the 4 biomes. This is the workstream most likely to produce a game
  with great scenery and a limp loop. The Meadow is the reference: it must be excellent
  before a second biome is populated.

## 6. Next step

See [`docs/PLAN.md`](docs/PLAN.md). In short: **flight alone, first** — flat meadow, bee,
camera, flight model, auto-stab, configurable input. Nothing else. Exit criterion:
"is piloting this bee fun?"

**Immediate actions, in order:**

1. **Load the bee into the scene** — `public/assets/bee.glb` with `GLTFLoader`, procedural wing
   flap, third-person follow camera. M1 needs a real model to fly.
2. **M1a** — `sim/State.ts`, `sim/step.ts`, `sim/flight.ts` (the helicopter integrator),
   `game/Loop.ts` (fixed timestep), `render/interpolation.ts`.
3. Then M1b-d: input (physical-position bindings), stabilization, camera.

**Done:** M0 (skeleton, scene, instancing, lint boundary, tests) and **all 8 hero assets**
(Bee, Hornet, Wasp, Bird, Spider, Daisy, Poppy, Sunflower, RareFlower).

**Outstanding housekeeping:** none. `headers.tmp`, `verify.log` and `pull.log` were scratch
files from probing the Fiend endpoint and have been removed.

## 7. Session log

| Session | Work done |
|---|---|
| Design session | Full design interview completed. Locked: stack, camera, flight model, stabilization, input, forage loop, flower types, world layout, biomes, enemies, lives, skill tree, coop. Wrote `README.md`, `AGENTS.md`, `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/PLAN.md`. No game code. Added the `fiend` MCP server to `mcp.toml`. |
| Fiend session | Diagnosed the `fiend` MCP 403 (`Python-urllib` UA banned by Cloudflare — **not** an auth problem; fixed with a `User-Agent` header). Created scene `BeeSimulator - Assets`, built the `Bee`. Wrote `docs/ASSETS.md`. |
| Build session | **M0 complete**: Vite + TypeScript strict + Three r186, ACES/fog/shadows, 20 000 instanced grass blades, seeded RNG with tests, ESLint boundary rule that fires, debug overlay. Then **all 8 remaining hero assets**, generated from `tools/build-assets.mjs` with `tools/verify-assets.mjs` asserting structural invariants. Fixed three asset bugs (double-mirrored wings, sunken spider, inconsistent flower naming). |
| Repo session | Verified M0 at 60 fps in a browser (2 draw calls, 240 896 triangles). Added the `browsermcp` MCP server (verified working via `tools/probe-mcp.mjs`). `git init`, Git LFS for `*.glb`, initial commit, pushed to `github.com/96Ems/BeeSimulator`. **Caught and removed the Fiend write secret from a tracked doc before pushing** — see §8. |

## 8. Credentials — do not commit

> ⚠️ **The repository is PUBLIC** (`github.com/96Ems/BeeSimulator`). Anything committed is
> world-readable, and history is effectively permanent.

The Fiend **edit secret** is a bearer capability: anyone holding it can rewrite or delete
every asset in the scene. It must never enter a tracked file.

| Where it belongs | Where it must not go |
|---|---|
| `tools/fiend.config.json` (git-ignored) | `docs/**`, `AGENTS.md`, `README.md`, commit messages, chat logs, links |

Rules:

- **Never write the secret into documentation.** Document that it *exists* and where it lives;
  never its value. `docs/ASSETS.md` was authored wrongly once and fixed before the first push.
- **Never paste the collaborative edit URL** (`...#secret=...`) into a tracked file. The
  fragment carries the secret.
- The **scene ID is not secret** and is safe to commit. Reading and GLB download need no
  credential, so a clone without the secret still builds and runs.
- Before any push, run:
  `git log -p --all | Select-String "fs_"` — it must return nothing.
- **If the secret is exposed:** it cannot be revoked, only abandoned. Re-create the scene via
  `create_scene({ source_id: "<scene id>" })` to get a fresh secret, update
  `tools/fiend.config.json`, and re-run `npm run assets`.

## 9. Available tooling

- **Fiend** (server `fiend`, 28 tools) — collaborative Three.js editor. Builds the "hero"
  assets and exports them as GLB. Also renders PNGs (`capture_scene`) and supports annotated
  design review (`get_feedback`). Scene details: [`docs/ASSETS.md`](docs/ASSETS.md).

  ⚠️ **Its config in `mcp.toml` requires the `User-Agent` header override.** The kn9t MCP
  plugin uses `urllib.request`, whose default UA is `Python-urllib/3.x`; Cloudflare on
  `anoma.ly` bans that exact string and answers HTTP 403 (error 1010,
  `browser_signature_banned`). Any other UA is accepted. Removing the header breaks the
  connection with a confusing "403 Access denied" that looks like an auth problem. It is not.

- **Browser MCP** (server `browsermcp`, local via `npx`) — automates the real Chrome profile;
  exposes `browser_screenshot`, `browser_get_console_logs`, navigation, and clicks.
  Configured and verified to spawn, but **needs the Chrome extension** installed by hand from
  https://browsermcp.io/install and then **Connect** pressed in its toolbar popup.

  ⚠️ **Unproven:** whether the agent can actually *read* the screenshots it returns. The
  `capture_scene` images from Fiend came back as references the agent could not interpret.
  Test this before relying on it for visual verification.

- **`tools/probe-mcp.mjs`** — smoke-tests any stdio MCP server end to end (spawn, handshake,
  `tools/list`, report stderr). Use it to check a server before adding it to `mcp.toml`:
  `node tools/probe-mcp.mjs npx @browsermcp/mcp@latest`

- **pptx** — not relevant here.
