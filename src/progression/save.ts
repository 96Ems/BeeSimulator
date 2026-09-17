/**
 * Persistence. DESIGN §10.3.
 *
 * Two deliberate decisions:
 *
 *   1. **Settings and progression live under separate keys.** A corrupt or hand-edited
 *      progression file must never cost the player their keybindings — losing your controls
 *      because a skill tree failed to parse is the kind of bug that makes people quit.
 *   2. **Versioned from day one.** Migration is cheap to add later and impossible to
 *      retrofit, so the shape is `{ version: 1, ... }` before there is anything to migrate.
 *
 * Everything is wrapped in try/catch. `localStorage` throws in private-browsing modes and
 * when quota is exhausted, and a save failure must never take down the game.
 */

import type { Investment } from "./tree";

const PROGRESSION_KEY = "beesimulator.progression.v1";
const SETTINGS_KEY = "beesimulator.settings.v1";
const RECORDS_KEY = "beesimulator.records.v1";

export type Progression = {
  version: 1;
  /** Unspent pollen available to invest. */
  pollen: number;
  /** Lifetime pollen deposited, for the profile screen. */
  lifetime: number;
  investment: Investment;
};

export type Settings = {
  version: 1;
  scheme: "mouse" | "keyboard";
  bindings: Record<string, string> | null;
};

export type Records = {
  version: 1;
  bestTrip: number;
  bestSession: number;
  bestPollenPerMinute: number;
  totalTrips: number;
  /** Trips completed without taking a hit — the risk-discipline metric. */
  cleanTrips: number;
};

export function createProgression(): Progression {
  return { version: 1, pollen: 0, lifetime: 0, investment: {} };
}

export function createSettings(): Settings {
  return { version: 1, scheme: "mouse", bindings: null };
}

export function createRecords(): Records {
  return {
    version: 1,
    bestTrip: 0,
    bestSession: 0,
    bestPollenPerMinute: 0,
    totalTrips: 0,
    cleanTrips: 0,
  };
}

// ── storage primitives ───────────────────────────────────────────────────────────

function read<T extends { version: number }>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Partial<T>;
    if (typeof parsed !== "object" || parsed === null) return fallback;

    // Version check before merging, so a future shape does not silently half-load into this
    // one and produce a player with negative pollen.
    if (parsed.version !== fallback.version) return fallback;

    return { ...fallback, ...parsed };
  } catch {
    // Unavailable storage, corrupt JSON, or a quota error. Falling back is always correct:
    // the player loses progress, not the ability to play.
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ── public API ───────────────────────────────────────────────────────────────────

export function loadProgression(): Progression {
  return read(PROGRESSION_KEY, createProgression());
}

export function saveProgression(progression: Progression): boolean {
  return write(PROGRESSION_KEY, progression);
}

export function loadSettings(): Settings {
  return read(SETTINGS_KEY, createSettings());
}

export function saveSettings(settings: Settings): boolean {
  return write(SETTINGS_KEY, settings);
}

export function loadRecords(): Records {
  return read(RECORDS_KEY, createRecords());
}

export function saveRecords(records: Records): boolean {
  return write(RECORDS_KEY, records);
}

/**
 * Wipe progression only.
 *
 * Deliberately does **not** touch settings or records. A player asking to reset their tree
 * has not asked to lose their keybindings, and conflating the two is a support ticket waiting
 * to happen.
 */
export function resetProgression(): Progression {
  const fresh = createProgression();
  saveProgression(fresh);
  return fresh;
}

/** Fold a finished session into the persistent records. */
export function mergeSession(
  records: Records,
  session: { deposited: number; bestTrip: number; pollenPerMinute: number; trips: number; hitsTaken: number },
): Records {
  const clean = Math.max(0, session.trips - session.hitsTaken);

  const merged: Records = {
    ...records,
    bestTrip: Math.max(records.bestTrip, session.bestTrip),
    bestSession: Math.max(records.bestSession, session.deposited),
    bestPollenPerMinute: Math.max(records.bestPollenPerMinute, session.pollenPerMinute),
    totalTrips: records.totalTrips + session.trips,
    cleanTrips: records.cleanTrips + clean,
  };

  saveRecords(merged);
  return merged;
}
