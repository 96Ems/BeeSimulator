/**
 * Session accounting. DESIGN §10.
 *
 * Kept outside `SimState` because it is *derived* from a stream of simulation events rather
 * than simulated. The simulation does not need to know that a score exists, and putting it in
 * `SimState` would mean the score could desync from the world it describes.
 *
 * The one metric worth arguing about is pollen per minute. Total pollen rewards simply flying
 * for longer, which is not a skill. The ratio rewards *routing* — which flowers, in what order,
 * and when to turn for home — and that is the skill this game is actually about.
 */

export type SessionStats = {
  elapsed: number;
  deposited: number;
  trips: number;
  bestTrip: number;
  hitsTaken: number;
  /** Trips finished without a single hit: the risk-discipline signal. */
  cleanTrips: number;
  /** Set false by any hit during the current trip. */
  currentTripClean: boolean;
  over: boolean;
};

export function createSessionStats(): SessionStats {
  return {
    elapsed: 0,
    deposited: 0,
    trips: 0,
    bestTrip: 0,
    hitsTaken: 0,
    cleanTrips: 0,
    currentTripClean: true,
    over: false,
  };
}

export function resetSession(stats: SessionStats): void {
  stats.elapsed = 0;
  stats.deposited = 0;
  stats.trips = 0;
  stats.bestTrip = 0;
  stats.hitsTaken = 0;
  stats.cleanTrips = 0;
  stats.currentTripClean = true;
  stats.over = false;
}

export function pollenPerMinute(stats: SessionStats): number {
  // Guard against a divide by zero in the first fraction of a second, which would otherwise
  // report an infinite score on the very first deposit.
  const minutes = Math.max(stats.elapsed, 1) / 60;
  return stats.deposited / minutes;
}

export function onHit(stats: SessionStats): void {
  stats.hitsTaken += 1;
  stats.currentTripClean = false;
}

export function onDeposit(stats: SessionStats, amount: number): void {
  stats.deposited += amount;
  stats.trips += 1;
  stats.bestTrip = Math.max(stats.bestTrip, amount);

  if (stats.currentTripClean) stats.cleanTrips += 1;
  // A new trip begins the moment the old one is banked, so cleanliness resets here rather
  // than on takeoff.
  stats.currentTripClean = true;
}
