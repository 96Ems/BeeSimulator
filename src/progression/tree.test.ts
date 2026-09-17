import { describe, expect, it } from "vitest";
import { computeRole } from "./role";
import { canUnlock, foldInvestment, investedPoints, TREE, type Investment } from "./tree";

const BASE = { pollenCapacity: 120, maxLives: 3, stingReach: 1.7 };

describe("tree data", () => {
  it("has unique node ids", () => {
    // Duplicate ids would make the investment map silently share a tier between two nodes,
    // which looks like a UI glitch rather than a data error.
    const ids = TREE.nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("references only nodes that exist", () => {
    const ids = new Set(TREE.nodes.map((node) => node.id));
    for (const node of TREE.nodes) {
      for (const requirement of node.requires) {
        expect(ids.has(requirement), `${node.id} requires unknown ${requirement}`).toBe(true);
      }
    }
  });

  it("puts every node in a declared branch", () => {
    const branches = new Set(TREE.branches.map((branch) => branch.id));
    for (const node of TREE.nodes) {
      expect(branches.has(node.branch), `${node.id} in unknown branch`).toBe(true);
    }
  });

  it("marks active nodes with a skill id and a cooldown", () => {
    for (const node of TREE.nodes) {
      if (node.kind === "passive") continue;
      expect(node.skillId, `${node.id} is active but has no skillId`).toBeDefined();
      expect(node.cooldownSeconds, `${node.id} is active but has no cooldown`).toBeGreaterThan(0);
    }
  });

  it("has no cyclic prerequisites", () => {
    // A cycle would make those nodes permanently unreachable, and the UI would show them as
    // forever-locked with no explanation.
    const byId = new Map(TREE.nodes.map((node) => [node.id, node]));
    const state = new Map<string, "visiting" | "done">();

    const visit = (id: string): void => {
      if (state.get(id) === "done") return;
      expect(state.get(id), `prerequisite cycle through ${id}`).not.toBe("visiting");
      state.set(id, "visiting");
      for (const requirement of byId.get(id)?.requires ?? []) visit(requirement);
      state.set(id, "done");
    };

    for (const node of TREE.nodes) visit(node.id);
  });
});

describe("foldInvestment", () => {
  it("is identity when nothing is invested", () => {
    // The fallback must always be neutral: a bee with no investment has to behave exactly as
    // it did before the skill tree existed.
    const stats = foldInvestment(BASE, {});
    expect(stats.pollenCapacity).toBe(BASE.pollenCapacity);
    expect(stats.maxLives).toBe(BASE.maxLives);
    expect(stats.stingReach).toBe(BASE.stingReach);
    expect(stats.speedMul).toBe(1);
    expect(stats.dragMul).toBe(1);
    expect(stats.forageSpeedMul).toBe(1);
    expect(stats.unlockedSkills).toEqual([]);
  });

  it("scales per-tier effects by the tier", () => {
    const one = foldInvestment(BASE, { "forage.capacity1": 1 });
    const three = foldInvestment(BASE, { "forage.capacity1": 3 });

    expect(one.pollenCapacity).toBe(BASE.pollenCapacity + 30);
    expect(three.pollenCapacity).toBe(BASE.pollenCapacity + 90);
  });

  it("applies non-per-tier effects once, however deep the node goes", () => {
    const one = foldInvestment(BASE, { "hard.shield": 1 });
    const two = foldInvestment(BASE, { "hard.shield": 2 });

    expect(one.unlockedSkills).toEqual(["shield"]);
    // Unlocking a skill twice must not duplicate it.
    expect(two.unlockedSkills).toEqual(["shield"]);
  });

  it("clamps multiplicative effects so they cannot reach zero", () => {
    // Every drag-reduction node at max. Without the clamp the bee would experience zero air
    // resistance and fly in a straight line forever.
    const stats = foldInvestment(BASE, {
      "mob.drag1": 2,
      "mob.speed1": 3,
    });
    expect(stats.dragMul).toBeGreaterThanOrEqual(0.3);
  });

  it("adds lives from the hardiness branch", () => {
    const stats = foldInvestment(BASE, { "hard.lives1": 2 });
    expect(stats.maxLives).toBe(BASE.maxLives + 2);
  });

  it("never lets damage resistance approach immunity", () => {
    const stats = foldInvestment(BASE, { "hard.tough1": 3 });
    expect(stats.damageResist).toBeLessThanOrEqual(0.75);
  });

  it("counts invested points as tier times cost", () => {
    const investment: Investment = { "forage.capacity1": 2, "forage.yield1": 1 };
    const node = TREE.nodes.find((candidate) => candidate.id === "forage.capacity1");
    const other = TREE.nodes.find((candidate) => candidate.id === "forage.yield1");
    expect(investedPoints(investment)).toBe(
      (node?.tierCost ?? 0) * 2 + (other?.tierCost ?? 0),
    );
  });
});

describe("canUnlock", () => {
  it("refuses when pollen is short, and says how much is needed", () => {
    const check = canUnlock("forage.capacity1", {}, 0);
    expect(check.ok).toBe(false);
    // Every refusal must carry a human reason: "why can't I click this?" is the most common
    // question a skill tree has to answer.
    if (!check.ok) expect(check.reason).toContain("pollen");
  });

  it("refuses when a prerequisite is unmet, and names it", () => {
    // forage.yield1 requires forage.capacity1.
    const check = canUnlock("forage.yield1", {}, 999);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toContain("Deeper Crop");
  });

  it("allows a node whose prerequisite is satisfied and pollen is sufficient", () => {
    const check = canUnlock("forage.yield1", { "forage.capacity1": 1 }, 999);
    expect(check.ok).toBe(true);
  });

  it("refuses at maximum tier", () => {
    const max = TREE.nodes.find((node) => node.id === "forage.capacity1")?.maxTier ?? 0;
    const check = canUnlock("forage.capacity1", { "forage.capacity1": max }, 999);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toContain("maximum");
  });
});

describe("computeRole", () => {
  it("reports no role before any investment", () => {
    const role = computeRole({});
    expect(role.dominant).toBeNull();
    expect(role.label).toBe("Undifferentiated");
  });

  it("identifies a committed tank", () => {
    // Everything into hardiness: the branch is overwhelming, so the basic role name should
    // appear rather than a hybrid.
    const role = computeRole({
      "hard.lives1": 2,
      "hard.keep1": 3,
      "hard.recover1": 2,
      "hard.tough1": 3,
    });
    expect(role.dominant).toBe("hardiness");
    expect(role.label).toBe("Tank");
  });

  it("names a genuine hybrid rather than picking the larger half", () => {
    // The whole point of emergent roles (DESIGN §9.2): a build nobody designed should be
    // *named*, because being named is the reward for inventing it.
    const role = computeRole({
      "hard.lives1": 2,
      "hard.keep1": 3,
      "mob.speed1": 3,
      "mob.turn1": 3,
    });
    expect(role.dominant).toBeDefined();
    expect(role.label.split(" ").length).toBe(2);
  });

  it("keeps a broadly spread build undifferentiated", () => {
    // A near-even spread must honestly report itself as undifferentiated instead of being
    // labelled by a rounding error.
    const role = computeRole({
      "hard.keep1": 1,
      "off.sting1": 1,
      "mob.speed1": 1,
      "forage.capacity1": 1,
    });
    expect(role.dominant).toBeNull();
  });

  it("shares sum to one across the role branches", () => {
    const role = computeRole({ "hard.lives1": 2, "off.sting1": 3, "mob.speed1": 1 });
    const total =
      role.share.hardiness + role.share.offense + role.share.mobility + role.share.foraging;
    // Foraging is excluded from the role denominator, so only the three role branches sum to 1.
    expect(role.share.hardiness + role.share.offense + role.share.mobility).toBeCloseTo(1, 6);
    expect(total).toBeGreaterThan(0);
  });
});
