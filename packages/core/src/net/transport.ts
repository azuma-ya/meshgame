// ---- Message ----

/** A message carried over the transport. */
export interface TransportMessage {
  /** Routing topic, e.g. "action", "commit", "ping". */
  readonly topic: string;
  /** Arbitrary binary payload. */
  readonly payload: Uint8Array;
}

// ---- Peer events ----

export interface PeerConnectedEvent {
  readonly type: "peer_connected";
  readonly peerId: string;
}

export interface PeerDisconnectedEvent {
  readonly type: "peer_disconnected";
  readonly peerId: string;
  readonly reason?: string;
}

export type PeerEvent = PeerConnectedEvent | PeerDisconnectedEvent;

// ---- Handler types ----

export type MessageHandler = (
  fromPeerId: string,
  msg: TransportMessage,
) => void;

export type PeerEventHandler = (ev: PeerEvent) => void;

// ---- Transport interface ----

/**
 * Abstract transport layer for peer-to-peer communication.
 * Implementations can use WebRTC DataChannel, WebSocket relay, etc.
 */
export interface Transport {
  /** Identifier of this node. */
  readonly self: string;

  /** Initialise the underlying connection resources. */
  start(): Promise<void>;

  /** Tear down all connections and release resources. */
  stop(): Promise<void>;

  /** Send a message to all connected peers. */
  broadcast(msg: TransportMessage): Promise<void>;

  /**
   * Send a message to a specific peer.
   * For 1-to-1 transports `toPeerId` may be ignored.
   */
  send(toPeerId: string, msg: TransportMessage): Promise<void>;

  /** Register a handler invoked when a message is received. */
  onMessage(handler: MessageHandler): void;

  /** Register a handler invoked on peer connect / disconnect events. */
  onPeerEvent(handler: PeerEventHandler): void;
}
