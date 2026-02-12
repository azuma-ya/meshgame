/**
 * Sync Layer Types
 * Stub for future state synchronization.
 */

export interface StateSnapshot {
  height: number;
  tick: number;
  stateHash?: string;
  state: unknown;
}
