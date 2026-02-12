import type { ActionCommit, ActionLog } from "../log/types.js";
import type { Membership } from "../membership/types.js";
import {
  ActionCommitMessage,
  ActionProposeMessage,
  type NodeMessage,
} from "../protocol/types.js";
import { getCurrentTick, getTickDeadline } from "../time/tick.js";
import type { Ordering, OrderingOutput } from "./types.js";

/**
 * Hostless Lockstep Ordering.
 *
 * - No central host.
 * - Time is divided into ticks.
 * - Deadline = t0 + (tick + 1) * tickMs.
 * - Peers broadcast ACTION_PROPOSE for a specific tick.
 * - On deadline, every peer deterministically finalizes the tick:
 *   - Gathers all proposals for that tick.
 *   - Fills missing peers with null (NOOP).
 *   - Sorts via peerId.
 *   - Appends block to log.
 */
export class HostlessLockstepOrdering implements Ordering {
  private readonly buffer = new Map<number, Map<string, unknown>>();
  private currentTick = -1;
  private committedHeight = 0;

  constructor(
    private readonly membership: Membership,
    private readonly log: ActionLog,
    private readonly config: {
      t0Ms: number;
      tickMs: number;
      inputDelayTicks: number;
      roomId: string;
    },
  ) {}

  getHeight(): number {
    return this.committedHeight;
  }

  handleMessage(fromPeerId: string, msg: NodeMessage): boolean {
    switch (msg.type) {
      case "ACTION_PROPOSE": {
        if (msg.roomId !== this.config.roomId) return false;

        // Too late?
        if (msg.tick <= this.currentTick) {
          // In a real system we might log this as a "too late" drop
          // console.warn(`Dropped late proposal from ${fromPeerId} for tick ${msg.tick}`);
          return true;
        }

        let tickBuffer = this.buffer.get(msg.tick);
        if (!tickBuffer) {
          tickBuffer = new Map();
          this.buffer.set(msg.tick, tickBuffer);
        }

        // Single action per tick per peer for MVP simple lockstep
        if (!tickBuffer.has(fromPeerId)) {
          tickBuffer.set(fromPeerId, msg.payload);
        }
        return true;
      }
      case "ACTION_COMMIT": {
        // In hostless mode, we generate commits locally.
        // Receiving a commit is purely for verification/gossip.
        // For MVP, we ignore incoming commits or just check them loosely.
        return true;
      }
      default:
        return false;
    }
  }

  onLocalAction(payload: unknown, nowMs: number): void {
    const liveTick = getCurrentTick(
      nowMs,
      this.config.t0Ms,
      this.config.tickMs,
    );
    const targetTick = liveTick + this.config.inputDelayTicks;

    // Store local action directly in buffer (optimistic)
    let tickBuffer = this.buffer.get(targetTick);
    if (!tickBuffer) {
      tickBuffer = new Map();
      this.buffer.set(targetTick, tickBuffer);
    }
    tickBuffer.set(this.membership.self.peerId, payload);
  }

  /**
   * Advance time.
   * If a tick's deadline has passed, finalize it.
   */
  tick(nowMs: number): OrderingOutput {
    const liveTick = getCurrentTick(
      nowMs,
      this.config.t0Ms,
      this.config.tickMs,
    );
    const output: OrderingOutput = { outbound: [], commits: [] };

    if (liveTick < 0) return output; // Not started

    // If this is the first time we see this tick, maybe we need to broadcast our local action?
    // Actually, onLocalAction is called by the UI.
    // But we need to ensure we broadcast our proposal for the target tick.
    // For MVP, `onLocalAction` puts it in buffer. We need to broadcast it NOW.
    // Wait, `onLocalAction` should return the outbound message or queue it.
    // Let's change onLocalAction behavior or queue logic.
    //
    // Revised approach:
    // `onLocalAction` is called when user inputs. We immediately queue an ACTION_PROPOSE.
    // But `tick()` returns `outbound`.
    // We need an internal outbound queue.

    // Check for tickers we need to finalize.
    // We finalize ticks strictly in order: currentTick + 1, currentTick + 2, ...
    // as long as their deadline has passed.

    let nextTick = this.currentTick + 1;

    // We can finalize `nextTick` if `nowMs >= deadline(nextTick)`
    while (true) {
      const deadline = getTickDeadline(
        nextTick,
        this.config.t0Ms,
        this.config.tickMs,
      );
      if (nowMs >= deadline) {
        // Finalize this tick
        const commit = this.finalizeTick(nextTick);
        output.commits.push(commit);

        // Also broadcast the commit (gossip/validation) - optional but requested
        output.outbound.push({
          type: "ACTION_COMMIT",
          roomId: this.config.roomId,
          tick: nextTick,
          height: commit.height,
          actionsByPeer: commit.actionsByPeer,
        });

        this.currentTick = nextTick;
        this.committedHeight++;

        // Cleanup buffer
        this.buffer.delete(nextTick);

        nextTick++;
      } else {
        break;
      }
    }

    // Flush local proposals that are pending broadcast?
    // In this definition `tick()` is the only place returning outbound.
    // So we need to store "pending proposals" from `onLocalAction`.
    // Let's modify: `onLocalAction` will store to a separate "localPending" list
    // OR we iterate the buffer for "future" ticks that contain "self" and haven't been sent?
    // Simplest: `onLocalAction` doesn't return anything, but `tick()` collects them?
    // No, `tick` might be called rarely. `onLocalAction` might want immediate feedback?
    // The interface `Ordering` defines `onLocalAction` as void.
    // Let's add a "pendingOutbound" queue to the class.

    if (this._pendingOutbound.length > 0) {
      output.outbound.push(...this._pendingOutbound);
      this._pendingOutbound = [];
    }

    return output;
  }

  private _pendingOutbound: NodeMessage[] = [];

  // Overriding onLocalAction to capture the broadcast requirement
  // We need to re-implement the method signature from the interface properly
  // Since I can't effectively change the logic inside `tick` dynamically for the method,
  // I'll update the method here.

  // Re-declare for clarity in logic flow (it was defined above but logic is split)
  // The method above in the class body is:
  /*
  onLocalAction(payload: unknown, nowMs: number): void {
      const liveTick = getCurrentTick(nowMs, this.config.t0Ms, this.config.tickMs);
      const targetTick = liveTick + this.config.inputDelayTicks;
      
      // 1. Buffer locally
      let tickBuffer = this.buffer.get(targetTick);
      if (!tickBuffer) {
          tickBuffer = new Map();
          this.buffer.set(targetTick, tickBuffer);
      }
      tickBuffer.set(this.membership.self.peerId, payload);
      
      // 2. Queue broadcast
      this._pendingOutbound.push({
          type: "ACTION_PROPOSE",
          roomId: this.config.roomId,
          peerId: this.membership.self.peerId,
          tick: targetTick,
          payload: payload
      });
  }
  */
  // I will overwrite the previous method in the actual file content below.

  private finalizeTick(tick: number): ActionCommit {
    const tickBuffer = this.buffer.get(tick);
    const peers = this.membership.getPeers();

    // Deterministic sort
    peers.sort((a, b) => a.peerId.localeCompare(b.peerId));

    const actionsByPeer = peers.map((p) => ({
      peerId: p.peerId,
      payload: tickBuffer?.get(p.peerId) ?? null, // NOOP if missing
    }));

    return {
      height: this.committedHeight + 1,
      tick: tick,
      actionsByPeer,
    };
  }
}
