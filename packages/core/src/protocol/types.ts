/**
 * Protocol Types for GameNode
 * Hostless Lockstep Version
 */

/**
 * Top-level envelope for all protocol messages.
 */
export interface Envelope {
  v: "v1";
  /** Sender's public key (if not handled by transport layer). */
  from?: string;
  /** Sequence number for deduplication/ordering (optional). */
  seq?: number;
  /** Timestamp of creation. */
  ts: number;
  /** Signature (if not handled by transport layer). */
  sig?: string;
  /** Previous hash for chain verification (optional). */
  prevHash?: string;
  /** Room ID to multiplex streams. */
  roomId?: string;

  msg: NodeMessage;
}

export type NodeMessage =
  | HelloMessage
  | WelcomeMessage
  | JoinMessage
  | ActionProposeMessage
  | ActionSealMessage
  | ActionCommitMessage
  | PingMessage
  | PongMessage;

// ---- Connection / Handshake ----

export interface HelloMessage {
  type: "HELLO";
}

export interface JoinMessage {
  type: "JOIN";
  peerId: string;
  roomId: string;
}

export interface WelcomeMessage {
  type: "WELCOME";
  roomId: string;
  /** List of peers currently in the session. */
  peers: Array<{ peerId: string; role?: "peer" | "observer" }>;
  /** The start time of the game (tick 0). */
  t0Ms: number;
  /** Duration of one tick in milliseconds. */
  tickMs: number;
  /** Number of ticks input must be delayed by. */
  inputDelayTicks: number;
}

// ---- Lockstep Ordering ----

export interface ActionProposeMessage {
  type: "ACTION_PROPOSE";
  roomId: string;
  peerId: string;
  /** The tick this action is targeting. */
  tick: number;
  /** App-specific payload. */
  payload: unknown;

  seq: number;
}

export interface ActionSealMessage {
  type: "ACTION_SEAL";
  roomId: string;
  peerId: string;
  tick: number;
  lastSeq: number; // -1 allowed
}

/**
 * A committed block of actions for a specific tick.
 * In Hostless mode, every peer generates this locally or broadcasts it.
 */
export interface ActionCommitMessage {
  type: "ACTION_COMMIT";
  roomId: string;
  /** The tick number this commit corresponds to. */
  tick: number;
  /** The log height (sequence number). */
  height: number;
  /**
   * Ordered list of actions for this tick.
   * This supports multiple actions per peer via (peerId, seq).
   */
  actions: Array<{
    peerId: string;
    seq: number;
    payload: unknown;
  }>;
}

// ---- Health ----

export interface PingMessage {
  type: "PING";
  ts: number;
}

export interface PongMessage {
  type: "PONG";
  origTs: number;
}
