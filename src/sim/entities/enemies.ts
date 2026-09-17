/**
 * Predators. DESIGN §8.
 *
 * Three enemies, three deliberately different economic models, so none of them plays the
 * same way:
 *
 *   bird    permanent tax    — unkillable; filling its harassment meter buys a breather
 *   hornet  one-off cost     — fragile and killable, but flees after the first hit
 *   wasp    subscription     — trivial to kill individually, constantly reconstituted
 *
 * The second design rule lives here too: **every enemy punishes one role and rewards
 * another**, which is what forces co-op to be a puzzle rather than a damage race (DESIGN
 * §8.5). The bird punishes the slow tank; the swarm is only survivable by magnetising it.
 *
 * As with all of `sim/`, this file knows nothing about rendering. It emits events instead.
 */

import { ENEMIES } from "../../data/enemies";
import { HIVE } from "../../data/tuning";
import { clamp, rotateForward, type Attitude, type Vec3 } from "../math";
import { vec3 } from "../math";
import type { SimEvent } from "../events";
import type { SimState } from "../State";

export type EnemyKind = "bird" | "hornet" | "wasp";

export type EnemyState =
  | "patrol" // flying its circuit, unaware
  | "telegraph" // committed, winding up — the player's warning
  | "attack" // plunging or pursuing
  | "recover" // floundering after a miss; vulnerable
  | "flee" // driven off or hurt, leaving
  | "dead";

export type Enemy = {
  readonly id: number;
  readonly kind: EnemyKind;
  position: Vec3;
  velocity: Vec3;
  attitude: Attitude;
  state: EnemyState;
  /** Seconds spent in the current state. */
  stateTime: number;
  /** Health. One means a single sting kills. */
  health: number;
  /** Non-zero while the enemy cannot act, e.g. between dives. */
  cooldown: number;

  /** Bird only: 0..max. Filling it drives the bird off. */
  harassment: number;

  /** Orbit parameters, used by patrols and the swarm. */
  orbitAngle: number;
  orbitRadius: number;
  orbitAltitude: number;
  /** Centre of the orbit. For wasps this is the hive, for others a wander point. */
  anchor: Vec3;
};

/** Scratch vectors, so the per-step enemy loop allocates nothing. */
const scratchAttitude: Attitude = { yaw: 0, pitch: 0, roll: 0 };
const scratchForward: Vec3 = { x: 0, y: 0, z: 0 };

export function createEnemies(seed: () => number): Enemy[] {
  const enemies: Enemy[] = [];
  let nextId = 1;

  // Birds patrol far out, where the rich flowers are. That is the design intent: the risk
  // and the reward share a location.
  for (let i = 0; i < ENEMIES.bird.count; i += 1) {
    const angle = (i / ENEMIES.bird.count) * Math.PI * 2 + seed() * 0.8;
    const radius = ENEMIES.bird.patrolRadius;
    enemies.push({
      id: nextId++,
      kind: "bird",
      position: vec3(Math.cos(angle) * radius, ENEMIES.bird.patrolAltitude, Math.sin(angle) * radius),
      velocity: vec3(),
      attitude: { yaw: 0, pitch: 0, roll: 0 },
      state: "patrol",
      stateTime: 0,
      health: 1,
      cooldown: ENEMIES.bird.diveCooldown * seed(),
      harassment: 0,
      orbitAngle: angle,
      orbitRadius: radius,
      orbitAltitude: ENEMIES.bird.patrolAltitude,
      anchor: vec3(0, 0, 0),
    });
  }

  for (let i = 0; i < ENEMIES.hornet.count; i += 1) {
    const angle = seed() * Math.PI * 2;
    const radius =
      ENEMIES.hornet.minRadius +
      seed() * (ENEMIES.hornet.maxRadius - ENEMIES.hornet.minRadius);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    enemies.push({
      id: nextId++,
      kind: "hornet",
      position: vec3(x, 4 + seed() * 6, z),
      velocity: vec3(),
      attitude: { yaw: 0, pitch: 0, roll: 0 },
      state: "patrol",
      stateTime: 0,
      health: ENEMIES.hornet.health,
      cooldown: 0,
      harassment: 0,
      orbitAngle: seed() * Math.PI * 2,
      orbitRadius: ENEMIES.hornet.patrolRadius * (0.5 + seed() * 0.5),
      orbitAltitude: 5 + seed() * 5,
      anchor: vec3(x, 0, z),
    });
  }

  // The swarm orbits the hive with its members spread across radius and altitude, so there
  // are real gaps to fly through rather than a wall.
  for (let i = 0; i < ENEMIES.wasp.count; i += 1) {
    const angle = (i / ENEMIES.wasp.count) * Math.PI * 2;
    const radius = ENEMIES.wasp.orbitRadius + (seed() - 0.5) * 2 * ENEMIES.wasp.radiusJitter;

    enemies.push({
      id: nextId++,
      kind: "wasp",
      position: vec3(Math.cos(angle) * radius, ENEMIES.wasp.orbitAltitude, Math.sin(angle) * radius),
      velocity: vec3(),
      attitude: { yaw: 0, pitch: 0, roll: 0 },
      state: "patrol",
      stateTime: 0,
      health: ENEMIES.wasp.health,
      cooldown: 0,
      harassment: 0,
      orbitAngle: angle,
      orbitRadius: radius,
      orbitAltitude: ENEMIES.wasp.orbitAltitude + (seed() - 0.5) * 4,
      anchor: vec3(HIVE.position.x, 0, HIVE.position.z),
    });
  }

  return enemies;
}

