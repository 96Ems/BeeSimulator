# BeeSimulator — Implementation Plan

> Milestones, acceptance criteria and risks. Each milestone must be **playable** at its end.

---

## Milestone overview

| # | Milestone | Outcome | Status |
|---|---|---|---|
| **M0** | Skeleton | Project runs, empty meadow renders | ✅ **Done** |
| **A** | Hero assets | Bee, 3 enemies, spider, 4 flowers | ✅ **Done** |
| **M1** | **Flight** | Piloting the bee is fun. **Gate for the whole project** | Next |
| **M2** | Foraging loop | Forage → carry → deposit → score | Not started |
| **M3** | Threat | One bird, one hornet. Risk is real | Not started |
| **M4** | Progression | Skill tree, roles, save, sessions | Not started |
| **M5** | Co-op | Second bee in the same hive | Deferred by design |
| — | Biomes (Forest/Desert/Beach) | Each is a full art + balance pass | Deferred — see Risks |

**Workstream A** (hero assets) ran ahead of M1 deliberately: it is independent of the flight
code, it was the cheapest time to do it, and M1 plays better with a real bee than with a
placeholder box. Details: [`ASSETS.md`](ASSETS.md).

**Ordering principle**: M1 is a hard gate. If piloting the bee is not enjoyable, no amount of
M2-M4 content fixes it, and every value in M2-M4 is calibrated *against* M1's tuning. Building
forward before M1 passes means calibrating on sand.

---

## M0 — Skeleton ✅

**Goal**: the project builds, runs, and shows an empty lit meadow at target frame rate.

### Tasks

- [x] Vite + TypeScript, strict mode on (`strict`, `noUncheckedIndexedAccess`,
      `noImplicitOverride`, `noUnusedLocals`, `verbatimModuleSyntax`)
- [x] `three@0.186` + `@types/three`, `vitest`, `eslint` + `typescript-eslint`
- [x] ESLint rule: `sim/` may not import `three` (enforces constraint 1)
- [x] `src/main.ts` → canvas, renderer, resize handling, frame loop
- [x] `src/render/Renderer.ts`: ACES tone mapping, sRGB output, pixel-ratio cap
- [x] `src/render/Scene.ts`: fog tinted to sky, hemisphere + directional sun, tight shadow
      frustum, shadow focus that follows the viewer
- [x] `src/render/scenery/Meadow.ts`: circular ground + 20 000 instanced grass blades with
      per-instance hue and scale variation
- [x] `src/sim/rng.ts`: seeded mulberry32 (`Math.random` banned in `sim/`)
- [x] `src/render/debugCamera.ts`: free-fly camera for inspection
- [x] `src/data/tuning.ts`: every tunable value in one file
- [x] Debug overlay: fps, frame ms, draw calls, triangles, position

### Acceptance criteria

- [x] **Build**: `npm run build` succeeds with zero TypeScript errors
- [x] **Lint rule fires**: verified by deliberately adding `import * as THREE from "three"`
      to `src/sim/` — `no-restricted-imports` errored with the intended message
- [x] **Tests**: 7 passing (`src/sim/rng.test.ts`) — determinism, bounds, uniformity,
      and the disc-sampling square-root regression
- [x] **Instancing**: 20 000 blades against a target of 1 000
- [ ] **Frame rate**: *needs a human at a browser.* Cannot be verified headlessly
- [ ] **Tone mapping and fog visibly in effect**: *needs a human at a browser*

> Two criteria genuinely require eyes on a running browser. Runtime WebGL behaviour cannot be
> asserted from a headless build, and the agent driving this project has no vision. Run
> `npm run dev` and confirm.

### Deliberately out of scope

The meadow is a flat placeholder — no flowers, hive, or biome variation. That is M2. M0 exists
so M1 has stable ground to fly over and a frame-rate baseline to protect.

M0 is deliberately boring. It exists so that M1 has somewhere to be measured — a stable
frame rate and a working build — and so the architectural guardrails (the lint rule) are in
place *before* there is any code to violate them.

---

## M1 — Flight (project gate) — **in progress**

**Goal**: answer one question. **"Is piloting this bee fun?"**

Scope is deliberately narrow: **flat meadow, one bee, one camera, nothing else.** No flowers,
no enemies, no hive, no UI beyond a debug readout.

### Tasks

#### M1a — Flight model ✅

- [x] `sim/State.ts` — `SimState`, plain and serializable
- [x] `sim/step.ts` — `step(state, command, dt)`, zero allocation in the hot path
- [x] `sim/flight.ts` — helicopter integrator (ARCHITECTURE §4.4)
- [x] `sim/math.ts` — vector/attitude maths, free of Three.js so the sim stays pure
- [x] `game/Loop.ts` — fixed-timestep accumulator with a catch-up cap
- [x] `render/interpolation.ts` — blends prev/current state so display rate ≠ sim rate

#### M1b — Input ✅ (rebinding UI still to do)

- [x] `input/bindings.ts` — `event.code` tables, presets, layout detection for labels
- [x] `input/InputManager.ts` — mouse-as-stick and full-keyboard schemes, one command type
- [ ] Rebinding menu: press-to-capture, persist to `localStorage`
- [x] Layout detection wired (display only)

