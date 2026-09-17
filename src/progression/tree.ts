/**
 * The skill tree. DESIGN §9.
 *
 * The tree **is** the class system. There is no pre-session class pick: the player invests
 * freely and their *build* defines their role, which is what keeps progression meaningful and
 * what keeps solo play viable — a mixed build is mediocre at everything but functional,
 * whereas a committed 90% tank is genuinely unplayable alone. That is correct, but only
 * because it was a choice rather than an obligation.
 *
 * Two properties this module exists to guarantee:
 *
 *   1. **Data-driven.** Adding a node is editing `tree.json`. No code change.
 *   2. **One-way.** Nothing outside this module reads the tree. The simulation only ever sees
 *      the folded `StatBlock`, which is plain numbers, so rebalancing never touches gameplay
 *      code.
 */

import rawTree from "../data/tree.json";

export type BranchId = "foraging" | "hardiness" | "offense" | "mobility";

export type EffectKind =
  | "capacity_add"
  | "forage_speed_mul"
  | "yield_mul"
  | "wind_resist"
  | "takeoff_recovery"
  | "lives_add"
  | "pollen_keep"
  | "invulnerable_bonus"
  | "aggro_shift"
  | "unlock_skill"
  | "damage_resist"
  | "sting_damage"
  | "harassment_mul"
  | "sting_reach"
  | "sting_cooldown"
  | "speed_mul"
  | "turn_mul"
  | "drag_reduction"
  | "climb_mul"
  | "stability_mul";

export type NodeKind = "passive" | "active_instant" | "active_committed";

export type TreeEffect = {
  kind: EffectKind;
  value: number | string;
  /** When true, the value is multiplied by the tier rather than applied once. */
  perTier?: boolean;
};

export type TreeNode = {
  id: string;
  branch: BranchId;
  label: string;
  description: string;
  kind: NodeKind;
  maxTier: number;
  tierCost: number;
  requires: string[];
  effects: TreeEffect[];
  /** Present on active nodes; the key that triggers it. */
  skillId?: string;
  cooldownSeconds?: number;
};

export type TreeBranch = {
  id: BranchId;
  label: string;
  universal: boolean;
  summary: string;
};

export type Tree = {
  version: number;
  branches: TreeBranch[];
  nodes: TreeNode[];
};

export const TREE = rawTree as Tree;

/**
 * The folded result of everything the player has unlocked.
 *
 * Plain numbers only. This is the *entire* interface between progression and gameplay, which
 * is what keeps balancing confined to data.
 */
export type StatBlock = {
  pollenCapacity: number;
  forageSpeedMul: number;
  yieldMul: number;
  windResist: number;
  takeoffRecovery: number;
  maxLives: number;
  pollenKeep: number;
  invulnerableBonus: number;
  aggroShift: number;
  damageResist: number;
  stingDamage: number;
  harassmentMul: number;
  stingReach: number;
  stingCooldownMul: number;
  speedMul: number;
  turnMul: number;
  dragMul: number;
  climbMul: number;
  stabilityMul: number;
  unlockedSkills: string[];
};

/** Unlocked tier per node id. A missing node means tier 0. */
export type Investment = Record<string, number>;

export function createStatBlock(base: {
  pollenCapacity: number;
  maxLives: number;
  stingReach: number;
}): StatBlock {
  return {
    pollenCapacity: base.pollenCapacity,
    forageSpeedMul: 1,
    yieldMul: 1,
    windResist: 0,
    takeoffRecovery: 0,
    maxLives: base.maxLives,
    pollenKeep: 0,
    invulnerableBonus: 0,
    aggroShift: 0,
    damageResist: 0,
    stingDamage: 0,
    harassmentMul: 1,
    stingReach: base.stingReach,
    stingCooldownMul: 1,
    speedMul: 1,
    turnMul: 1,
    dragMul: 1,
    climbMul: 1,
    stabilityMul: 1,
    unlockedSkills: [],
  };
}

/**
 * Fold an investment into a `StatBlock`.
 *
 * Multiplicative effects compose by multiplication and additive ones by addition, which is why
 * each effect declares its own kind rather than the stat block guessing. A `perTier` effect is
 * scaled by the tier; the rest apply once however deep the node goes (which is how an
 * `unlock_skill` node works — the skill is either unlocked or it is not).
 */
