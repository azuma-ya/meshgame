import {
  BaseEngine,
  err,
  type Meta,
  ok,
  type Result,
  type Rule,
  type Schedule,
  type Scheduler,
  type System,
  type View,
} from "@nodegame/core";
import { msToSec } from "../lib/utils";
import { createRNG } from "./rng";
import {
  BASE_TICK_MS,
  FERTILIZER_CONFIG,
  type GameAction,
  type GameState,
  GRID_SIZE,
  ORDERING_TICK_MS,
  type PlayerView,
  SEED_CONFIG,
  type SeedType,
  TICK_MS,
  type TileState,
  type TileType,
  WATER_ADJACENCY_BOOST,
} from "./types";

export class GrowthScheduler implements Scheduler<GameState> {
  id = "growth";

  schedule(_state: GameState) {
    return {
      kind: "every",
      everyTicks: 1,
      except: (state: GameState) => state.status !== "PLAYING",
    } as const;
  }

  apply(state: GameState, meta: Meta): GameState | null {
    if (state.status !== "PLAYING") return null;

    const currentTick = meta.orderingTick;
    const lastTick = state.lastGrowthTick ?? 0;
    const dt = currentTick - lastTick;

    if (dt <= 0) return null;

    // ★ dt tick 分まとめて進める
    const next = this.applyGrowthForTicks(state, dt);

    // lastGrowthTick を更新
    return { ...next, lastGrowthTick: currentTick };
  }

  private applyGrowthForTicks(state: GameState, dt: number): GameState {
    // 破壊的変更を避けたいなら deep copy 方針に寄せてください
    // ここでは最小例として「必要箇所だけコピー」する
    const grid: TileState[][] = state.grid.map((row) =>
      row.map((t) => ({ ...t, crop: t.crop ? { ...t.crop } : undefined })),
    );

    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const tile = grid[y][x];
        if (!tile.crop || tile.crop.stage === "MATURE") continue;

        const crop = tile.crop;
        const config = SEED_CONFIG[crop.type];

        let speed = 1.0;
        if (state.weather === "RAINY") speed *= 1.5;
        if (state.weather === "STORM") speed *= 0.5;

        if (this.hasWaterAdj(grid, x, y)) speed /= WATER_ADJACENCY_BOOST;
        if (crop.fertilized) speed /= FERTILIZER_CONFIG.growthBoost;

        // ★ TICK_MS ではなく「ordering tick 何回分進んだか(dt)」で増やす
        // growthTicks が “ordering tick” 単位で設計されている前提
        crop.growthTimePoints += speed * dt;

        const [t0, t1, t2] = [
          config.growthTicks[0],
          config.growthTicks[0] + config.growthTicks[1],
          config.growthTicks[0] + config.growthTicks[1] + config.growthTicks[2],
        ];

        if (crop.growthTimePoints >= t2) crop.stage = "MATURE";
        else if (crop.growthTimePoints >= t1) crop.stage = "GROWING";
        else if (crop.growthTimePoints >= t0) crop.stage = "SPROUT";
      }
    }

    return { ...state, grid };
  }

  private hasWaterAdj(grid: TileState[][], x: number, y: number): boolean {
    const neighbors = [
      { x: x - 1, y },
      { x: x + 1, y },
      { x, y: y - 1 },
      { x, y: y + 1 },
    ];
    return neighbors.some(
      (n) =>
        n.x >= 0 &&
        n.x < GRID_SIZE &&
        n.y >= 0 &&
        n.y < GRID_SIZE &&
        grid[n.y][n.x].type === "WATER",
    );
  }
}

class SubsidyScheduler implements Scheduler<GameState> {
  id = "subsidy";

  schedule(state: GameState): Schedule<GameState> | null {
    return {
      kind: "every",
      everyTicks: 1,
      except: (state: GameState) => state.status !== "PLAYING",
    };
  }

  apply(state: GameState, meta: Meta): GameState | null {
    // if (state.status !== "PLAYING") return null;

    // Grant $5 to all players every 100 ticks
    const currentTick = meta.orderingTick;
    const lastTick = state.lastSubsidyTick ?? 0;
    const dt = currentTick - lastTick;

    if (dt <= 0) return null;

    const plusMoney = 5;

    if (meta.orderingTick % 100 === 0) {
      Object.values(state.players).forEach((p) => {
        p.money += plusMoney * dt;
      });
    }

    return { ...state, lastSubsidyTick: currentTick };
  }
}

class WeatherScheduler implements Scheduler<GameState> {
  id = "weather";

  schedule(state: GameState): Schedule<GameState> | null {
    return {
      kind: "every",
      everyTicks: Math.floor(10 / (ORDERING_TICK_MS / 1000)),
      except: (state: GameState) => state.status !== "PLAYING",
    };
  }

