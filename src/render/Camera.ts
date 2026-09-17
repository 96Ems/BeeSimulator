/**
 * Third-person follow camera. DESIGN §5.2, ARCHITECTURE §6.4.
 *
 * Two feel decisions carry this file:
 *
 *   1. **The follow frame uses yaw only, never roll.** A camera that rolls with the bee is
 *      genuinely nauseating and makes the horizon useless as an attitude reference.
 *   2. **The camera lags.** It is dragged toward its ideal position rather than snapped
 *      there, so fast direction changes leave the bee visibly ahead of the frame. That
 *      trailing is what sells speed — more than the field-of-view trick does.
 */

import { PerspectiveCamera, Vector3 } from "three";
import { CAMERA, FLIGHT } from "../data/tuning";
import type { RenderBee } from "./interpolation";

export class FollowCamera {
  readonly camera: PerspectiveCamera;

  private readonly desiredPosition = new Vector3();
  private readonly smoothedPosition = new Vector3();
  private readonly lookTarget = new Vector3();
  private readonly smoothedLook = new Vector3();
  private initialized = false;

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(CAMERA.fov, aspect, CAMERA.near, CAMERA.far);
  }

  /**
   * Snap straight to the ideal framing, without any lag.
   *
   * Used on spawn and respawn. Without it, the camera would start at the origin and slide
   * across the whole world to reach the bee, which looks like a bug.
   */
  reset(bee: RenderBee): void {
    this.computeIdeal(bee, this.desiredPosition, this.lookTarget);
    this.smoothedPosition.copy(this.desiredPosition);
    this.smoothedLook.copy(this.lookTarget);
    this.apply();
    this.initialized = true;
  }

  update(bee: RenderBee, dt: number): void {
    if (!this.initialized) {
      this.reset(bee);
      return;
    }

    this.computeIdeal(bee, this.desiredPosition, this.lookTarget);

    // Frame-rate independent smoothing, so the camera trails by the same *time* at any fps.
    const positionBlend = 1 - Math.exp(-CAMERA.positionResponse * dt);
    const lookBlend = 1 - Math.exp(-CAMERA.targetResponse * dt);
    this.smoothedPosition.lerp(this.desiredPosition, positionBlend);
    this.smoothedLook.lerp(this.lookTarget, lookBlend);

    // Never let the camera drop below the ground plane, however the bee manoeuvres.
    this.smoothedPosition.y = Math.max(this.smoothedPosition.y, 0.35);

    this.apply();

    // Widen the field of view with speed. Cheap, and it does more for perceived velocity
    // than any amount of motion blur.
    const speedRatio = Math.min(bee.speed / FLIGHT.maxHorizontalSpeed, 1);
    const targetFov = CAMERA.fov + CAMERA.speedFovBoost * speedRatio;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov += (targetFov - this.camera.fov) * positionBlend;
      this.camera.updateProjectionMatrix();
    }
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private computeIdeal(bee: RenderBee, positionOut: Vector3, lookOut: Vector3): void {
    const yaw = bee.attitude.yaw;

    // The bee's forward axis is -Z, so "forward" in the yaw frame is (-sin, 0, -cos).
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);

    positionOut.set(
      bee.position.x - forwardX * CAMERA.offsetBack,
      bee.position.y + CAMERA.offsetUp,
      bee.position.z - forwardZ * CAMERA.offsetBack,
    );

    lookOut.set(
      bee.position.x + forwardX * CAMERA.lookAhead,
      bee.position.y,
      bee.position.z + forwardZ * CAMERA.lookAhead,
    );
  }

  private apply(): void {
    this.camera.position.copy(this.smoothedPosition);
    this.camera.lookAt(this.smoothedLook);
  }
}
