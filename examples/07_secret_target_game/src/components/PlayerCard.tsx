import { Shield, Skull, Target, User } from "lucide-react";
import type { Player, PlayerId } from "../types";

interface PlayerCardProps {
  player: Player;
  isSelf: boolean;
  canSelect: boolean;
  onSelectTarget: (targetId: PlayerId) => void;
}

export function PlayerCard({
  player,
  isSelf,
  canSelect,
  onSelectTarget,
}: PlayerCardProps) {
  const isDead = !player.isAlive || player.hp <= 0;

  return (
    <div
      className={`relative p-4 rounded-xl border-2 transition-all ${
        isSelf
          ? "border-primary bg-primary/5"
          : isDead
            ? "border-destructive/50 bg-destructive/10 opacity-70"
            : "border-muted bg-card hover:border-primary/50"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className={`p-2 rounded-full ${
              isSelf ? "bg-primary text-primary-foreground" : "bg-muted"
            }`}
          >
            {isDead ? <Skull size={20} /> : <User size={20} />}
          </div>
          <span className="font-bold text-lg">{player.id}</span>
          {isSelf && (
            <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
              YOU
            </span>
          )}
        </div>
        {!isDead && (
          <div className="flex items-center gap-1 text-red-500 font-bold">
            <Shield size={16} />
            <span>{player.hp}</span>
          </div>
        )}
      </div>

      {/* Status */}
      <div className="space-y-2">
        {isDead ? (
          <div className="text-center py-2 text-destructive font-bold uppercase tracking-widest">
            Eliminated
          </div>
        ) : (
          <>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Status</span>
              <span
                className={
                  player.selectedTarget ? "text-green-500" : "text-yellow-500"
                }
              >
                {player.selectedTarget ? "Ready" : "Thinking..."}
              </span>
            </div>

            {/* Actions for Self */}
            {canSelect && !isSelf && (
              <button
                onClick={() => onSelectTarget(player.id)}
                className="w-full mt-4 flex items-center justify-center gap-2 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors font-semibold"
              >
                <Target size={18} />
                Attack
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
