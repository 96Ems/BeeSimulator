import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProgression,
  createRecords,
  createSettings,
  loadProgression,
  mergeSession,
  resetProgression,
  saveProgression,
  saveSettings,
} from "./save";

/**
 * A minimal in-memory `localStorage`.
 *
 * The storage layer is the one place the game talks to a browser API, so it is the one place
 * worth stubbing rather than mocking the whole DOM.
 */
function installFakeStorage(options: { throwOnWrite?: boolean } = {}): Map<string, string> {
  const store = new Map<string, string>();

  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (options.throwOnWrite) throw new Error("QuotaExceededError");
        store.set(key, value);
      },
      removeItem: (key: string) => store.delete(key),
    },
  });

  return store;
}

describe("save/load round trip", () => {
  beforeEach(() => {
    installFakeStorage();
  });

  it("returns defaults when nothing is stored", () => {
    const loaded = loadProgression();
    expect(loaded.pollen).toBe(0);
    expect(loaded.investment).toEqual({});
  });

  it("round-trips progression", () => {
    const progression = createProgression();
    progression.pollen = 120;
    progression.lifetime = 400;
    progression.investment["forage.capacity1"] = 2;

    expect(saveProgression(progression)).toBe(true);

    const loaded = loadProgression();
    expect(loaded.pollen).toBe(120);
    expect(loaded.lifetime).toBe(400);
    expect(loaded.investment["forage.capacity1"]).toBe(2);
  });
});

describe("robustness", () => {
  it("falls back to defaults on corrupt JSON", () => {
    // A hand-edited or truncated save must not prevent the game from starting.
    const store = installFakeStorage();
    store.set("beesimulator.progression.v1", "{ this is not json");

    const loaded = loadProgression();
    expect(loaded.pollen).toBe(0);
    expect(loaded.investment).toEqual({});
  });

  it("rejects a save from a different version", () => {
    // Version checking before merging is what stops a future shape half-loading into this one
    // and producing, say, negative pollen.
    const store = installFakeStorage();
    store.set(
      "beesimulator.progression.v1",
      JSON.stringify({ version: 99, pollen: 9999, lifetime: 0, investment: {} }),
    );

    expect(loadProgression().pollen).toBe(0);
  });

  it("survives a storage write failure without throwing", () => {
    // Private browsing and exhausted quota both throw on write. Losing a save is acceptable;
    // crashing the game is not.
    installFakeStorage({ throwOnWrite: true });
    expect(() => saveProgression(createProgression())).not.toThrow();
    expect(saveProgression(createProgression())).toBe(false);
  });

  it("keeps bindings when progression is reset", () => {
    // The whole reason settings live under a separate key: a player resetting their tree has
    // not asked to lose their controls.
    const store = installFakeStorage();

    const settings = createSettings();
    settings.bindings = { sting: "KeyF" };
    saveSettings(settings);

    const progression = createProgression();
    progression.pollen = 500;
    saveProgression(progression);

    resetProgression();

    const reloaded = loadSettingsSafe();
    expect(reloaded.bindings?.sting).toBe("KeyF");
    expect(store.has("beesimulator.settings.v1")).toBe(true);
  });
});

/** Local helper so the import list stays explicit about what this test needs. */
function loadSettingsSafe(): ReturnType<typeof createSettings> {
  const raw = window.localStorage.getItem("beesimulator.settings.v1");
  return raw ? (JSON.parse(raw) as ReturnType<typeof createSettings>) : createSettings();
}

describe("mergeSession", () => {
  it("keeps the best values and accumulates the totals", () => {
    const records = createRecords();

    const merged = mergeSession(records, {
      deposited: 100,
      bestTrip: 40,
      pollenPerMinute: 20,
      trips: 3,
      hitsTaken: 1,
    });

    expect(merged.bestTrip).toBe(40);
    expect(merged.bestSession).toBe(100);
    expect(merged.bestPollenPerMinute).toBe(20);
    expect(merged.totalTrips).toBe(3);
    expect(merged.cleanTrips).toBe(2);
  });

  it("never lowers a record", () => {
    const records = createRecords();
    records.bestTrip = 90;

    const merged = mergeSession(records, {
      deposited: 10,
      bestTrip: 12,
      pollenPerMinute: 1,
      trips: 1,
      hitsTaken: 0,
    });

    expect(merged.bestTrip).toBe(90);
  });

  it("never reports negative clean trips", () => {
    // A session that ends mid-trip can record more hits than completed trips. Clamping keeps
    // the display honest rather than showing "-1 clean trips".
    const merged = mergeSession(createRecords(), {
      deposited: 0,
      bestTrip: 0,
      pollenPerMinute: 0,
      trips: 0,
      hitsTaken: 3,
    });

    expect(merged.cleanTrips).toBe(0);
  });
});
