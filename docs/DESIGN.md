# BeeSimulator — Game Design

> Status of this document: **locked** unless a playtest contradicts it.
> Values marked 🔧 are starting points to be tuned during playtesting, not commitments.

---

## 1. Pitch

You are a bee. Your hive sits at the center of a world that extends in every direction.
You fly out to forage, filling your body with pollen — and the more pollen you carry,
the more you are worth eating. You fly back through predators that hunt you specifically
for what you carry. You deposit. You invest. You fly out again, better than before.

The tension is never "can I survive". It is **"should I take one more flower?"**

## 2. Design pillars

1. **Flight is the game.** Every other system is calibrated against the feel of flying.
2. **Greed is the risk.** The player chooses their own danger level by choosing how far
   to go and how much to carry. No system ever forces risk on them.
3. **Readability beats beauty.** The player must identify a threat at 60 m. We trade visual
   flourish for silhouette clarity, every time.
4. **The tree is the class system.** Progression *is* identity. There are no pre-session
   class picks.

## 3. Core loop

```
   fly out  ──▶  find flowers  ──▶  forage (interruptible)  ──▶  pollen fills body
      ▲                                                              │
      │                                                              ▼
   upgrade  ◀──  deposit pollen at hive  ◀──  return through danger  ◀┘
```

The return trip is the gameplay. The outbound trip is the setup. Every decision that
matters — how far, which flowers, when to leave — is made during the outbound trip and
paid for on the way home.

### Why capacity is limited

Unlimited capacity would mean no reason to return, therefore no exposure to danger,
therefore no game. **Limited capacity is the engine of the entire risk model.** It is not
a balance knob; it is the core mechanic.

## 4. Flight model

### 4.1 Model: true helicopter

The bee does not fly like a bird or a plane. It flies like a **helicopter**:

- **Pitch the nose down to accelerate.** Speed comes from attitude, not from a throttle key.
- **Pitch the nose up to brake.** There is no brake key.
- **Full inertia while actively flying.** Momentum carries you. You slide, you overshoot,
  you counter-steer.
- **Hover is native.** The bee can hold altitude and position, at a cost in *time*, not in
  a resource. There is no stamina bar in v1.

This is the single most important feel decision in the project. Speed must be *felt*,
which is why the camera is third-person: the player needs to see the nose dip.

### 4.2 Auto-stabilization

**Problem**: mouse movement has no "released" event. There is no way to detect "the player
let go of the stick".

**Solution**: detect **inactivity**.

| Phase | Trigger | Behavior |
|---|---|---|
| Manual | Any pitch/roll input within the last 200 ms | Full helicopter physics, full inertia, zero assistance |
| Blend-in | No pitch/roll input for ~200 ms 🔧 | Assistance ramps up over ~400 ms 🔧. No snap, no jerk |
| Stabilized | Sustained inactivity | Attitude returns to level, velocity is damped, altitude is held |

This makes hovering to forage pleasant — which matters, because hovering **is half the game** —
without removing the inertia that makes flying fun.

A `Shift`-style manual override can force pure manual flight; see §5.4.

### 4.3 Physical scale: game scale, not real scale

A real bee against a real meadow is a 15000:1 ratio — unplayable and unreadable. We use
**game scale**: real-world units (meters), but the bee is scaled up until it reads on screen.

- Bee body length: **~0.3 m** 🔧 (visual scale)
- Sunflower height: **~4 m** 🔧
- Hive: **~6 m** 🔧 across

This is the classic "Antz" approach. Physical realism is explicitly abandoned in favor of
readability and a sense of speed.

## 5. Controls

### 5.1 Binding by physical position

Bindings are stored as **physical key codes** (`event.code`, e.g. `KeyW`), never as
characters (`event.key`). The physical key labeled "Z" on AZERTY sits where "W" sits on
QWERTY, so a single binding works on both layouts with no branching.

Layout is detected only for **display purposes** (what label to draw in the menu).

### 5.2 Mouse-as-stick scheme (default)

| Input | Action |
|---|---|
| Mouse ↑/↓ | Pitch (nose down = accelerate, nose up = brake) |
| Mouse ←/→ | Roll |
| `KeyW` / `KeyS` | Collective: climb / descend |
| `KeyA` / `KeyD` | Yaw (pedals) |
| Pointer lock | Required while flying |

### 5.3 Full-keyboard scheme (required, equal footing)

| Input | Action |
|---|---|
| `KeyZ`-position / `KeyQ`-position / `KeyS` / `KeyD` | Pitch / roll / yaw |
| `KeyI`-position / `KeyK`-position / `KeyJ`-position / `KeyL`-position | Collective + yaw |

