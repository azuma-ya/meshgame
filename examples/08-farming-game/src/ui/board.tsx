import type React from "react";
import { useMemo } from "react";
import type { PlayerView } from "../game/types";
import { TileCell } from "./tile-cell";

interface BoardProps {
  view: PlayerView;
  onSelectTile: (x: number, y: number) => void;
  selfId: string;
}

export const Board: React.FC<BoardProps> = ({ view, onSelectTile, selfId }) => {
  // Pre-calculate occupant map for O(1) lookup in TileCell
  const occupantMap = useMemo(() => {
    const map: Record<string, (typeof view.players)[string]> = {};
    for (const player of Object.values(view.players)) {
      if (player.position) {
        map[`${player.position.x}-${player.position.y}`] = player;
      }
    }
    return map;
  }, [view.players]);

  const self = view.players[selfId];

  return (
    <div className="grid grid-cols-10 grid-rows-10 gap-0 bg-border p-px rounded-lg aspect-square w-full max-w-[80vh] border border-border">
      {view.grid.map((row, y) =>
        row.map((tile, x) => {
          const key = `${x}-${y}`;
          return (
            <TileCell
              key={key}
              x={x}
              y={y}
              tile={tile}
              occupant={occupantMap[key]}
              isSelected={
                self?.selectedTile?.x === x && self?.selectedTile?.y === y
              }
              onClick={() => onSelectTile(x, y)}
            />
          );
        }),
      )}
    </div>
  );
};
