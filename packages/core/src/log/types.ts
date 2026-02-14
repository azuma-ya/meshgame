/**
 * Log Layer Types
 */

export interface SignedAction {
  peerId: string;
  payload: unknown;
  signature?: string;
}

/**
 * A committed block of actions for a specific tick.
 * NOTE: Lockstep needs "multiple actions per tick", so this is a block.
 */
export interface Commit {
  /** Log sequence number (height). 1-based. */
  seq: number;
  /** Actions committed for the tick, deterministically ordered. */
  actions: SignedAction[];
  /** Previous hash for chain verification (optional). */
  prevHash?: string;
  /** Metadata for internal use (e.g. ordering tick number). */
  metadata: {
    orderingTick: number;
  };
}

export interface ActionLog {
  append(commit: Commit): Promise<void>;
  getRange(fromHeight: number, toHeight: number): Promise<Commit[]>;
  latestHeight(): Promise<number>;
  clear(): Promise<void>;
}
