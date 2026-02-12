// ---- Signaling Message ----

/** Signaling message exchanged between peers via external signaling channel. */
export interface SignalingMessage {
  type: "offer" | "answer";
  from: string;
  to: string;
  /** Base64-encoded SDP. */
  payload: string;
}

// ---- Handler ----

export type SignalingMessageHandler = (msg: SignalingMessage) => void;

/** Handler invoked when the server broadcasts an updated peer list. */
export type PeerListHandler = (peerIds: string[]) => void;

// ---- Signaling Client Interface ----

/**
 * Abstract signaling client for WebRTC peer discovery and SDP exchange.
 *
 * Implementations may use WebSocket, HTTP long-polling, Firebase Realtime
 * Database, or any other communication channel capable of relaying
 * {@link SignalingMessage} between peers.
 */
export interface SignalingClient {
  /**
   * Connect to the signaling server and register as `peerId`.
   * After this resolves the client is ready to send and receive messages.
   */
  connect(peerId: string): Promise<void>;

  /** Disconnect from the signaling server. */
  disconnect(): Promise<void>;

  /** Send a signaling message through the server. */
  send(msg: SignalingMessage): Promise<void>;

  /** Register a handler invoked when a signaling message arrives. */
  onMessage(handler: SignalingMessageHandler): void;

  /**
   * Register a handler invoked when the server broadcasts an updated
   * peer list. Used for automatic mesh construction.
   */
  onPeerList(handler: PeerListHandler): void;
}
