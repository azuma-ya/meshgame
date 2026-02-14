import {
  Info,
  Package,
  ShoppingCart,
  Tractor,
  Users,
  Wallet,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import {
  FERTILIZER_CONFIG,
  type GameAction,
  type GameState,
  SEED_CONFIG,
} from "../game/types";
import { cn } from "../lib/utils";

interface SidePanelProps {
  view: GameState;
  onAction: (action: GameAction) => void;
  selfId: string;
  selectedSeedIndex?: number;
  onSelectSeedIndex?: (index: number) => void;
  className?: string;
}

const SEED_NAMES: Record<string, string> = {
  TURNIP: "カブ",
  CARROT: "人参",
  POTATO: "ジャガイモ",
};

const TILE_NAMES: Record<string, string> = {
  SOIL: "土",
  GRASS: "草地",
  FARMLAND: "農地",
  WATER: "水",
};

export const SidePanel: React.FC<SidePanelProps> = ({
  view,
  onAction,
  selfId,
  selectedSeedIndex,
  onSelectSeedIndex,
  className,
}) => {
  const [useFertilizer, setUseFertilizer] = useState(false);
  const activePlayer = view.players[selfId];
  if (!activePlayer) return null;

  const playerPos = activePlayer.position;
  if (!playerPos) {
    return (
      <div className="w-80 bg-card border-l border-border flex flex-col items-center justify-center p-6 text-center">
        <Users size={48} className="text-muted-foreground mb-4 opacity-20" />
        <h3 className="font-semibold">参加中...</h3>
        <p className="text-sm text-muted-foreground mt-2">
          位置情報の割り当てを待っています。
        </p>
      </div>
    );
  }

  // Action Tile is ALWAYS the player's current position
  const actionTile = view.grid[playerPos.y]?.[playerPos.x];

  // Info Tile prioritized selectedTile, falls back to player position
  const infoPos = activePlayer.selectedTile || playerPos;
  const infoTile = view.grid[infoPos.y]?.[infoPos.x];

  if (!infoTile || !actionTile) return null;

  return (
    <div
      className={cn(
        "w-80 h-full bg-card border-l border-border flex flex-col overflow-hidden animate-in slide-in-from-right duration-500",
        className,
      )}
    >
      <div className="p-6 space-y-8 flex-1 overflow-y-auto">
        {/* Money Display - Responsive Only */}
        <section className="lg:hidden space-y-2 pb-4 border-b border-border">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <Wallet size={14} /> 所持金
          </div>
          <div className="text-2xl font-black text-primary">
            ${activePlayer.money}
          </div>
        </section>
        {/* Actions - Desktop Only */}
        <section className="hidden lg:block space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <Tractor size={14} /> アクション
          </div>
          <div className="grid grid-cols-1 gap-2">
            {actionTile.type === "GRASS" && (
              <button
                onClick={() => onAction({ type: "EXPLORE" })}
                className="flex items-center justify-between w-full h-10 px-4 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-all"
              >
                周囲を探索{" "}
                <span className="text-[10px] opacity-70">種を見つける</span>
              </button>
            )}

            {actionTile.type === "SOIL" && (
              <button
                onClick={() => onAction({ type: "TILL" })}
                className="flex items-center justify-between w-full h-10 px-4 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-all"
              >
                土地を耕す{" "}
                <span className="text-[10px] opacity-70">農地にする</span>
              </button>
            )}

            {actionTile.type === "FARMLAND" && !actionTile.crop && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={useFertilizer}
                      onChange={(e) => setUseFertilizer(e.target.checked)}
                      className="size-4 rounded border-input bg-background accent-primary"
                    />
                    <span className="text-xs font-bold text-muted-foreground group-hover:text-foreground transition-colors">
                      肥料をまく
                      <span className="ml-1 opacity-50 font-normal">
                        (x
                        {activePlayer.inventory.find(
                          (i) => i.type === "FERTILIZER",
                        )?.count ?? 0}
                        )
                      </span>
                    </span>
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["TURNIP", "CARROT", "POTATO"] as const).map(
                    (seed, idx) => {
                      const inv = activePlayer.inventory.find(
                        (i) => i.type === seed && i.category === "SEED",
                      );
                      const has = (inv?.count ?? 0) > 0;
                      const isSelected = selectedSeedIndex === idx;
                      return (
                        <button
                          key={seed}
                          disabled={!has}
                          onClick={() => {
                            onSelectSeedIndex?.(idx);
                            onAction({
                              type: "PLANT",
                              seedType: seed,
                              useFertilizer: useFertilizer,
                            });
                          }}
                          className={cn(
                            "h-20 flex flex-col items-center justify-center gap-1 rounded-md border bg-background hover:bg-accent transition-all",
                            isSelected
                              ? "border-primary ring-1 ring-primary"
                              : "border-input",
                            !has && "opacity-30 hover:bg-background",
                          )}
                        >
                          <span className="text-[10px] font-bold">
                            {SEED_NAMES[seed]}
                          </span>
                          <span className="font-mono text-lg font-black">
                            {inv?.count ?? 0}
                          </span>
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            )}

            {actionTile.crop?.stage === "MATURE" && (
              <button
                onClick={() => onAction({ type: "HARVEST" })}
                className="flex items-center justify-between w-full h-10 px-4 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-all shadow-md shadow-primary/20"
              >
                収穫する{" "}
                <span className="text-xs">
                  +{SEED_NAMES[actionTile.crop.type]}
                </span>
              </button>
            )}
          </div>
        </section>

        {/* Inventory */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <Package size={14} /> 持ち物
          </div>
          <div className="grid grid-cols-2 gap-2">
            {activePlayer.inventory.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-muted rounded-md border border-input space-y-1"
              >
                <div className="text-[10px] font-bold text-muted-foreground">
                  {SEED_NAMES[item.type as keyof typeof SEED_NAMES] ||
                    item.type}
                  {item.category === "SEED" && " (種)"}
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">x{item.count}</span>
                  {item.category === "CROP" && (
                    <button
                      onClick={() =>
                        onAction({
                          type: "SELL",
                          seedType: item.type as keyof typeof SEED_CONFIG,
                        })
                      }
                      className="text-[10px] bg-primary text-primary-foreground px-2 py-1 rounded-sm hover:opacity-90 transition-opacity"
                    >
                      売却 $
                      {
                        SEED_CONFIG[item.type as keyof typeof SEED_CONFIG]
                          ?.sellPrice
                      }
                    </button>
                  )}
                </div>
              </div>
            ))}
            {activePlayer.inventory.length === 0 && (
              <div className="col-span-2 py-8 text-center border-2 border-dashed border-input rounded-md">
                <span className="text-xs text-muted-foreground">空です</span>
              </div>
            )}
          </div>
        </section>

        {/* Market */}
        <section className="space-y-4 pb-8">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <ShoppingCart size={14} /> ショップ
          </div>
          <div className="flex flex-col gap-2">
            {(
              Object.entries(SEED_CONFIG) as [
                keyof typeof SEED_CONFIG,
                (typeof SEED_CONFIG)["TURNIP"],
              ][]
            ).map(([type, config]) => (
              <button
                key={type}
                onClick={() =>
                  onAction({
                    type: "BUY",
                    itemType: type,
                  })
                }
                className="flex items-center justify-between px-4 py-2 border border-input rounded-md hover:bg-accent transition-colors"
              >
                <div className="flex flex-col items-start">
                  <span className="text-xs font-bold">
                    {SEED_NAMES[type]} の種
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    成長:{" "}
                    {config.growthTicks.reduce(
                      (a: number, b: number) => a + b,
                      0,
                    )}{" "}
                    ティック
                  </span>
                </div>
                <span className="font-mono font-bold text-sm">
                  ${config.buyPrice}
                </span>
              </button>
            ))}
            <button
              onClick={() =>
                onAction({
                  type: "BUY",
                  itemType: "FERTILIZER",
                })
              }
              className="flex items-center justify-between px-4 py-2 border border-input rounded-md hover:bg-accent transition-colors"
            >
              <div className="flex flex-col items-start">
                <span className="text-xs font-bold">肥料</span>
                <span className="text-[10px] text-muted-foreground">
                  効果: 成長15%加速
                </span>
              </div>
              <span
                className="font-mono font-bold text-sm"
                style={{ color: "#ff9800" }}
              >
                ${FERTILIZER_CONFIG.buyPrice}
              </span>
            </button>
          </div>
        </section>
      </div>

      {/* Selected Tile Info */}
      <footer className="p-6 bg-muted border-t border-border">
        <div className="flex items-start gap-3">
          <Info size={16} className="text-muted-foreground mt-0.5" />
          <div>
            <h4 className="text-xs font-bold uppercase tracking-tighter">
              現在の区画
            </h4>
            <p className="text-sm font-medium mt-1">
              [{infoPos.x}, {infoPos.y}] - {TILE_NAMES[infoTile.type]}
            </p>
            {infoTile.crop && (
              <div className="mt-2 space-y-1">
                <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{
                      width: `${(infoTile.crop.growthTimePoints / infoTile.crop.totalGrowthNeeded) * 100}%`,
                    }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground font-mono">
                  状態:{" "}
                  {infoTile.crop.stage === "PLANTED"
                    ? "種まき済"
                    : infoTile.crop.stage === "SPROUT"
                      ? "発芽"
                      : infoTile.crop.stage === "GROWING"
                        ? "成長中"
                        : "収穫可能"}
                  (
                  {Math.round(
                    (infoTile.crop.growthTimePoints /
                      infoTile.crop.totalGrowthNeeded) *
                      100,
                  )}
                  %)
                </p>
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};