The full-keyboard scheme is **not** a degraded fallback — it must be equally playable. It is
also the reason the skill keys live on the number row: the player's hands are already on
the keyboard.

### 5.4 Action bindings

| Action | Key | Control cost |
|---|---|---|
| **Sting (attack)** | `Space` | None — thumb, reachable without leaving the stick. This is the *reflex* action |
| **Dash (evade)** | `Shift` | None — pinky, reachable without leaving the stick. This is the *emergency* action |
| **Skill slots 1-3** | `Digit4` `Digit5` `Digit6` | **Per-skill**: some cost nothing, some force you to abandon flight control. This is the *tactical* action |

Number-row keys are physically identical on AZERTY and QWERTY, so they inherit the
position-based binding rule with no special handling.

### 5.5 Control cost as a design tool

The control cost of a skill is a **property of the skill**, not of its slot:

| Skill category | Key | Control cost | Balancing currency | Examples |
|---|---|---|---|---|
| **Passive** | none | none | — | +1 life, +speed, +capacity, silent wings |
| **Instant active** | `4`/`5`/`6` | **none** — you keep flying normally | Cooldown | Shield, regeneration, blinding pollen cloud |
| **Committed active** | `4`/`5`/`6` | **total** — you commit your flight | Control sacrificed | Dive attack, dash, charge |

This gives two independent balancing currencies (cooldown and sacrificed control) and reads
clearly to the player: *"I'm saving the shield for a bad encounter"* vs *"I'm going for the
dive right now."*

### 5.6 Input system requirements

- Real rebinding menu: press a key, it is captured, it persists to `localStorage`.
- Presets: AZERTY, QWERTY, arrows.
- Both schemes (mouse-as-stick and full-keyboard) are first-class.

## 6. Foraging

### 6.1 Sequence

1. Approach a flower. A prompt/invitation appears when in range.
2. Forage: the bee either **hovers** or **lands**, depending on the flower type (§6.3).
3. Pollen accumulates **progressively** over ~1.5 s 🔧 and is drawn **on the bee's body**.
4. The forage is **interruptible** — leaving early loses the uncollected remainder.
5. The pollen gauge fills. At capacity, the bee visibly bulges.

### 6.2 The dilemma

Because foraging is progressive and interruptible, every approaching predator forces the
same decision: **"do I finish this flower, or do I run?"** That question, asked twenty
times per session, is the core of the moment-to-moment experience.

### 6.3 Flower types

The flower type dictates the parameters. The player learns 4 flowers, not 4 abstract rules.

| | Mode | Yield | Forage time | Respawn | Exposure |
|---|---|---|---|---|---|
| **Daisy** | hover | low | fast | fast | sheltered |
| **Poppy** | hover | medium | medium | medium | medium |
| **Sunflower** | landable | high | long | slow | open |
| **Rare flower** | landable | very high | very long | very slow | heavily exposed |

**Governing rule**: `yield ∝ risk × time`. The rare flower sits in the open middle of the
meadow, takes 4 seconds to forage, and is worth 10 daisies. The player sees it from far
away, knows it will hurt, and goes anyway.

### 6.4 Hover vs. landing

Landing is **more valuable and more dangerous**:

- **Landing**: faster extraction, higher yield per flower — but **takeoff is slow** (~0.6 s 🔧
  before the bee is maneuverable again).
- **Hovering**: lower yield — but instant escape.

Since the flower type determines the mode, each flower is a fixed bet rather than a
player-chosen one. This keeps the decision legible: the player evaluates *the sky*, not
their own settings.

## 7. World

### 7.1 Layout: hive at the center

The hive sits at the center. Four biomes occupy 90° sectors around it. The player's
**heading becomes their difficulty choice**, and this happens without a single menu:

- **Closer to the hive** → safer, poorer flowers.
- **Farther from the hive** → richer flowers, more predators, longer return trip.

The player authors their own difficulty curve. This is the strongest structural idea in
the design and should not be flattened.

### 7.2 Scale

- Playable radius from the hive: **~150 m** 🔧
- Flower fields: ring from ~20 m to ~120 m
- Typical round trip: 30-40 s 🔧
- Session length: **5 minutes** 🔧

### 7.3 Biomes

| Biome | Mechanical identity | Why it is fun |
|---|---|---|
| **Meadow** | **None. This is the baseline.** | Dense flowers, birds, the reference for all tuning |
| **Forest** | **Ceiling** (canopy) + trunks = obstacles. You fly in a corridor. Vertical navigation | Slalom, wasp nests in clearings, the biome that tests the flight model |
| **Desert** | **No cover anywhere.** Birds omnipresent, lateral gusts. Rare flowers with very high yield | The fear biome. You forage while watching the sky |
| **Beach** | **Water kills** — hitting the surface costs pollen and knocks you back. Sea spray reduces visibility | Flying at the waterline, the finest line in the game |

