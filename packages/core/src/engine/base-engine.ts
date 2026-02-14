import type { EngineFacade } from "./adapter.js";
import type { Rule } from "./rule.js";
import type { Scheduler } from "./scheduler.js";
import type { System } from "./system.js";
import type { Action, Meta, Result, State } from "./types.js";
import type { View } from "./view.js";

/**
 * Base implementation of an Engine that follows the 3-Layer Architecture:
 * 1. Rule Kernel (Logic)
 * 2. System Pipeline (Tick/Systems)
 * 3. View Layer (Observation)
 *
 * It implements EngineFacade, making it compatible with GameNode.
 */
export abstract class BaseEngine<
  S extends State = State,
  A extends Action = Action,
  O = unknown,
> implements EngineFacade<S, A, O>
{
  protected abstract rule: Rule<S, A>;
  protected abstract view: View<S, O>;
  protected systems: System<S>[] = [];
  schedulers: Scheduler<S>[] = [];

  constructor(public readonly initialState: S) {}

  /**
   * Registers a system into the pipeline.
   * Systems are executed in order during `tick` updates.
   */
  addSystem(system: System<S>): void {
    this.systems.push(system);
  }

  /**
   * Registers a scheduler into the pipeline.
   * Schedulers are executed in order during `tick` updates.
   */
  addScheduler(scheduler: Scheduler<S>): void {
    this.schedulers.push(scheduler);
  }

  /**
   * Main state transition function.
   * - Validates action (isLegal)
   * - Applies action (rule.apply)
   * - Runs systems (pipeline)
   */
  reduce(state: S, action: A, meta: Meta): S {
    // 1. Validate
    const result = this.isLegal(state, action, meta);
    if (!result.ok) {
      // In a deterministic engine, invalid actions *should* be rejected before this point
      // or handled gracefully. Since reduce must be safe, we log and ignore (or throw generic error).
      // Ideally, the Node checks isLegal before calling reduce.
      return state;
    }

    // 2. Apply Rule
    let nextState = this.rule.apply(state, action, meta);

    // 3. Run Systems
    for (const system of this.systems) {
      nextState = system.update(nextState, meta);
    }

    return nextState;
  }

  isLegal(state: S, action: A, meta: Meta): Result<void> {
    return this.rule.isLegal(state, action, meta);
  }

  observe(state: S, playerId: string): O {
    return this.view.observe(state, playerId);
  }

  abstract decodeAction(payload: unknown): A;

  // Optional: override if needed
  serializeState(state: S): string {
    return JSON.stringify(state);
  }

  deserializeState(data: string | Uint8Array): S {
    if (typeof data !== "string") {
      throw new Error(
        "BaseEngine default deserialization only supports strings",
      );
    }
    return JSON.parse(data);
  }
}
