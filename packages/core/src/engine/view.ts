import type { State } from "./types.js";

/**
 * View Layer responsibility:
 * Transform the authoritative State (True State) into a Player View (Observed State).
 * This manages hidden information like hand cards, fog of war, etc.
 */
export interface View<S = State, O = unknown> {
  /**
   * Generate a view for a specific player.
   * If playerId is null/undefined, it might return a spectator or public view.
   */
  observe(state: S, playerId: string): O;
}
