/**
 * Fixed-timestep game loop. AGENTS.md §4, constraint 2.
 *
 * The simulation always advances in exact 1/60 s increments, regardless of how fast the
 * display refreshes. This is not a networking nicety bolted on early: it is a *flight
 * quality* requirement. The integrator composes attitude into a thrust vector, so with a
 * variable `delta` a frame hitch changes the result and the bee behaves differently at
 * 60 Hz and 144 Hz — which makes tuning meaningless.
 *
 * It also gives the renderer a remainder (`alpha`) to interpolate with, so display rate and
 * simulation rate are genuinely independent.
 */

/**
 * Maximum simulation steps allowed in one frame.
 *
 * Eight steps is ~133 ms of catch-up. Beyond that the frame is dropped rather than
 * simulated: after a breakpoint or a long stall, simulating the whole gap would freeze the
 * tab, and the player would rather lose a fifth of a second than the whole session.
 */
const MAX_CATCHUP_STEPS = 8;

export class FixedStepLoop {
  private accumulator = 0;
  private stepsLastFrame = 0;

  constructor(
    private readonly stepSeconds: number,
    private readonly onStep: (dt: number) => void,
  ) {}

  /**
   * Feed in a real frame delta and run however many fixed steps it earned.
   *
   * `frameSeconds` should already be clamped by the caller to guard against the tab being
   * backgrounded for minutes.
   */
  advance(frameSeconds: number): void {
    this.accumulator += frameSeconds;
    this.stepsLastFrame = 0;

    while (this.accumulator >= this.stepSeconds && this.stepsLastFrame < MAX_CATCHUP_STEPS) {
      this.onStep(this.stepSeconds);
      this.accumulator -= this.stepSeconds;
      this.stepsLastFrame += 1;
    }

    // Ran out of catch-up budget: discard the backlog instead of accruing debt that would
    // cause a spiral of death on the following frames.
    if (this.stepsLastFrame >= MAX_CATCHUP_STEPS) {
      this.accumulator = 0;
    }
  }

  /**
   * How far between the last two simulation states we are, 0..1.
   *
   * The renderer lerps between the previous and current snapshots by this amount, so motion
   * is smooth on a 144 Hz display driven by a 60 Hz simulation (ARCHITECTURE §6.1).
   */
  get alpha(): number {
    return this.accumulator / this.stepSeconds;
  }

  get steps(): number {
    return this.stepsLastFrame;
  }
}
