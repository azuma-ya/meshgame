import type { Meta, Result, State } from "./types.js";

/**
 * Base class for a Rule Kernel.
 * A Rule Kernel encapsulates the pure game logic:
 * - Validity checks (isLegal)
 * - State transitions (apply)
 */
export interface Rule<S = State, A = unknown> {
  /**
   * Check if an action is legal in the current state.
   * Should return Result.ok() if legal, or Result.err(reason) if not.
   * MUST be deterministic.
   */
  isLegal(state: S, action: A, meta: Meta): Result<void>;

  /**
   * Apply an action to the state and return the new state.
   * MUST be deterministic and pure (no side effects).
   * It is assumed `isLegal` has passed before calling this,
   * though implementations may re-check for safety.
   */
  apply(state: S, action: A, meta: Meta): S;
}
