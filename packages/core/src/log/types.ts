/**
 * Log Layer Types
 */

/**
 * A committed block of actions for a specific tick.
 */
export interface ActionCommit {
  /** Log sequence number (height). 1-based. */
  height: number;
  /** The tick number this commit corresponds to. */
  tick: number;
  /**
   * Actions from all peers for this tick.
   * Sorted deterministically by peerId.
   */
  actionsByPeer: Array<{
    peerId: string;
    payload: unknown | null;
  }>;
}

export interface ActionLog {
  append(commit: ActionCommit): Promise<void>;
  getRange(fromHeight: number, toHeight: number): Promise<ActionCommit[]>;
  latestHeight(): number;
}
