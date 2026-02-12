import type { ManualWebRtcTransportOptions } from "./manual-webrtc-transport.js";
import { ManualWebRtcTransport } from "./manual-webrtc-transport.js";
import type { SignalingClient } from "./signaling-client.js";

// ---- Options ----

export interface SignaledWebRtcTransportOptions
  extends ManualWebRtcTransportOptions {}

// ---- Implementation ----

/**
 * A multi-peer (full-mesh) WebRTC transport that automates signaling
 * through an external {@link SignalingClient}.
 *
 * Data flows **peer-to-peer** via WebRTC DataChannels — the signaling
 * channel is used **only** for the initial SDP offer/answer exchange.
 *
 * ```
 *  ┌────────┐   SDP (WebSocket etc.)   ┌────────┐
 *  │ Peer A │ ◄──────────────────────► │ Peer B │
 *  │        │   Data (P2P WebRTC)      │        │
 *  │        │ ◄══════════════════════► │        │
 *  └────────┘                          └────────┘
 * ```
 *
 * @example
 * ```ts
 * const signaling = new WebSocketSignalingClient("ws://localhost:8080");
 * const transport = new SignaledWebRtcTransport(
 *   { self: "player-1" },
 *   signaling,
 * );
 * await transport.start();
 * await transport.connectToPeer("player-2");
 * ```
 */
export class SignaledWebRtcTransport extends ManualWebRtcTransport {
  protected readonly signaling: SignalingClient;

  constructor(
    opts: SignaledWebRtcTransportOptions,
    signaling: SignalingClient,
  ) {
    super(opts);
    this.signaling = signaling;
  }

  // ---- Lifecycle ----

  override async start(): Promise<void> {
    await super.start();

    // Register incoming signaling handler
    this.signaling.onMessage(async (msg) => {
      // Ignore messages not addressed to us
      if (msg.to !== this.self) return;

      try {
        if (msg.type === "offer") {
          console.log(`[signaled] Received offer from ${msg.from}`);
          const answerSdp = await this.acceptOfferAndCreateAnswerSdp(
            msg.from,
            msg.payload,
          );
          await this.signaling.send({
            type: "answer",
            from: this.self,
            to: msg.from,
            payload: answerSdp,
          });
        } else if (msg.type === "answer") {
          console.log(`[signaled] Received answer from ${msg.from}`);
          await this.acceptAnswerSdp(msg.from, msg.payload);
        }
      } catch (err) {
        console.error(
          `[signaled] Failed to handle ${msg.type} from ${msg.from}:`,
          err,
        );
      }
    });

    // Connect to signaling server
    await this.signaling.connect(this.self);
  }

  override async stop(): Promise<void> {
    await this.signaling.disconnect();
    await super.stop();
  }

  // ---- Public API ----

  /**
   * Initiate a P2P connection to a remote peer.
   *
   * Creates a WebRTC offer and sends it through the signaling channel.
   * The remote peer will automatically answer via its own signaling
   * handler, completing the handshake.
   */
  async connectToPeer(peerId: string): Promise<void> {
    this.assertStarted();
    console.log(`[signaled] Initiating connection to ${peerId}`);

    const offerSdp = await this.createOfferSdp(peerId);
    await this.signaling.send({
      type: "offer",
      from: this.self,
      to: peerId,
      payload: offerSdp,
    });
  }
}
