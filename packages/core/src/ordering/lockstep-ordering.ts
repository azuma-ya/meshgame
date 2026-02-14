import type { Commit, SignedAction } from "../log/types.js";
import type { Membership } from "../membership/types.js";
import type {
  PeerEvent,
  Transport,
  TransportMessage,
} from "../net/transport.js";
import { decodeMessage, encodeMessage } from "../protocol/codec.js";
import type { NodeMessage } from "../protocol/types.js";
import type { Ordering } from "./types.js";

const NODE_TOPIC = "node";

/**
 * Lockstep Ordering.
 *
 * - Encapsulates Transport.
 * - Manages message handling internally.
 * - Emits committed blocks via onCommit callback.
 */
export class LockstepOrdering implements Ordering {
  /**
   * Action buffer:
   * tick -> authorPeerId -> array of actions (in arrival order; we also keep seq for deterministic sort)
   */
  private readonly buffer = new Map<
    number,
    Map<string, { seq: number; action: SignedAction }[]>
  >();

  /**
   * Seal buffer (complete-ness):
   * tick -> authorPeerId -> lastSeq
   * When we have seals from ALL peers for a tick, that tick can be committed.
   */
  private readonly seals = new Map<number, Map<string, number>>();

  private currentTick = -1;
  // private committedTick = -1;
  private committedTick: number;

  private committedHeight = 0;

  private commitCallbacks: ((commit: Commit) => void)[] = [];
  private peerCallbacks: ((ev: PeerEvent) => void)[] = [];

  /** Next per-tick local sequence number. */
  private readonly localSeqByTick = new Map<number, number>();

  /** Track which ticks we already sealed (sent seal). */
  private readonly sealedTicks = new Set<number>();

  /**
   * The first tick a peer is expected to participate in.
   * Peers joining late don't need to seal past ticks.
   */
  private readonly peerFirstTick = new Map<string, number>();

  /** Set after start() */
  private started = false;

  constructor(
    private readonly transport: Transport,
    private readonly membership: Membership,
    private readonly config: {
      t0Ms: number;
      tickMs: number;
      inputDelayTicks: number;
      roomId: string;
    },
  ) {
    this.committedTick = this.config.inputDelayTicks - 1;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.transport.onMessage((from, msg) => this.handleMessage(from, msg));
    this.transport.onPeerEvent((ev) => this.handlePeerEvent(ev));

    await this.transport.start();
  }

