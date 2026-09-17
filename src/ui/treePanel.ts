/**
 * The skill tree panel. DESIGN §9.
 *
 * A DOM overlay rather than a 3D panel inside the hive. The design calls for the tree to be
 * **diegetic** — you fly into a chamber of the hive and open a physical panel (DESIGN §9.4) —
 * and that is still the target. It is deferred because the in-hive version needs hive interior
 * geometry and a camera mode, and neither affects whether the *balance* works. The data model
 * and the interaction are identical either way, so this is a presentation swap later, not a
 * rewrite.
 *
 * Built from plain DOM rather than a canvas: it is text and buttons, the browser already
 * handles focus, scrolling and accessibility, and a canvas UI would be more code for less.
 */

import { BEE } from "../data/tuning";
import { computeRole, type RoleProfile } from "../progression/role";
import { canUnlock, labelOf, TREE, type Investment, type TreeNode } from "../progression/tree";

export type TreePanelCallbacks = {
  /** Called when a node is purchased. Returns the remaining pollen. */
  onPurchase: (nodeId: string, cost: number) => void;
};

export class TreePanel {
  private readonly root: HTMLDivElement;
  private investment: Investment = {};
  private pollen = 0;
  private visible = false;
  private profile: RoleProfile | null = null;

  constructor(
    private readonly parent: HTMLElement,
    private readonly callbacks: TreePanelCallbacks,
  ) {
    this.root = document.createElement("div");
    this.root.id = "tree-panel";
    this.root.style.display = "none";
    this.parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.visible;
  }

  open(investment: Investment, pollen: number): void {
    this.investment = investment;
    this.pollen = pollen;
    this.visible = true;
    this.root.style.display = "block";
    this.render();
  }

  close(): void {
    this.visible = false;
    this.root.style.display = "none";
  }

  toggle(investment: Investment, pollen: number): void {
    if (this.visible) this.close();
    else this.open(investment, pollen);
  }

  /** Refresh the numbers without changing visibility. */
  setState(investment: Investment, pollen: number): void {
    this.investment = investment;
    this.pollen = pollen;
    if (this.visible) this.render();
  }

  private render(): void {
    this.profile = computeRole(this.investment);

    const spent = this.profile.spend;
    const header = `
      <div class="tree-header">
        <div>
          <h2>Hive Panel</h2>
          <p class="tree-sub">
            Pollen available: <strong>${Math.floor(this.pollen)}</strong>
            &nbsp;|&nbsp; Profile: <strong>${this.profile.label}</strong>
          </p>
          <p class="tree-blurb">${this.profile.blurb}</p>
        </div>
        <button class="tree-close" data-close>close (T)</button>
      </div>
    `;

    const branches = TREE.branches
      .map((branch) => {
        const nodes = TREE.nodes.filter((node) => node.branch === branch.id);
        const share = this.profile ? Math.round(this.profile.share[branch.id] * 100) : 0;

        const nodeMarkup = nodes
          .map((node) => this.nodeMarkup(node))
          .join("");

        return `
          <section class="tree-branch tree-branch--${branch.id}">
            <header>
              <h3>${branch.label}${branch.universal ? " <em>universal</em>" : ""}</h3>
              <span class="tree-spend">${spent[branch.id]} pts${
                branch.universal ? "" : ` &middot; ${share}% of role`
              }</span>
              <p>${branch.summary}</p>
            </header>
            <div class="tree-nodes">${nodeMarkup}</div>
          </section>
        `;
      })
      .join("");

    this.root.innerHTML = header + `<div class="tree-branches">${branches}</div>`;

    this.root.querySelector("[data-close]")?.addEventListener("click", () => this.close());

    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-node]")) {
      button.addEventListener("click", () => {
        const nodeId = button.dataset.node;
        if (!nodeId) return;

        const node = TREE.nodes.find((candidate) => candidate.id === nodeId);
        if (!node) return;

        const check = canUnlock(nodeId, this.investment, this.pollen);
        if (!check.ok) return;

        this.callbacks.onPurchase(nodeId, node.tierCost);
      });
    }
  }

  private nodeMarkup(node: TreeNode): string {
    const tier = this.investment[node.id] ?? 0;
    const check = canUnlock(node.id, this.investment, this.pollen);
    const maxed = tier >= node.maxTier;

    const state = maxed ? "maxed" : check.ok ? "available" : "locked";
    const tierPips = Array.from({ length: node.maxTier }, (_, index) =>
      index < tier ? "*" : "-",
    ).join("");

    // A locked node must say *why*. "Why can't I click this?" is the single most common
    // question a skill tree has to answer, and a greyed-out box answers none of it.
    const hint = maxed
      ? "max tier"
      : check.ok
        ? `buy for ${node.tierCost}`
        : check.reason;

    const kindBadge =
      node.kind === "passive"
        ? ""
        : `<span class="tree-kind">${node.kind === "active_instant" ? "ACTIVE" : "ACTIVE - COMMITS FLIGHT"}</span>`;

    const requires =
      node.requires.length > 0 && tier === 0
        ? `<span class="tree-req">needs ${node.requires.map(labelOf).join(", ")}</span>`
        : "";

    return `
      <div class="tree-node tree-node--${state}">
        <button data-node="${node.id}" ${state === "available" ? "" : "disabled"}>
          <span class="tree-tier">${tierPips}</span>
          <span class="tree-label">${node.label}</span>
          <span class="tree-cost">${node.tierCost}</span>
        </button>
        ${kindBadge}
        <p class="tree-desc">${node.description}</p>
        <p class="tree-hint">${hint}</p>
        ${requires}
      </div>
    `;
  }
}