  apply(state: GameState, meta: Meta): GameState | null {
    const rng = createRNG(`${state.seed}-weather-${meta.orderingTick}`);
    const r = rng();
    if (r < 0.6) state.weather = "SUNNY";
    else if (r < 0.9) state.weather = "RAINY";
    else state.weather = "STORM";

    return { ...state, lastWeatherTick: meta.orderingTick };
  }
}

const INITIAL_STATE: GameState = {
  status: "LOBBY",
  lastGrowthTick: 0,
  lastSubsidyTick: 0,
  lastWeatherTick: 0,
  grid: [],
  players: {},
  seed: "farming-v2-stable-seed", // Shared seed for all peers
  weather: "SUNNY",
};

export function initializeGrid(seed: string): TileState[][] {
  const rng = createRNG(seed);
  const grid: TileState[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: TileState[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      const r = rng();
      let type: TileType = "SOIL";
      if (r < 0.1) type = "WATER";
      else if (r < 0.4) type = "GRASS";

      const variant = Math.floor(rng() * 5); // Index 0-4 for variants
      row.push({ type, variant });
    }
    grid.push(row);
  }
  return grid;
}

class FarmingRule implements Rule<GameState, GameAction> {
  isLegal(
    state: GameState,
    action: GameAction,
    meta: { from: string },
  ): Result<void> {
    if (action.type === "JOIN") return ok(undefined);
    if (action.type === "START_GAME") {
      if (state.status !== "LOBBY") return err("Game already started");
      if (Object.keys(state.players).length < 1)
        return err("Not enough players");
      return ok(undefined);
    }
    if (action.type === "SELECT_TILE") return ok(undefined);
    if (action.type === "LEAVE") return ok(undefined);

    const player = state.players[meta.from];

    if (!player) return err("Player not found");

    // Safety check for grid access
    if (state.status !== "PLAYING") {
      return err("Game not started yet");
    }

    const { x, y } = player.position || { x: -1, y: -1 };
    const tile =
      x !== -1 && y !== -1 ? (state.grid[y] ? state.grid[y][x] : null) : null;

    if (!tile) return err("Invalid tile position");

    switch (action.type) {
      case "MOVE": {
        if (!player.position) return err("Player has no position");
        const { x, y } = player.position;
        const dx = Math.abs(x - action.target.x);
        const dy = Math.abs(y - action.target.y);
        if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
          if (
            Object.values(state.players).some(
              (p) =>
                p.position?.x === action.target.x &&
                p.position?.y === action.target.y,
            )
          ) {
            return err("Tile is occupied");
          }
          return ok(undefined);
        }
        return err("Move too far or diagonal");
      }
      case "EXPLORE":
        if (tile.type !== "GRASS") return err("Must be on grass to explore");
        return ok(undefined);
      case "TILL":
        if (tile.type !== "SOIL") return err("Must be on soil to till");
        return ok(undefined);
      case "PLANT": {
        if (tile.type !== "FARMLAND")
          return err("Must be on farmland to plant");
        if (tile.crop) return err("Tile already has a crop");
        const seed = player.inventory.find(
          (i) => i.type === action.seedType && i.category === "SEED",
        );
        if (action.useFertilizer) {
          const fert = player.inventory.find((i) => i.type === "FERTILIZER");
          if (!fert || fert.count <= 0) return err("No fertilizer left");
        }
        return ok(undefined);
      }
      case "HARVEST":
        if (!tile.crop || tile.crop.stage !== "MATURE")
          return err("No mature crop to harvest");
        return ok(undefined);
      case "SELL": {
        const crop = player.inventory.find(
          (i) => i.type === action.seedType && i.category === "CROP",
        );
        if (!crop || crop.count <= 0) return err("No crops to sell");
        return ok(undefined);
      }
      case "BUY": {
        const price =
          action.itemType === "FERTILIZER"
            ? FERTILIZER_CONFIG.buyPrice
            : SEED_CONFIG[action.itemType as SeedType].buyPrice;
        if (player.money < price) return err("Not enough money");
        return ok(undefined);
      }
      default:
        return ok(undefined);
    }
  }

  apply(
    state: GameState,
    action: GameAction,
    meta: { from: string },
  ): GameState {
    const next = structuredClone(state);
    const rng = createRNG(`${next.seed}-${next.lastGrowthTick}`);
    const player = next.players[meta.from];

    switch (action.type) {
      case "JOIN":
        if (!next.players[action.playerId]) {
          next.players[action.playerId] = {
            id: action.playerId,
            name: action.name,
            color: action.color,
            money: 100,
            selectedTile: null,
            inventory: [
              {
                id: `init-${action.playerId}`,
                type: "TURNIP",
                category: "SEED",
                count: 2,
              },
            ],
          };
        }
        break;

      case "START_GAME": {
        console.log("[Engine] START_GAME signal received");
        next.status = "PLAYING";
        next.grid = initializeGrid(next.seed);

        // Deterministic Placement: Sort all player IDs alphabetically
        // This ensures every peer assigns the same position to the same player
        const sortedPlayerIds = Object.keys(next.players).sort();
        const spawnPoints = [
          { x: 0, y: 0 }, // Top-Left
          { x: 9, y: 0 }, // Top-Right
          { x: 0, y: 9 }, // Bottom-Left
          { x: 9, y: 9 }, // Bottom-Right
        ];

        sortedPlayerIds.forEach((id, index) => {
          const p = next.players[id];
          if (p) {
            p.position = spawnPoints[index % spawnPoints.length];
          }
        });
        break;
      }

      case "MOVE":
        if (player) {
          player.position = action.target;
        }
        break;

      case "EXPLORE": {
        const p = player;
        const r = rng();
        if (r < 0.4) {
          const seedR = rng();
          let sType: SeedType = "TURNIP";
          if (seedR < 0.2) sType = "POTATO";
          else if (seedR < 0.5) sType = "CARROT";

          const existing = p.inventory.find(
            (i) => i.type === sType && i.category === "SEED",
          );
          if (existing) {
            existing.count += 1;
          } else {
            p.inventory.push({
              id: `${sType}-${Date.now()}`,
              type: sType,
              category: "SEED",
              count: 1,
            });
          }
        }
        break;
      }

      case "TILL": {
        const p = player;
        if (p.position) {
          next.grid[p.position.y][p.position.x].type = "FARMLAND";
        }
        break;
      }

      case "PLANT": {
        const p = player;
        if (!p.position) break;
        const tile = next.grid[p.position.y][p.position.x];
        const seedItem = p.inventory.find(
          (i) => i.type === action.seedType && i.category === "SEED",
        );
        if (!seedItem) break;
        seedItem.count -= 1;
        tile.crop = {
          type: action.seedType,
          stage: "PLANTED",
          plantedTick: next.lastGrowthTick,
          fertilized: action.useFertilizer,
          growthTimePoints: 0,
          totalGrowthNeeded: SEED_CONFIG[action.seedType].growthTicks.reduce(
            (a, b) => a + b,
            0,
          ),
        };
        if (action.useFertilizer) {
          const fert = p.inventory.find((i) => i.type === "FERTILIZER");
          if (fert) fert.count -= 1;
        }
        p.inventory = p.inventory.filter((i) => i.count > 0);
        break;
      }

      case "HARVEST": {
        const p = player;
        if (!p.position) break;
        const tile = next.grid[p.position.y][p.position.x];
        if (!tile.crop) break;
        const cType = tile.crop.type;
        tile.crop = undefined;
        const existing = p.inventory.find(
          (i) => i.type === cType && i.category === "CROP",
        );
        if (existing) {
          existing.count += 1;
        } else {
          p.inventory.push({
            id: `${cType}-crop-${Date.now()}`,
            type: cType,
            category: "CROP",
            count: 1,
          });
        }
        break;
      }

      case "SELL": {
        const p = player;
        const item = p.inventory.find(
          (i) => i.type === action.seedType && i.category === "CROP",
        );
        if (!item) break;
        p.money += SEED_CONFIG[action.seedType].sellPrice;
        item.count -= 1;
        p.inventory = p.inventory.filter((i) => i.count > 0);
        break;
      }

      case "BUY": {
        const p = player;
        const price =
          action.itemType === "FERTILIZER"
            ? FERTILIZER_CONFIG.buyPrice
            : SEED_CONFIG[action.itemType as SeedType].buyPrice;
        p.money -= price;
        const cat = action.itemType === "FERTILIZER" ? "ITEM" : "SEED";
        const existing = p.inventory.find(
          (i) => i.type === action.itemType && i.category === cat,
        );
        if (existing) {
          existing.count += 1;
        } else {
          p.inventory.push({
            id: `${action.itemType}-${Date.now()}`,
            type: action.itemType as SeedType | "FERTILIZER",
            category: cat as "SEED" | "ITEM",
            count: 1,
          });
        }
        break;
      }

      case "SELECT_TILE":
        if (player) {
          if (
            player.selectedTile?.x === action.x &&
            player.selectedTile?.y === action.y
          ) {
            player.selectedTile = null;
          } else {
            player.selectedTile = { x: action.x, y: action.y };
          }
        }
        break;

      case "LEAVE":
        delete next.players[action.playerId];
        break;
    }

    return next;
  }
}

class FarmingView implements View<GameState, PlayerView> {
  observe(state: GameState, _playerId: string): PlayerView {
    return state; // Full visibility for now
  }
}

export class FarmingEngine extends BaseEngine<
  GameState,
  GameAction,
  PlayerView
> {
  protected rule = new FarmingRule();
  protected view = new FarmingView();

  constructor() {
    super(INITIAL_STATE);
    this.addScheduler(new WeatherScheduler());
    this.addScheduler(new GrowthScheduler());
    this.addScheduler(new SubsidyScheduler());
  }

  decodeAction(payload: unknown): GameAction {
    return payload as GameAction;
  }
}

export const farmingEngine = new FarmingEngine();
