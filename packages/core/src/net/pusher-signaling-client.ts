import type {
  PeerListHandler,
  SignalingClient,
  SignalingMessage,
  SignalingMessageHandler,
} from "./signaling-client.js";

// ---- Minimal Pusher types (avoids importing pusher-js) ----

/** Minimal subset of pusher-js `Members` used by this adapter. */
interface PusherMembers {
  count: number;
  each(callback: (member: { id: string }) => void): void;
}

/** Minimal subset of pusher-js `PresenceChannel` used by this adapter. */
export interface PusherPresenceChannel {
  bind(event: string, callback: (...args: never[]) => void): void;
  unbind(event: string, callback?: (...args: never[]) => void): void;
  trigger(event: string, data: unknown): boolean;
  members: PusherMembers;
}

/** Minimal subset of pusher-js `Pusher` used by this adapter. */
export interface PusherInstance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscribe(channelName: string): any;
  unsubscribe(channelName: string): void;
}

// ---- Client event names ----

const CLIENT_SIGNAL_EVENT = "client-signal";

// ---- Implementation ----

/**
 * A {@link SignalingClient} backed by Pusher presence channels.
 *
 * - Uses **presence channels** for automatic peer discovery
 *   (`pusher:member_added` / `pusher:member_removed`).
 * - Uses **client events** (`client-signal`) for SDP relay, which
 *   bypasses the application server entirely.
 *
 * ## Prerequisites
 *
 * 1. Install `pusher-js` in your application.
 * 2. Enable **client events** in the Pusher dashboard.
 * 3. Set up an auth endpoint for presence channels.
 *    The `user_id` returned by the auth endpoint **must** match the
 *    `peerId` passed to {@link connect}.
 *
 * ## Example
 *
 * ```ts
 * import Pusher from "pusher-js";
 *
 * const pusher = new Pusher("APP_KEY", {
 *   cluster: "ap3",
 *   authEndpoint: "/api/pusher/auth",
 * });
 *
 * const signaling = new PusherSignalingClient(pusher, "presence-game-room");
 * const transport = new SignaledMeshWebRtcTransport(
 *   { self: "player-1" },
 *   signaling,
 * );
 * await transport.start();
 * ```
 */
export class PusherSignalingClient implements SignalingClient {
  private channel: PusherPresenceChannel | null = null;
  private peerId: string | null = null;
  private readonly messageHandlers: SignalingMessageHandler[] = [];
  private readonly peerListHandlers: PeerListHandler[] = [];

  constructor(
    private readonly pusher: PusherInstance,
    private readonly channelName: string,
  ) {}

  async connect(peerId: string): Promise<void> {
    this.peerId = peerId;

    return new Promise<void>((resolve, reject) => {
      const channel = this.pusher.subscribe(this.channelName);
      this.channel = channel;

      // Subscription succeeded — resolve and emit initial peer list
      channel.bind(
        "pusher:subscription_succeeded",
        (members: PusherMembers) => {
          const peerIds = this.collectMemberIds(members);
          this.emitPeerList(peerIds);
          resolve();
        },
      );

      channel.bind(
        "pusher:subscription_error",
        (err: { type: string; error: string }) => {
          reject(
            new Error(`Pusher subscription error: ${err.error ?? err.type}`),
          );
        },
      );

      // Member tracking
      channel.bind("pusher:member_added", (_member: { id: string }) => {
        this.emitPeerList(this.collectMemberIds(channel.members));
      });

      channel.bind("pusher:member_removed", (_member: { id: string }) => {
        this.emitPeerList(this.collectMemberIds(channel.members));
      });

      // Signaling messages
      channel.bind(CLIENT_SIGNAL_EVENT, (data: SignalingMessage) => {
        // Client events are NOT sent to the sender, only to others,
        // but we still filter by `to` for multi-peer rooms.
        if (data.to !== this.peerId) return;

        for (const h of this.messageHandlers) {
          h(data);
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.channel) {
      this.pusher.unsubscribe(this.channelName);
      this.channel = null;
    }
    this.peerId = null;
  }

  async send(msg: SignalingMessage): Promise<void> {
    if (!this.channel) {
      throw new Error("Not connected to Pusher channel.");
    }
    this.channel.trigger(CLIENT_SIGNAL_EVENT, msg);
  }

  onMessage(handler: SignalingMessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onPeerList(handler: PeerListHandler): void {
    this.peerListHandlers.push(handler);
  }

  // ---- Internal helpers ----

  private collectMemberIds(members: PusherMembers): string[] {
    const ids: string[] = [];
    members.each((member) => ids.push(member.id));
    return ids;
  }

  private emitPeerList(peerIds: string[]): void {
    for (const h of this.peerListHandlers) {
      h(peerIds);
    }
  }
}
