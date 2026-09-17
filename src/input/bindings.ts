/**
 * Key bindings and keyboard-layout handling.
 *
 * Bindings are stored as **physical position** (`KeyboardEvent.code`), never as characters
 * (`event.key`). This is not a stylistic preference: the physical key labelled "Z" on AZERTY
 * sits exactly where "W" sits on QWERTY, so one binding table works on both layouts with no
 * branching and no way to get it wrong.
 *
 * A consequence worth stating plainly: **there is only one keyboard preset.** AZERTY and
 * QWERTY players get the same `code` values. The layout only changes what the rebinding menu
 * *prints*, which is why `labelFor` exists and why nothing in the gameplay path calls it.
 */

export type Action =
  | "pitchUp"
  | "pitchDown"
  | "rollLeft"
  | "rollRight"
  | "yawLeft"
  | "yawRight"
  | "climb"
  | "descend"
  | "sting"
  | "dash";

/** Action -> `KeyboardEvent.code`. */
export type Bindings = Record<Action, string>;

export type Layout = "azerty" | "qwerty";

export const ACTIONS: readonly Action[] = [
  "pitchDown",
  "pitchUp",
  "rollLeft",
  "rollRight",
  "yawLeft",
  "yawRight",
  "climb",
  "descend",
  "sting",
  "dash",
];

/**
 * The full-keyboard scheme, DESIGN §5.3.
 *
 * Left hand: attitude (pitch and roll). Right hand: collective and yaw. Ten keys, no
 * modifier held, both hands resting on the keyboard — which is also why the skill keys live
 * on the number row (DESIGN §5.4).
 */
export const PHYSICAL_PRESET: Bindings = {
  pitchDown: "KeyW", // physical position of Z on AZERTY — nose down, accelerate
  pitchUp: "KeyS", // nose up, brake
  rollLeft: "KeyA", // physical position of Q on AZERTY
  rollRight: "KeyD",
  yawLeft: "KeyJ",
  yawRight: "KeyL",
  climb: "KeyI",
  descend: "KeyK",
  sting: "Space",
  dash: "ShiftLeft",
};

/** Arrow-key alternative, for players who prefer the inverted-T. */
export const ARROW_PRESET: Bindings = {
  pitchDown: "ArrowUp",
  pitchUp: "ArrowDown",
  rollLeft: "ArrowLeft",
  rollRight: "ArrowRight",
  yawLeft: "KeyJ",
  yawRight: "KeyL",
  climb: "KeyI",
  descend: "KeyK",
  sting: "Space",
  dash: "ShiftLeft",
};

export const PRESETS: Record<string, { label: string; bindings: Bindings }> = {
  physical: { label: "ZQSD / WASD", bindings: PHYSICAL_PRESET },
  arrows: { label: "Arrows", bindings: ARROW_PRESET },
};

/**
 * Human-readable label for display only.
 *
 * The only place a layout actually matters. Nothing in the gameplay path may call this —
 * if a label ever reaches a binding comparison, the whole physical-position scheme has been
 * undone.
 */
export function labelFor(code: string, layout: Layout): string {
  if (layout !== "azerty") return code.replace(/^Key/, "").replace(/^Digit/, "");

  // AZERTY's top letter row is AZERTYUIOP, shifted by one from QWERTY's QWERTYUIOP.
  const azerty: Record<string, string> = {
    KeyQ: "A",
    KeyW: "Z",
    KeyA: "Q",
  };
  return azerty[code] ?? code.replace(/^Key/, "").replace(/^Digit/, "");
}

/**
 * Detect the keyboard layout, for labels only.
 *
 * The probe: press the physical `KeyQ` key. On AZERTY that key is labelled "A"; on QWERTY
 * it is "Q". Cheap, reliable, and needs no locale heuristic.
 */
export function detectLayout(code: string, key: string): Layout | null {
  if (code === "KeyQ" && (key === "a" || key === "A")) return "azerty";
  if (code === "KeyQ" && (key === "q" || key === "Q")) return "qwerty";
  return null;
}