/**
 * Advance every predator.
 *
 * `enemies` is mutated in place; dead wasps are recycled rather than removed, because the
 * swarm's whole character is that it comes back.
 */
export function updateEnemies(state: SimState, dt: number, events: SimEvent[]): void {
  const bee = state.bee;

  for (const enemy of state.enemies) {
    enemy.stateTime += dt;
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);

    switch (enemy.kind) {
      case "bird":
        updateBird(enemy, state, dt, events);
        break;
      case "hornet":
        updateHornet(enemy, state, dt, events);
        break;
      case "wasp":
        updateWasp(enemy, state, dt, events);
        break;
    }

    applyFlight(enemy, dt);
  }

  void bee;
}

/**
 * The bird: patrol, notice the juiciest bee, telegraph, plunge, recover.
 *
 * It targets the **most pollen-laden** bee, which is the single most important line in the
 * file. Your cargo is what makes you worth eating, so the richest return is the most
 * dangerous one — the tension comes from the player's own greed rather than from the enemy.
 */
function updateBird(enemy: Enemy, state: SimState, dt: number, events: SimEvent[]): void {
  const { bird } = ENEMIES;
  const bee = state.bee;

  const toBee = vec3(
    bee.position.x - enemy.position.x,
    bee.position.y - enemy.position.y,
    bee.position.z - enemy.position.z,
  );
  const distance = Math.hypot(toBee.x, toBee.y, toBee.z);

  switch (enemy.state) {
    case "patrol": {
      // A slow circuit. The bird is a looming shape before it is a threat, which gives the
      // player time to notice it and decide — reading the sky is meant to be a skill.
      enemy.orbitAngle += (bird.patrolSpeed / Math.max(enemy.orbitRadius, 1)) * dt;
      const targetX = enemy.anchor.x + Math.cos(enemy.orbitAngle) * enemy.orbitRadius;
      const targetZ = enemy.anchor.z + Math.sin(enemy.orbitAngle) * enemy.orbitRadius;
      steerToward(enemy, targetX, enemy.orbitAltitude, targetZ, bird.patrolSpeed, dt);

      if (distance < bird.detectRadius && enemy.cooldown <= 0 && bee.pollen > 0) {
        enemy.state = "telegraph";
        enemy.stateTime = 0;
      }
      break;
    }

    case "telegraph": {
      // Hold position and aim. The telegraph exists because a dive you cannot see coming is
      // not difficulty, it is a bug — the player must have time to react.
      steerToward(enemy, bee.position.x, bee.position.y + 2, bee.position.z, 2, dt);

      if (enemy.stateTime >= bird.diveTelegraph) {
        enemy.state = "attack";
        enemy.stateTime = 0;
        const aim = 1 / Math.max(distance, 0.001);
        enemy.velocity.x = toBee.x * aim * bird.diveSpeed;
        enemy.velocity.y = toBee.y * aim * bird.diveSpeed;
        enemy.velocity.z = toBee.z * aim * bird.diveSpeed;
      }
      break;
    }

    case "attack": {
      // No steering: the dive is committed. That is what makes dodging possible — the bee
      // can dodge because the bird cannot correct.
      const speed = Math.hypot(enemy.velocity.x, enemy.velocity.y, enemy.velocity.z);
      if (speed < bird.diveSpeed * 0.55 || enemy.stateTime > 2.5) {
        // Missed. The bird flounders with its belly exposed — the window a team exploits,
        // and the reason the bird is repelled rather than merely endured.
        enemy.state = "recover";
        enemy.stateTime = 0;
        enemy.velocity.x *= 0.2;
        enemy.velocity.z *= 0.2;
      }
      break;
    }

    case "recover": {
      enemy.velocity.x *= 0.94;
      enemy.velocity.z *= 0.94;
      enemy.velocity.y += 4 * dt;

      if (enemy.stateTime >= bird.recoverSeconds) {
        enemy.state = "patrol";
        enemy.stateTime = 0;
        enemy.cooldown = bird.diveCooldown;
        // Re-anchor near where it ended up, so it keeps hunting the same area rather than
        // teleporting back to a fixed circuit.
        enemy.anchor.x = enemy.position.x;
        enemy.anchor.z = enemy.position.z;
      }
      break;
    }

    case "flee": {
      steerToward(enemy, enemy.position.x * 1.4, bird.patrolAltitude, enemy.position.z * 1.4, 16, dt);

      if (enemy.stateTime >= bird.fleeSeconds) {
        enemy.state = "patrol";
        enemy.stateTime = 0;
        enemy.harassment = 0;
        enemy.cooldown = bird.diveCooldown;
      }
      break;
    }

    case "dead":
      break;
  }

  // Contact. Only lethal during a dive: a bird that damages you by merely existing nearby
  // would make the far meadow unplayable rather than tense.
  if (
    (enemy.state === "attack" || enemy.state === "telegraph") &&
    distance < bird.hitRadius &&
    bee.invulnerable <= 0
  ) {
    events.push({ kind: "beeHit", enemyId: enemy.id, damage: bird.damage });
    // Bounce off, then climb away, so a hit is a discrete event rather than a grind.
    const away = 1 / Math.max(distance, 0.001);
    enemy.velocity.x = toBee.x * away * -8;
    enemy.velocity.z = toBee.z * away * -8;
    enemy.velocity.y = 6;
    enemy.state = "recover";
    enemy.stateTime = 0;
    enemy.cooldown = bird.diveCooldown;
  }
}

