/**
 * Result type for operations that might fail, without throwing exceptions.
 * This is crucial for deterministic execution where errors should be handled gracefully.
 */
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/**
 * Metadata associated with an action or update.
 * Provides context like who performed it and when.
 */
export interface Meta {
  /** The ID of the actor (player or system) that initiated the action. */
  from: string;

  // ordering用
  /** The logical time step (orderingTick) when this action is applied. */
  orderingTick: number;
  /** The block height or sequence number for ordering. */
  height?: number;

  /** Timestamp (wall clock) - optional and often for display only in deterministic engines. */
  timestamp?: number;
}

/**
 * A standardized action structure.
 * P is the payload type.
 */
export interface Action<P = unknown> {
  /** verification/action type identifier */
  type: string;
  payload?: P;
  /** Optional metadata specific to the action instance (e.g., signature) */
  meta?: Record<string, unknown>;
}

/**
 * Base interface for the Game State.
 * The State must be serializable and contain all "truth" of the game.
 */
export interface State {}
