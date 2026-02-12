// ---- Key pair ----

/** An ECDSA P-256 key pair with a hex-encoded public key identifier. */
export interface KeyPair {
  readonly publicKey: CryptoKey;
  readonly privateKey: CryptoKey;
  /** Hex-encoded raw public key — used as the player identity. */
  readonly publicKeyHex: string;
}

/** Serialisable representation of a key pair (JWK format). */
export interface ExportedKeyPair {
  readonly publicKeyJwk: JsonWebKey;
  readonly privateKeyJwk: JsonWebKey;
  readonly publicKeyHex: string;
}

// ---- Signed envelope ----

/**
 * Wire-format envelope that wraps every message with an identity
 * signature so the receiver can verify the sender.
 */
export interface SignedEnvelope {
  /** Hex-encoded raw public key of the sender. */
  readonly senderId: string;
  /** Original message topic. */
  readonly topic: string;
  /** Original binary payload (base64-encoded for JSON transport). */
  readonly payloadB64: string;
  /** ECDSA SHA-256 signature over `topic + payload` (base64-encoded). */
  readonly signatureB64: string;
}

// ---- Callback types ----

/** Called when a received message fails signature verification. */
export type VerificationFailureHandler = (
  fromPeerId: string,
  envelope: SignedEnvelope,
  reason: string,
) => void;
