import { PerspectiveCamera, Vector3 } from "three";

const LOOK_SENSITIVITY = 0.0024;
const MOVE_SPEED = 14; // m/s
const SPRINT_MULTIPLIER = 4;

/**
 * A free-fly camera for inspecting the scene.
 *
 * This is scaffolding, not the game camera. It exists so M0's world can be eyeballed and the
 * scale verified before there is anything to pilot. The third-person follow camera of
 * DESIGN §5.2 replaces it at M1, and its input handling is throwaway — the real input system
 * (`src/input/`, physical-position bindings) does not exist yet, so raw events here are fine.
 *
 * Controls: drag to look, WASD to move, Q/E for down/up, Shift to sprint.
 */
export class DebugCamera {
  readonly camera: PerspectiveCamera;

  private readonly held = new Set<string>();
  private readonly abort = new AbortController();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly worldUp = new Vector3(0, 1, 0);

  private yaw = 0;
  private pitch = -0.28;
  private dragging = false;
  private pointerX = 0;
  private pointerY = 0;

  constructor(fov: number, aspect: number, near: number, far: number, start: Vector3) {
    this.camera = new PerspectiveCamera(fov, aspect, near, far);
    this.camera.position.copy(start);
  }

  attach(element: HTMLElement): void {
    const { signal } = this.abort;

    element.addEventListener(
      "pointerdown",
      (event: PointerEvent) => {
        this.dragging = true;
        this.pointerX = event.clientX;
        this.pointerY = event.clientY;
        element.setPointerCapture(event.pointerId);
      },
      { signal },
    );

    element.addEventListener(
      "pointerup",
      (event: PointerEvent) => {
        this.dragging = false;
        element.releasePointerCapture(event.pointerId);
      },
      { signal },
    );

    element.addEventListener(
      "pointermove",
      (event: PointerEvent) => {
        if (!this.dragging) return;
        const dx = event.clientX - this.pointerX;
        const dy = event.clientY - this.pointerY;
        this.pointerX = event.clientX;
        this.pointerY = event.clientY;

        this.yaw -= dx * LOOK_SENSITIVITY;
        // Clamp to just under a right angle: at exactly +/- 90 degrees the view vector
        // becomes parallel to world-up and the camera rolls unpredictably.
        this.pitch = clamp(this.pitch - dy * LOOK_SENSITIVITY, -1.55, 1.55);
      },
      { signal },
    );

    window.addEventListener(
      "keydown",
      (event: KeyboardEvent) => {
        this.held.add(event.code);
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

    // Without this, a key held while the tab loses focus stays held forever.
    window.addEventListener("blur", () => this.held.clear(), { signal });

    this.applyOrientation();
  }

  update(dt: number): void {
    this.applyOrientation();

    const speed = MOVE_SPEED * (this.held.has("ShiftLeft") ? SPRINT_MULTIPLIER : 1) * dt;

    // Horizontal basis: the camera's yaw only. Deriving forward from the full view vector
    // would make W fly upwards when looking at the sky, which is disorienting in a survey tool.
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.crossVectors(this.forward, this.worldUp).normalize();

    if (this.held.has("KeyW")) this.camera.position.addScaledVector(this.forward, speed);
    if (this.held.has("KeyS")) this.camera.position.addScaledVector(this.forward, -speed);
    if (this.held.has("KeyD")) this.camera.position.addScaledVector(this.right, speed);
    if (this.held.has("KeyA")) this.camera.position.addScaledVector(this.right, -speed);
    if (this.held.has("KeyE")) this.camera.position.y += speed;
    if (this.held.has("KeyQ")) this.camera.position.y -= speed;
  }

  dispose(): void {
    this.abort.abort();
  }

  private applyOrientation(): void {
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
