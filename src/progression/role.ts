/**
 * Role emergence. DESIGN §9.2.
 *
 * The role is **not chosen**. It is computed from where the player put their points, which is
 * the whole reason 24+ nodes are worth having: a 50/50 Hardiness + Mobility build produces an
 * "armoured scout" that no designer planned, and that hybrid is the thing that makes investing
 * feel like authorship rather than like picking a class.
 *
 * This module is **presentational only**. It reports; it never gates mechanics. If a role ever
 * starts changing what a player can do, the design has quietly reintroduced rigid classes.
 */

import { TREE, type BranchId, type Investment } from "./tree";

/** The three role branches. Foraging is deliberately excluded: it is universal. */
const ROLE_BRANCHES: BranchId[] = ["hardiness", "offense", "mobility"];

export type RoleProfile = {
  /** Points spent in each role branch. */
  spend: Record<BranchId, number>;
  /** Share of the role-branch total, 0..1, per branch. */
  share: Record<BranchId, number>;
  /** The dominant branch, or null when undifferentiated. */
  dominant: BranchId | null;
  /** Human label, e.g. "Tank", "Armoured scout". */
  label: string;
  /** One-line description for the UI. */
  blurb: string;
};

const BRANCH_ROLE_NAMES: Record<BranchId, string> = {
  foraging: "forager",
  hardiness: "tank",
  offense: "striker",
  mobility: "scout",
};

const ADJECTIVES: Record<BranchId, string> = {
  foraging: "keen",
  hardiness: "armoured",
  offense: "vicious",
  mobility: "swift",
};

/**
 * Compute the profile from an investment.
 *
 * "Dominant" requires a real plurality rather than the largest of several near-equal shares,
 * so a broadly spread build honestly reports itself as undifferentiated instead of being
 * labelled by a rounding error.
 */
export function computeRole(investment: Investment): RoleProfile {
  const spend: Record<BranchId, number> = {
    foraging: 0,
    hardiness: 0,
    offense: 0,
    mobility: 0,
  };

  for (const node of TREE.nodes) {
    const tier = investment[node.id] ?? 0;
    if (tier <= 0) continue;
    spend[node.branch] += tier * node.tierCost;
  }

  let roleTotal = 0;
  for (const branch of ROLE_BRANCHES) roleTotal += spend[branch];

  const share: Record<BranchId, number> = {
    foraging: 0,
    hardiness: 0,
    offense: 0,
    mobility: 0,
  };

  if (roleTotal > 0) {
    for (const branch of ROLE_BRANCHES) {
      share[branch] = spend[branch] / roleTotal;
    }
  }

  const sorted = [...ROLE_BRANCHES].sort((a, b) => share[b] - share[a]);
  const top = sorted[0];
  const second = sorted[1];

  let dominant: BranchId | null = null;
  if (top && share[top] >= 0.45) dominant = top;

  return {
    spend,
    share,
    dominant,
    label: labelFor(dominant, second, share, top),
    blurb: blurbFor(share, top, second),
  };
}

function labelFor(
  dominant: BranchId | null,
  second: BranchId | undefined,
  share: Record<BranchId, number>,
  top: BranchId | undefined,
): string {
  if (!dominant || !top) return "Undifferentiated";

  // A strong second branch makes a genuinely distinct hybrid, and naming it is the reward for
  // having invented something. Below the threshold it is just a spread build.
  if (second && share[second] >= 0.3) {
    return capitalise(ADJECTIVES[second]) + " " + BRANCH_ROLE_NAMES[dominant];
  }

  const names: Record<BranchId, string> = {
    foraging: "Forager",
    hardiness: "Tank",
    offense: "Striker",
    mobility: "Scout",
  };
  return names[dominant];
}

function blurbFor(
  share: Record<BranchId, number>,
  top: BranchId | undefined,
  second: BranchId | undefined,
): string {
  if (!top) return "No points spent yet.";

  const pct = Math.round(share[top] * 100);
  if (second && share[second] >= 0.3) {
    return `${pct}% ${top}, ${Math.round(share[second] * 100)}% ${second}. A hybrid nobody planned.`;
  }

  return `${pct}% of your role points are in ${top}. The other branches will feel the lack.`;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** The role marker colour, so a co-op team can read composition at a glance. */
export function roleColor(profile: RoleProfile): number {
  switch (profile.dominant) {
    case "hardiness":
      return 0xb8652a;
    case "offense":
      return 0xc03030;
    case "mobility":
      return 0x2f9ec4;
    case "foraging":
      return 0xd8b62a;
    default:
      return 0x9a9a9a;
  }
}
