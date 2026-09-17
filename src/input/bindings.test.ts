import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  ARROW_PRESET,
  detectLayout,
  labelFor,
  PHYSICAL_PRESET,
  PRESETS,
} from "./bindings";

describe("bindings", () => {
  it("defines a key for every action in both presets", () => {
    // A missing action would silently make that control unreachable, and it would look like a
    // gameplay bug rather than a data gap.
    for (const action of ACTIONS) {
      expect(PHYSICAL_PRESET[action], `physical preset missing ${action}`).toBeTruthy();
      expect(ARROW_PRESET[action], `arrow preset missing ${action}`).toBeTruthy();
    }
  });

  it("never binds the same key to two different actions", () => {
    // A duplicate binding means two controls fire together, which reads as a broken game.
    const codes = Object.values(PHYSICAL_PRESET);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("uses physical-position codes rather than characters", () => {
    // The whole layout-independence argument rests on this. A bare "W" or a single letter would
    // break on AZERTY, which is exactly the bug `event.code` exists to prevent.
    for (const code of Object.values(PHYSICAL_PRESET)) {
      expect(code, `${code} is not a KeyboardEvent.code value`).toMatch(
        /^(Key[A-Z]|Digit[0-9]|Arrow[A-Za-z]+|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight|AltLeft|AltRight|Tab|Enter|Escape)$/,
      );
    }
  });

  it("gives the sting and the dash a home reachable without leaving the stick", () => {
    // DESIGN §5.4: Space and Shift are the reflex and emergency actions, and they only work if
    // the thumb and pinky can hold them while the other fingers keep flying.
    expect(PHYSICAL_PRESET.sting).toBe("Space");
    expect(PHYSICAL_PRESET.dash.startsWith("Shift")).toBe(true);
  });

  it("keeps attitude, collective and yaw on separate hands", () => {
    // Left hand owns attitude, right hand owns collective and yaw. If this ever collapses onto
    // one hand the full-keyboard scheme stops being playable, and it is a first-class scheme.
    const left = ["pitchDown", "pitchUp", "rollLeft", "rollRight"];
    const right = ["climb", "descend", "yawLeft", "yawRight"];

    for (const action of left) expect(PHYSICAL_PRESET[action as keyof typeof PHYSICAL_PRESET]).toMatch(/^Key[ZQSWADCXFE]/);
    for (const action of right) expect(PHYSICAL_PRESET[action as keyof typeof PHYSICAL_PRESET]).toMatch(/^Key[IJKLUO]/);
  });
});

describe("labelFor", () => {
  it("prints the AZERTY character for the physical key", () => {
    // The physical key that is labelled Z on AZERTY sits where W sits on QWERTY. The binding is
    // the same either way; only the label changes.
    expect(labelFor("KeyW", "azerty")).toBe("Z");
    expect(labelFor("KeyA", "azerty")).toBe("Q");
    expect(labelFor("KeyQ", "azerty")).toBe("A");
  });

  it("prints the QWERTY character unchanged", () => {
    expect(labelFor("KeyW", "qwerty")).toBe("W");
    expect(labelFor("KeyA", "qwerty")).toBe("A");
  });

  it("leaves keys that are layout-identical alone on AZERTY", () => {
    // Not every key moves: S, D, and the whole number row are in the same place on both.
    expect(labelFor("KeyS", "azerty")).toBe("S");
    expect(labelFor("KeyD", "azerty")).toBe("D");
    expect(labelFor("Digit4", "azerty")).toBe("4");
  });

  it("strips the Key prefix for non-letter keys", () => {
    expect(labelFor("Space", "qwerty")).toBe("Space");
    expect(labelFor("ArrowUp", "qwerty")).toBe("ArrowUp");
  });
});

describe("detectLayout", () => {
  it("identifies AZERTY from the physical KeyQ producing 'a'", () => {
    expect(detectLayout("KeyQ", "a")).toBe("azerty");
  });

  it("identifies QWERTY from the physical KeyQ producing 'q'", () => {
    expect(detectLayout("KeyQ", "q")).toBe("qwerty");
  });

  it("returns null for any other key, so detection waits for the right one", () => {
    // Detection must not guess from an unrelated keypress: a wrong guess would mislabel the
    // whole menu, and the labels are the only thing the layout affects.
    expect(detectLayout("KeyW", "z")).toBeNull();
    expect(detectLayout("Space", " ")).toBeNull();
  });
});

describe("presets", () => {
  it("exposes both presets for the menu", () => {
    expect(Object.keys(PRESETS)).toContain("physical");
    expect(PRESETS.physical?.bindings).toBe(PHYSICAL_PRESET);
  });
});
