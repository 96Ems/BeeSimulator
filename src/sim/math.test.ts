import { describe, expect, it } from "vitest";
import {
  angleDelta,
  approach,
  clamp,
  rotateByAttitude,
  rotateForward,
  rotateUp,
  smoothstep,
  type Attitude,
  type Vec3,
} from "./math";

const LEVEL: Attitude = { yaw: 0, pitch: 0, roll: 0 };
const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

function rotated(v: Vec3, attitude: Attitude): Vec3 {
  return rotateByAttitude(v, attitude, { x: 0, y: 0, z: 0 });
}

describe("rotateForward", () => {
  it("points along -Z at rest", () => {
    // The bee model faces -Z (docs/ASSETS.md). If this ever returns +Z, the bee flies
    // backwards and it looks like a tuning problem rather than a maths one.
    const forward = rotateForward(LEVEL, { x: 0, y: 0, z: 0 });
    expect(forward.x).toBeCloseTo(0, 10);
    expect(forward.y).toBeCloseTo(0, 10);
    expect(forward.z).toBeCloseTo(-1, 10);
  });

  it("pitches up and down with the sign convention", () => {
    const noseDown = rotateForward({ yaw: 0, pitch: -0.5, roll: 0 }, { x: 0, y: 0, z: 0 });
    expect(noseDown.y).toBeLessThan(0); // nose below the horizon

    const noseUp = rotateForward({ yaw: 0, pitch: 0.5, roll: 0 }, { x: 0, y: 0, z: 0 });
    expect(noseUp.y).toBeGreaterThan(0);
  });

  it("turns with yaw", () => {
    const turned = rotateForward({ yaw: Math.PI / 2, pitch: 0, roll: 0 }, { x: 0, y: 0, z: 0 });
    expect(turned.x).toBeCloseTo(-1, 10);
    expect(turned.z).toBeCloseTo(0, 10);
  });
});

describe("rotateUp", () => {
  it("points along +Y at rest", () => {
    const up = rotateUp(LEVEL, { x: 0, y: 0, z: 0 });
    expect(up.x).toBeCloseTo(0, 10);
    expect(up.y).toBeCloseTo(1, 10);
    expect(up.z).toBeCloseTo(0, 10);
  });

  it("tilts forward when the nose drops", () => {
    // This is the mechanical heart of the flight model: thrust follows attitude, so a
    // nose-down attitude must push the bee along -Z. If this inverts, the bee accelerates
    // backwards while the player pitches forward.
    const up = rotateUp({ yaw: 0, pitch: -0.5, roll: 0 }, { x: 0, y: 0, z: 0 });
    expect(up.z).toBeLessThan(0);
    expect(up.y).toBeGreaterThan(0);
  });

  it("agrees with the general rotation about the X axis", () => {
    const attitude: Attitude = { yaw: 0, pitch: 0.4, roll: 0 };
    const expected = rotated({ x: 0, y: 1, z: 0 }, attitude);
    const actual = rotateUp(attitude, { x: 0, y: 0, z: 0 });
    expect(actual.x).toBeCloseTo(expected.x, 10);
    expect(actual.y).toBeCloseTo(expected.y, 10);
    expect(actual.z).toBeCloseTo(expected.z, 10);
  });
});

describe("rotateByAttitude", () => {
  it("leaves the axis of rotation untouched", () => {
    const yawOnly: Attitude = { yaw: 0.7, pitch: 0, roll: 0 };
    const up = rotated({ x: 0, y: 1, z: 0 }, yawOnly);
    expect(up.y).toBeCloseTo(1, 10);
  });

  it("preserves vector length", () => {
    const attitude: Attitude = { yaw: 1.1, pitch: -0.6, roll: 0.4 };
    const source: Vec3 = { x: 0.3, y: -0.7, z: 0.5 };
    const result = rotated(source, attitude);
    const before = Math.hypot(source.x, source.y, source.z);
    const after = Math.hypot(result.x, result.y, result.z);
    expect(after).toBeCloseTo(before, 10);
  });

  it("composes roll, then pitch, then yaw", () => {
    const attitude: Attitude = { yaw: 0.3, pitch: -0.2, roll: 0.55 };
    const forward = rotateForward(attitude, { x: 0, y: 0, z: 0 });
    const viaGeneral = rotated({ x: 0, y: 0, z: -1 }, attitude);
    expect(forward.x).toBeCloseTo(viaGeneral.x, 10);
    expect(forward.y).toBeCloseTo(viaGeneral.y, 10);
    expect(forward.z).toBeCloseTo(viaGeneral.z, 10);
  });
});

describe("angleDelta", () => {
  it("takes the short way around the wrap point", () => {
    // The bug this guards: lerping yaw raw across +/-PI spins the bee almost the full circle
    // for a one-degree turn, which reads as a violent glitch when crossing due south.
    const delta = angleDelta(Math.PI - 0.1, -Math.PI + 0.1);
    expect(delta).toBeCloseTo(0.2, 10);
  });

  it("is zero for identical angles", () => {
    expect(angleDelta(0.42, 0.42)).toBeCloseTo(0, 12);
  });

  it("is signed", () => {
    expect(angleDelta(0, 0.5)).toBeCloseTo(0.5, 10);
    expect(angleDelta(0, -0.5)).toBeCloseTo(-0.5, 10);
  });
});

describe("approach", () => {
  it("converges without overshoot, even for a rate above the step count", () => {
    // The naive `current += (target - current) * rate * dt` form oscillates once
    // rate * dt exceeds 1, which at 60 Hz is any rate above 60.
    let value = 0;
    for (let i = 0; i < 200; i += 1) value = approach(value, 1, 500, 1 / 60);
    expect(value).toBeLessThanOrEqual(1);
    expect(value).toBeGreaterThan(0.999);
  });

  it("moves toward the target monotonically", () => {
    let value = 0;
    let previous = -1;
    for (let i = 0; i < 60; i += 1) {
      value = approach(value, 1, 8, 1 / 60);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });
});

describe("smoothstep", () => {
  it("clamps outside the edges", () => {
    expect(smoothstep(0.2, 0.6, 0)).toBe(0);
    expect(smoothstep(0.2, 0.6, 10)).toBe(1);
  });

  it("has zero derivative at both edges", () => {
    // The stabilization handover relies on this. A linear ramp produces a visible kick the
    // instant assistance engages, which reads as a bug rather than as help.
    const epsilon = 1e-4;
    const atStart = (smoothstep(0.2, 0.6, 0.2 + epsilon) - smoothstep(0.2, 0.6, 0.2)) / epsilon;
    const atEnd = (smoothstep(0.2, 0.6, 0.6) - smoothstep(0.2, 0.6, 0.6 - epsilon)) / epsilon;
    expect(Math.abs(atStart)).toBeLessThan(1e-2);
    expect(Math.abs(atEnd)).toBeLessThan(1e-2);
  });

  it("is monotonic across the ramp", () => {
    let previous = -1;
    for (let t = 0.2; t <= 0.6; t += 0.01) {
      const value = smoothstep(0.2, 0.6, t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe("clamp", () => {
  it("bounds both ways and passes through inside values", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});

void ORIGIN;
