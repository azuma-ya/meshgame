import type { EngineAdapter } from "../engine/index.js";
import { type ActionLog, MemoryLogStore } from "../log/index.js";
import {
  BasicMembership,
  type Membership,
  type NodeRole,
  type PeerInfo,
} from "../membership/index.js";
import type { Transport } from "../net/transport.js";
import { HostlessLockstepOrdering, type Ordering } from "../ordering/index.js";
import { decodeMessage, encodeMessage } from "../protocol/codec.js";
import type { NodeMessage } from "../protocol/types.js";

export interface GameNodeOptions {
  transport: Transport;
  initialRole?: NodeRole;
  config: {
    t0Ms?: number; // Optional: If starting fresh, defaults to now. If joining, overridden.
    tickMs: number;
    inputDelayTicks: number;
    roomId: string;
  };
}

/**
 * GameNode Facade.
 * Binds Transport, Membership, Log, and Lockstep Ordering.
 */
export class GameNode<S, A> {
  readonly transport: Transport;
  readonly membership: Membership;
  readonly log: ActionLog;
  readonly ordering: Ordering;

  private state: S;
  private engine: EngineAdapter<S, A>;
  private tickerInterval: ReturnType<typeof setInterval> | undefined; // Node/Browser timer

  constructor(opts: GameNodeOptions, engine: EngineAdapter<S, A>) {
    this.transport = opts.transport;
    this.engine = engine;
    this.state = engine.initialState;

    // Initialize components
    const selfInfo: PeerInfo = {
      peerId: this.transport.self,
      role: opts.initialRole || "peer",
      joinedAt: Date.now(),
    };

    this.membership = new BasicMembership(selfInfo);
    this.log = new MemoryLogStore();

    // Config defaults
    const orderingConfig = {
      t0Ms: opts.config.t0Ms ?? Date.now(),
      tickMs: opts.config.tickMs,
      inputDelayTicks: opts.config.inputDelayTicks,
      roomId: opts.config.roomId,
    };

    this.ordering = new HostlessLockstepOrdering(
      this.membership,
      this.log,
      orderingConfig,
    );

    // Bind handlers
    this.transport.onMessage((from, msg) =>
      this.handleTransportMessage(from, msg),
    );
    this.transport.onPeerEvent((ev) => {
      if (ev.type === "peer_connected") {
        // For MVP, simplistic handling.
        // In real app, we wait for Hello/Join to add to membership with role.
        // But lockstep ordering needs them in membership to sort commits.
        this.membership.addPeer({
          peerId: ev.peerId,
          role: "peer",
          joinedAt: Date.now(),
        });
      } else if (ev.type === "peer_disconnected") {
        this.membership.removePeer(ev.peerId);
      }
    });
  }

  async start(): Promise<void> {
    await this.transport.start();

    // Start Ticker
    // MVP: simple interval. For high precision, use requestAnimationFrame or recursive setTimeout with drift correction.
    this.tickerInterval = setInterval(() => {
      this.advanceTick();
    }, 16); // Check every ~frame, though ordering.tick() handles the actual logic logic
  }

  async stop(): Promise<void> {
    clearInterval(this.tickerInterval);
    await this.transport.stop();
  }

  /**
   * Submit an action to the network.
   */
  submit(action: A): void {
    this.ordering.onLocalAction(action, Date.now());
    // Force immediate tick check to flush outbound if needed
    this.advanceTick();
  }

  getState(): S {
    return this.state;
  }

  getHeight(): number {
    return this.ordering.getHeight();
  }

  private advanceTick() {
    const output = this.ordering.tick(Date.now());

    // 1. Flush Outbound
    for (const msg of output.outbound) {
      const encoded = encodeMessage(msg);
      // Broadcast to everyone (gossip)
      // Note: In a real optimized system we might multicast or use tree
      this.transport
        .broadcast({
          topic: "protocol",
          payload: encoded,
        })
        .catch((e) => console.error("Broadcast failed", e));
    }

    // 2. Apply Commits
    for (const commit of output.commits) {
      // Commit contains a block of actions.
      // We must apply them in deterministic order (already sorted by ordering).

      for (const peerAction of commit.actionsByPeer) {
        if (peerAction.payload === null) continue; // NOOP

        try {
          const action = this.engine.decodeAction(peerAction.payload);
          this.state = this.engine.reduce(this.state, action, {
            from: peerAction.peerId,
            height: commit.height,
            tick: commit.tick,
          });
        } catch (e) {
          console.error("Failed to reduce action", e);
        }
      }
    }
  }

  private async handleTransportMessage(
    from: string,
    tMsg: { topic: string; payload: Uint8Array },
  ) {
    if (tMsg.topic === "protocol") {
      try {
        const msg = decodeMessage(tMsg.payload);
        const handled = this.ordering.handleMessage(from, msg);
        // Ordering handles PROPOSE.
        // We might need to handle JOIN/WELCOME here if not in ordering.
        if (!handled) {
          this.handleManagementMessage(from, msg);
        }
      } catch (e) {
        console.warn("Invalid protocol message", e);
      }
    }
  }

  private handleManagementMessage(from: string, msg: NodeMessage) {
    if (msg.type === "JOIN") {
      // If I was a host I would welcome. But we are hostless.
      // Everyone can welcome or we just use it to track peers.
      this.membership.addPeer({
        peerId: from,
        role: "peer",
        joinedAt: Date.now(),
      });
    }
    // TODO: Implement full Join/Welcome flow for t0 sync.
    // For MVP we assume config is shared or we assume t0 is fixed.
  }
}
