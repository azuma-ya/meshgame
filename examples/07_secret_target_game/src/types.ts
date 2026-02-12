import type { Action, State } from "@nodegame/core";

export type PlayerId = string;

export interface Player {
  id: PlayerId;
  hp: number;
  isAlive: boolean;
  selectedTarget?: PlayerId | null; // Null if not selected yet
}

export interface GameLog {
  turn: number;
  message: string;
  timestamp: number;
}

export type GameStatus = "LOBBY" | "PLAYING" | "GAME_OVER";

export interface GameState extends State {
  status: GameStatus;
  turn: number;
  players: Record<PlayerId, Player>;
  logs: GameLog[];
  winner?: PlayerId;
}

export interface PlayerView {
  status: GameStatus;
  turn: number;
  players: Record<PlayerId, Player>;
  logs: GameLog[];
  winner?: PlayerId;
}

interface JoinAction extends Action {
  type: "JOIN";
  playerId: PlayerId;
}

interface StartGameAction extends Action {
  type: "START_GAME";
}

interface SelectTargetAction extends Action {
  type: "SELECT_TARGET";
  playerId: PlayerId;
  targetId: PlayerId;
}

interface ResolveTurnAction extends Action {
  type: "RESOLVE_TURN";
}

export type GameAction =
  | JoinAction
  | StartGameAction
  | SelectTargetAction
  | ResolveTurnAction;

export interface P2PMessage {
  type: "ACTION";
  action: GameAction;
}
