/**
 * Time Utilities for Lockstep Synchronization.
 */

/**
 * Calculate the current tick number based on start time and tick duration.
 * tick = floor((now - t0) / tickMs)
 */
export function getCurrentTick(
  nowMs: number,
  t0Ms: number,
  tickMs: number,
): number {
  if (nowMs < t0Ms) return -1; // Before start
  return Math.floor((nowMs - t0Ms) / tickMs);
}

/**
 * Calculate the deadline for a given tick.
 * Deadline is the time when the tick ends and the next one begins.
 */
export function getTickDeadline(
  tick: number,
  t0Ms: number,
  tickMs: number,
): number {
  return t0Ms + (tick + 1) * tickMs;
}

/**
 * Calculate the start time for a given tick.
 */
export function getTickStartTime(
  tick: number,
  t0Ms: number,
  tickMs: number,
): number {
  return t0Ms + tick * tickMs;
}
