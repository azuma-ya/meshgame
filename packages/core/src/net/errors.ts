/** Transport has not been started yet. Call start() first. */
export class TransportNotStartedError extends Error {
  constructor() {
    super("Transport has not been started. Call start() first.");
    this.name = "TransportNotStartedError";
  }
}

/** DataChannel is not open. Connection may not be established yet. */
export class DataChannelNotOpenError extends Error {
  constructor() {
    super("DataChannel is not open.");
    this.name = "DataChannelNotOpenError";
  }
}

/** Failed to parse signaling data (SDP). */
export class SignalingParseError extends Error {
  constructor(cause?: unknown) {
    super("Failed to parse signaling data.");
    this.name = "SignalingParseError";
    this.cause = cause;
  }
}

/** ICE gathering did not complete within the timeout. */
export class IceGatheringTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`ICE gathering timed out after ${timeoutMs}ms.`);
    this.name = "IceGatheringTimeoutError";
  }
}