/** Styles, injected once so the panel is self-contained. */
export function installTreePanelStyles(): void {
  if (document.getElementById("tree-panel-styles")) return;

  const style = document.createElement("style");
  style.id = "tree-panel-styles";
  style.textContent = `
    #tree-panel {
      position: fixed; inset: 0; z-index: 20; overflow-y: auto;
      background: rgba(6, 10, 12, 0.94);
      color: #e8f0e8;
      font: 12px/1.5 ui-monospace, "Cascadia Mono", Consolas, monospace;
      padding: 20px 26px 60px;
    }
    #tree-panel h2 { margin: 0 0 4px; font-size: 18px; letter-spacing: 0.06em; color: #ffe9a8; }
    #tree-panel h3 { margin: 0 0 2px; font-size: 13px; color: #b9f0c4; }
    #tree-panel h3 em { color: #7d8f85; font-style: normal; font-size: 10px; }
    #tree-panel p { margin: 0 0 6px; color: #9fb0a6; }
    .tree-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
    .tree-sub { font-size: 13px; color: #d8e6dc; }
    .tree-blurb { font-style: italic; }
    .tree-close {
      background: #24302a; color: #cfe6d4; border: 1px solid #3d5044;
      padding: 6px 12px; cursor: pointer; font: inherit; border-radius: 4px;
    }
    .tree-close:hover { background: #2f3f37; }
    .tree-branches { display: grid; gap: 18px; margin-top: 18px; }
    .tree-branch { border-left: 3px solid #3d5044; padding-left: 14px; }
    .tree-branch--foraging { border-color: #d8b62a; }
    .tree-branch--hardiness { border-color: #b8652a; }
    .tree-branch--offense { border-color: #c03030; }
    .tree-branch--mobility { border-color: #2f9ec4; }
    .tree-spend { font-size: 10px; color: #7d8f85; }
    .tree-nodes { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .tree-node { width: 210px; border: 1px solid #2a3630; border-radius: 4px; padding: 6px 8px; }
    .tree-node--available { border-color: #4f7a5e; background: rgba(60, 110, 80, 0.14); }
    .tree-node--maxed { border-color: #7a6a2f; background: rgba(120, 100, 40, 0.16); }
    .tree-node--locked { opacity: 0.55; }
    .tree-node button {
      all: unset; display: flex; gap: 8px; align-items: baseline; width: 100%;
      cursor: pointer; font: inherit;
    }
    .tree-node button:disabled { cursor: not-allowed; }
    .tree-tier { color: #ffe9a8; letter-spacing: 0.15em; }
    .tree-label { flex: 1; color: #e8f0e8; }
    .tree-cost { color: #9fb0a6; }
    .tree-kind { display: inline-block; margin-top: 3px; font-size: 9px; color: #f0a05a; letter-spacing: 0.08em; }
    .tree-desc { font-size: 10px; margin: 4px 0 2px !important; }
    .tree-hint { font-size: 10px; color: #7d8f85 !important; margin: 0 !important; }
    .tree-req { font-size: 10px; color: #c08080; }
  `;
  document.head.appendChild(style);
}

void BEE;
