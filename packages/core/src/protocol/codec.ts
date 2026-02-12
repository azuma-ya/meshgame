import type { Envelope, NodeMessage } from "./types.js";

/**
 * JSON Codec for GameNode protocol.
 * Encodes messages to/from Uint8Array (via string).
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeMessage(msg: NodeMessage): Uint8Array {
  const envelope: Envelope = {
    v: "v1",
    ts: Date.now(),
    msg,
  };
  return textEncoder.encode(JSON.stringify(envelope));
}

export function decodeMessage(data: Uint8Array): NodeMessage {
  const json = textDecoder.decode(data);
  try {
    const envelope = JSON.parse(json) as Envelope;
    if (envelope.v !== "v1") {
      throw new Error(`Unsupported protocol version: ${envelope.v}`);
    }
    return envelope.msg;
  } catch (err) {
    throw new Error(`Failed to decode protocol message: ${String(err)}`);
  }
}
