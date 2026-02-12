import type { TransportMessage } from "./transport.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Binary frame layout:
 *   [topicLen: 2 bytes LE] [topic: UTF-8] [payload: remaining bytes]
 */

/** Encode a TransportMessage into a single Uint8Array frame. */
export function encodeMessage(msg: TransportMessage): Uint8Array {
  const topicBytes = textEncoder.encode(msg.topic);
  if (topicBytes.length > 0xffff) {
    throw new RangeError("Topic is too long (max 65535 bytes).");
  }

  const frame = new Uint8Array(2 + topicBytes.length + msg.payload.length);
  // topic length — little-endian 16-bit
  frame[0] = topicBytes.length & 0xff;
  frame[1] = (topicBytes.length >> 8) & 0xff;
  frame.set(topicBytes, 2);
  frame.set(msg.payload, 2 + topicBytes.length);
  return frame;
}

/** Decode a Uint8Array frame back into a TransportMessage. */
export function decodeMessage(bytes: Uint8Array): TransportMessage {
  if (bytes.length < 2) {
    throw new RangeError("Frame too short to contain a header.");
  }

  const topicLen = bytes[0] | (bytes[1] << 8);
  if (bytes.length < 2 + topicLen) {
    throw new RangeError("Frame too short for the declared topic length.");
  }

  const topic = textDecoder.decode(bytes.subarray(2, 2 + topicLen));
  const payload = bytes.slice(2 + topicLen);
  return { topic, payload };
}
