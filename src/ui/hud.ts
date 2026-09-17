/**
 * Debug overlay and minimal play HUD.
 *
 * A single monospace block rather than a designed interface. During tuning the numbers that
 * matter are speed, altitude, attitude and the stabilization state, and they need to be
 * readable at a glance without looking away from the horizon. The play-critical readouts —
 * pollen, lives, timer, and the nearest threat — sit at the top, because those are the ones
 * the player checks while deciding whether to take one more flower.
 */

export type HudInfo = {
  fps: number;
  draws: number;
  triangles: number;
  simSteps: number;

  speed: number;
  altitude: number;
  distanceFromHive: number;
  pitch: number;
  roll: number;
  stabilized: boolean;

  pollen: number;
  pollenCapacity: number;
  lives: number;
  maxLives: number;

  /** 0..1 while foraging, null when not. */
  forageProgress: number | null;
  forageLabel: string | null;

  /** Seconds left in the session. */
  timeLeft: number;
  deposited: number;
  trips: number;
  pollenPerMinute: number;

  /** Nearest threat, in metres, or null when the sky is clear. */
  threatDistance: number | null;
  threatLabel: string | null;

  /** Spendable pollen, and the emergent role label. */
  banked: number;
  roleLabel: string;

  scheme: string;
  pointerLocked: boolean;
};

export class Hud {
  constructor(private readonly element: HTMLElement) {}

  update(info: HudInfo): void {
    const lines = [
      `POLLEN ${bar(info.pollen, info.pollenCapacity)} ${String(Math.floor(info.pollen)).padStart(3)}/${info.pollenCapacity}`,
      `LIVES  ${"*".repeat(Math.max(0, info.lives))}${".".repeat(Math.max(0, info.maxLives - info.lives))}` +
        `    TIME ${formatClock(info.timeLeft)}`,
      `SCORE  ${String(info.deposited).padStart(4)} pollen   ${info.trips} trips   ` +
        `${info.pollenPerMinute.toFixed(0)}/min`,
      sky(info),
      ``,
      forage(info),
      ``,
      `fps ${info.fps.toFixed(0)}  draws ${info.draws}  ` +
        `tris ${info.triangles.toLocaleString("en-US")}  steps ${info.simSteps}`,
      `spd ${info.speed.toFixed(1)} m/s   alt ${info.altitude.toFixed(1)} m   ` +
        `hive ${info.distanceFromHive.toFixed(0)} m`,
      `att ${deg(info.pitch)} pitch  ${deg(info.roll)} roll   ` +
        `${info.stabilized ? "AUTO (level)" : "manual"}`,
      ``,
      `Z/S pitch    Q/D roll    I/K climb    J/L yaw`,
      `SPACE sting   T hive panel   M scheme (${info.scheme})   N mute   R respawn`,
    ];

    if (info.scheme === "mouse" && !info.pointerLocked) {
      lines.push(`>> CLICK TO CAPTURE MOUSE <<`);
    }

    this.element.textContent = lines.join("\n");
  }
}

function bar(value: number, capacity: number): string {
  const filled = capacity > 0 ? Math.round((value / capacity) * 10) : 0;
  return `[${"#".repeat(filled)}${"-".repeat(10 - filled)}]`;
}

function forage(info: HudInfo): string {
  if (info.forageProgress === null) return `       (approach a flower to forage)`;

  const filled = Math.round(info.forageProgress * 20);
  const label = info.forageLabel ?? "";
  return `FORAGE [${"#".repeat(filled)}${"-".repeat(20 - filled)}] ${(info.forageProgress * 100).toFixed(0)}% ${label}`;
}

/** The nearest threat: the most decision-relevant number on the screen. */
function sky(info: HudInfo): string {
  const line =
    info.threatDistance === null || info.threatLabel === null
      ? `SKY    clear`
      : `SKY    ${info.threatLabel} at ${info.threatDistance.toFixed(0)} m`;

  return line + `    BANK ${Math.floor(info.banked)}    ${info.roleLabel}`;
}

function formatClock(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function deg(radians: number): string {
  return `${((radians * 180) / Math.PI).toFixed(0).padStart(4)}deg`;
}
