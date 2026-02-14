import { Activity, Clock, Menu, Play, ShoppingBag, Wallet } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import {
  type GameAction,
  type GameState,
  ORDERING_TICK_MS,
} from "../game/types";
import { cn } from "../lib/utils";
import { Board } from "./board";
import { PlayerSidebar } from "./player-sidebar";
import { SidePanel } from "./side-panel";

interface GameShellProps {
  view: GameState;
  onAction: (action: GameAction) => void;
  onTogglePause: () => void;
  isPaused: boolean;
  selfId: string;
}

const SEEDS = ["TURNIP", "CARROT", "POTATO"] as const;

export const GameShell: React.FC<GameShellProps> = ({
  view,
  onAction,
  isPaused,
  selfId,
}) => {
  const localPlayer = view.players[selfId];
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [useFertilizer, setUseFertilizer] = useState(false);
  const [selectedSeedIndex, setSelectedSeedIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(
    null,
  );

  const currentSeed = SEEDS[selectedSeedIndex];

  // Keyboard Movement
  useEffect(() => {
    if (view.status !== "PLAYING" || isPaused) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!localPlayer) return;

      let targetX = localPlayer.position?.x ?? -1;
      let targetY = localPlayer.position?.y ?? -1;
      if (targetX === -1 || targetY === -1) return;

      // Handle Key Actions
      const k = e.key.toLowerCase();
      if (k === "w") targetY--;
      else if (k === "s") targetY++;
      else if (k === "a") targetX--;
      else if (k === "d") targetX++;
      else if (e.key === " ") {
        // Space Action logic
        e.preventDefault(); // Prevent scrolling
        const pos = localPlayer.position;
        if (!pos) return;
        const tile = view.grid[pos.y]?.[pos.x];
        if (!tile) return;

        if (tile.crop?.stage === "MATURE") {
          onAction({ type: "HARVEST" });
        } else if (tile.type === "GRASS") {
          onAction({ type: "EXPLORE" });
        } else if (tile.type === "SOIL") {
          onAction({ type: "TILL" });
        } else if (tile.type === "FARMLAND" && !tile.crop) {
          onAction({
            type: "PLANT",
            seedType: currentSeed,
            useFertilizer,
          });
        }
        return;
      } else {
        return;
      }

      // Check bounds and Move
      if (targetX >= 0 && targetX < 10 && targetY >= 0 && targetY < 10) {
        onAction({
          type: "MOVE",
          target: { x: targetX, y: targetY },
        });
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) {
        setSelectedSeedIndex((prev) => (prev + 1) % SEEDS.length);
      } else {
        setSelectedSeedIndex(
          (prev) => (prev - 1 + SEEDS.length) % SEEDS.length,
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", handleWheel);
    };
  }, [
    view.status,
    isPaused,
    localPlayer,
    onAction,
    currentSeed,
    useFertilizer,
    view.grid,
  ]);

  // Touch/Swipe Movement
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart || !localPlayer?.position) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (Math.max(absX, absY) < 40) return; // Sensitivity threshold

    let targetX = localPlayer.position.x;
    let targetY = localPlayer.position.y;

    if (absX > absY) {
      if (dx > 0) targetX++;
      else targetX--;
    } else {
      if (dy > 0) targetY++;
      else targetY--;
    }

    if (targetX >= 0 && targetX < 10 && targetY >= 0 && targetY < 10) {
      onAction({ type: "MOVE", target: { x: targetX, y: targetY } });
    }
    setTouchStart(null);
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="flex flex-col h-screen w-screen bg-background select-none animate-in fade-in duration-700"
    >
      {/* HUD - Shadcn Style */}
      <header
        onTouchStart={(e) => e.stopPropagation()}
        className="h-16 border-b border-border flex items-center justify-between px-6 bg-card sticky top-0 z-50"
      >
        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 group shrink-0">
            <Clock
              size={18}
              className="text-muted-foreground group-hover:text-primary transition-colors"
            />
            <div className="flex flex-col">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">
                経過時間
              </span>
              <span className="font-mono text-sm font-bold">
                {view.lastGrowthTick}
              </span>
            </div>
          </div>

          <div className="h-8 w-px bg-border shrink-0" />

          <div className="flex items-center gap-2 group shrink-0">
            <div className="flex flex-col">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">
                天気
              </span>
              <span className="font-bold text-sm">
                {view.weather === "SUNNY" && "☀️ 晴れ"}
                {view.weather === "RAINY" && "🌧️ 雨"}
                {view.weather === "STORM" && "⚡ 嵐"}
              </span>
            </div>
          </div>

          <div className="h-8 w-px bg-border shrink-0" />

          <div className="flex items-center gap-2 group shrink-0">
            <Activity
              size={18}
              className="text-muted-foreground group-hover:text-primary transition-colors"
            />
            <div className="flex flex-col">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">
                同期状態
              </span>
              <span className="font-bold text-sm">
                {Object.keys(view.players).length} ピア
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
            className="lg:hidden rounded-md hover:bg-accent transition-colors"
            title="プレイヤーリスト"
          >
            <Menu className="text-muted-foreground size-4" />
          </button>

          <div className="h-8 w-px bg-border hidden sm:block shrink-0" />

          <div className="items-center gap-3 shrink-0 hidden lg:flex">
            <Wallet size={18} className="text-muted-foreground" />
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">
                所持金
              </span>
              <span className="text-sm font-bold text-primary">
                ${localPlayer?.money ?? 0}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar - Player List */}
        <div onTouchStart={(e) => e.stopPropagation()}>
          <PlayerSidebar
            view={view}
            selfId={selfId}
            className={cn(
              "fixed top-16 bottom-0 left-0 z-40 lg:relative lg:top-0 lg:translate-x-0 transition-transform duration-300 ease-in-out",
              isLeftSidebarOpen ? "translate-x-0" : "-translate-x-full",
            )}
          />
        </div>

        <div className="flex-1 bg-muted/20 flex items-center justify-center p-4 sm:p-8 overflow-auto">
          {view.status === "LOBBY" ? (
            <div className="max-w-md w-full bg-card border border-border rounded-lg p-8 shadow-sm space-y-6">
              <div className="space-y-2 text-center">
                <h2 className="text-xl font-semibold tracking-tight">
                  準備はいいですか？
                </h2>
                <p className="text-sm text-muted-foreground">
                  開始ボタンを押すとシミュレーションが始まります。
                </p>
              </div>
              <div className="rounded-md bg-muted p-4 font-mono text-xs text-muted-foreground space-y-1">
                <p># プロトコル: NODECORE_FARMING_V2</p>
                <p># 参加人数: {Object.keys(view.players).length}</p>
                <p># 通信間隔: {ORDERING_TICK_MS}ms</p>
              </div>

              <button
                onClick={() => onAction({ type: "START_GAME" })}
                className="w-full flex items-center justify-center gap-2 rounded-md bg-primary py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.98]"
              >
                <Play size={16} fill="currentColor" />
                シミュレーションを開始
              </button>
            </div>
          ) : (
            <Board
              view={view}
              selfId={selfId}
              onSelectTile={(x, y) => {
                if (!localPlayer) {
                  onAction({ type: "SELECT_TILE", x, y });
                  return;
                }
                // Determine if we should MOVE or SELECT
                if (!localPlayer.position) {
                  onAction({ type: "SELECT_TILE", x, y });
                  return;
                }
                const dx = Math.abs(localPlayer.position.x - x);
                const dy = Math.abs(localPlayer.position.y - y);
                if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
                  onAction({
                    type: "MOVE",
                    target: { x, y },
                  });
                } else {
                  onAction({ type: "SELECT_TILE", x, y });
                }
              }}
            />
          )}
        </div>

        {/* Right Sidebar - Actions/Market */}
        {view.status !== "LOBBY" && (
          <div onTouchStart={(e) => e.stopPropagation()}>
            <SidePanel
              view={view}
              onAction={onAction}
              selfId={selfId}
              selectedSeedIndex={selectedSeedIndex}
              onSelectSeedIndex={setSelectedSeedIndex}
              className={cn(
                "fixed top-16 bottom-0 right-0 z-40 lg:relative lg:top-0 lg:translate-x-0 transition-transform duration-300 ease-in-out",
                isRightSidebarOpen ? "translate-x-0" : "translate-x-full",
              )}
            />
          </div>
        )}

        {/* Mobile Action Bar - Floating at bottom */}
        {view.status === "PLAYING" && localPlayer?.position && (
          <div
            onTouchStart={(e) => e.stopPropagation()}
            className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-20 bg-card/95 backdrop-blur-md border-t border-border flex items-center px-4 safe-area-bottom"
          >
            <div className="flex-1 flex items-center justify-between gap-2 max-w-lg mx-auto w-full h-full">
              {(() => {
                const pos = localPlayer.position;
                if (!pos) return null;
                const tile = view.grid[pos.y]?.[pos.x];
                if (!tile) return null;

                return (
                  <div className="flex-1 flex items-center gap-2">
                    {tile.crop?.stage === "MATURE" ? (
                      <button
                        onClick={() => onAction({ type: "HARVEST" })}
                        className="flex-1 h-12 rounded-lg bg-primary text-primary-foreground font-bold text-sm active:scale-95 transition-all shadow-lg shadow-primary/20 animate-subtle-bounce"
                      >
                        収穫
                      </button>
                    ) : tile.type === "GRASS" ? (
                      <button
                        onClick={() => onAction({ type: "EXPLORE" })}
                        className="flex-1 h-12 rounded-lg bg-primary text-primary-foreground font-bold text-sm active:scale-95 transition-all"
                      >
                        探索
                      </button>
                    ) : tile.type === "SOIL" ? (
                      <button
                        onClick={() => onAction({ type: "TILL" })}
                        className="flex-1 h-12 rounded-lg bg-primary text-primary-foreground font-bold text-sm active:scale-95 transition-all"
                      >
                        耕す
                      </button>
                    ) : tile.type === "FARMLAND" && !tile.crop ? (
                      <div className="flex-1 flex items-center gap-2 h-full">
                        <div className="flex items-center gap-1.5 h-full">
                          <button
                            onClick={() => setUseFertilizer(!useFertilizer)}
                            className={cn(
                              "size-10 rounded-lg font-bold text-[10px] transition-all flex flex-col items-center justify-center",
                              useFertilizer
                                ? "bg-primary border-primary text-primary-foreground"
                                : "bg-background border-input text-muted-foreground",
                            )}
                            title="肥料"
                            disabled={
                              (localPlayer.inventory.find(
                                (i) =>
                                  i.type === "FERTILIZER" &&
                                  i.category === "ITEM",
                              )?.count ?? 0) === 0 && !useFertilizer
                            }
                          >
                            <span>肥料</span>
                            <span className="text-[8px] opacity-70">
                              x
                              {localPlayer.inventory.find(
                                (i) =>
                                  i.type === "FERTILIZER" &&
                                  i.category === "ITEM",
                              )?.count ?? 0}
                            </span>
                          </button>
                          <div className="flex items-center gap-1 h-full">
                            {SEEDS.map((seed, idx) => {
                              const inv = localPlayer.inventory.find(
                                (i) => i.type === seed && i.category === "SEED",
                              );
                              const has = (inv?.count ?? 0) > 0;
                              const isSelected = idx === selectedSeedIndex;
                              return (
                                <button
                                  key={seed}
                                  disabled={!has}
                                  onClick={() => setSelectedSeedIndex(idx)}
                                  className={cn(
                                    "size-10 rounded-lg border border-input bg-background font-bold text-[10px] transition-all flex flex-col items-center justify-center",
                                    isSelected
                                      ? "ring-2 ring-primary"
                                      : "border-input",
                                    !has && "opacity-30",
                                  )}
                                >
                                  <span>
                                    {seed === "TURNIP"
                                      ? "カブ"
                                      : seed === "CARROT"
                                        ? "人参"
                                        : "芋"}
                                  </span>
                                  <span className="text-[8px] opacity-70">
                                    x{inv?.count ?? 0}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="w-px h-8 bg-border shrink-0 mx-1" />
                        <button
                          onClick={() =>
                            onAction({
                              type: "PLANT",
                              seedType: SEEDS[selectedSeedIndex],
                              useFertilizer,
                            })
                          }
                          className="flex-1 h-12 rounded-lg bg-primary text-primary-foreground font-bold text-sm active:scale-95 transition-all"
                        >
                          種まき
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center gap-3 min-w-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-bold text-muted-foreground uppercase leading-none mb-1 truncate">
                            {tile.type === "WATER"
                              ? "水場"
                              : tile.type === "FARMLAND"
                                ? "農地"
                                : tile.type === "GRASS"
                                  ? "草地"
                                  : "土地"}
                          </div>
                          <div className="text-xs font-bold leading-none truncate">
                            {tile.crop
                              ? `${tile.crop.type === "TURNIP" ? "カブ" : tile.crop.type === "CARROT" ? "人参" : "芋"}成長中`
                              : "待機中"}
                          </div>
                        </div>
                        {tile.crop && (
                          <div className="w-16 h-1 bg-muted rounded-full overflow-hidden border border-border shrink-0">
                            <div
                              className="h-full bg-primary transition-all duration-500"
                              style={{
                                width: `${(tile.crop.growthTimePoints / tile.crop.totalGrowthNeeded) * 100}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="w-px h-8 bg-border shrink-0 mx-1" />

              <button
                onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                className={cn(
                  "rounded-lg transition-all active:scale-95 shrink-0 hover:bg-accent",
                  isRightSidebarOpen ? "text-primary" : "text-muted-foreground",
                )}
                title="メニュー"
              >
                <ShoppingBag className="size-6" />
              </button>
            </div>
          </div>
        )}

        {/* Mobile Overlays */}
        {(isLeftSidebarOpen || isRightSidebarOpen) && (
          <div
            role="button"
            tabIndex={0}
            onTouchStart={(e) => e.stopPropagation()}
            className="fixed top-16 inset-x-0 bottom-0 bg-background/80 backdrop-blur-sm z-30 lg:hidden"
            onClick={() => {
              setIsLeftSidebarOpen(false);
              setIsRightSidebarOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                setIsLeftSidebarOpen(false);
                setIsRightSidebarOpen(false);
              }
            }}
          />
        )}
      </main>
    </div>
  );
};