export function foldInvestment(
  base: { pollenCapacity: number; maxLives: number; stingReach: number },
  investment: Investment,
): StatBlock {
  const stats = createStatBlock(base);

  for (const node of TREE.nodes) {
    const tier = investment[node.id] ?? 0;
    if (tier <= 0) continue;

    for (const effect of node.effects) {
      const scale = effect.perTier ? tier : 1;

      switch (effect.kind) {
        case "capacity_add":
          stats.pollenCapacity += num(effect.value) * scale;
          break;
        case "forage_speed_mul":
          stats.forageSpeedMul += num(effect.value) * scale;
          break;
        case "yield_mul":
          stats.yieldMul += num(effect.value) * scale;
          break;
        case "wind_resist":
          stats.windResist += num(effect.value) * scale;
          break;
        case "takeoff_recovery":
          stats.takeoffRecovery += num(effect.value) * scale;
          break;
        case "lives_add":
          stats.maxLives += num(effect.value) * scale;
          break;
        case "pollen_keep":
          stats.pollenKeep += num(effect.value) * scale;
          break;
        case "invulnerable_bonus":
          stats.invulnerableBonus += num(effect.value) * scale;
          break;
        case "aggro_shift":
          stats.aggroShift += num(effect.value) * scale;
          break;
        case "damage_resist":
          stats.damageResist += num(effect.value) * scale;
          break;
        case "sting_damage":
          stats.stingDamage += num(effect.value) * scale;
          break;
        case "harassment_mul":
          stats.harassmentMul += num(effect.value) * scale;
          break;
        case "sting_reach":
          stats.stingReach += num(effect.value) * scale;
          break;
        case "sting_cooldown":
          stats.stingCooldownMul -= num(effect.value) * scale;
          break;
        case "speed_mul":
          stats.speedMul += num(effect.value) * scale;
          break;
        case "turn_mul":
          stats.turnMul += num(effect.value) * scale;
          break;
        case "drag_reduction":
          stats.dragMul -= num(effect.value) * scale;
          break;
        case "climb_mul":
          stats.climbMul += num(effect.value) * scale;
          break;
        case "stability_mul":
          stats.stabilityMul += num(effect.value) * scale;
          break;
        case "unlock_skill": {
          const skill = String(effect.value);
          if (!stats.unlockedSkills.includes(skill)) stats.unlockedSkills.push(skill);
          break;
        }
      }
    }
  }

  // Clamp the multiplicative terms. Without this, a player who stacked every drag reduction
  // would eventually reach zero damping and fly in a straight line forever.
  stats.dragMul = Math.max(0.3, stats.dragMul);
  stats.stingCooldownMul = Math.max(0.25, stats.stingCooldownMul);
  stats.damageResist = Math.min(0.75, stats.damageResist);
  stats.pollenKeep = Math.min(1, stats.pollenKeep);

  return stats;
}

/** Total pollen spent, i.e. how rich the player's build is. */
export function investedPoints(investment: Investment): number {
  let total = 0;
  for (const node of TREE.nodes) {
    const tier = investment[node.id] ?? 0;
    if (tier > 0) total += tier * node.tierCost;
  }
  return total;
}

export type UnlockCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether a node can be advanced right now.
 *
 * Every refusal returns a human reason rather than a bare false, because "why can't I click
 * this?" is the single most common question a skill tree UI has to answer.
 */
export function canUnlock(
  nodeId: string,
  investment: Investment,
  availablePoints: number,
): UnlockCheck {
  const node = TREE.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return { ok: false, reason: "unknown node" };

  const current = investment[node.id] ?? 0;
  if (current >= node.maxTier) return { ok: false, reason: "already at maximum tier" };

  for (const requirement of node.requires) {
    const met = investment[requirement] ?? 0;
    if (met <= 0) return { ok: false, reason: `requires ${labelOf(requirement)}` };
  }

  if (availablePoints < node.tierCost) {
    return { ok: false, reason: `needs ${node.tierCost} pollen` };
  }

  return { ok: true };
}

export function labelOf(nodeId: string): string {
  return TREE.nodes.find((node) => node.id === nodeId)?.label ?? nodeId;
}

export function nodeById(nodeId: string): TreeNode | undefined {
  return TREE.nodes.find((node) => node.id === nodeId);
}

function num(value: number | string): number {
  return typeof value === "number" ? value : 0;
}