  async stop(): Promise<void> {
    this.started = false;
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

  getTick(): number {
    return this.currentTick;
  }

  onLocalAction(payload: unknown, nowMs: number): void {
    const nowTick = this.computeTick(nowMs);
    const targetTick = nowTick + this.config.inputDelayTicks;

    // If we've already committed this tick (or earlier), ignore late actions.
    if (targetTick <= this.committedTick) return;

    const seq = this.nextLocalSeq(targetTick);
    const msg: NodeMessage = {
      type: "ACTION_PROPOSE",
      roomId: this.config.roomId,
      peerId: this.transport.self,
      tick: targetTick,
      seq,
      payload,
    };

    // Store locally immediately.
    this.putAction(targetTick, this.transport.self, seq, {
      peerId: this.transport.self,
      payload,
    });

    // Broadcast to peers (fire-and-forget).
    void this.transport.broadcast({
      topic: NODE_TOPIC,
      payload: encodeMessage(msg),
    });
  }

  private lastTickLogMs = 0;

  tick(nowMs: number): void {
    const newTick = this.computeTick(nowMs);

    if (nowMs - this.lastTickLogMs > 1000) {
      this.lastTickLogMs = nowMs;
    }

    // Initial warp: don't iterate over past ticks
    if (this.currentTick === -1) {
      this.currentTick = newTick;

      // いま締め切り可能な action tick
      const toSeal = this.currentTick - 1 + this.config.inputDelayTicks;
      if (toSeal >= 0) this.sealTickIfNeeded(toSeal);

      // 「存在しない古いtick」をコミットしようとして詰まらないようにする
      this.committedTick = Math.max(this.committedTick, toSeal - 1);

      // ここでコミットも試す（相手のsealが届いていれば進む）
      this.tryCommitUpTo(this.maxCommittableTick());
      return;
    }

    // Start from the current tick
    if (newTick <= this.currentTick) {
      // Even if tick didn't advance, we can still try to commit if seals arrived.
      this.tryCommitUpTo(this.maxCommittableTick());
      return;
    }

    // Advance ticks one by one to ensure seals are sent for each tick boundary.
    for (let t = this.currentTick + 1; t <= newTick; t++) {
      this.currentTick = t;

      // When we enter tick t, we "seal" the target tick we were collecting during tick (t-1).
      // That target tick is (t-1 + inputDelayTicks).
      const toSeal = t - 1 + this.config.inputDelayTicks;
      if (t - 1 >= 0) this.sealTickIfNeeded(toSeal);
    }

    // After advancing, try to commit ticks that are now eligible.
    this.tryCommitUpTo(this.maxCommittableTick());
  }

  // ---- Internals ----

  private computeTick(nowMs: number): number {
    const { t0Ms, tickMs } = this.config;
    const dt = nowMs - t0Ms;
    if (dt < 0) return 0;
    // floor(dt / tickMs)
    return Math.floor(dt / tickMs);
  }

  private nextLocalSeq(tick: number): number {
    const cur = this.localSeqByTick.get(tick) ?? 0;
    this.localSeqByTick.set(tick, cur + 1);
    return cur;
  }

  private putAction(
    tick: number,
    author: string,
    seq: number,
    action: SignedAction,
  ): void {
    let byAuthor = this.buffer.get(tick);
    if (!byAuthor) {
      byAuthor = new Map();
      this.buffer.set(tick, byAuthor);
    }
    let arr = byAuthor.get(author);
    if (!arr) {
      arr = [];
      byAuthor.set(author, arr);
    }

    // Avoid duplicates (can happen if a peer rebroadcasts).
    if (arr.some((x) => x.seq === seq)) return;

    arr.push({ seq, action });
  }

  private putSeal(tick: number, author: string, lastSeq: number): void {
    let byAuthor = this.seals.get(tick);
    if (!byAuthor) {
      byAuthor = new Map();
      this.seals.set(tick, byAuthor);
    }
    byAuthor.set(author, lastSeq);
  }

  private sealTickIfNeeded(tick: number): void {
    if (tick <= this.committedTick) return;
    if (this.sealedTicks.has(tick)) return;

    this.sealedTicks.add(tick);

    const localActions = this.buffer.get(tick)?.get(this.transport.self) ?? [];
    const lastSeq =
      localActions.length === 0
        ? -1
        : Math.max(...localActions.map((a) => a.seq));

    // Store local seal immediately.
    this.putSeal(tick, this.transport.self, lastSeq);

    const msg: NodeMessage = {
      type: "ACTION_SEAL",
      roomId: this.config.roomId,
      peerId: this.transport.self,
      tick,
      lastSeq,
    };

    void this.transport.broadcast({
      topic: NODE_TOPIC,
      payload: encodeMessage(msg),
    });
  }

  private handleMessage(fromPeerId: string, msg: TransportMessage): void {
    if (msg.topic !== NODE_TOPIC) return;

    const nodeMsg = decodeMessage(msg.payload);

    // Room guard (many messages have roomId)
    const roomId =
      "roomId" in nodeMsg ? (nodeMsg as { roomId: string }).roomId : undefined;
    if (roomId && roomId !== this.config.roomId) return;

    switch (nodeMsg.type) {
      case "ACTION_PROPOSE": {
        if (nodeMsg.peerId !== fromPeerId) return;
        if (nodeMsg.tick <= this.committedTick) {
          console.warn(
            `[ordering] Discarding late action for tick ${nodeMsg.tick} (committed: ${this.committedTick}) from ${nodeMsg.peerId}`,
          );
          return;
        }

        this.putAction(nodeMsg.tick, nodeMsg.peerId, nodeMsg.seq, {
          peerId: nodeMsg.peerId,
          payload: nodeMsg.payload,
        });
        return;
      }
      case "ACTION_SEAL": {
        if (nodeMsg.peerId !== fromPeerId) return;
        if (nodeMsg.tick <= this.committedTick) return;
        this.putSeal(nodeMsg.tick, nodeMsg.peerId, nodeMsg.lastSeq);
        this.tryCommitUpTo(this.currentTick - this.config.inputDelayTicks);
        return;
      }
      case "ACTION_COMMIT": {
        // Optional: accept remote commits as "hint" / catch-up.
        // You can validate determinism here (compare to locally computed actions) before using.
        // For now, ignore and rely on local lockstep barrier.
        return;
      }
      case "SYNC_CLOCK": {
        if (nodeMsg.peerId === this.transport.self) return;
        const localTick = this.computeTick(Date.now());
        if (nodeMsg.tick > localTick) {
          console.log(
            `[ordering] Clock skew! Warping forward: ${localTick} -> ${nodeMsg.tick}.`,
          );
          const nowMs = Date.now();
          this.config.t0Ms = nowMs - nodeMsg.tick * this.config.tickMs;

          // Perform warp
          this.currentTick = nodeMsg.tick;

          // Update all existing peerFirstTicks to align with the new warped reality.
          // This prevents the newcomer from getting stuck waiting for past seals from existing peers.
          for (const [pId, firstTick] of this.peerFirstTick.entries()) {
            const newVal = Math.max(
              firstTick,
              this.currentTick + this.config.inputDelayTicks,
            );
            this.peerFirstTick.set(pId, newVal);
            console.log(`[ordering] Warped peer ${pId} firstTick to ${newVal}`);
          }

          // Before moving forward, seal "old" future ticks if necessary
          const newestSeal = this.currentTick - 1 + this.config.inputDelayTicks;
          for (let s = 0; s <= newestSeal; s++) {
            this.sealTickIfNeeded(s);
          }

          // Force a state check
          this.tryCommitUpTo(this.maxCommittableTick());
        }
        return;
      }
      default:
        return;
    }
  }

  private handlePeerEvent(ev: PeerEvent): void {
    // Let the app update membership externally if it wants; but we can mirror connect/disconnect.
    // If you already manage membership elsewhere, you can remove these lines.
    if (ev.type === "peer_connected") {
      const currentTick = this.computeTick(Date.now());
      // The first tick this peer can possibly send an action or seal for is currentTick + delay.
      const effectiveTick = currentTick + this.config.inputDelayTicks;
      this.peerFirstTick.set(ev.peerId, effectiveTick);
      console.log(
        `[ordering] Peer connected: ${ev.peerId}. Effective from tick ${effectiveTick} (now ${currentTick})`,
      );

      if (!this.membership.getPeer(ev.peerId)) {
        this.membership.addPeer({
          peerId: ev.peerId,
          role: "peer",
          joinedAt: Date.now(),
        });
      }

      // Send the captured tick immediately to ensure consistency.
      const syncMsg: NodeMessage = {
        type: "SYNC_CLOCK",
        roomId: this.config.roomId,
        peerId: this.transport.self,
        tick: currentTick,
      };

      // Slight delay for DataChannel stability, but use the captured 'currentTick'.
      setTimeout(() => {
        this.transport.send(ev.peerId, {
          topic: NODE_TOPIC,
          payload: encodeMessage(syncMsg),
        });
      }, 100);
    } else if (ev.type === "peer_disconnected") {
      this.membership.removePeer(ev.peerId);
      this.peerFirstTick.delete(ev.peerId);
    }

    for (const cb of this.peerCallbacks) cb(ev);
  }

  private maxCommittableTick(): number {
    // tick t に入った時点で seal されるのは (t-1 + delay)
    // つまり currentTick 時点で “締め切り済み” の最大 tick は (currentTick - 1 + delay)
    return this.currentTick - 1 + this.config.inputDelayTicks;
  }

  private tryCommitUpTo(maxTickToCommit: number): void {
    for (let t = this.committedTick + 1; t <= maxTickToCommit; t++) {
      if (!this.canCommitTick(t)) {
        // Diagnostic: Log occasionally if we are stuck
        if (t % 100 === 0 || t === this.committedTick + 1) {
          const missing = this.getMissingSeals(t);
          if (missing.length > 0) {
            console.debug(
              `[ordering] Waiting for seals for tick ${t} from: ${missing.join(", ")}`,
            );
          }
        }
        break;
      }
      this.commitTick(t);
      this.committedTick = t;
    }
  }

  private getMissingSeals(tick: number): string[] {
    const peers = this.getPeers();
    if (!peers.includes(this.transport.self)) peers.push(this.transport.self);
    const byAuthor = this.seals.get(tick);
    const result: string[] = [];
    for (const p of peers) {
      const first = this.peerFirstTick.get(p) ?? 0;
      if (tick >= first && (!byAuthor || !byAuthor.has(p))) {
        result.push(p);
      }
    }
    return result;
  }

  /**
   * Lockstep barrier condition:
   * "We have SEAL from every current peer for tick t"
   *
   * NOTE: If you want "No-op on missing peer" or timeouts, implement it here.
   */
  private canCommitTick(tick: number): boolean {
    const peers = this.getPeers();

    // Require self, too.
    if (!peers.includes(this.transport.self)) peers.push(this.transport.self);

    const byAuthor = this.seals.get(tick);

    for (const peerId of peers) {
      // Barrier logic:
      // Only require a seal if the peer was already present and "effective" for this tick.
      const firstTick = this.peerFirstTick.get(peerId) ?? 0;
      if (tick < firstTick) {
        continue;
      }

      if (!byAuthor || !byAuthor.has(peerId)) {
        return false;
      }
    }
    return true;
  }

  private commitTick(tick: number): void {
    const peers = this.getPeers();
    if (!peers.includes(this.transport.self)) peers.push(this.transport.self);

    // Deterministic ordering:
    // 1) authorPeerId ascending
    // 2) seq ascending within author
    const actions: SignedAction[] = [];
    const byAuthor =
      this.buffer.get(tick) ??
      new Map<string, { seq: number; action: SignedAction }[]>();

    for (const author of peers.sort()) {
      // Logic: Only process actions from this author if they were already joined for this tick.
      const firstTick = this.peerFirstTick.get(author) ?? 0;
      if (tick < firstTick) {
        continue;
      }

      const arr = byAuthor.get(author) ?? [];
      arr.sort((a, b) => a.seq - b.seq);
      for (const item of arr) actions.push(item.action);
    }

    const commit: Commit = {
      seq: ++this.committedHeight,
      actions,
      metadata: { orderingTick: tick },
    };

    for (const cb of this.commitCallbacks) cb(commit);

    // Optional: broadcast ACTION_COMMIT to help recovery/catch-up.
    // This does not change ordering (still lockstep); it's just sharing the decided block.
    const commitMsg: NodeMessage = {
      type: "ACTION_COMMIT",
      roomId: this.config.roomId,
      tick,
      height: commit.seq,
      actions: actions.map((a) => ({
        peerId: a.peerId,
        // seq is not stored on SignedAction; we can reconstruct by reading buffer before cleanup.
        // Here we set seq=-1 if unknown. If you need exact seq in commit message,
        // keep it in SignedAction or build from buffer before flattening.
        seq: -1,
        payload: a.payload,
      })),
    };
    void this.transport.broadcast({
      topic: NODE_TOPIC,
      payload: encodeMessage(commitMsg),
    });

    // Cleanup to keep memory bounded.
    this.buffer.delete(tick);
    this.seals.delete(tick);
    this.localSeqByTick.delete(tick);
  }

  getCommittedTick(): number {
    return this.committedTick;
  }
}
