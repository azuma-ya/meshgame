import type {
  MessageHandler,
  PeerEventHandler,
  Transport,
  TransportMessage,
} from "../net/transport.js";
import { sign, verify } from "./identity.js";
import type {
  KeyPair,
  SignedEnvelope,
  VerificationFailureHandler,
} from "./types.js";

const textEncoder = new TextEncoder();

// ---- Helpers ----

/** Base64 encode `Uint8Array`. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Base64 decode → `Uint8Array`. */
function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Concatenate topic + payload into a single buffer for signing. */
function buildSignData(topic: string, payload: Uint8Array): Uint8Array {
  const topicBytes = textEncoder.encode(topic);
  const data = new Uint8Array(topicBytes.length + payload.length);
  data.set(topicBytes, 0);
  data.set(payload, topicBytes.length);
  return data;
}

// ---- Topic used for signed envelopes ----

const SIGNED_ENVELOPE_TOPIC = "__signed__";

// ---- Implementation ----

/**
 * A Transport decorator that **signs** every outgoing message with
 * the local player's ECDSA key pair and **verifies** every incoming
 * message's signature before delivering it to application handlers.
 *
 * The `self` property is overridden with the player's `publicKeyHex`,
 * making the public key the canonical player identity.
 *
 * @example
 * ```ts
 * const inner = new SignaledMeshWebRtcTransport(opts, signaling);
 * const keyPair = await generateKeyPair();
 * const transport = new SignedTransport(inner, keyPair);
 *
 * await transport.start();
 * // `transport.self` === keyPair.publicKeyHex
 * ```
 */
export class SignedTransport implements Transport {
  /** Player identity = hex-encoded ECDSA P-256 public key. */
  readonly self: string;

  private readonly inner: Transport;
  private readonly keyPair: KeyPair;
  private readonly appMessageHandlers: MessageHandler[] = [];
  private readonly appPeerEventHandlers: PeerEventHandler[] = [];
  private readonly failureHandlers: VerificationFailureHandler[] = [];

  constructor(inner: Transport, keyPair: KeyPair) {
    this.inner = inner;
    this.keyPair = keyPair;
    this.self = keyPair.publicKeyHex;

    // Intercept incoming messages from the inner transport.
    this.inner.onMessage((fromPeerId, msg) => {
      void this.handleIncoming(fromPeerId, msg);
    });

    // Forward peer events as-is.
    this.inner.onPeerEvent((ev) => {
      for (const h of this.appPeerEventHandlers) {
        h(ev);
      }
    });
  }

  // ---- Transport interface ----

  async start(): Promise<void> {
    return this.inner.start();
  }

  async stop(): Promise<void> {
    return this.inner.stop();
  }

  async broadcast(msg: TransportMessage): Promise<void> {
    const signed = await this.wrapAndSign(msg);
    return this.inner.broadcast(signed);
  }

  async send(toPeerId: string, msg: TransportMessage): Promise<void> {
    const signed = await this.wrapAndSign(msg);
    return this.inner.send(toPeerId, signed);
  }

  onMessage(handler: MessageHandler): void {
    this.appMessageHandlers.push(handler);
  }

  onPeerEvent(handler: PeerEventHandler): void {
    this.appPeerEventHandlers.push(handler);
  }

  // ---- Verification failure ----

  /**
   * Register a handler that is called when a received message
   * fails signature verification.
   */
  onVerificationFailure(handler: VerificationFailureHandler): void {
    this.failureHandlers.push(handler);
  }

  // ---- Internal: sign outgoing ----

  private async wrapAndSign(msg: TransportMessage): Promise<TransportMessage> {
    const signData = buildSignData(msg.topic, msg.payload);
    const signature = await sign(this.keyPair.privateKey, signData);

    const envelope: SignedEnvelope = {
      senderId: this.self,
      topic: msg.topic,
      payloadB64: toBase64(msg.payload),
      signatureB64: toBase64(signature),
    };

    return {
      topic: SIGNED_ENVELOPE_TOPIC,
      payload: textEncoder.encode(JSON.stringify(envelope)),
    };
  }

  // ---- Internal: verify incoming ----

  private async handleIncoming(
    fromPeerId: string,
    msg: TransportMessage,
  ): Promise<void> {
    // Only process signed envelopes; pass through other messages.
    if (msg.topic !== SIGNED_ENVELOPE_TOPIC) {
      for (const h of this.appMessageHandlers) {
        h(fromPeerId, msg);
      }
      return;
    }

    let envelope: SignedEnvelope;
    try {
      const json = new TextDecoder().decode(msg.payload);
      envelope = JSON.parse(json) as SignedEnvelope;
    } catch {
      this.notifyFailure(fromPeerId, undefined, "Failed to parse envelope");
      return;
    }

    const payload = fromBase64(envelope.payloadB64);
    const signature = fromBase64(envelope.signatureB64);
    const signData = buildSignData(envelope.topic, payload);

    let valid: boolean;
    try {
      valid = await verify(envelope.senderId, signData, signature);
    } catch {
      this.notifyFailure(fromPeerId, envelope, "Verification threw an error");
      return;
    }

    if (!valid) {
      this.notifyFailure(fromPeerId, envelope, "Invalid signature");
      return;
    }

    // Deliver verified message with senderId (public key) as the peer ID.
    const verifiedMsg: TransportMessage = {
      topic: envelope.topic,
      payload,
    };
    for (const h of this.appMessageHandlers) {
      h(envelope.senderId, verifiedMsg);
    }
  }

  private notifyFailure(
    fromPeerId: string,
    envelope: SignedEnvelope | undefined,
    reason: string,
  ): void {
    if (this.failureHandlers.length === 0) {
      console.warn(
        `[signed-transport] Verification failure from ${fromPeerId}: ${reason}`,
      );
      return;
    }

    const fallback: SignedEnvelope = envelope ?? {
      senderId: "unknown",
      topic: "unknown",
      payloadB64: "",
      signatureB64: "",
    };

    for (const h of this.failureHandlers) {
      h(fromPeerId, fallback, reason);
    }
  }
}
