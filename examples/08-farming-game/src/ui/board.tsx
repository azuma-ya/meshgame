import type React from "react";
import type { PlayerView } from "../game/types";
import { TileCell } from "./tile-cell";

interface BoardProps {
  view: PlayerView;
  onSelectTile: (x: number, y: number) => void;
  selfId: string;
}

export const Board: React.FC<BoardProps> = ({ view, onSelectTile, selfId }) => {
  return (
    <div className="grid grid-cols-10 grid-rows-10 gap-0 bg-border p-px rounded-lg shadow-sm aspect-square w-full max-w-[80vh] border border-border">
      {view.grid.map((row, y) =>
        row.map((tile, x) => (
          <TileCell
            key={`${x}-${y}`}
            x={x}
            y={y}
            tile={tile}
            players={view.players}
            isSelected={
              view.players[selfId]?.selectedTile?.x === x &&
              view.players[selfId]?.selectedTile?.y === y
            }
            onClick={() => onSelectTile(x, y)}
          />
        )),
      )}
    </div>
  );
};
