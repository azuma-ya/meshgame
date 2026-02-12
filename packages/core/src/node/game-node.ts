import type { EngineFacade } from "../engine/adapter.js";
import { MemoryLogStore } from "../log/memory-log-store.js";
import type { ActionLog, Commit } from "../log/types.js";
import type { PeerEvent } from "../net/transport.js";
import type { Ordering } from "../ordering/index.js";

export interface GameNodeOptions<O> {
  ordering: Ordering;
  log?: ActionLog;
  playerId: string;
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
  private state: S;
  private ordering: Ordering;
  private log: ActionLog;
  private engine: EngineFacade<S, A, O>;
  private tickerInterval: ReturnType<typeof setInterval> | undefined;
  private commitQueue: Promise<void> = Promise.resolve();
  private playerId: string;
  private subscribers: Record<string, (view: O) => void> = {};

  constructor(opts: GameNodeOptions<O>, engine: EngineFacade<S, A, O>) {
    this.ordering = opts.ordering;
    this.engine = engine;
    this.state = engine.initialState;
    this.log = opts.log ?? new MemoryLogStore();
    this.playerId = opts.playerId;

    // Initial update will happen when onUpdate is called or via notifyUpdate

    // Bind handlers
    this.ordering.onCommit((commit) => {
      this.commitQueue = this.commitQueue.then(async () => {
        // 1. Append to Log (The history)
        try {
          await this.log.append(commit);

          // 2. Apply to Engine (The current state)
          const action = this.engine.decodeAction(commit.action.payload);
          this.state = this.engine.reduce(this.state, action, {
            from: commit.action.peerId,
            height: commit.seq,
            tick: commit.metadata?.tick ?? 0,
          });

          this.notifySubscribers();
        } catch (e) {
          console.error("Failed to process commit", e, commit);
        }
      });
    });
  }

  async start(): Promise<void> {
    await this.ordering.start();

    // Start Ticker
    this.tickerInterval = setInterval(() => {
      this.advanceTick();
    }, 16);
  }

  async stop(): Promise<void> {
    if (this.tickerInterval) {
      clearInterval(this.tickerInterval);
      this.tickerInterval = undefined;
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
    this.ordering.onLocalAction(action, Date.now());
    this.advanceTick();
  }

  /**
   * Returns a filtered view of the state for a specific player.
   */
  getView(playerId: string): O {
    return this.engine.observe(this.state, playerId);
  }

  private notifySubscribers() {
    for (const fn of Object.values(this.subscribers)) {
      fn(this.getView(this.playerId));
    }
  }

  private advanceTick() {
    this.ordering.tick(Date.now());
  }
}
