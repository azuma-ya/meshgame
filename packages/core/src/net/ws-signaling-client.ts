import type {
  PeerListHandler,
  SignalingClient,
  SignalingMessage,
  SignalingMessageHandler,
} from "./signaling-client.js";

// ---- WebSocket protocol messages ----

/** Sent to the server right after the WebSocket opens. */
interface RegisterMessage {
  type: "register";
  peerId: string;
}

/** Received from the server when the peer list changes. */
interface PeerListMessage {
  type: "peer_list";
  peers: string[];
}

type WsOutgoing = RegisterMessage | SignalingMessage;
type WsIncoming = SignalingMessage | PeerListMessage;

// ---- Implementation ----

/**
 * A {@link SignalingClient} backed by a plain WebSocket connection.
 *
 * ## Server protocol (minimal)
 *
 * 1. Client opens a WebSocket to `url`.
 * 2. Client sends `{ type: "register", peerId }`.
 * 3. Server relays incoming `SignalingMessage` objects to the peer
 *    identified by `msg.to`.
 * 4. Server broadcasts `{ type: "peer_list", peers: string[] }` whenever
 *    a peer registers or disconnects.
 *
 * All messages are JSON-encoded strings.
 */
export class WebSocketSignalingClient implements SignalingClient {
  private ws: WebSocket | null = null;
  private readonly messageHandlers: SignalingMessageHandler[] = [];
  private readonly peerListHandlers: PeerListHandler[] = [];

  constructor(private readonly url: string) {}

  async connect(peerId: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;

      ws.onopen = () => {
        const reg: RegisterMessage = { type: "register", peerId };
        ws.send(JSON.stringify(reg));
        resolve();
      };

      ws.onerror = (ev) => {
        reject(new Error(`WebSocket error: ${String(ev)}`));
      };

      ws.onclose = () => {
        this.ws = null;
      };

      ws.onmessage = (ev: MessageEvent) => {
        try {
          const msg = JSON.parse(String(ev.data)) as WsIncoming;

          if (msg.type === "peer_list") {
            for (const h of this.peerListHandlers) {
              h(msg.peers);
            }
          } else {
            for (const h of this.messageHandlers) {
              h(msg);
            }
          }
        } catch {
          // Ignore non-JSON or unexpected messages
        }
      };
    });
  }

  async disconnect(): Promise<void> {
    this.ws?.close();
    this.ws = null;
  }

  async send(msg: SignalingMessage): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected.");
    }
    const outgoing: WsOutgoing = msg;
    this.ws.send(JSON.stringify(outgoing));
  }

  onMessage(handler: SignalingMessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onPeerList(handler: PeerListHandler): void {
    this.peerListHandlers.push(handler);
  }
}
