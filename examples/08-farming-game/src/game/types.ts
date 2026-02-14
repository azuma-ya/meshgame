import type { State } from "@nodegame/core";

export type TileType = "SOIL" | "GRASS" | "FARMLAND" | "WATER";
export type SeedType = "TURNIP" | "CARROT" | "POTATO";
export type GrowthStage = "PLANTED" | "SPROUT" | "GROWING" | "MATURE";

export interface Crop {
  type: SeedType;
  stage: GrowthStage;
  plantedTick: number;
  fertilized: boolean;
  growthTimePoints: number;
  totalGrowthNeeded: number;
}

export interface InventoryItem {
  id: string;
  type: SeedType | "FERTILIZER";
  category: "SEED" | "CROP" | "ITEM";
  count: number;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  position?: { x: number; y: number };
  selectedTile: { x: number; y: number } | null;
  money: number;
  inventory: InventoryItem[];
}

export interface TileState {
  type: TileType;
  variant?: number;
  crop?: Crop;
}

export interface GameState extends State {
  status: "LOBBY" | "PLAYING" | "GAME_OVER";
  grid: TileState[][];
  players: Record<string, Player>;
  seed: string;
  lastGrowthTick: number;
  lastSubsidyTick: number;
  lastWeatherTick: number;
  weather: "SUNNY" | "RAINY" | "STORM";
  winner?: string;
}

export type GameAction =
  | { type: "JOIN"; playerId: string; name: string; color: string }
  | { type: "START_GAME" }
  | { type: "MOVE"; target: { x: number; y: number } }
  | { type: "EXPLORE" }
  | { type: "TILL" }
  | {
      type: "PLANT";
      seedType: SeedType;
      useFertilizer: boolean;
    }
  | { type: "HARVEST" }
  | { type: "SELL"; seedType: SeedType }
  | { type: "BUY"; itemType: SeedType | "FERTILIZER" }
  | { type: "SELECT_TILE"; x: number; y: number }
  | { type: "LEAVE"; playerId: string };

export interface PlayerView extends GameState {}

export const GRID_SIZE = 10;
export const TICK_MS = 50;
export const ORDERING_TICK_MS = 1000;
export const BASE_TICK_MS = 1000;

export const SEED_CONFIG: Record<
  SeedType,
  { buyPrice: number; sellPrice: number; growthTicks: number[]; label: string }
> = {
  TURNIP: {
    buyPrice: 10,
    sellPrice: 20,
    growthTicks: [4, 6, 8],
    label: "カブ",
  },
  CARROT: {
    buyPrice: 15,
    sellPrice: 30,
    growthTicks: [6, 8, 10],
    label: "ニンジン",
  },
  POTATO: {
    buyPrice: 20,
    sellPrice: 40,
    growthTicks: [8, 10, 12],
    label: "ジャガイモ",
  },
};

export const FERTILIZER_CONFIG = {
  buyPrice: 15,
  growthBoost: 0.85,
};

export const WATER_ADJACENCY_BOOST = 0.8;
