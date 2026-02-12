import {
  BaseEngine,
  err,
  ok,
  type Result,
  type Rule,
  type View,
} from "@nodegame/core";
import type { GameAction, GameState, PlayerView } from "./types";

const INITIAL_HP = 5;

const INITIAL_STATE: GameState = {
  status: "LOBBY",
  turn: 1,
  players: {},
  logs: [],
  tick: 0,
};

class SecretTargetRule implements Rule<GameState, GameAction> {
  isLegal(
    state: GameState,
    action: GameAction,
    meta: { from: string },
  ): Result<void> {
    switch (action.type) {
      case "JOIN":
        return ok(undefined);
      case "START_GAME":
        if (state.status !== "LOBBY") {
          return err("Game already started");
        }
        if (Object.keys(state.players).length < 2) {
          return err("Not enough players");
        }
        return ok(undefined);
      case "SELECT_TARGET":
        if (meta.from !== action.playerId) {
          return err("Cannot select target for another player");
        }
        if (state.status !== "PLAYING") {
          return err("Game not in progress");
        }
        if (!state.players[action.playerId]?.isAlive) {
          return err("Player is not alive");
        }
        if (!state.players[action.targetId]) {
          return err("Target player does not exist");
        }
        return ok(undefined);
      default:
        return ok(undefined);
    }
  }

  apply(
    state: GameState,
    action: GameAction,
    _meta: { from: string },
  ): GameState {
    const next = structuredClone(state);

    switch (action.type) {
      case "JOIN":
        if (!next.players[action.playerId]) {
          next.players[action.playerId] = {
            id: action.playerId,
            hp: INITIAL_HP,
            isAlive: true,
            selectedTarget: null,
          };
        }
        break;

      case "START_GAME":
        next.status = "PLAYING";
        next.logs.push({
          turn: 0,
          message: "Game Started!",
          timestamp: Date.now(),
        });
        break;

      case "SELECT_TARGET":
        next.players[action.playerId].selectedTarget = action.targetId;
        break;
    }

    return this.maybeResolveTurn(next);
  }

  private maybeResolveTurn(state: GameState): GameState {
    if (state.status !== "PLAYING") return state;

    const livingPlayers = Object.values(state.players).filter((p) => p.isAlive);
    const allSelected =
      livingPlayers.length > 0 &&
      livingPlayers.every((p) => p.selectedTarget != null);

    if (!allSelected) return state;

    // RESOLUTION
    livingPlayers.forEach((p) => {
      const targetId = p.selectedTarget!;
      state.logs.push({
        turn: state.turn,
        message: `${p.id} attacked ${targetId}`,
        timestamp: Date.now(),
      });

      const target = state.players[targetId];
      if (target) {
        target.hp -= 1;
        if (target.hp <= 0 && target.isAlive) {
          target.isAlive = false;
          state.logs.push({
            turn: state.turn,
            message: `${targetId} was eliminated!`,
            timestamp: Date.now(),
          });
        }
      }
      p.selectedTarget = null;
    });

    // Check game over
    const survivors = Object.values(state.players).filter((p) => p.isAlive);
    if (survivors.length <= 1) {
      state.status = "GAME_OVER";
      state.winner = survivors[survivors.length - 1]?.id || "No one";
      const winMessage =
        survivors.length === 1
          ? `Game Over! Winner: ${state.winner}`
          : "Game Over! It's a draw!";
      state.logs.push({
        turn: state.turn,
        message: winMessage,
        timestamp: Date.now(),
      });
    } else {
      state.turn += 1;
    }

    return state;
  }
}

class SecretTargetView implements View<GameState, PlayerView> {
  observe(state: GameState, _playerId: string): PlayerView {
    return {
      status: state.status,
      turn: state.turn,
      players: Object.fromEntries(
        Object.entries(state.players).map(([id, player]) => [
          id,
          {
            id,
            hp: player.hp,
            isAlive: player.isAlive,
            selectedTarget: player.selectedTarget,
          },
        ]),
      ),
      logs: state.logs,
      winner: state.winner,
    };
  }
}

export class SecretTargetEngine extends BaseEngine<
  GameState,
  GameAction,
  PlayerView
> {
  protected rule = new SecretTargetRule();
  protected view = new SecretTargetView();

  constructor() {
    super(INITIAL_STATE);
  }

  decodeAction(payload: unknown): GameAction {
    return payload as GameAction;
  }
}

export const secretTargetEngine = new SecretTargetEngine();
