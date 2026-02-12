// Identity — ECDSA P-256 signature & verification

export { SignatureVerificationError } from "./errors.js";
export {
  exportKeyPair,
  generateKeyPair,
  importKeyPair,
  importPublicKey,
  sign,
  verify,
} from "./identity.js";
export { SignedTransport } from "./signed-transport.js";
export type {
  ExportedKeyPair,
  KeyPair,
  SignedEnvelope,
  VerificationFailureHandler,
} from "./types.js";
