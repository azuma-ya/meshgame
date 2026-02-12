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
 */
export interface Commit {
  /** Log sequence number (height). 1-based. */
  seq: number;
  /** The action that was committed. */
  action: SignedAction;
  /** Previous hash for chain verification (optional). */
  prevHash?: string;
  /** Optional metadata for internal use (e.g. tick number). */
  metadata?: {
    tick?: number;
  };
}

export interface ActionLog {
  append(commit: Commit): Promise<void>;
  getRange(fromHeight: number, toHeight: number): Promise<Commit[]>;
  latestHeight(): Promise<number>;
  clear(): Promise<void>;
}
