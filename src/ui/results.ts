/**
 * Session end. DESIGN §10.2.
 *
 * The session is five minutes (DESIGN §10.1) rather than a run that ends in failure, because
 * the objective is a score rather than survival. A hard fail state would fight the timer: the
 * player would either die early and lose the session, or survive and have nothing to compare.
 *
 * The score breakdown deliberately leads with **pollen per minute** rather than total pollen.
 * Total rewards time spent; the ratio rewards routing decisions, which is the actual skill the
 * game is about — and a player who is optimising the ratio will naturally start taking the
 * risks that make the game interesting.
 */

export type SessionSummary = {
  deposited: number;
  trips: number;
  bestTrip: number;
  pollenPerMinute: number;
  hitsTaken: number;
  cleanTrips: number;
  bestPollenPerMinute: number;
  bestSession: number;
  pollenBanked: number;
  newRecords: string[];
};

export class ResultsScreen {
  private readonly root: HTMLDivElement;
  private visible = false;

  constructor(private readonly parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "results-screen";
    this.root.style.display = "none";
    this.parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.visible;
  }

  show(summary: SessionSummary): void {
    this.visible = true;
    this.root.style.display = "flex";

    const recordLines =
      summary.newRecords.length > 0
        ? `<p class="results-record">NEW RECORD: ${summary.newRecords.join(", ")}</p>`
        : "";

    const cleanRate =
      summary.trips > 0 ? Math.round((summary.cleanTrips / summary.trips) * 100) : 0;

    this.root.innerHTML = `
      <div class="results-card">
        <h2>Session complete</h2>

        <div class="results-headline">
          <div>
            <span class="results-value">${Math.round(summary.pollenPerMinute)}</span>
            <span class="results-unit">pollen / minute</span>
          </div>
          <div class="results-secondary">
            <span>${summary.deposited} delivered</span>
            <span>${summary.trips} trips</span>
          </div>
        </div>

        <table class="results-table">
          <tr><td>Best single trip</td><td>${summary.bestTrip}</td></tr>
          <tr><td>Best trip ever</td><td>${summary.bestPollenPerMinute > 0 ? summary.bestPollenPerMinute : 0} /min</td></tr>
          <tr><td>Clean trips</td><td>${summary.cleanTrips} / ${summary.trips} (${cleanRate}%)</td></tr>
          <tr><td>Hits taken</td><td>${summary.hitsTaken}</td></tr>
          <tr><td>Best session ever</td><td>${summary.bestSession}</td></tr>
        </table>

        <p class="results-banked">
          <strong>${summary.pollenBanked}</strong> pollen banked for the hive.
          Press <strong>T</strong> to spend it in the tree.
        </p>

        ${recordLines}

        <button class="results-restart" data-restart>Fly again (Enter)</button>
      </div>
    `;

    this.root.querySelector("[data-restart]")?.addEventListener("click", () => this.close());
  }

  close(): void {
    this.visible = false;
    this.root.style.display = "none";
  }
}

export function installResultsStyles(): void {
  if (document.getElementById("results-styles")) return;

  const style = document.createElement("style");
  style.id = "results-styles";
  style.textContent = `
    #results-screen {
      position: fixed; inset: 0; z-index: 30; display: flex;
      align-items: center; justify-content: center;
      background: rgba(6, 10, 12, 0.9);
      color: #e8f0e8;
      font: 13px/1.6 ui-monospace, "Cascadia Mono", Consolas, monospace;
    }
    .results-card {
      width: 460px; padding: 24px 28px; border-radius: 8px;
      background: #111a16; border: 1px solid #2c3a32;
    }
    .results-card h2 { margin: 0 0 16px; font-size: 16px; letter-spacing: 0.1em; color: #ffe9a8; }
    .results-headline { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 18px; }
    .results-value { font-size: 34px; color: #b9f0c4; }
    .results-unit { display: block; font-size: 10px; color: #7d8f85; letter-spacing: 0.1em; }
    .results-secondary { text-align: right; color: #9fb0a6; font-size: 12px; }
    .results-secondary span { display: block; }
    .results-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    .results-table td { padding: 3px 0; color: #9fb0a6; }
    .results-table td:last-child { text-align: right; color: #e8f0e8; }
    .results-banked { color: #d8e6dc; }
    .results-record { color: #ffe9a8; }
    .results-restart {
      margin-top: 18px; width: 100%; padding: 9px;
      background: #24302a; color: #cfe6d4; border: 1px solid #3d5044;
      font: inherit; cursor: pointer; border-radius: 4px;
    }
    .results-restart:hover { background: #2f3f37; }
  `;
  document.head.appendChild(style);
}