**Each biome must change a rule, not just a palette.** A recolored meadow is money spent for
zero gameplay.

### 7.4 Build order

The Meadow is the **reference implementation**. It defines flower density, bird behavior,
pollen rates and flight tuning. No other biome is populated until the Meadow is finished
and the core loop is proven. See `PLAN.md` — the 4 biomes are project risk #1.

## 8. Dangers

### 8.1 Three economic models

Each threat has a *different* rhythm, so none of them plays the same way:

| Enemy | Killable | How you deal with it | Economic model |
|---|---|---|---|
| **Bird** | ❌ No | **Harassment meter** → it gives up and hunts elsewhere for ~25 s 🔧, **then returns** | **Permanent tax.** You never solve it; you buy a breather |
| **Hornet** | ✅ 3 hits | Killed — but it flees after the first hit | **One-off cost.** Expensive in time, permanently solved |
| **Wasp** | ✅ 1 hit | Killed in one hit — but there are 30 of them | **Subscription.** Trivial to kill, constantly reconstitutes |

The killability rule is **the size ratio**, which makes it self-explanatory: you cannot
kill something 1000× your size.

### 8.2 The bird (unkillable)

- Plunges at the **most pollen-laden** player. Heavy damage.
- Its **belly is exposed only after a missed dive** — a 1.5 s 🔧 window.
- Killing is impossible, but the exposed belly lets a team **shorten its harassment meter**
  dramatically, driving it off faster.

### 8.3 The wasp swarm (attracted to pollen)

The swarm orbits the hive in a rotating ring with **moving gaps**. You enter through a gap.

**The critical detail**: the swarm's aggression radius grows with the pollen you carry.

The consequence, free of charge: **your richest return is your most dangerous return.**
Your cargo becomes your bait, using a resource the player already understands. No tutorial
required. This is the single best emergent tension in the design.

### 8.4 Collision cost

**Soft death**, not hard death:

- Losing all lives is what costs you — individual hits are survivable.
- **3 lives** 🔧, one is regenerated on each deposit at the hive (capped at 3).
- Regenerating lives at the hive turns *"go home"* into an act of survival, not just
  bookkeeping. The pollen dilemma and the life dilemma point in the same direction, so
  the decision stays legible instead of becoming confusing.

Hitting at 0 lives **away from the hive** costs the pollen you are carrying. Pollen already
deposited is safe.

### 8.5 Weakness matrix (co-op puzzle)

The point is that **no single role can solve any enemy**, and each enemy *punishes* a
different role:

| Enemy | What it does | What hurts it | Role required | The team play |
|---|---|---|---|---|
| **Bird** | Dives at the most loaded bee | Exposed belly after a missed dive | **Speed** (bait it) + **Offense** (hit the belly) | Speed baits a low pass, the bird misses and crashes for 1.5 s. Offense drives it off. A Tank alone cannot: it is too slow to provoke the dive |
| **Hornet** | Solitary, pursues, **steals pollen on contact** | Fragile, flees after one hit | **Offense** (kill it) or **Hardiness** (absorb it, lose nothing) | The solo enemy. Offense handles it alone — until there are three, and then the Tank becomes essential |
| **Wasp swarm** | Orbits the hive, aggression scales with your pollen | They **cluster on the largest target** | **Hardiness** (magnetize) then **Offense** (disperse) | The swarm ignores everyone while the Tank is present. The Tank holds them at the hive while Offense thins them and Speed delivers pollen |
| **Spider** *(Forest)* | Immobile, **invisible trap** on the ground/canopy | The web is **visible when approaching slowly**, invisible at speed | **Speed** (spot and disable) or stealth | It punishes speed. In the Forest you must *slow down* — the Speed build becomes the scout, not the sprinter |

The pattern to protect: **every enemy punishes one role and rewards another.**

## 9. Skill tree

### 9.1 Structure

**1 universal branch + 3 role branches.**

| Branch | Nodes | Content |
|---|---|---|
| **Foraging** (universal) | ~8 | Capacity, yield, forage speed, wind resistance |
| **Hardiness** | ~12 | Lives, invulnerability window, damage reduction, self-recovery |
| **Offense** | ~12 | Sting damage, harassment buildup, skill damage, dive power |
| **Mobility** | ~12 | Top speed, acceleration, turn rate, dive recovery |