#### M1c — Stabilization ✅

- [x] Inactivity detection + smoothstep blend, driven from the shared idle timer

#### M1d — Camera ✅

- [x] Spring-damper third-person follow, yaw-only frame, speed-linked FOV
- [ ] Camera collision raycast (needed once the Forest canopy exists)

#### M1e — Hero asset ✅

- [x] `bee.glb` loaded, root layout transform reset on load
- [x] Procedural wing flap driven from the shoulder pivot groups

### Playtest findings (first hands-on session)

Three issues reported from actually flying it. All three were **feel** problems, not logic
bugs, which is exactly why this milestone exists.

| Report | Measured cause | Fix |
|---|---|---|
| "Crazy fast" | 16 m/s cap for a 0.36 m bee | Cap 7, and damping lowered so natural top speed is **5.4 m/s** rather than the cap |
| "Auto hold is very long" / "glides tooo far" | Release → settle took **~2.5 s and ~20 m** | Delay 0.2→0.1 s, ramp 0.4→0.15 s, damping 1.6→4.5. Now **1.7 m in 0.8 s** |
| "The opposite key must instant stop" | Reverse thrust alone took seconds to bite | Added explicit `brakeDamping`: counter-input now stops the bee in **0.75 s** |
| Mouse left/right reversed | `attitude.roll` is a Z rotation, and a *positive* Z rotation raises the **right** wing, banking the bee **left** | Sign converted in one place, in `flight.ts`, with the Three.js verification recorded |

A regression test now pins the glide distance, and the control-direction tests exist because
a sign error here produces perfectly smooth flight that simply goes the wrong way — which
survives playtesting, because you unconsciously adapt to it.

### Acceptance criteria

- [ ] **Subjective**: flying for 2 minutes without an objective is enjoyable — *partially
      confirmed; the reporter liked the feel but flagged the three tuning issues above*
- [ ] Identical behavior at 60 fps and 144 fps
- [x] Nose-down-to-accelerate is felt — speed reads on screen
- [x] Hover is stable enough to hold position (asserted in tests)
- [x] Auto-stab engages after inactivity with no visible snap
- [x] Both input schemes are playable
- [ ] Rebinding works and survives a reload
- [x] `step()` is unit-tested: same inputs → same outputs (**42 tests passing**)

### Risks at M1

| Risk | Mitigation |
|---|---|
| True helicopter is too hard to control, hover is frustrating | Tune stabilization aggressiveness first; it is the intended relief valve. Only then reconsider the flight model |
| Mouse-as-stick feels imprecise | Sensitivity + a deadzone curve setting. This is a tuning problem, not a design problem |
| Wing flap looks wrong | Flap rate and amplitude are `tuning.ts` values; iterate with the debug readout |
| Perf regresses with visuals | Measure at M0 and keep the counters visible throughout |

**Do not proceed to M2 until every M1 acceptance criterion is met.**

---

## M2 — Foraging loop

**Goal**: the core loop of DESIGN §3 is playable end to end with placeholder threats.

### Tasks

- [ ] `sim/entities/flower.ts` — flower types from `data/flowers.json`
- [ ] `sim/forage.ts` — progressive, interruptible pollen accumulation
- [ ] Hive as a deposit point (placeholder geometry)
- [ ] `data/tuning.ts` — capacity, forage durations, yield, respawn timers
- [ ] Pollen capacity, load-coupled flight (a loaded bee is heavier)
- [ ] HUD: pollen gauge, capacity, prompt when in range
- [ ] Trip scoring: pollen, trip time, pollen/minute, best-trip record
- [ ] 4 flower types in Fiend (Daisy, Poppy, Sunflower, RareFlower) with distinguishable silhouettes
- [ ] Meadow scenery: instanced flower field, hive, ground variation
- [ ] `ui/results.ts` — end-of-session screen
- [ ] `game/Session.ts` — 5-minute timer

### Acceptance criteria

- [ ] Foraging is interruptible and partial progress is visibly lost
- [ ] Capacity limit forces a return trip; an unlimited-capacity test build feels obviously wrong
- [ ] The 4 flower types are distinguishable **at 100 m by silhouette and hue**
- [ ] Pollen is visible on the bee's body and reads clearly when full
- [ ] `pollen/minute` reacts to routing decisions, not just to time spent
- [ ] A full 5-minute session completes without errors

### Risk at M2

The loop may be *correct* but *flat*. The fix is almost always **tuning, not content**: longer
forage times, rarer high-yield flowers, higher capacity. Resist adding systems.

---

## M3 — Threat

**Goal**: risk becomes real and the soft-death model is validated.

### Tasks

- [ ] `sim/entities/bird.ts` — patrol → detect → pursue → dive → recover
- [ ] Harassment meter on the bird, with the exposed-belly window after a missed dive
- [ ] Bird targets the **most pollen-laden** bee
- [ ] `sim/entities/hornet.ts` — solitary pursuit, steals pollen on contact
- [ ] Hornet: 3 hits to kill, flees after the first
- [ ] Sting attack: dive-based, contact hitbox at the nose
- [ ] 3 lives, soft death, knockback, 1 s invulnerability
- [ ] Life regeneration on deposit (capped at 3)
- [ ] Hit feedback: knockback, screen effect, pollen loss, audio
- [ ] Bird and Hornet assets in Fiend
- [ ] Bird/hornet audio cues — **must be audible from any direction**, since they are the
      player's early warning

