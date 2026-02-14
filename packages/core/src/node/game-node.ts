import type { EngineFacade } from "../engine/adapter.js";
import { isDue } from "../engine/scheduler.js";
import type { Meta } from "../engine/types.js";
import { MemoryLogStore } from "../log/memory-log-store.js";
import type { ActionLog, Commit, SignedAction } from "../log/types.js";
import type { PeerEvent } from "../net/transport.js";
import type { Ordering } from "../ordering/index.js";
import { createTimeSource, type TimeSource } from "../time/time-source.js";

export interface GameNodeOptions {
  ordering: Ordering;
  log?: ActionLog;
  playerId: string;
  tickIntervalMs?: number;
  t0Ms: number;
  orderingTickMs: number;
}

/**
 * GameNode is the main entry point for a game instance on a single node.
 * It manages the lifecycle of the game, including synchronization, state updates, and logging.
 *
 * @template S - Global Game State type
 * @template A - Action type
 * @template O - Observable View type (what a specific player sees)
 */
export class GameNode<S, A, O = unknown> {
  private state: S; // Current state (may include optimistic updates)
  private authoritativeState: S; // State built only from confirmed commits
  private ordering: Ordering;
  private log: ActionLog;
  private engine: EngineFacade<S, A, O>;
  private commitQueue: Promise<void> = Promise.resolve();
  private playerId: string;
  private subscribers: Record<string, (view: O) => void> = {};
  private tickIntervalMs: number;
  private tickerLoop: ReturnType<typeof setInterval> | undefined;
  readonly time: TimeSource;

  // optimistic
  private pendingActions: Array<{ action: A; tempId: number }> = [];
  private nextTempId = 0;

  private lastSchedulerCommittedTick = -1;

  constructor(opts: GameNodeOptions, engine: EngineFacade<S, A, O>) {
    this.ordering = opts.ordering;
    this.engine = engine;
    this.state = engine.initialState;
    this.authoritativeState = engine.initialState;
    this.log = opts.log ?? new MemoryLogStore();
    this.playerId = opts.playerId;
    this.tickIntervalMs = opts.tickIntervalMs ?? 16;

    this.time = createTimeSource({
      t0Ms: opts.t0Ms,
      orderingTickMs: opts.orderingTickMs,
      getCommittedOrderingTick: () => this.ordering.getCommittedTick(),
    });

    // Bind handlers
    this.ordering.onCommit((commit) => {
      this.commitQueue = this.commitQueue.then(async () => {
        try {
          // 1) Append to Log
          await this.log.append(commit);

          const committedTick = commit.metadata.orderingTick;
          if (committedTick % 10 === 0) {
            console.log(
              `[GameNode] processing commit for tick ${committedTick}. Pending actions: ${this.pendingActions.length}`,
            );
          }

          // 2) Apply commit.actions
          this.authoritativeState = this.applyCommitToState(
            this.authoritativeState,
            commit,
            committedTick,
          );

          // 3) Apply schedulers deterministically up to committedTick (catch-up)
          this.authoritativeState = this.applySchedulersCatchUp(
            this.authoritativeState,
            committedTick,
          );

          // 4) Remove my actions from pending (simplified)
          // Require actionId by payload identity or tempId for strict linking
          const myCount = commit.actions.filter(
            (a) => a.peerId === this.playerId,
          ).length;
          if (myCount > 0) this.pendingActions.splice(0, myCount);

          // 5) Rebuild optimistic state = authoritative + pending
          this.state = this.authoritativeState;
          for (const pending of this.pendingActions) {
            try {
              this.state = this.engine.reduce(this.state, pending.action, {
                from: this.playerId,
                height: 0,
                orderingTick: committedTick,
              });
            } catch (e) {
              console.warn("Pending action became invalid, removing", e);
              this.pendingActions = this.pendingActions.filter(
                (p) => p !== pending,
              );
            }
          }

          // 6) Notify subscribers
          this.notifySubscribers();
        } catch (e) {
          console.error("Failed to process commit", e, commit);
        }
      });
    });
  }

  async start(): Promise<void> {
    console.log("[GameNode] start tickIntervalMs", this.tickIntervalMs);
    await this.ordering.start();
    this.tickerLoop = setInterval(this.tickLoop, this.tickIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.tickerLoop) {
      clearInterval(this.tickerLoop);
      this.tickerLoop = undefined;
    }
    await this.ordering.stop();
  }

  onPeerEvent(callback: (ev: PeerEvent) => void): void {
    this.ordering.onPeerEvent(callback);
  }

  subscribe(fn: (view: O) => void) {
    const id = Object.keys(this.subscribers).length;
    this.subscribers[id] = fn;
    // Trigger immediate update with current internal state
    fn(this.getView(this.playerId));
    // Return a handle that allows the caller to unsubscribe.
    return () => {
      delete this.subscribers[id];
    };
  }

  getPeers(): string[] {
    return this.ordering.getPeers();
  }

  submit(action: A) {
    const tempId = this.nextTempId++;
    this.pendingActions.push({ action, tempId });

    // optimistic apply
    try {
      this.state = this.engine.reduce(this.state, action, {
        from: this.playerId,
        height: 0,
        orderingTick: this.ordering.getTick(),
      });
      this.notifySubscribers();
    } catch (e) {
      console.warn("Optimistic update failed, will wait for commit", e);
      this.pendingActions = this.pendingActions.filter(
        (p) => p.tempId !== tempId,
      );
    }

    // network: only player actions go to ordering
    this.ordering.onLocalAction(action, Date.now());
  }

  /**
   * Returns a filtered view of the state for a specific player.
   */
  getView(playerId: string): O {
    return this.engine.observe(this.state, playerId);
  }

  /**
   * - ordering.tick を回す（seal/commit が進む）
   * - scheduler はここでは絶対に action を生成しない（重複の原因）
   * - scheduler は onCommit 側で committedTick に同期して進める
   */
  private tickLoop = () => {
    const nowMs = Date.now();
    this.ordering.tick(nowMs);

    this.notifySubscribers();
  };

  private applyCommitToState(
    state: S,
    commit: Commit,
    committedTick: number,
  ): S {
    let s = state;

    for (const signed of commit.actions as SignedAction[]) {
      const decoded = this.engine.decodeAction(signed.payload);
      const meta: Meta = {
        from: signed.peerId,
        height: commit.seq,
        orderingTick: committedTick,
      };
      s = this.engine.reduce(s, decoded, meta);
    }

    return s;
  }

  private applySchedulersCatchUp(state: S, committedTick: number): S {
    const schedulers = this.engine.schedulers ?? [];
    if (schedulers.length === 0) {
      this.lastSchedulerCommittedTick = Math.max(
        this.lastSchedulerCommittedTick,
        committedTick,
      );
      return state;
    }

    let s = state;

    // last+1..committedTick を順に進める（取りこぼし防止）
    for (let t = this.lastSchedulerCommittedTick + 1; t <= committedTick; t++) {
      const meta: Meta = { orderingTick: t, from: this.playerId };

      for (const sch of schedulers) {
        const schedule = sch.schedule(s);
        if (!schedule) continue;
        if (!isDue(schedule, s, meta)) continue;

        // ネット送信しない：state を直接進める（決定的）
        const next = sch.apply(s, meta);
        if (next) s = next;
      }
    }

    this.lastSchedulerCommittedTick = Math.max(
      this.lastSchedulerCommittedTick,
      committedTick,
    );

    return s;
  }

  private notifySubscribers() {
    for (const fn of Object.values(this.subscribers)) {
      fn(this.getView(this.playerId));
    }
  }
}
