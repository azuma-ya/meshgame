import { Users } from "lucide-react";
import type React from "react";
import type { GameState } from "../game/types";
import { cn } from "../lib/utils";

interface PlayerSidebarProps {
  view: GameState;
  selfId: string;
  className?: string;
}

export const PlayerSidebar: React.FC<PlayerSidebarProps> = ({
  view,
  selfId,
  className,
}) => {
  return (
    <aside
      className={cn(
        "w-64 bg-card border-r border-border flex flex-col overflow-hidden animate-in slide-in-from-left duration-500",
        className,
      )}
    >
      <div className="p-6 space-y-4 flex-1 overflow-y-auto">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-2">
          <Users size={14} /> プレイヤーリスト
        </div>
        <div className="space-y-2">
          {Object.values(view.players).map((p) => (
            <div
              key={p.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-md border border-input bg-background/50 transition-colors hover:bg-accent/50",
                p.id === selfId &&
                  "ring-1 ring-primary/50 bg-primary/5 border-primary/20",
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className="size-3 rounded-full ring-2 ring-background shadow-sm"
                  style={{ backgroundColor: p.color }}
                />
                <div className="flex flex-col">
                  <span className="text-sm font-bold tracking-tight text-foreground">
                    {p.name} {p.id === selfId ? "(自分)" : ""}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    pos:{" "}
                    {p.position
                      ? `[${p.position.x}, ${p.position.y}]`
                      : "待機中"}
                  </span>
                </div>
              </div>
              <span className="font-mono font-bold text-xs text-primary">
                ${p.money}
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};