The Foraging branch is the **shared language**: every build invests in it, because it is the
mission objective. A Tank and a Speed build always have something in common.

### 9.2 Role emerges from the ratio

The role is **not chosen**. It is computed from investment distribution:

- 80% Hardiness → committed Tank.
- 50/50 Hardiness + Mobility → an "armored scout" — a hybrid the designer never planned.
- 40/30/30 → functional solo.

This is what makes 60 nodes worth having. It also keeps **solo play viable**: a mixed build
is mediocre at everything but functional. A 90%-Tank build is unplayable solo — which is
correct, but only because it was a *choice*, not an *obligation*.

The UI reports the profile explicitly (`Profile: Tank 62%`) and the bee carries a visual
marker (abdomen plate, color band, pennant) so a co-op team can read composition at a glance.

### 9.3 Data model

- 3 branches × N nodes, each with **2-5 power tiers**.
- Prerequisites between nodes.
- Node types: `passive`, `active_instant`, `active_committed` (§5.5).
- **The code supports the full scale (3 × 20 nodes × 5 tiers). The shipped data file starts
  smaller and grows during playtesting.**

Rationale: balancing is a playtesting activity, not a design activity. Writing 180 values
before a single playtest would mean writing 180 values to throw away. Growing the tree later
is a **JSON edit, not a code change**.

### 9.4 The tree lives in the hive

The tree is **diegetic**: the player flies into a chamber of the hive and opens a panel —
as opposed to a menu overlaid on the game. This gives the hive a purpose beyond depositing
pollen, and gives progression a physical place.

## 10. Session and progression

### 10.1 Session

- **5-minute sessions** 🔧 with a fixed objective: gather as much pollen as possible.
- At the end: score, breakdown, and the pollen is banked into the tree.
- **Progression is continuous and persistent** across sessions. Model: Deep Rock Galactic /
  Lethal Company — a run structure *inside* a persistent progression curve. Both systems
  coexist and this must be explicit in the UI.

### 10.2 Scoring

The **trip is the unit of score**, not the session alone:

| Metric | Purpose |
|---|---|
| Pollen deposited | The headline number |
| Trip time | Rewards routing efficiency |
| **Pollen per minute** | The optimization metric; the real skill signal |
| Best single trip | Personal record for sharing |
| Clean trips (no hits) | Rewards risk discipline |

Player bests are stored locally and surfaced on the results screen.

### 10.3 Save

Automatic. Serialize `{ pollen, unlockedNodes, records, settings, lastSession }` to
`localStorage` on every deposit and on session end. Versioned schema from day one
(`{ version: 1, ... }`) so migrations are possible.

## 11. Co-op

Multiple bees in the **same hive, same session**.

### 11.1 Making "together" mechanical

The trap: two bees in the same meadow with nothing connecting them is just two solos
running in parallel. Co-op needs a **shared resource or a shared threat**.

| Lever | Design |
|---|---|
| **Shared flowers** | A flower depletes **for everyone** — so players cannot double-dip |
| **Faster with more bees** | Each additional bee accelerates extraction. This **incentivizes spreading out** across the meadow rather than following each other |
| **Shared threats** | Birds and wasps attack the hive's bees collectively. One player can **bait** a bird while another finishes a sunflower. Emergent cooperation, free of charge, from existing systems |
| **Revive** | Reaching 0 lives does not kill you if a teammate touches you within X seconds. You become a grounded, vulnerable bee, and your teammate must **risk their cargo to come get you**. This is the emotional peak co-op can offer |

### 11.2 Networking readiness

No netcode is written in v1, but the three constraints in `AGENTS.md` §4 (simulation/render
split, fixed timestep, no global state) are what make co-op affordable later. They are
non-negotiable from the first line of gameplay code.

The eventual model is a **server-authoritative simulation**: clients send input commands,
the server simulates at a fixed step, clients interpolate. See `ARCHITECTURE.md` §9.

## 12. Open questions

These are **deliberately unresolved**. They should be answered by playtesting, not by
discussion.

1. Exact pollen capacity, forage duration, and regeneration rates.
2. Exact flight tuning: top speed, angular acceleration, inertia, stabilization rates.
3. Whether the Desert's lateral gusts are fun or merely annoying.
4. Whether the Beach's water death is too punishing.
5. How the spider's web behaves with multiple spiders.
6. Whether the harassment meter on birds is legible to a new player.
7. Whether birds should be visible on a minimap, or whether that destroys the tension.
8. Minimum viable size for the shipped tree data (18 nodes proposed: 3 branches × 6 nodes × up to 3 tiers).
