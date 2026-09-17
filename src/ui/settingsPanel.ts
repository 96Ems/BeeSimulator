/**
 * Settings: rebinding, control scheme, and presets. DESIGN §5.6.
 *
 * The rebinding menu is where the physical-position binding design either pays off or does not.
 * Because bindings are stored as `event.code` (physical position) rather than `event.key`
 * (character), **there is only one keyboard preset** — an AZERTY player and a QWERTY player
 * produce identical `code` values from the same physical key. The layout only changes the labels
 * this menu prints, which is why `labelFor` is called here and nowhere in the gameplay path.
 *
 * Two promises this keeps:
 *
 *   1. The full-keyboard scheme is not a degraded fallback. It gets equal billing with the mouse
 *      scheme, because it is the reason the skill keys live on the number row.
 *   2. A player who dislikes a key can change it. Shipping two hard-coded presets and calling it
 *      "configurable" is the thing this menu exists to avoid.
 */

import type { InputManager } from "../input/InputManager";
import { ACTIONS, PRESETS, labelFor, type Action } from "../input/bindings";
import type { Layout } from "../input/bindings";

/** What each action does, in the player's language rather than the code's. */
const ACTION_LABELS: Record<Action, string> = {
  pitchDown: "Nose down (accelerate)",
  pitchUp: "Nose up (brake)",
  rollLeft: "Roll left",
  rollRight: "Roll right",
  climb: "Climb",
  descend: "Descend",
  yawLeft: "Turn left",
  yawRight: "Turn right",
  sting: "Sting",
  dash: "Dash",
};

export type SettingsCallbacks = {
  onBindingsChanged: () => void;
  onSchemeChanged: (scheme: "mouse" | "keyboard") => void;
};

export class SettingsPanel {
  private readonly root: HTMLDivElement;
  private visible = false;
  /** The action awaiting a keypress, or null. */
  private capturing: Action | null = null;

  constructor(
    private readonly parent: HTMLElement,
    private readonly input: InputManager,
    private readonly callbacks: SettingsCallbacks,
  ) {
    this.root = document.createElement("div");
    this.root.id = "settings-panel";
    this.root.style.display = "none";
    this.parent.appendChild(this.root);

    // Capture happens on `keydown` in the capture phase so it pre-empts the gameplay input
    // manager. Without the capture phase the key would also be applied to the bee, and the
    // player would fly away while rebinding.
    window.addEventListener(
      "keydown",
      (event) => {
        if (this.capturing === null) return;

        event.preventDefault();
        event.stopPropagation();

        // Escape cancels rather than binding, because "I pressed the wrong thing" must have an
        // exit and Escape is the universal one.
        if (event.code === "Escape") {
          this.capturing = null;
          this.render();
          return;
        }

        this.input.setBinding(this.capturing, event.code);
        this.capturing = null;
        this.callbacks.onBindingsChanged();
        this.render();
      },
      { capture: true },
    );
  }

  get isOpen(): boolean {
    return this.visible;
  }

  open(): void {
    this.visible = true;
    this.root.style.display = "block";
    // Release held keys: the player was flying when they opened the menu, and a held key would
    // still be in the `held` set otherwise.
    this.input.releaseAll();
    this.render();
  }

  close(): void {
    this.visible = false;
    this.capturing = null;
    this.root.style.display = "none";
  }

  toggle(): void {
    if (this.visible) this.close();
    else this.open();
  }

  private render(): void {
    const layout = this.input.keyboardLayout;
    const scheme = this.input.currentScheme;

    const rows = ACTIONS.map((action) => {
      const code = this.input.getBinding(action);
      const isCapturing = this.capturing === action;
      const label = isCapturing ? "press a key..." : labelFor(code, layout);

      return `
        <tr>
          <td>${ACTION_LABELS[action]}</td>
          <td>
            <button class="bind ${isCapturing ? "bind--capturing" : ""}" data-bind="${action}">
              ${label}
            </button>
          </td>
        </tr>
      `;
    }).join("");

    const presetButtons = Object.entries(PRESETS)
      .map(
        ([key, preset]) =>
          `<button class="preset" data-preset="${key}">${preset.label}</button>`,
      )
      .join("");

    this.root.innerHTML = `
      <div class="settings-card">
        <div class="settings-head">
          <h2>Controls</h2>
          <button class="close" data-close>close (Esc)</button>
        </div>

        <p class="settings-note">
          Bindings are stored by <strong>physical key position</strong>, not by character.
          That is why AZERTY and QWERTY both work with the same settings, and why the labels
          below change but the keys you press do not.
        </p>

        <div class="settings-row">
          <span>Scheme</span>
          <button class="scheme ${scheme === "mouse" ? "on" : ""}" data-scheme="mouse">
            Mouse as stick
          </button>
          <button class="scheme ${scheme === "keyboard" ? "on" : ""}" data-scheme="keyboard">
            Full keyboard
          </button>
        </div>

        <div class="settings-row">
          <span>Preset</span>
          ${presetButtons}
        </div>

        <table class="settings-bindings">${rows}</table>

        <p class="settings-note">
          The <strong>mouse</strong> scheme needs pointer lock: click the canvas to capture the
          mouse, Esc to release. Pitch and roll come from the mouse; collective and yaw stay on
          the keyboard either way.
        </p>
      </div>
    `;

    this.root.querySelector("[data-close]")?.addEventListener("click", () => this.close());

    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-bind]")) {
      button.addEventListener("click", () => {
        this.capturing = button.dataset.bind as Action;
        this.render();
      });
    }

    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-preset]")) {
      button.addEventListener("click", () => {
        this.input.applyPreset(button.dataset.preset ?? "physical");
        this.callbacks.onBindingsChanged();
        this.render();
      });
    }

    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-scheme]")) {
      button.addEventListener("click", () => {
        const next = button.dataset.scheme === "keyboard" ? "keyboard" : "mouse";
        this.input.setScheme(next);
        this.callbacks.onSchemeChanged(next);
        this.render();
      });
    }
  }
}

/** The current layout, for display. Kept next to the panel that needs it. */
export function describeLayout(layout: Layout): string {
  return layout === "azerty" ? "AZERTY detected" : "QWERTY detected";
}
