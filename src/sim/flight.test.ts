import { describe, expect, it } from "vitest";
import { FLIGHT } from "../data/tuning";
import { neutralCommand, type InputCommand } from "./commands";
import { FLIGHT_STEP, integrateFlight } from "./flight";
import { createBee } from "./State";
import type { Bee } from "./State";

/** Run the simulation for `seconds` with a fixed command, from a level standstill. */
function fly(command: Partial<InputCommand>, seconds: number): Bee {
  const bee = createBee();
  const full: InputCommand = { ...neutralCommand(), ...command };

  // Start at altitude so the ground clamp does not mask the flight behaviour.
  bee.position.y = 20;

  const steps = Math.round(seconds / FLIGHT_STEP);
  for (let i = 0; i < steps; i += 1) {
    integrateFlight(bee, full, FLIGHT_STEP);
  }
  return bee;
}

describe("control directions", () => {
  // These tests exist because a sign error here produces perfectly stable, perfectly smooth
  // flight in which the bee simply goes the wrong way. That reads as "the controls are
  // broken", not as "a maths bug", and it is the kind of thing that survives playtesting
  // because you unconsciously adapt to it. Pinning it down is cheaper than noticing it.

  it("D (roll right) banks right, so the bee moves toward +X", () => {
    // +X is the bee's right at yaw 0, because forward is -Z and up is +Y.
    // Verified against Three.js: a positive Z rotation raises the right wing, so banking
    // right must be a negative attitude.roll.
    const bee = fly({ roll: 1 }, 0.5);
    expect(bee.velocity.x).toBeGreaterThan(0.2);
  });

  it("A (roll left) banks left, so the bee moves toward -X", () => {
    const bee = fly({ roll: -1 }, 0.5);
    expect(bee.velocity.x).toBeLessThan(-0.2);
  });

  it("W (nose down) accelerates forward, along -Z", () => {
    // The core of the helicopter model: thrust follows attitude, so nose-down is the
    // accelerator. If this inverts, the bee flies backwards.
    const bee = fly({ pitch: -1 }, 1.0);
    expect(bee.velocity.z).toBeLessThan(-2);
    expect(bee.attitude.pitch).toBeLessThan(0);
  });

  it("S (nose up) brakes, then reverses", () => {
    const bee = fly({ pitch: 1 }, 0.5);
    expect(bee.velocity.z).toBeGreaterThan(0.2);
  });

  it("J (yaw left) turns toward -X, which is the bee's left", () => {
    const bee = fly({ yaw: 1 }, 0.5);
    expect(bee.attitude.yaw).toBeGreaterThan(0.1);

    // Forward is (-sin yaw, 0, -cos yaw), so a positive yaw must send it toward -X.
    expect(-Math.sin(bee.attitude.yaw)).toBeLessThan(0);
  });

  it("L (yaw right) turns the other way", () => {
    const bee = fly({ yaw: -1 }, 0.5);
    expect(bee.attitude.yaw).toBeLessThan(-0.1);
  });

  it("I climbs and K descends", () => {
    expect(fly({ thrust: 1 }, 1.0).velocity.y).toBeGreaterThan(0.5);
    expect(fly({ thrust: -1 }, 1.0).position.y).toBeLessThan(20);
  });
});

