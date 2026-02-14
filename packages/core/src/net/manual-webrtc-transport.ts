import {
  DataChannelNotOpenError,
  IceGatheringTimeoutError,
  SignalingParseError,
  TransportNotStartedError,
} from "./errors.js";
import type {
  MessageHandler,
  PeerEventHandler,
  Transport,
  TransportMessage,
} from "./transport.js";
import { decodeMessage, encodeMessage } from "./transport-message.js";

// ---- Types ----

export interface ManualWebRtcTransportOptions {
  /** Identifier for this peer. */
  self: string;
  /** Timeout for ICE gathering in ms. Default: 10 000. */
  iceGatheringTimeoutMs?: number;
}

/** Internal state for a single peer connection. */
interface PeerSlot {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
}

const DEFAULT_ICE_TIMEOUT_MS = 10_000;
const DATA_CHANNEL_LABEL = "game";

// ---- Implementation ----

/**
 * A multi-peer (full-mesh) WebRTC DataChannel transport with **manual**
 * (copy-paste) signaling. Each remote peer gets its own
 * `RTCPeerConnection` + `RTCDataChannel`.
 */
export class ManualWebRtcTransport implements Transport {
  readonly self: string;

  protected readonly iceTimeoutMs: number;
  protected readonly peers: Map<string, PeerSlot> = new Map();

  protected messageHandlers: MessageHandler[] = [];
  protected peerEventHandlers: PeerEventHandler[] = [];

  private started = false;

  constructor(opts: ManualWebRtcTransportOptions) {
    this.self = opts.self;
    this.iceTimeoutMs = opts.iceGatheringTimeoutMs ?? DEFAULT_ICE_TIMEOUT_MS;
  }

