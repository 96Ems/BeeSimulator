/**
 * Named file for the settings panel styles.
 *
 * Split from `settingsPanel.ts` only so the CSS can be scanned on its own; it is installed once
 * by `installSettingsStyles`.
 */

export function installSettingsStyles(): void {
  if (document.getElementById("settings-styles")) return;

  const style = document.createElement("style");
  style.id = "settings-styles";
  style.textContent = `
    #settings-panel {
      position: fixed; inset: 0; z-index: 40; overflow-y: auto;
      background: rgba(6, 10, 12, 0.95);
      color: #e8f0e8;
      font: 12px/1.6 ui-monospace, "Cascadia Mono", Consolas, monospace;
      padding: 24px 28px 60px;
    }
    .settings-card { max-width: 640px; margin: 0 auto; }
    .settings-head { display: flex; justify-content: space-between; align-items: center; }
    .settings-head h2 { margin: 0; font-size: 16px; letter-spacing: 0.08em; color: #ffe9a8; }
    .settings-note { color: #8fa096; font-size: 11px; margin: 10px 0 16px; }
    .settings-row { display: flex; gap: 8px; align-items: center; margin: 10px 0; }
    .settings-row > span { width: 64px; color: #8fa096; }
    .settings-bindings { width: 100%; border-collapse: collapse; margin-top: 14px; }
    .settings-bindings td { padding: 3px 6px; border-bottom: 1px solid #1e2823; }
    .settings-bindings td:first-child { color: #9fb0a6; }
    .settings-bindings td:last-child { width: 190px; text-align: right; }
    .settings-card button {
      background: #1c2622; color: #cfe6d4; border: 1px solid #33443a;
      padding: 4px 10px; font: inherit; cursor: pointer; border-radius: 4px;
    }
    .settings-card button:hover { background: #26332d; }
    .bind { min-width: 170px; text-align: left; }
    .bind--capturing { border-color: #ffe9a8 !important; color: #ffe9a8 !important; }
    .scheme.on { background: #2c4a38; border-color: #4f7a5e; color: #d6f5de; }
    .close { align-self: flex-start; }
  `;
  document.head.appendChild(style);
}
