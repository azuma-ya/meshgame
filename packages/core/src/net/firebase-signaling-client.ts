import type {
  PeerListHandler,
  SignalingClient,
  SignalingMessage,
  SignalingMessageHandler,
} from "./signaling-client.js";

// ---- Minimal Firebase RTDB types (avoids importing firebase) ----

/**
 * Opaque reference to a Firebase RTDB location.
 * Compatible with `DatabaseReference` from `firebase/database`.
 */
// biome-ignore lint/suspicious/noEmptyInterface: opaque handle
export interface FirebaseDbRef {}

/**
 * Minimal snapshot type matching `DataSnapshot` from `firebase/database`.
 */
export interface FirebaseDbSnapshot {
  val(): unknown;
  key: string | null;
}

/**
 * Bundle of Firebase RTDB functions required by {@link FirebaseSignalingClient}.
 *
 * Pass the functions directly from `firebase/database` — no wrapper needed.
 *
 * @example
 * ```ts
 * import {
 *   getDatabase, ref, set, push, remove,
 *   onValue, onChildAdded, onDisconnect,
 * } from "firebase/database";
 *
 * const firebase: FirebaseFunctions = {
 *   db: getDatabase(app),
 *   ref, set, push, remove, onValue, onChildAdded, onDisconnect,
 * };
 * ```
 */
export interface FirebaseFunctions {
  /** Firebase `Database` instance from `getDatabase()`. */
  db: object;

  /** `ref(db, path)` — create a database reference. */
  ref(db: object, path: string): FirebaseDbRef;

  /** `set(ref, value)` — write data. */
  set(ref: FirebaseDbRef, value: unknown): Promise<void>;

  /** `push(ref, value)` — push a new child. */
  push(ref: FirebaseDbRef, value: unknown): unknown;

  /** `remove(ref)` — delete data. */
  remove(ref: FirebaseDbRef): Promise<void>;

  /** `onValue(ref, cb)` — listen for value changes. Returns unsubscribe. */
  onValue(
    ref: FirebaseDbRef,
    cb: (snapshot: FirebaseDbSnapshot) => void,
  ): () => void;

  /** `onChildAdded(ref, cb)` — listen for new children. Returns unsubscribe. */
  onChildAdded(
    ref: FirebaseDbRef,
    cb: (snapshot: FirebaseDbSnapshot) => void,
  ): () => void;

  /** `onDisconnect(ref)` — returns an OnDisconnect object. */
  onDisconnect(ref: FirebaseDbRef): { remove(): Promise<void> };
}

// ---- Implementation ----

/**
 * A {@link SignalingClient} backed by Firebase Realtime Database.
 *
 * **Completely serverless** — no auth endpoint needed (uses anonymous
 * or client-side Firebase Auth). Data model:
 *
 * ```
 * <channelPath>/
 *   presence/
 *     <peerId>: true          ← auto-removed on disconnect
 *   messages/
 *     <pushId>: SignalingMessage
 * ```
 *
 * - **Peer discovery**: Listens to `presence/` with `onValue` and
 *   derives the peer list from the keys.
 * - **Signaling**: Pushes `SignalingMessage` objects to `messages/`
 *   and listens with `onChildAdded`. Messages are filtered by `to`.
 * - **Cleanup**: Uses `onDisconnect().remove()` for presence, ensuring
 *   peers are automatically removed when they disconnect.
 *
 * @example
 * ```ts
 * import { initializeApp } from "firebase/app";
 * import {
 *   getDatabase, ref, set, push, remove,
 *   onValue, onChildAdded, onDisconnect,
 * } from "firebase/database";
 *
 * const app = initializeApp({ ... });
 * const signaling = new FirebaseSignalingClient(
 *   { db: getDatabase(app), ref, set, push, remove, onValue, onChildAdded, onDisconnect },
 *   "signaling/game-room",
 * );
 * const transport = new SignaledMeshWebRtcTransport({ self: "alice" }, signaling);
 * await transport.start();
 * ```
 */
export class FirebaseSignalingClient implements SignalingClient {
  private peerId: string | null = null;
  private readonly messageHandlers: SignalingMessageHandler[] = [];
  private readonly peerListHandlers: PeerListHandler[] = [];
  private readonly unsubscribes: (() => void)[] = [];

  constructor(
    private readonly fb: FirebaseFunctions,
    private readonly channelPath: string,
  ) {}

  async connect(peerId: string): Promise<void> {
    this.peerId = peerId;

    const presenceRef = this.fb.ref(
      this.fb.db,
      `${this.channelPath}/presence/${peerId}`,
    );
    const presenceRootRef = this.fb.ref(
      this.fb.db,
      `${this.channelPath}/presence`,
    );
    const messagesRef = this.fb.ref(this.fb.db, `${this.channelPath}/messages`);

    // Register presence
    await this.fb.set(presenceRef, true);
    await this.fb.onDisconnect(presenceRef).remove();

    // Listen for presence changes → peer list
    const unsubPresence = this.fb.onValue(presenceRootRef, (snapshot) => {
      const val = snapshot.val() as Record<string, boolean> | null;
      const peerIds = val ? Object.keys(val) : [];
      for (const h of this.peerListHandlers) {
        h(peerIds);
      }
    });
    this.unsubscribes.push(unsubPresence);

    // Listen for signaling messages
    const unsubMessages = this.fb.onChildAdded(messagesRef, (snapshot) => {
      const msg = snapshot.val() as SignalingMessage | null;
      if (!msg || msg.to !== this.peerId) return;

      for (const h of this.messageHandlers) {
        h(msg);
      }

      // Clean up processed message
      if (snapshot.key) {
        const msgRef = this.fb.ref(
          this.fb.db,
          `${this.channelPath}/messages/${snapshot.key}`,
        );
        this.fb.remove(msgRef).catch(() => {});
      }
    });
    this.unsubscribes.push(unsubMessages);
  }

  async disconnect(): Promise<void> {
    // Unsubscribe all listeners
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes.length = 0;

    // Remove presence
    if (this.peerId) {
      const presenceRef = this.fb.ref(
        this.fb.db,
        `${this.channelPath}/presence/${this.peerId}`,
      );
      await this.fb.remove(presenceRef).catch(() => {});
    }

    this.peerId = null;
  }

  async send(msg: SignalingMessage): Promise<void> {
    const messagesRef = this.fb.ref(this.fb.db, `${this.channelPath}/messages`);
    await this.fb.push(messagesRef, msg);
  }

  onMessage(handler: SignalingMessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onPeerList(handler: PeerListHandler): void {
    this.peerListHandlers.push(handler);
  }
}