  // ---- Transport interface ----

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
  }

  async stop(): Promise<void> {
    for (const [, slot] of this.peers) {
      slot.dc?.close();
      slot.pc.close();
    }
    this.peers.clear();
    this.started = false;
  }

  async broadcast(msg: TransportMessage): Promise<void> {
    this.assertStarted();
    const frame = encodeMessage(msg);
    const buf = toArrayBuffer(frame);

    for (const [, slot] of this.peers) {
      if (slot.dc?.readyState === "open") {
        slot.dc.send(buf);
      }
    }
  }

  async send(toPeerId: string, msg: TransportMessage): Promise<void> {
    this.assertStarted();
    const slot = this.peers.get(toPeerId);
    if (!slot?.dc || slot.dc.readyState !== "open") {
      throw new DataChannelNotOpenError();
    }
    const frame = encodeMessage(msg);
    slot.dc.send(toArrayBuffer(frame));
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onPeerEvent(handler: PeerEventHandler): void {
    this.peerEventHandlers.push(handler);
  }

  // ---- Manual signaling API (per-peer) ----

  /**
   * Create an offer for a new peer and return a base64-encoded SDP string.
   * This side creates the DataChannel (offerer).
   */
  async createOfferSdp(peerId: string): Promise<string> {
    this.assertStarted();
    console.log("[transport] createOfferSdp: creating peer connection...");

    const pc = this.createPeerConnection(peerId);
    const dc = pc.createDataChannel(DATA_CHANNEL_LABEL);
    const slot: PeerSlot = { pc, dc };
    this.peers.set(peerId, slot);
    this.attachDataChannelListeners(peerId, dc);

    console.log("[transport] createOfferSdp: creating offer...");
    const offer = await pc.createOffer();
    console.log("[transport] createOfferSdp: setting local description...");
    await pc.setLocalDescription(offer);
    console.log("[transport] createOfferSdp: waiting for ICE gathering...");
    await this.waitForIceGathering(pc);
    console.log("[transport] createOfferSdp: ICE gathering complete.");

    if (!pc.localDescription) {
      throw new Error("Local description is not set");
    }
    return btoa(JSON.stringify(pc.localDescription.toJSON()));
  }

  /**
   * Accept a remote peer's offer and return an answer SDP as base64.
   * This side receives the DataChannel (answerer).
   */
  async acceptOfferAndCreateAnswerSdp(
    peerId: string,
    offer: string,
  ): Promise<string> {
    this.assertStarted();

    const pc = this.createPeerConnection(peerId);
    const slot: PeerSlot = { pc, dc: null };
    this.peers.set(peerId, slot);

    // Listen for the DataChannel created by the offerer
    pc.ondatachannel = (ev) => {
      slot.dc = ev.channel;
      this.attachDataChannelListeners(peerId, ev.channel);
    };

    const offerDesc = this.decodeSdp(offer);
    await pc.setRemoteDescription(offerDesc);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this.waitForIceGathering(pc);

    if (!pc.localDescription) {
      throw new Error("Local description is not set");
    }
    return btoa(JSON.stringify(pc.localDescription.toJSON()));
  }

  /**
   * Accept a remote peer's answer SDP to complete the handshake.
   */
  async acceptAnswerSdp(peerId: string, answer: string): Promise<void> {
    this.assertStarted();
    const slot = this.peers.get(peerId);
    if (!slot) {
      throw new TransportNotStartedError();
    }

    if (slot.pc.signalingState !== "have-local-offer") {
      console.warn(
        `[transport] Ignoring answer for ${peerId} in signalingState: ${slot.pc.signalingState}`,
      );
      return;
    }

    const answerDesc = this.decodeSdp(answer);
    await slot.pc.setRemoteDescription(answerDesc);
  }

  /** List currently connected peer IDs. */
  get connectedPeers(): string[] {
    const result: string[] = [];
    for (const [id, slot] of this.peers) {
      if (slot.dc?.readyState === "open") {
        result.push(id);
      }
    }
    return result;
  }

  // ---- Internal helpers ----

  protected assertStarted(): void {
    if (!this.started) {
      throw new TransportNotStartedError();
    }
  }

  protected createPeerConnection(_peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
      ],
    });

    pc.onconnectionstatechange = () => {
      console.log(
        `[transport] connectionState for ${_peerId}: ${pc.connectionState}`,
      );
      if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        this.removePeer(_peerId, `connection ${pc.connectionState}`);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(
        `[transport] iceConnectionState for ${_peerId}: ${pc.iceConnectionState}`,
      );
    };

    pc.onicegatheringstatechange = () => {
      console.log(
        `[transport] iceGatheringState for ${_peerId}: ${pc.iceGatheringState}`,
      );
    };

    return pc;
  }

  protected removePeer(peerId: string, reason: string): void {
    const slot = this.peers.get(peerId);
    if (!slot) return;

    slot.dc?.close();
    slot.pc.close();
    this.peers.delete(peerId);

    for (const h of this.peerEventHandlers) {
      h({ type: "peer_disconnected", peerId, reason });
    }
  }

  protected decodeSdp(encoded: string): RTCSessionDescriptionInit {
    try {
      const json = atob(encoded);
      return JSON.parse(json) as RTCSessionDescriptionInit;
    } catch (err) {
      throw new SignalingParseError(err);
    }
  }

  protected waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === "complete") {
      return Promise.resolve();
    }

    const ICE_TIMEOUT_MS = 15_000; // Increased to 15s

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        console.warn(
          `[transport] ICE gathering timed out after ${ICE_TIMEOUT_MS}ms. State: ${pc.iceGatheringState}`,
        );
        // If we have some candidates, we can try to proceed instead of failing hard
        if (pc.localDescription?.sdp.includes("a=candidate")) {
          console.log("[transport] Proceeding with partial candidates...");
          resolve();
        } else {
          reject(new IceGatheringTimeoutError(ICE_TIMEOUT_MS));
        }
      }, ICE_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(timer);
        pc.removeEventListener("icegatheringstatechange", onStateChange);
        pc.removeEventListener("icecandidate", onCandidate);
      };

      const done = () => {
        cleanup();
        resolve();
      };

      const onStateChange = () => {
        console.log(
          `[transport] ICE gathering state change: ${pc.iceGatheringState}`,
        );
        if (pc.iceGatheringState === "complete") {
          done();
        }
      };

      const onCandidate = (ev: RTCPeerConnectionIceEvent) => {
        if (ev.candidate === null) {
          console.log(
            "[transport] ICE gathering signaled complete (null candidate)",
          );
          done();
        } else {
          console.log(
            `[transport] Candidate gathered: ${ev.candidate.type} ${ev.candidate.protocol}`,
          );
        }
      };

      pc.addEventListener("icegatheringstatechange", onStateChange);
      pc.addEventListener("icecandidate", onCandidate);
    });
  }

  protected attachDataChannelListeners(
    peerId: string,
    dc: RTCDataChannel,
  ): void {
    dc.binaryType = "arraybuffer";

    dc.onopen = () => {
      for (const h of this.peerEventHandlers) {
        h({ type: "peer_connected", peerId });
      }
    };

    dc.onclose = () => {
      this.removePeer(peerId, "channel closed");
    };

    dc.onerror = (ev) => {
      const reason =
        ev instanceof RTCErrorEvent
          ? ev.error.message
          : "unknown DataChannel error";
      this.removePeer(peerId, reason);
    };

    dc.onmessage = (ev: MessageEvent) => {
      const raw: ArrayBuffer | string = ev.data;
      const bytes =
        typeof raw === "string"
          ? new TextEncoder().encode(raw)
          : new Uint8Array(raw);

      const msg = decodeMessage(bytes);
      for (const h of this.messageHandlers) {
        h(peerId, msg);
      }
    };
  }
}

// ---- Utility ----

function toArrayBuffer(frame: Uint8Array): ArrayBuffer {
  return frame.buffer.slice(
    frame.byteOffset,
    frame.byteOffset + frame.byteLength,
  ) as ArrayBuffer;
}