describe("helicopter feel", () => {
  it("hover is stable: no drift without input", () => {
    // The player must be able to sit still on a flower. This is why auto-stabilization
    // exists at all (DESIGN §4.2), and it is half the game.
    const bee = fly({}, 3.0);
    const drift = Math.hypot(bee.velocity.x, bee.velocity.z);
    expect(drift).toBeLessThan(0.05);
    expect(Math.abs(bee.attitude.pitch)).toBeLessThan(0.01);
    expect(Math.abs(bee.attitude.roll)).toBeLessThan(0.01);
  });

  it("momentum carries after the stick is released, but settles quickly", () => {
    // Two competing requirements, and the balance between them is the whole feel of the
    // model. Inertia must exist *while* flying or it stops feeling like a helicopter — but
    // the first playtest asked for the bee to stop gliding "toooo far", so release has to
    // settle in well under a second.
    const bee = createBee();
    bee.position.y = 30;

    const dive = { ...neutralCommand(), pitch: -1 };
    for (let i = 0; i < 120; i += 1) integrateFlight(bee, dive, FLIGHT_STEP);

    const speedAtRelease = Math.hypot(bee.velocity.x, bee.velocity.z);
    expect(speedAtRelease).toBeGreaterThan(4);

    const coast = neutralCommand();

    // A tenth of a second later the bee is still moving: this is the inertia.
    for (let i = 0; i < 6; i += 1) integrateFlight(bee, coast, FLIGHT_STEP);
    const afterOneTenth = Math.hypot(bee.velocity.x, bee.velocity.z);
    expect(afterOneTenth).toBeGreaterThan(speedAtRelease * 0.6);

    // But after a second of hands-off, stabilization has reclaimed it.
    for (let i = 0; i < 66; i += 1) integrateFlight(bee, coast, FLIGHT_STEP);
    expect(Math.hypot(bee.velocity.x, bee.velocity.z)).toBeLessThan(0.3);
  });

  it("does not glide far after release: the measured regression", () => {
    // Numbers taken from an actual measurement, not guessed. The first playtest version
    // coasted ~20 m over 2.5 s, which is what "it glides toooo far" meant.
    const bee = createBee();
    bee.position.y = 30;

    const dive = { ...neutralCommand(), pitch: -1 };
    for (let i = 0; i < 120; i += 1) integrateFlight(bee, dive, FLIGHT_STEP);

    const startX = bee.position.x;
    const startZ = bee.position.z;
    const coast = neutralCommand();
    for (let i = 0; i < 120; i += 1) integrateFlight(bee, coast, FLIGHT_STEP);

    const glided = Math.hypot(bee.position.x - startX, bee.position.z - startZ);
    expect(glided).toBeLessThan(3);
  });

  it("the opposite key brakes hard instead of complaining slowly", () => {
    // The explicit request: "the opposite key must instant stop". Reverse thrust alone was
    // too weak, so counter-input gets direct damping help.
    const bee = createBee();
    bee.position.y = 30;

    const dive = { ...neutralCommand(), pitch: -1 };
    for (let i = 0; i < 120; i += 1) integrateFlight(bee, dive, FLIGHT_STEP);
    expect(Math.hypot(bee.velocity.x, bee.velocity.z)).toBeGreaterThan(4);

    // Three quarters of a second of nose-up should all but stop it.
    const brake = { ...neutralCommand(), pitch: 1 };
    for (let i = 0; i < 45; i += 1) integrateFlight(bee, brake, FLIGHT_STEP);
    expect(Math.hypot(bee.velocity.x, bee.velocity.z)).toBeLessThan(0.5);
  });

  it("pitching down and holding produces real forward speed", () => {
    const bee = fly({ pitch: -1 }, 2.0);
    expect(Math.hypot(bee.velocity.x, bee.velocity.z)).toBeGreaterThan(4);
  });

  it("respects the horizontal speed cap", () => {
    const bee = fly({ pitch: -1 }, 8.0);
    // A little slack for the exponential damping; the cap is applied to the velocity each
    // step, so a small overshoot within a single step is expected and harmless.
    expect(Math.hypot(bee.velocity.x, bee.velocity.z)).toBeLessThanOrEqual(
      FLIGHT.maxHorizontalSpeed * 1.02,
    );
  });

  it("cannot fly below the ground, and does not die on contact", () => {
    const bee = createBee();
    // Start low: the descent cap is 4.5 m/s, so from the default test altitude of 20 m the
    // bee would need ~5 s just to arrive.
    bee.position.y = 3;

    const sink = { ...neutralCommand(), thrust: -1 };
    for (let i = 0; i < 60 * 4; i += 1) integrateFlight(bee, sink, FLIGHT_STEP);

    expect(bee.position.y).toBeGreaterThan(0);
    expect(bee.grounded).toBe(true);
    expect(bee.velocity.y).toBe(0);
  });

  it("stays inside the world boundary however long it flies", () => {
    const bee = createBee();
    bee.position.y = 40;
    const straight = { ...neutralCommand(), pitch: -1 };
    for (let i = 0; i < 60 * 60; i += 1) integrateFlight(bee, straight, FLIGHT_STEP);
    expect(Math.hypot(bee.position.x, bee.position.z)).toBeLessThanOrEqual(150.5);
  });
});

describe("determinism", () => {
  it("produces identical state for identical inputs", () => {
    // The property that makes replays, tests and a server-authoritative co-op mode possible
    // (ARCHITECTURE §9). It also catches accidental use of Math.random or Date.now inside
    // the simulation.
    const a = fly({ pitch: -0.7, roll: 0.3, yaw: 0.2, thrust: 0.4 }, 3.0);
    const b = fly({ pitch: -0.7, roll: 0.3, yaw: 0.2, thrust: 0.4 }, 3.0);

    expect(a.position.x).toBe(b.position.x);
    expect(a.position.y).toBe(b.position.y);
    expect(a.position.z).toBe(b.position.z);
    expect(a.attitude.yaw).toBe(b.attitude.yaw);
    expect(a.attitude.pitch).toBe(b.attitude.pitch);
    expect(a.attitude.roll).toBe(b.attitude.roll);
  });

  it("honours the attitude envelope", () => {
    const bee = fly({ pitch: -1, roll: 1 }, 4.0);
    expect(Math.abs(bee.attitude.pitch)).toBeLessThanOrEqual(FLIGHT.maxPitch + 1e-6);
    expect(Math.abs(bee.attitude.roll)).toBeLessThanOrEqual(FLIGHT.maxRoll + 1e-6);
  });
});
