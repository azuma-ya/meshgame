import type { ExportedKeyPair, KeyPair } from "./types.js";

// ---- Algorithm constants ----

const ECDSA_PARAMS: EcKeyGenParams = { name: "ECDSA", namedCurve: "P-256" };
const SIGN_PARAMS: EcdsaParams = { name: "ECDSA", hash: "SHA-256" };

// ---- Hex helpers ----

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ---- Key pair management ----

/**
 * Generate a new ECDSA P-256 key pair.
 * The `publicKeyHex` can be used as the player identity.
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const { publicKey, privateKey } = (await crypto.subtle.generateKey(
    ECDSA_PARAMS,
    true, // extractable — needed for export / import
    ["sign", "verify"],
  )) as CryptoKeyPair;

  const rawPublic = await crypto.subtle.exportKey("raw", publicKey);
  const publicKeyHex = toHex(new Uint8Array(rawPublic));

  return { publicKey, privateKey, publicKeyHex };
}

/**
 * Export a key pair to a serialisable JWK format.
 * Suitable for saving to `localStorage` or any JSON store.
 */
export async function exportKeyPair(kp: KeyPair): Promise<ExportedKeyPair> {
  const [publicKeyJwk, privateKeyJwk] = await Promise.all([
    crypto.subtle.exportKey("jwk", kp.publicKey),
    crypto.subtle.exportKey("jwk", kp.privateKey),
  ]);
  return { publicKeyJwk, privateKeyJwk, publicKeyHex: kp.publicKeyHex };
}

/**
 * Import a key pair from previously exported JWK data.
 */
export async function importKeyPair(
  exported: ExportedKeyPair,
): Promise<KeyPair> {
  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.importKey("jwk", exported.publicKeyJwk, ECDSA_PARAMS, true, [
      "verify",
    ]),
    crypto.subtle.importKey("jwk", exported.privateKeyJwk, ECDSA_PARAMS, true, [
      "sign",
    ]),
  ]);
  return { publicKey, privateKey, publicKeyHex: exported.publicKeyHex };
}

/**
 * Import another player's public key from its hex representation.
 * Returns a `CryptoKey` that can be used for signature verification.
 */
export async function importPublicKey(hex: string): Promise<CryptoKey> {
  const raw = fromHex(hex);
  return crypto.subtle.importKey(
    "raw",
    raw.buffer as ArrayBuffer,
    ECDSA_PARAMS,
    true,
    ["verify"],
  );
}

// ---- Signing & verification ----

/**
 * Sign arbitrary data with an ECDSA P-256 private key.
 * Returns the raw signature bytes.
 */
export async function sign(
  privateKey: CryptoKey,
  data: Uint8Array,
): Promise<Uint8Array> {
  const sig = await crypto.subtle.sign(
    SIGN_PARAMS,
    privateKey,
    data.buffer as ArrayBuffer,
  );
  return new Uint8Array(sig);
}

/**
 * Verify an ECDSA P-256 signature.
 *
 * @param publicKeyHex — Hex-encoded raw public key of the signer.
 * @param data         — The original data that was signed.
 * @param signature    — The raw signature bytes.
 * @returns `true` if the signature is valid.
 */
export async function verify(
  publicKeyHex: string,
  data: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  const pubKey = await importPublicKey(publicKeyHex);
  return crypto.subtle.verify(
    SIGN_PARAMS,
    pubKey,
    signature.buffer as ArrayBuffer,
    data.buffer as ArrayBuffer,
  );
}