/**
 * The hornet: solitary pursuit that steals pollen rather than lives.
 *
 * It is the one enemy a solo player can *solve*, which is what keeps the early game from
 * being purely defensive. Its counter is the Offense role, and killing it is permanent.
 */
function updateHornet(enemy: Enemy, state: SimState, dt: number, events: SimEvent[]): void {
  const { hornet } = ENEMIES;
  const bee = state.bee;

  if (enemy.state === "dead") {
    enemy.cooldown -= dt;
    if (enemy.cooldown <= 0) {
      // Replaced elsewhere in the meadow, so killing hornets thins them out without ever
      // clearing the world.
      const angle = enemy.orbitAngle;
      enemy.position.x = Math.cos(angle) * hornet.maxRadius * 0.7;
      enemy.position.z = Math.sin(angle) * hornet.maxRadius * 0.7;
      enemy.position.y = 5;
      enemy.health = hornet.health;
      enemy.state = "patrol";
      enemy.stateTime = 0;
      enemy.cooldown = 0;
      enemy.anchor.x = enemy.position.x;
      enemy.anchor.z = enemy.position.z;
    }
    return;
  }

  const distance = Math.hypot(
    bee.position.x - enemy.position.x,
    bee.position.y - enemy.position.y,
    bee.position.z - enemy.position.z,
  );

  switch (enemy.state) {
    case "patrol": {
      enemy.orbitAngle += 0.6 * dt;
      steerToward(
        enemy,
        enemy.anchor.x + Math.cos(enemy.orbitAngle) * enemy.orbitRadius,
        enemy.anchor.y + enemy.orbitAltitude,
        enemy.anchor.z + Math.sin(enemy.orbitAngle) * enemy.orbitRadius,
        hornet.patrolSpeed,
        dt,
      );

      if (distance < hornet.detectRadius) {
        enemy.state = "attack";
        enemy.stateTime = 0;
      }
      break;
    }

    case "attack": {
      steerToward(enemy, bee.position.x, bee.position.y, bee.position.z, hornet.pursueSpeed, dt);

      if (distance < hornet.contactRadius && enemy.cooldown <= 0) {
        const stolen = Math.floor(bee.pollen * hornet.pollenSteal);
        if (stolen > 0) {
          bee.pollen -= stolen;
          events.push({ kind: "pollenStolen", enemyId: enemy.id, amount: stolen });
        }
        enemy.cooldown = hornet.stealCooldown;
        // Satisfied, it withdraws. This is what makes it a cost rather than a death.
        enemy.state = "flee";
        enemy.stateTime = 0;
      } else if (distance > hornet.detectRadius * 1.8) {
        enemy.state = "patrol";
        enemy.stateTime = 0;
      }
      break;
    }

    case "flee": {
      const awayX = enemy.position.x - bee.position.x;
      const awayZ = enemy.position.z - bee.position.z;
      const away = 1 / Math.max(Math.hypot(awayX, awayZ), 0.001);
      steerToward(
        enemy,
        enemy.position.x + awayX * away * 20,
        enemy.position.y + 6,
        enemy.position.z + awayZ * away * 20,
        hornet.pursueSpeed,
        dt,
      );

      if (enemy.stateTime >= hornet.fleeSeconds) {
        enemy.state = "patrol";
        enemy.stateTime = 0;
        enemy.anchor.x = enemy.position.x;
        enemy.anchor.z = enemy.position.z;
      }
      break;
    }

    case "telegraph":
    case "recover":
      enemy.state = "patrol";
      break;
  }
}

