/**
 * Device input -> `InputCommand`.
 *
 * This layer knows about keyboards, mice and pointer lock. It does **not** know that a
 * simulation exists, and the simulation does not know it exists either: they meet at the
 * `InputCommand` structure (ARCHITECTURE §1, constraint 3).
 *
 * Two schemes are supported and both are first-class (DESIGN §5):
 *
 *   mouse    - the mouse is the cyclic stick. Pitch and roll only; the keyboard still owns
 *              collective and yaw. Requires pointer lock.
 *   keyboard - the full-keyboard scheme, no mouse needed at all.
 *
 * Both funnel into the same command, including the shared idle timer that drives
 * auto-stabilization, which is why assistance behaves identically either way.
 */

import { INPUT } from "../data/tuning";
import type { InputCommand } from "../sim/commands";
import { neutralCommand } from "../sim/commands";
import {
  ACTIONS,
  detectLayout,
  type Action,
  type Bindings,
  type Layout,
  PHYSICAL_PRESET,
  PRESETS,
} from "./bindings";

export type Scheme = "mouse" | "keyboard";

/** Clamp a stick axis into the legal command range. */
function axis(value: number): number {
  return value < -1 ? -1 : value > 1 ? 1 : value;
}

export class InputManager {
  private readonly held = new Set<string>();
  private readonly abort = new AbortController();

  private bindings: Bindings = { ...PHYSICAL_PRESET };
  private scheme: Scheme = "mouse";
  private layout: Layout = "qwerty";
  private layoutResolved = false;

  /** Virtual stick for the mouse scheme, in -1..1. Decays back to centre when idle. */
  private mousePitch = 0;
  private mouseRoll = 0;

  private pointerLocked = false;

  /** Edge-triggered actions, latched on keydown and cleared when sampled. */
  private pendingSting = false;
  private pendingDash = false;

  private readonly command: InputCommand = neutralCommand();

  constructor(private readonly element: HTMLElement) {}

  attach(): void {
    const { signal } = this.abort;

    window.addEventListener(
      "keydown",
      (event: KeyboardEvent) => {
        if (event.repeat) {
          // Auto-repeat must not re-latch edge-triggered actions, and holding a key is
          // already tracked by the `held` set.
          if (this.bindings.sting !== event.code && this.bindings.dash !== event.code) {
            event.preventDefault();
          }
          return;
        }

        if (!this.layoutResolved) {
          const detected = detectLayout(event.code, event.key);
          if (detected) {
            this.layout = detected;
            this.layoutResolved = true;
          }
        }

        this.held.add(event.code);

        if (event.code === this.bindings.sting) this.pendingSting = true;
        if (event.code === this.bindings.dash) this.pendingDash = true;

        // Space scrolls the page and the arrows move the caret; neither is wanted in a game.
        if (event.code === "Space" || event.code.startsWith("Arrow")) {
          event.preventDefault();
        }
      },
      { signal },
    );

    window.addEventListener(
      "keyup",
      (event: KeyboardEvent) => {
        this.held.delete(event.code);
      },
      { signal },
    );

    // Without this, a key held while the tab loses focus stays held forever — the bee flies
    // away on its own and the player comes back to a lost session.
    window.addEventListener("blur", () => this.releaseAll(), { signal });

    this.element.addEventListener(
      "mousedown",
      () => {
        if (this.scheme === "mouse" && !this.pointerLocked) {
          void this.element.requestPointerLock();
        }
      },
      { signal },
    );

    document.addEventListener(
      "pointerlockchange",
      () => {
        this.pointerLocked = document.pointerLockElement === this.element;
      },
      { signal },
    );

    document.addEventListener(
      "mousemove",
      (event: MouseEvent) => {
        if (this.scheme !== "mouse" || !this.pointerLocked) return;

        // The mouse commands a *rate*, not an attitude. Pushing forward pitches the nose
        // down — which, because thrust follows attitude, is the accelerator (DESIGN §4.1).
        this.mousePitch = axis(this.mousePitch - event.movementY * INPUT.mouseSensitivity);
        this.mouseRoll = axis(this.mouseRoll + event.movementX * INPUT.mouseSensitivity);
      },
      { signal },
    );
  }

  /**
   * Produce the command for this frame.
   *
   * The command is sampled once per frame and reused for every fixed step in that frame.
   * Input is inherently frame-quantised; trying to interpolate it across steps would add
   * jitter, not fidelity.
   */
  sample(dt: number): InputCommand {
    // Mouse stick self-centres, which is what lets auto-stabilization take over after the
    // player stops moving the mouse. There is no "mouse released" event; this decay plus the
    // simulation's idle timer is the honest substitute.
    if (this.scheme === "mouse") {
      const decay = Math.exp(-INPUT.mouseStickReturn * dt);
      this.mousePitch *= decay;
      this.mouseRoll *= decay;
      if (Math.abs(this.mousePitch) < 0.001) this.mousePitch = 0;
      if (Math.abs(this.mouseRoll) < 0.001) this.mouseRoll = 0;
    }

    const keyPitchDown = this.held.has(this.bindings.pitchDown) ? 1 : 0;
    const keyPitchUp = this.held.has(this.bindings.pitchUp) ? 1 : 0;
    const keyRollLeft = this.held.has(this.bindings.rollLeft) ? 1 : 0;
    const keyRollRight = this.held.has(this.bindings.rollRight) ? 1 : 0;

    // +1 means nose up. The keyboard maps directly; the mouse axis is already inverted for
    // that convention in the mousemove handler.
    const keyboardPitch = keyPitchUp - keyPitchDown;
    const keyboardRoll = keyRollRight - keyRollLeft;

    const useMouse = this.scheme === "mouse";
    this.command.pitch = axis(useMouse ? this.mousePitch + keyboardPitch : keyboardPitch);
    this.command.roll = axis(useMouse ? this.mouseRoll + keyboardRoll : keyboardRoll);

    this.command.yaw =
      (this.held.has(this.bindings.yawLeft) ? 1 : 0) -
      (this.held.has(this.bindings.yawRight) ? 1 : 0);
    this.command.thrust =
      (this.held.has(this.bindings.climb) ? 1 : 0) - (this.held.has(this.bindings.descend) ? 1 : 0);

    this.command.sting = this.pendingSting;
    this.command.dash = this.pendingDash;
    this.pendingSting = false;
    this.pendingDash = false;

    return this.command;
  }

  releaseAll(): void {
    this.held.clear();
    this.mousePitch = 0;
    this.mouseRoll = 0;
  }

  get currentScheme(): Scheme {
    return this.scheme;
  }

  setScheme(scheme: Scheme): void {
    this.scheme = scheme;
    this.releaseAll();
    if (scheme !== "mouse" && this.pointerLocked) {
      void document.exitPointerLock();
    }
  }

  get keyboardLayout(): Layout {
    return this.layout;
  }

  get isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  getBinding(action: Action): string {
    return this.bindings[action];
  }

  setBinding(action: Action, code: string): void {
    this.bindings[action] = code;
  }

  applyPreset(name: keyof typeof PRESETS): void {
    const preset = PRESETS[name];
    if (preset) this.bindings = { ...preset.bindings };
  }

  /** All bindings, for persistence. */
  snapshotBindings(): Bindings {
    return { ...this.bindings };
  }

  restoreBindings(bindings: Partial<Bindings>): void {
    this.bindings = { ...this.bindings, ...bindings };
  }

  dispose(): void {
    this.abort.abort();
  }
}

export { ACTIONS };
