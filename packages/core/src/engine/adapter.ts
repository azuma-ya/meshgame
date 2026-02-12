import type { Meta, Result, State } from "./types.js";

/**
 * Minimal interface required by GameNode to interact with ANY Engine.
 * This is the same interface that `GameNode` expects.
 */
export interface EngineAdapter<S = State, A = unknown> {
  initialState: S;
  decodeAction: (payload: unknown) => A;
  reduce: (state: S, action: A, meta: Meta) => S;
}

/**
 * Extended interface for a full-featured Engine with observability and verification.
 * This is what `BaseEngine` will implement.
 */
export interface EngineFacade<S = State, A = unknown, O = unknown>
  extends EngineAdapter<S, A> {
  /**
   * Check if an action is valid without applying it.
   */
  isLegal: (state: S, action: A, meta: Meta) => Result<void>;

  /**
   * Produce a view of the state for a specific player.
   * Handles fog of war, hidden information (cards), etc.
   */
  observe: (state: S, playerId: string) => O;

  /**
   * Optional: Serialize state for snapshots/sync.
   */
  serializeState?: (state: S) => Uint8Array | string;

  /**
   * Optional: Deserialize state from snapshots/sync.
   */
  deserializeState?: (data: Uint8Array | string) => S;
}
