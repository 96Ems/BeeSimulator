import { describe, expect, it } from "vitest";
import { createRng, pointInDisc, range } from "./rng";

describe("createRng", () => {
  it("is deterministic for a given seed", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const first = Array.from({ length: 64 }, () => a());
    const second = Array.from({ length: 64 }, () => b());
    expect(first).toEqual(second);
  });

  it("produces different sequences for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    const first = Array.from({ length: 32 }, () => a());
    const second = Array.from({ length: 32 }, () => b());
    expect(first).not.toEqual(second);
  });

  it("stays within [0, 1)", () => {
    const rng = createRng(99);
    for (let i = 0; i < 10_000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("is roughly uniform across the unit interval", () => {
    const rng = createRng(7);
    const buckets = new Array<number>(10).fill(0);
    const samples = 100_000;
    for (let i = 0; i < samples; i += 1) {
      const index = Math.floor(rng() * 10);
      buckets[index] = (buckets[index] ?? 0) + 1;
    }
    // Each bucket should hold ~10% of the samples. A loose bound catches a broken
    // generator without making the test flaky.
    for (const count of buckets) {
      expect(count).toBeGreaterThan(samples * 0.08);
      expect(count).toBeLessThan(samples * 0.12);
    }
  });
});

describe("range", () => {
  it("stays within the requested bounds", () => {
    const rng = createRng(3);
    for (let i = 0; i < 1_000; i += 1) {
      const value = range(rng, -5, 12);
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThan(12);
    }
  });
});

describe("pointInDisc", () => {
  it("never escapes the disc", () => {
    const rng = createRng(42);
    for (let i = 0; i < 10_000; i += 1) {
      const { x, z } = pointInDisc(rng, 20);
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(20);
    }
  });

  it("covers the area uniformly rather than clustering at the centre", () => {
    // This is the regression test for the square-root transform. Sampling the radius
    // linearly bunches points towards the middle and would drag the mean well below
    // 2/3 of the radius; this guards against anyone "simplifying" that line away.
    const rng = createRng(2024);
    const radius = 30;
    let total = 0;
    const samples = 50_000;
    for (let i = 0; i < samples; i += 1) {
      const { x, z } = pointInDisc(rng, radius);
      total += Math.hypot(x, z);
    }
    const meanRadius = total / samples;
    const expected = (2 / 3) * radius;
    expect(meanRadius).toBeGreaterThan(expected * 0.97);
    expect(meanRadius).toBeLessThan(expected * 1.03);
  });
});
