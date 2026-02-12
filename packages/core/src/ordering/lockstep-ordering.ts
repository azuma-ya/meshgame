import type { Commit } from "../log/types.js";
import type { Membership } from "../membership/types.js";
import type { PeerEvent, Transport } from "../net/transport.js";
import { decodeMessage, encodeMessage } from "../protocol/codec.js";
import type { NodeMessage } from "../protocol/types.js";
import { getCurrentTick, getTickDeadline } from "../time/tick.js";
import type { Ordering } from "./types.js";

/**
 * Hostless Lockstep Ordering.
 *
 * - Encapsulates Transport.
 * - Manages message handling internally.
 * - Emits committed blocks via onCommit callback.
 */
export class HostlessLockstepOrdering implements Ordering {
  private readonly buffer = new Map<number, Map<string, unknown>>();
  private currentTick = -1;
  private committedHeight = 0;
  private commitCallbacks: ((commit: Commit) => void)[] = [];
  private peerCallbacks: ((ev: PeerEvent) => void)[] = [];

  constructor(
    private readonly transport: Transport,
    private readonly membership: Membership,
    private readonly config: {
      t0Ms: number;
      tickMs: number;
      inputDelayTicks: number;
      roomId: string;
    },
  ) {}

  async start(): Promise<void> {
    this.transport.onMessage((from, tMsg) => {
      if (tMsg.topic === "protocol") {
        try {
          const msg = decodeMessage(tMsg.payload);
          this.handleMessage(from, msg);
        } catch (e) {
          console.warn("Invalid protocol message", e);
        }
      }
    });

    this.transport.onPeerEvent((ev) => {
      if (ev.type === "peer_connected") {
        this.membership.addPeer({
          peerId: ev.peerId,
          role: "peer",
          joinedAt: Date.now(),
        });
      } else if (ev.type === "peer_disconnected") {
        this.membership.removePeer(ev.peerId);
      }
      for (const cb of this.peerCallbacks) cb(ev);
    });

    await this.transport.start();

    // Sync currentTick to now to avoid replaying from t0 if t0 is in the past
    const liveTick = getCurrentTick(
      Date.now(),
      this.config.t0Ms,
      this.config.tickMs,
    );
    this.currentTick = liveTick - 1;
    console.log(`[Lockstep] Started at tick ${this.currentTick}`);
  }

  async stop(): Promise<void> {
    await this.transport.stop();
  }

  onCommit(callback: (commit: Commit) => void): void {
    this.commitCallbacks.push(callback);
  }

  onPeerEvent(callback: (ev: PeerEvent) => void): void {
    this.peerCallbacks.push(callback);
  }

  getPeers(): string[] {
    return this.membership.getPeers().map((p) => p.peerId);
  }

  private handleMessage(fromPeerId: string, msg: NodeMessage) {
    switch (msg.type) {
      case "ACTION_PROPOSE": {
        if (msg.roomId !== this.config.roomId) return;

        // Too late?
        if (msg.tick <= this.currentTick) {
          return;
        }

        let tickBuffer = this.buffer.get(msg.tick);
        if (!tickBuffer) {
          tickBuffer = new Map();
          this.buffer.set(msg.tick, tickBuffer);
        }

        if (!tickBuffer.has(fromPeerId)) {
          tickBuffer.set(fromPeerId, msg.payload);
        }
        break;
      }
      case "ACTION_COMMIT": {
        // Validation / Gossip could happen here
        break;
      }
      case "JOIN": {
        // Handle JOIN explicitly if passed down?
        // Actually, we use implicit join via transport event for now in `start()`
        // But if `JOIN` message carries more info, we process it here.
        this.membership.addPeer({
          peerId: fromPeerId,
          role: "peer",
          joinedAt: Date.now(),
        });
        break;
      }
    }
  }

  onLocalAction(payload: unknown, nowMs: number): void {
    const liveTick = getCurrentTick(
      nowMs,
      this.config.t0Ms,
      this.config.tickMs,
    );
    const targetTick = liveTick + this.config.inputDelayTicks;

    // 1. Buffer locally
    let tickBuffer = this.buffer.get(targetTick);
    if (!tickBuffer) {
      tickBuffer = new Map();
      this.buffer.set(targetTick, tickBuffer);
    }
    tickBuffer.set(this.membership.self.peerId, payload);

    // 2. Broadcast Proposal
    const msg: NodeMessage = {
      type: "ACTION_PROPOSE",
      roomId: this.config.roomId,
      peerId: this.membership.self.peerId,
      tick: targetTick,
      payload: payload,
    };
    this.broadcast(msg);
  }

  tick(nowMs: number): void {
    const liveTick = getCurrentTick(
      nowMs,
      this.config.t0Ms,
      this.config.tickMs,
    );

    if (liveTick < 0) return;

    let nextTick = this.currentTick + 1;
    let processedCount = 0;
    const MAX_TICKS_PER_FRAME = 100;

    // Check deadlines
    while (true) {
      // Safety break
      if (processedCount++ > MAX_TICKS_PER_FRAME) {
        console.warn(
          "LockstepOrdering: Exceeded max ticks per frame, skipping catchup",
        );
        break;
      }

      const deadline = getTickDeadline(
        nextTick,
        this.config.t0Ms,
        this.config.tickMs,
      );
      if (nowMs >= deadline) {
        // Finalize this tick
        const peers = this.membership.getPeers();
        // Deterministic sort
        peers.sort((a, b) => a.peerId.localeCompare(b.peerId));
        const tickBuffer = this.buffer.get(nextTick);

        const actionsByPeer: Array<{
          peerId: string;
          payload: unknown | null;
        }> = [];

        for (const p of peers) {
          const payload = tickBuffer?.get(p.peerId) ?? null;
          actionsByPeer.push({ peerId: p.peerId, payload });

          if (payload !== null) {
            this.committedHeight++;
            const commit: Commit = {
              seq: this.committedHeight,
              action: {
                peerId: p.peerId,
                payload: payload,
              },
              metadata: {
                tick: nextTick,
              },
            };

            // Emit individual commit
            for (const cb of this.commitCallbacks) {
              try {
                cb(commit);
              } catch (e) {
                console.error(e);
              }
            }
          }
        }

        // Broadcast gossip (Still batch for efficiency, but height is now a running sequence)
        this.broadcast({
          type: "ACTION_COMMIT",
          roomId: this.config.roomId,
          tick: nextTick,
          height: this.committedHeight,
          actionsByPeer,
        });

        this.currentTick = nextTick;
        this.buffer.delete(nextTick);

        nextTick++;
      } else {
        break;
      }
    }
  }

  private broadcast(msg: NodeMessage) {
    const encoded = encodeMessage(msg);
    this.transport
      .broadcast({
        topic: "protocol",
        payload: encoded,
      })
      .catch((e) => console.error("Broadcast failed", e));
  }
}
