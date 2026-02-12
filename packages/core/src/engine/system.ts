import type { Meta, State } from "./types.js";

/**
 * A System encapsulates a specific aspect of game logic that runs automatically,
 * often on a tick or trigger basis, rather than direct player action.
 * Examples: CooldownSystem, PhysicsSystem, BuffTerminationSystem.
 */
export interface System<S = State> {
  /**
   * Execute the system's logic.
   * Returns the modified state.
   */
  update(state: S, meta: Meta): S;
}