/**
 * The wasp swarm: orbit the hive, and close in when a bee is carrying enough to be worth it.
 *
 * The aggro radius is a function of the bee's pollen load, which is the mechanism that makes
 * the richest return the most dangerous one. It needs no tutorial because it reuses a
 * resource the player is already watching.
 */
function updateWasp(enemy: Enemy, state: SimState, dt: number, events: SimEvent[]): void {
  const { wasp } = ENEMIES;
  const bee = state.bee;

  if (enemy.state === "dead") {
    enemy.cooldown -= dt;
    if (enemy.cooldown <= 0) {
      enemy.health = wasp.health;
      enemy.state = "patrol";
      enemy.stateTime = 0;
      // Re-enters the ring rather than reappearing on top of the player.
      enemy.position.x = enemy.anchor.x + Math.cos(enemy.orbitAngle) * wasp.orbitRadius;
      enemy.position.z = enemy.anchor.z + Math.sin(enemy.orbitAngle) * wasp.orbitRadius;
      enemy.position.y = enemy.orbitAltitude;
    }
    return;
  }

  const load = bee.pollenCapacity > 0 ? bee.pollen / bee.pollenCapacity : 0;
  const aggroRadius =
    wasp.aggroRadiusEmpty + (wasp.aggroRadiusFull - wasp.aggroRadiusEmpty) * load;

  const toBeeX = bee.position.x - enemy.position.x;
  const toBeeY = bee.position.y - enemy.position.y;
  const toBeeZ = bee.position.z - enemy.position.z;
  const distance = Math.hypot(toBeeX, toBeeY, toBeeZ);

  if (enemy.state === "patrol") {
    enemy.orbitAngle += wasp.orbitalSpeed * dt;
    steerToward(
      enemy,
      enemy.anchor.x + Math.cos(enemy.orbitAngle) * enemy.orbitRadius,
      enemy.orbitAltitude,
      enemy.anchor.z + Math.sin(enemy.orbitAngle) * enemy.orbitRadius,
      wasp.chaseSpeed * 0.6,
      dt,
    );

    if (distance < aggroRadius) {
      enemy.state = "attack";
      enemy.stateTime = 0;
    }
    return;
  }

  // Attack: chase until the prey leaves the ring or the load drops enough to lose interest.
  steerToward(enemy, bee.position.x, bee.position.y, bee.position.z, wasp.chaseSpeed, dt);

  if (distance < wasp.contactRadius && bee.invulnerable <= 0) {
    events.push({ kind: "beeHit", enemyId: enemy.id, damage: 1 });
    // The wasp is spent on contact, whether or not it hurt — otherwise a single wasp would
    // hit the invulnerability window repeatedly.
    enemy.state = "dead";
    enemy.stateTime = 0;
    enemy.cooldown = wasp.respawnSeconds;
    events.push({ kind: "enemyKilled", enemyId: enemy.id, enemyKind: "wasp" });
    return;
  }

  if (distance > aggroRadius * 2.2) {
    enemy.state = "patrol";
    enemy.stateTime = 0;
  }
}

/**
 * Apply a sting from the bee, if one was requested.
 *
 * The sting is a *dive* rather than a button-triggered melee: it reuses the pitch-down the
 * player already mastered, so there is no new mechanic to learn, and the hitbox is the nose
 * rather than an aura — so speed genuinely becomes a weapon.
 */
