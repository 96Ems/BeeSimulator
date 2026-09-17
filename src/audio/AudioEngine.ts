/**
 * Procedural audio.
 *
 * Nothing here loads a file. Every sound is synthesised with the Web Audio API, for the same
 * reason the wing flap is procedural: the sources are continuous and modulated by game state,
 * and would be worse as samples. A speed-linked buzz cannot be a clip, and a dive warning whose
 * pitch tracks an incoming bird must be a parameter.
 *
 * The gameplay requirement this exists to satisfy is in M3's acceptance criteria: threats must
 * be **audible from any direction**. A bird diving from behind is unfair if the only warning is
 * visual, because the player's field of view is behind the bee. So the warning is stereo-panned
 * by the threat's bearing relative to the bee's *heading*, and its gain rises with proximity.
 *
 * Everything is best-effort. If the AudioContext cannot start, the game plays silently rather
 * than failing: audio is important, but it is not load-bearing.
 */

import type { EnemyKind } from "../sim/entities/enemies";
import type { SimEvent } from "../sim/events";

/** Master gain, low enough to sit under a human voice during playtesting. */
const MASTER_GAIN = 0.34;

type Point = { x: number; y: number; z: number };

export type ThreatCue = {
  kind: EnemyKind;
  position: Point;
  distance: number;
};

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;

  /** Continuous buzz. */
  private beeOsc: OscillatorNode | null = null;
  private beeGain: GainNode | null = null;

  /** The wing-beat tremolo, which is what makes it read as an insect rather than a tone. */
  private tremolo: OscillatorNode | null = null;

  /** A dedicated voice for dive warnings, so they cannot be masked by the buzz. */
  private warningOsc: OscillatorNode | null = null;
  private warningGain: GainNode | null = null;
  private warningPan: StereoPannerNode | null = null;

  private started = false;
  private muted = false;

  /**
   * Start the audio graph. Must be called from a user gesture: every browser blocks audio
   * until then, and an `AudioContext` created outside one starts suspended.
   */
  async start(): Promise<void> {
    if (this.started) {
      await this.context?.resume();
      return;
    }

    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;

      const context = new Ctor();
      this.context = context;

      const master = context.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(context.destination);
      this.master = master;

      this.buildBuzz();
      this.buildWarning();

      this.started = true;
      await context.resume();
    } catch {
      // No Web Audio, or it refused to start. Silent is a valid outcome.
      this.context = null;
      this.master = null;
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;

    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : MASTER_GAIN,
        this.context.currentTime,
        0.05,
      );
    }
    return this.muted;
  }

  // ── continuous voices ──────────────────────────────────────────────────────────

  /**
   * The bee's own buzz: a sawtooth through a lowpass, with a fast amplitude tremolo.
   *
   * A bare oscillator reads as a test tone. The tremolo at the wing-beat rate is what makes it
   * sound like an insect, and it doubles as the channel for speed: faster wings, higher pitch,
   * exactly as a real bee does when it labours.
   */
  private buildBuzz(): void {
    const context = this.context;
    if (!context || !this.master) return;

    const osc = context.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 190;

    const gain = context.createGain();
    gain.gain.value = 0;

    const tremolo = context.createOscillator();
    tremolo.type = "sine";
    tremolo.frequency.value = 26;

    const tremoloDepth = context.createGain();
    tremoloDepth.gain.value = 0.55;

    // A lowpass keeps the sawtooth buzzy without being piercing.
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;

    // Bias the tremolo so it modulates around 0.45 rather than around 0, which would otherwise
    // clip the negative half of the waveform.
    const bias = context.createConstantSource();
    bias.offset.value = 0.45;

    tremolo.connect(tremoloDepth);
    tremoloDepth.connect(gain.gain);
    bias.connect(gain.gain);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    osc.start();
    tremolo.start();
    bias.start();

    this.beeOsc = osc;
    this.beeGain = gain;
    this.tremolo = tremolo;
  }

  /** The warning voice, silent until a threat is closing. */
  private buildWarning(): void {
    const context = this.context;
    if (!context || !this.master) return;

    const osc = context.createOscillator();
    osc.type = "square";
    osc.frequency.value = 700;

    const gain = context.createGain();
    gain.gain.value = 0;

    const pan = context.createStereoPanner();
    pan.pan.value = 0;

    osc.connect(gain);
    gain.connect(pan);
    pan.connect(this.master);

    osc.start();

    this.warningOsc = osc;
    this.warningGain = gain;
    this.warningPan = pan;
  }

  /** Drive the buzz from the bee's speed and load. Called every frame. */
  updateBee(speed: number, maxSpeed: number, pollenRatio: number): void {
    const context = this.context;
    if (!context || !this.beeOsc || !this.beeGain || !this.tremolo) return;

    const now = context.currentTime;
    const ratio = Math.min(speed / Math.max(maxSpeed, 0.001), 1);

    // A loaded bee labours: the pollen ratio drags the pitch down and the amplitude up, which is
    // the audio version of the visible pollen bulge.
    const pitch = 175 + ratio * 130 - pollenRatio * 18;
    const amplitude = 0.16 + ratio * 0.16 + pollenRatio * 0.06;

    this.beeOsc.frequency.setTargetAtTime(pitch, now, 0.08);
    this.tremolo.frequency.setTargetAtTime(22 + ratio * 34, now, 0.08);
    this.beeGain.gain.setTargetAtTime(amplitude, now, 0.1);
  }

  /**
   * Point the warning voice at the nearest threat.
   *
   * The pan is computed from the threat's bearing **relative to the bee's heading**, not to the
   * world. That is the whole point: the cue has to tell the player which way to turn, and "down
   * the world's -X axis" means nothing once you have turned around.
   */
  updateThreat(threat: ThreatCue | null, bee: { position: Point; yaw: number }): void {
    const context = this.context;
    if (!context || !this.warningOsc || !this.warningGain || !this.warningPan) return;

    const now = context.currentTime;

    if (!threat) {
      this.warningGain.gain.setTargetAtTime(0, now, 0.12);
      return;
    }

    const dx = threat.position.x - bee.position.x;
    const dz = threat.position.z - bee.position.z;

    // Project onto the bee's right axis. Forward is -Z at yaw 0, so right is +X.
    const rightX = Math.cos(bee.yaw);
    const rightZ = -Math.sin(bee.yaw);
    const lateral = dx * rightX + dz * rightZ;

    const horizontal = Math.max(Math.hypot(dx, dz), 0.001);
    // Clamped so a threat directly overhead stays audible in both ears rather than snapping to
    // one side, which would be a lie about where it is.
    const pan = Math.max(-1, Math.min(1, lateral / horizontal));
    this.warningPan.pan.setTargetAtTime(pan, now, 0.05);

    // Gain rises as it closes, capped so a dive never clips.
    const proximity = Math.max(0, 1 - threat.distance / 60);
    const urgency = threat.kind === "bird" ? 1 : threat.kind === "wasp" ? 0.7 : 0.6;
    this.warningGain.gain.setTargetAtTime(proximity * urgency * 0.14, now, 0.08);

    // The whistle descends as it closes. A falling pitch reads as "incoming" without needing to
    // be learned, and the cue is identical whether or not the bird is on screen.
    this.warningOsc.frequency.setTargetAtTime(760 - proximity * 340, now, 0.1);
  }

  // ── one-shot voices ────────────────────────────────────────────────────────────

  /** Play the sounds implied by this step's simulation events. */
  playEvents(events: readonly SimEvent[]): void {
    for (const event of events) {
      switch (event.kind) {
        case "completed":
          this.blip(880, 1320, 0.09, 0.12);
          break;
        case "deposited":
          // A rising pair: the only unambiguously *good* sound in the game, which is what makes
          // banking pollen feel like a reward rather than a chore.
          this.blip(660, 990, 0.1, 0.14);
          this.blip(990, 1480, 0.12, 0.1, 0.06);
          break;
        case "enemyStung":
          this.noise(0.05, 0.11, 2600);
          break;
        case "enemyKilled":
          this.blip(420, 160, 0.16, 0.13);
          break;
        case "enemyRepelled":
          this.blip(300, 620, 0.3, 0.12);
          break;
        case "beeHit":
          // Low and blunt. A bright sound would read as an achievement rather than a mistake.
          this.noise(0.24, 0.2, 420);
          this.blip(180, 90, 0.22, 0.16);
          break;
        case "pollenStolen":
          this.blip(520, 340, 0.14, 0.1);
          break;
        case "full":
          this.blip(300, 300, 0.1, 0.06);
          break;
        case "interrupted":
        case "started":
        case "progress":
          break;
        default:
          break;
      }
    }
  }

  /** A short tone that glides from one frequency to another. */
  private blip(from: number, to: number, duration: number, gain: number, delay = 0): void {
    const context = this.context;
    if (!context || !this.master) return;

    const start = context.currentTime + delay;
    const osc = context.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), start + duration);

    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(gain, start + 0.008);
    // Exponential rather than linear decay: a linear fade sounds like a switch, an exponential
    // one sounds like a struck object.
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(envelope);
    envelope.connect(this.master);

    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /**
   * A filtered noise burst.
   *
   * Used for impacts. Noise through a lowpass reads as a physical thud, where the same envelope
   * on an oscillator reads as a musical note — which is wrong for a collision.
   */
  private noise(duration: number, gain: number, cutoff: number): void {
    const context = this.context;
    if (!context || !this.master) return;

    const frames = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < frames; i += 1) {
      // The decay is baked into the buffer, so no envelope node is needed.
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }

    const source = context.createBufferSource();
    source.buffer = buffer;

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;

    const envelope = context.createGain();
    envelope.gain.value = gain;

    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.master);

    source.start();
  }

  /** Silence the continuous voices, e.g. when the tab loses focus or a panel opens. */
  silence(): void {
    const context = this.context;
    if (!context) return;

    this.beeGain?.gain.setTargetAtTime(0, context.currentTime, 0.05);
    this.warningGain?.gain.setTargetAtTime(0, context.currentTime, 0.05);
  }
}