### Acceptance criteria

- [ ] A bird is identifiable at 60 m
- [ ] The harassment meter is legible: the player understands *why* the bird left
- [ ] Killing a hornet costs enough time that it is a real decision
- [ ] A soft death teaches without ending the run
- [ ] Lives regenerate on deposit, and the player notices it happening
- [ ] Losing a full pollen load hurts *specifically* — the player can name what they lost

### Risks at M3

| Risk | Mitigation |
|---|---|
| Birds feel unfair (undodgeable) | Dive telegraph must be long and loud. If the player cannot see it coming, it is a bug, not difficulty |
| Harassment meter is invisible to the player | Overlay a visible meter on the bird once it is hit |
| Combat trivializes the game | Session timer is the balancing force (DESIGN §8.1). Combat costs time; verify it does |

---

## M4 — Progression

**Goal**: the tree, roles, save and session structure are complete.

### Tasks

- [ ] `data/tree.json` — full-scale schema, modest shipped content
- [ ] `progression/tree.ts` — fold unlocked tiers into a `StatBlock`
- [ ] `progression/role.ts` — investment ratio → displayed profile
- [ ] `progression/save.ts` — versioned `localStorage`
- [ ] Effects: `capacity_add`, `speed_mul`, `lives_add`, `harassment_mul`, `unlock_skill`
- [ ] Passive effects wired into the sim via `StatBlock` only
- [ ] Instant active skills (shield) and committed active skills (dash) with cooldowns
- [ ] Bee visual marker reflecting the dominant role
- [ ] Diegetic tree UI: a hive chamber with a panel
- [ ] Results screen: score breakdown, records, pollen banked

### Acceptance criteria

- [ ] Adding a node requires **only** editing `tree.json` — zero code changes
- [ ] Role display matches investment ratio
- [ ] A hybrid build is playable and viable solo
- [ ] A committed active skill visibly costs flight control
- [ ] An instant active skill does not interfere with flying
- [ ] Save survives reload; a corrupt save does not destroy keybindings
- [ ] `settings` and `progression` are separate storage keys

---

## M5 — Co-op (deferred by design)

Not started in v1. Listed so the architecture serves it.

- [ ] Authoritative server running `step()` at 60 Hz
- [ ] Client → server `InputCommand` transport
- [ ] Server snapshots → client, with interpolation
- [ ] Client-side prediction + reconciliation
- [ ] Multiple bee entities in one world
- [ ] Shared flower depletion, faster multi-bee foraging
- [ ] Shared threats, baiting
- [ ] Teammate revive

---

## Risks

### Risk 1 — The 4 biomes (highest)

**The scenario**: Forest, Desert and Beach each get art, threats, flowers and tuning. The
Meadow — the reference that defines all the numbers — stays mediocre. The result is a
beautiful game with a limp loop.

**Mitigation**: the Meadow is finished and approved **before** a second biome is populated.
Forest is built second because it is the only biome whose mechanical identity (the ceiling)
puts the flight model itself in question. Desert and Beach come after.

### Risk 2 — Flight is not fun

**The scenario**: the helicopter model is authentic but unpleasant, and M1 never passes.

**Mitigation**: stabilization aggressiveness is the primary relief valve, tuned before the
model is reconsidered. A fallback exists (a more drone-like stabilization with a manual
override) at the cost of the "speed is felt" pillar. This is the only place where a design
pillar may be traded away.

### Risk 3 — Scope of the skill tree

**The scenario**: 3 branches × 20 nodes × 2-5 tiers = ~180 values written before a single
playtest, then rewritten entirely.

**Mitigation**: the architecture supports the full scale from day one; **content ships small
and grows during playtesting**. Growing the tree is a JSON edit.

### Risk 4 — Readability versus beauty

**The scenario**: post-processing and dense scenery look great but hide threats, so players
die without understanding why.

**Mitigation**: ARCHITECTURE §6.3 is a hard constraint list, not a suggestion. Verify at
every milestone that a hornet is identifiable at 60 m.

### Risk 5 — Fixed timestep is "optimized away"

**The scenario**: someone replaces the accumulator with `delta` because it is simpler.

**Mitigation**: the lint rule and the M1 acceptance test (identical behavior at 60 and
144 fps) catch it immediately. This is constraint 2 and it is not optional.

---

## Immediate next action

**M0, then M1a.** The concrete first steps:

1. `npm create vite@latest . -- --template vanilla-ts` in `C:\_ddm\projects\Agents\BeeSimulator`
2. Install `three`, `@types/three`, `vitest`
3. Write the tsconfig, the ESLint boundary rule, and `render/Scene.ts`
4. Then `sim/flight.ts` — the helicopter integrator

In parallel, create the Fiend scene and start the `Bee` group, so M1 can fly a real model
rather than a placeholder box.
