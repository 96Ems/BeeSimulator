/**
 * Simulation event vocabulary.
 *
 * The simulation emits events instead of playing sounds, spawning particles or updating the
 * HUD, because it must not know that presentation exists (ARCHITECTURE §1). The caller
 * decides what a completed forage or a landed sting looks and sounds like.
 *
 * Defined in one place so every producer can append to the same array without the layers
 * needing to know about each other.
 */

export type ForageEvent =
  | { kind: "started"; flowerId: number }
  | { kind: "progress"; flowerId: number; progress: number }
  | { kind: "completed"; flowerId: number; pollen: number }
  | { kind: "interrupted"; flowerId: number }
  | { kind: "deposited"; pollen: number; livesRestored: number }
  | { kind: "full" };

export type EnemyEvent =
  | { kind: "beeHit"; enemyId: number; damage: number }
  | { kind: "pollenStolen"; enemyId: number; amount: number }
  | { kind: "enemyStung"; enemyId: number; enemyKind: string; remainingHealth: number }
  | { kind: "enemyKilled"; enemyId: number; enemyKind: string }
  | { kind: "enemyRepelled"; enemyId: number; enemyKind: string };

export type SimEvent = ForageEvent | EnemyEvent;