export function updateSting(state: SimState, dt: number, events: SimEvent[]): void {
  const bee = state.bee;
  if (!state.stingRequested) return;
  if (bee.sinceSting < ENEMIES.stingCooldown) return;

  state.stingRequested = false;
  bee.sinceSting = 0;

  // The sting reaches along the bee's forward axis, so aiming is the same skill as flying.
  scratchAttitude.yaw = bee.attitude.yaw;
  scratchAttitude.pitch = bee.attitude.pitch;
  scratchAttitude.roll = 0;
  rotateForward(scratchAttitude, scratchForward);

  const tipX = bee.position.x + scratchForward.x * ENEMIES.stingReach;
  const tipY = bee.position.y + scratchForward.y * ENEMIES.stingReach;
  const tipZ = bee.position.z + scratchForward.z * ENEMIES.stingReach;

  for (const enemy of state.enemies) {
    if (enemy.state === "dead") continue;

    const distance = Math.hypot(
      tipX - enemy.position.x,
      tipY - enemy.position.y,
      tipZ - enemy.position.z,
    );

    const reach = enemy.kind === "bird" ? ENEMIES.bird.hitRadius * 1.6 : 1.2;
    if (distance > reach) continue;

    if (enemy.kind === "bird") {
      // Unkillable. A sting only shortens its harassment meter, driving it off sooner.
      // This is the "repel, never kill" rule from DESIGN §8.2, enforced in one place.
      enemy.harassment = clamp(
        enemy.harassment + ENEMIES.bird.harassmentPerHit,
        0,
        ENEMIES.bird.harassmentMax,
      );
      events.push({ kind: "enemyStung", enemyId: enemy.id, enemyKind: "bird", remainingHealth: 1 });

      if (enemy.harassment >= ENEMIES.bird.harassmentMax) {
        enemy.state = "flee";
        enemy.stateTime = 0;
        enemy.harassment = 0;
        events.push({ kind: "enemyRepelled", enemyId: enemy.id, enemyKind: "bird" });
      }
      break;
    }

    enemy.health -= 1;
    events.push({
      kind: "enemyStung",
      enemyId: enemy.id,
      enemyKind: enemy.kind,
      remainingHealth: enemy.health,
    });

    if (enemy.health <= 0) {
      enemy.state = "dead";
      enemy.stateTime = 0;
      enemy.cooldown = enemy.kind === "wasp" ? ENEMIES.wasp.respawnSeconds : 12;
      events.push({ kind: "enemyKilled", enemyId: enemy.id, enemyKind: enemy.kind });
    } else if (enemy.kind === "hornet") {
      // It flees after the first hit, so killing one costs three separate engagements.
      enemy.state = "flee";
      enemy.stateTime = 0;
    }
    break;
  }

  void dt;
}

/**
 * Integrate an enemy's velocity into its position, with drag.
 *
 * Enemy movement is deliberately simplistic — this is not a simulation of bird aerodynamics.
 * What matters is that threats are *readable*: predictable patrols, a telegraphed dive, and
 * a contact radius the player can judge.
 */
function applyFlight(enemy: Enemy, dt: number): void {
  enemy.position.x += enemy.velocity.x * dt;
  enemy.position.y += enemy.velocity.y * dt;
  enemy.position.z += enemy.velocity.z * dt;

  const decay = Math.exp(-1.6 * dt);
  enemy.velocity.x *= decay;
  enemy.velocity.z *= decay;
  if (enemy.kind !== "bird") enemy.velocity.y *= decay;

  // Nothing in v1 may fly below the meadow.
  if (enemy.position.y < 0.5) {
    enemy.position.y = 0.5;
    enemy.velocity.y = Math.max(enemy.velocity.y, 0);
  }

  // Face the direction of travel, so the models are not sliding sideways.
  const speed = Math.hypot(enemy.velocity.x, enemy.velocity.z);
  if (speed > 0.2) {
    enemy.attitude.yaw = Math.atan2(-enemy.velocity.x, -enemy.velocity.z);
    enemy.attitude.pitch = clamp(Math.asin(clamp(enemy.velocity.y / Math.max(speed, 0.001), -1, 1)) * 0.4, -0.5, 0.5);
  }
}

/**
 * Accelerate an enemy toward a point, at a capped speed.
 *
 * Deliberately arcade: no turning radius, no banking physics. The readability of the threat
 * is worth more than the plausibility of its flight path.
 */
function steerToward(
  enemy: Enemy,
  x: number,
  y: number,
  z: number,
  speed: number,
  dt: number,
): void {
  const dx = x - enemy.position.x;
  const dy = y - enemy.position.y;
  const dz = z - enemy.position.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 0.001) return;

  const accel = speed * 3.5;
  const scale = accel / distance;

  enemy.velocity.x += dx * scale * dt;
  enemy.velocity.y += dy * scale * dt;
  enemy.velocity.z += dz * scale * dt;

  const current = Math.hypot(enemy.velocity.x, enemy.velocity.y, enemy.velocity.z);
  if (current > speed) {
    const clampScale = speed / current;
    enemy.velocity.x *= clampScale;
    enemy.velocity.y *= clampScale;
    enemy.velocity.z *= clampScale;
  }
}
