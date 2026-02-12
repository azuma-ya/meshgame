/**
 * Ordering Layer Types
 */
import type { ActionCommit } from "../log/types.js";
import { Envelope, type NodeMessage } from "../protocol/types.js";

/**
 * Result of a tick processing.
 */
export interface OrderingOutput {
  /** Messages to broadcast/send. */
  outbound: NodeMessage[];
  /** New commits to apply to state. */
  commits: ActionCommit[];
}

export interface Ordering {
  /**
   * Handle an incoming protocol message.
   * Returns true if handled.
   */
  handleMessage(fromPeerId: string, msg: NodeMessage): boolean;

  /**
   * Submit a local action for the current time.
   */
  onLocalAction(payload: unknown, nowMs: number): void;

  /**
   * Advance time and generate outputs.
   */
  tick(nowMs: number): OrderingOutput;

  /**
   * Get the current highest committed height.
   */
  getHeight(): number;
}
