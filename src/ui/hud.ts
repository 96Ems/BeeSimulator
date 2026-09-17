/**
 * Debug overlay.
 *
 * Deliberately a single monospace block rather than a designed HUD. This is the M1
 * flight-tuning instrument: while dialling in the model, the numbers that matter are speed,
 * altitude, attitude and the stabilization state, and they need to be readable at a glance
 * without looking away from the horizon.
 */

export type HudInfo = {
  fps: number;
  frameMs: number;
  draws: number;
  triangles: number;
  simSteps: number;

  speed: number;
  verticalSpeed: number;
  altitude: number;
  distanceFromHive: number;

  yaw: number;
  pitch: number;
  roll: number;
  stabilized: boolean;

  scheme: string;
  pointerLocked: boolean;
  layout: string;
};

const DEG = 180 / Math.PI;

export class Hud {
  constructor(private readonly element: HTMLElement) {}

  update(info: HudInfo): void {
    const stabilizeState = info.stabilized ? "AUTO (level)" : "manual";

    this.element.textContent = [
      `fps     ${info.fps.toFixed(0).padStart(3)}   ${info.frameMs.toFixed(1)} ms   ${info.simSteps} sim step/frame`,
      `draws   ${info.draws}    tris ${info.triangles.toLocaleString("en-US")}`,
      ``,
      `speed   ${info.speed.toFixed(1).padStart(5)} m/s   (vertical ${info.verticalSpeed >= 0 ? "+" : ""}${info.verticalSpeed.toFixed(1)})`,
      `alt     ${info.altitude.toFixed(1).padStart(5)} m     hive ${info.distanceFromHive.toFixed(1)} m`,
      `att     yaw ${(info.yaw * DEG).toFixed(0).padStart(4)}deg  pitch ${(info.pitch * DEG).toFixed(0).padStart(4)}deg  roll ${(info.roll * DEG).toFixed(0).padStart(4)}deg`,
      `stick   ${stabilizeState}`,
      ``,
      `input   ${info.scheme}  (${info.layout} labels)${info.scheme === "mouse" && !info.pointerLocked ? "   CLICK TO CAPTURE MOUSE" : ""}`,
      ``,
      `  W / Z   nose down  (accelerate)      I / K   climb / descend`,
      `  S       nose up    (brake)           J / L   yaw left / right`,
      `  A / Q   roll left                    M       toggle mouse / keyboard`,
      `  D       roll right                   R       respawn at hive`,
    ].join("\n");
  }
}
