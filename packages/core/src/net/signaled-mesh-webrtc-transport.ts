import type { SignaledWebRtcTransportOptions } from "./signaled-webrtc-transport.js";
import { SignaledWebRtcTransport } from "./signaled-webrtc-transport.js";
import type { SignalingClient } from "./signaling-client.js";

// ---- Options ----

export interface SignaledMeshWebRtcTransportOptions
  extends SignaledWebRtcTransportOptions {}

// ---- Implementation ----

/**
 * A full-mesh WebRTC transport with automatic peer discovery via
 * {@link SignalingClient}.
 *
 * Extends {@link SignaledWebRtcTransport} by listening for server-broadcast
 * peer lists and automatically initiating connections to all unknown peers.
 *
 * - The signaling server broadcasts a peer list whenever someone joins/leaves.
 * - This transport connects to every peer it doesn't already know about.
 * - Tie-breaking (lexicographic comparison) prevents duplicate offers.
 * - After the P2P DataChannel is established, all data flows directly.
 *
 * @example
 * ```ts
 * const signaling = new WebSocketSignalingClient("ws://localhost:8080");
 * const transport = new SignaledMeshWebRtcTransport(
 *   { self: "player-1" },
 *   signaling,
 * );
 * await transport.start();
 * // Peers are discovered and connected automatically!
 * ```
 */
export class SignaledMeshWebRtcTransport extends SignaledWebRtcTransport {
  /** Track peers we are currently trying to connect to. */
  private readonly pendingConnections = new Set<string>();

  constructor(
    opts: SignaledMeshWebRtcTransportOptions,
    signaling: SignalingClient,
  ) {
    super(opts, signaling);
  }

  // ---- Lifecycle ----

  override async start(): Promise<void> {
    // Register peer list handler BEFORE connecting (super.start connects)
    this.signaling.onPeerList((peerIds) => {
      this.handlePeerList(peerIds);
    });

    await super.start();
  }

  // ---- Auto Mesh ----

  private handlePeerList(peerIds: string[]): void {
    for (const peerId of peerIds) {
      if (
        peerId !== this.self &&
        !this.peers.has(peerId) &&
        !this.pendingConnections.has(peerId)
      ) {
        // Tie-break: only the lexicographically smaller ID creates the offer.
        if (this.self > peerId) continue;

        this.pendingConnections.add(peerId);
        console.log(`[mesh] Auto-connecting to ${peerId}`);

        this.connectToPeer(peerId)
          .then(() => {
            this.pendingConnections.delete(peerId);
          })
          .catch((err) => {
            console.error(`[mesh] Failed to connect to ${peerId}:`, err);
            this.pendingConnections.delete(peerId);
          });
      }
    }
  }
}
