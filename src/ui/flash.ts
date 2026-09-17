/**
 * Full-screen feedback overlays.
 *
 * Two overlays, both driven from simulation state rather than from ad-hoc timers:
 *
 *   damage  a red vignette pulse when the bee is struck. Without it a hit is felt only as a
 *           number changing, which is easy to miss entirely during a fast pass.
 *   pollen  a warm pulse when a forage completes, so the reward lands at the moment of the
 *           action rather than only when the gauge is next read.
 *
 * Deliberately restrained: no shake, no blur, no chromatic aberration. In this game the player
 * must keep reading the sky, and any effect that costs them a clear view of an incoming bird is
 * a net negative no matter how good it looks.
 */

export class FlashOverlay {
  private readonly damage: HTMLDivElement;
  private readonly reward: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.damage = document.createElement("div");
    this.damage.className = "flash flash--damage";
    parent.appendChild(this.damage);

    this.reward = document.createElement("div");
    this.reward.className = "flash flash--reward";
    parent.appendChild(this.reward);
  }

  /** `intensity` 0..1. Called every frame, so it must be cheap and idempotent. */
  setDamage(intensity: number): void {
    this.damage.style.opacity = intensity <= 0 ? "0" : String(Math.min(intensity, 1) * 0.55);
  }

  setReward(intensity: number): void {
    this.reward.style.opacity = intensity <= 0 ? "0" : String(Math.min(intensity, 1) * 0.3);
  }
}

export function installFlashStyles(): void {
  if (document.getElementById("flash-styles")) return;

  const style = document.createElement("style");
  style.id = "flash-styles";
  style.textContent = `
    .flash {
      position: fixed; inset: 0; pointer-events: none; z-index: 10;
      transition: opacity 90ms linear;
    }
    .flash--damage {
      opacity: 0;
      background: radial-gradient(ellipse at center, rgba(0,0,0,0) 42%, rgba(190,20,20,0.9) 100%);
    }
    .flash--reward {
      opacity: 0;
      background: radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(240,190,40,0.55) 100%);
    }
  `;
  document.head.appendChild(style);
}
