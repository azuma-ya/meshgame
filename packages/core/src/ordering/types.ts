/**
 * Ordering Layer Types
 */
import type { Commit } from "../log/types.js";
import type { PeerEvent } from "../net/transport.js";

export interface Ordering {
  /**
   * Start the ordering service (and underlying transport).
   */
  start(): Promise<void>;

  /**
   * Stop the ordering service.
   */
  stop(): Promise<void>;

  /**
   * Subscribe to commit events.
   */
  onCommit(callback: (commit: Commit) => void): void;

  /**
   * Subscribe to peer events.
   */
  onPeerEvent(callback: (ev: PeerEvent) => void): void;

  /**
   * Get connected peer IDs.
   */
  getPeers(): string[];

  /**
   * Submit a local action for the current time.
   */
  onLocalAction(payload: unknown, nowMs: number): void;

  /**
   * Advance time and generate outputs.
   */
  tick(nowMs: number): void;

  /**
   * Get current tick.
   */
  getTick(): number;

  /**
   * Get committed tick.
   */
  getCommittedTick(): number;
}
