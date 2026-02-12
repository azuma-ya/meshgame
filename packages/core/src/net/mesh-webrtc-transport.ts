import type { ManualWebRtcTransportOptions } from "./manual-webrtc-transport.js";
import { ManualWebRtcTransport } from "./manual-webrtc-transport.js";
import type { TransportMessage } from "./transport.js";

const MESH_SIGNAL_TOPIC = "__mesh_signal__";
const PEER_DISCOVERY_TOPIC = "__peer_discovery__";

interface MeshSignal {
  /** Unique ID to prevent infinite relay loops. */
  id: string;
  type: "offer" | "answer";
  from: string;
  to: string;
  sdp: string;
}

interface PeerDiscovery {
  /** Unique ID to prevent infinite relay loops. */
  id: string;
  knownPeers: string[];
}

let nextId = 0;
function uid(): string {
  return `${Date.now()}-${++nextId}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface MeshWebRtcTransportOptions
  extends ManualWebRtcTransportOptions {}

export class MeshWebRtcTransport extends ManualWebRtcTransport {
  /** Track peers we are currently trying to connect to. */
  private readonly pendingConnections = new Set<string>();

  /** Track seen message IDs to prevent infinite flooding. */
  private readonly seenIds = new Set<string>();

  constructor(opts: MeshWebRtcTransportOptions) {
    super(opts);

    // Register mesh-specific message handlers
    this.onMessage(async (from, msg) => {
      if (msg.topic === MESH_SIGNAL_TOPIC) {
        await this.handleMeshSignal(from, msg);
      } else if (msg.topic === PEER_DISCOVERY_TOPIC) {
        await this.handlePeerDiscovery(from, msg);
      }
    });

    // When a peer connects, broadcast peer list to ALL connected peers.
    this.onPeerEvent((ev) => {
      if (ev.type === "peer_connected") {
        this.broadcastPeerList();
      }
    });
  }

  // ---- Peer Discovery ----

  /**
   * Broadcast the current peer list to ALL connected peers.
   */
  private async broadcastPeerList(): Promise<void> {
    const discovery: PeerDiscovery = {
      id: uid(),
      knownPeers: this.connectedPeers,
    };
    this.seenIds.add(discovery.id);

    const msg: TransportMessage = {
      topic: PEER_DISCOVERY_TOPIC,
      payload: new TextEncoder().encode(JSON.stringify(discovery)),
    };
    await this.broadcast(msg);
  }

  private async handlePeerDiscovery(
    from: string,
    msg: TransportMessage,
  ): Promise<void> {
    const data: PeerDiscovery = JSON.parse(
      new TextDecoder().decode(msg.payload),
    );

    // De-duplicate
    if (this.seenIds.has(data.id)) return;
    this.seenIds.add(data.id);

    // Re-flood to all peers except the sender
    await this.floodExcept(from, msg);

    // Process: try to connect to any unknown peers
    for (const peerId of data.knownPeers) {
      if (
        peerId !== this.self &&
        !this.peers.has(peerId) &&
        !this.pendingConnections.has(peerId)
      ) {
        await this.initiateMeshConnection(peerId);
      }
    }
  }

  // ---- Signal Relay (flood-based) ----

  /**
   * Send a mesh signal. The signal is flooded to all connected peers.
   * The intended recipient will process it; others will relay it.
   */
  private async sendSignal(signal: MeshSignal): Promise<void> {
    this.seenIds.add(signal.id);
    const msg: TransportMessage = {
      topic: MESH_SIGNAL_TOPIC,
      payload: new TextEncoder().encode(JSON.stringify(signal)),
    };
    await this.broadcast(msg);
  }

  private async handleMeshSignal(
    from: string,
    msg: TransportMessage,
  ): Promise<void> {
    const signal: MeshSignal = JSON.parse(
      new TextDecoder().decode(msg.payload),
    );

    // De-duplicate
    if (this.seenIds.has(signal.id)) return;
    this.seenIds.add(signal.id);

    if (signal.to === this.self) {
      // It's for us!
      if (signal.type === "offer") {
        console.log(`[mesh] Received offer from ${signal.from}`);
        this.pendingConnections.add(signal.from);
        try {
          const answerSdp = await this.acceptOfferAndCreateAnswerSdp(
            signal.from,
            signal.sdp,
          );
          const reply: MeshSignal = {
            id: uid(),
            type: "answer",
            from: this.self,
            to: signal.from,
            sdp: answerSdp,
          };
          await this.sendSignal(reply);
        } catch (err) {
          console.error(
            `[mesh] Failed to accept offer from ${signal.from}:`,
            err,
          );
          this.pendingConnections.delete(signal.from);
        }
      } else if (signal.type === "answer") {
        console.log(`[mesh] Received answer from ${signal.from}`);
        try {
          await this.acceptAnswerSdp(signal.from, signal.sdp);
        } catch (err) {
          console.error(
            `[mesh] Failed to accept answer from ${signal.from}:`,
            err,
          );
        }
        this.pendingConnections.delete(signal.from);
      }
    } else {
      // Not for us — relay (flood) to all peers except the sender
      console.log(`[mesh] Relaying signal from ${signal.from} to ${signal.to}`);
      await this.floodExcept(from, msg);
    }
  }

  // ---- Mesh Connection ----

  private async initiateMeshConnection(targetPeerId: string): Promise<void> {
    // Tie-break: only the lexicographically smaller ID creates the offer.
    if (this.self > targetPeerId) return;

    this.pendingConnections.add(targetPeerId);
    console.log(`[mesh] Initiating mesh connection to ${targetPeerId}`);

    try {
      const sdp = await this.createOfferSdp(targetPeerId);
      const signal: MeshSignal = {
        id: uid(),
        type: "offer",
        from: this.self,
        to: targetPeerId,
        sdp,
      };
      await this.sendSignal(signal);
    } catch (err) {
      console.error(
        `[mesh] Failed to initiate connection to ${targetPeerId}:`,
        err,
      );
      this.pendingConnections.delete(targetPeerId);
    }
  }

  // ---- Helpers ----

  /**
   * Forward a message to all connected peers except `excludePeerId`.
   * This implements simple flooding with the de-duplication done by callers.
   */
  private async floodExcept(
    excludePeerId: string,
    msg: TransportMessage,
  ): Promise<void> {
    for (const peerId of this.connectedPeers) {
      if (peerId !== excludePeerId) {
        try {
          await this.send(peerId, msg);
        } catch {
          // Peer may have disconnected
        }
      }
    }
  }
}
