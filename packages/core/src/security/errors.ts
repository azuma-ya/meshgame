/** Signature verification failed for a received message. */
export class SignatureVerificationError extends Error {
  constructor(senderId: string, reason?: string) {
    super(
      `Signature verification failed for sender ${senderId}${reason ? `: ${reason}` : ""}.`,
    );
    this.name = "SignatureVerificationError";
  }
}
