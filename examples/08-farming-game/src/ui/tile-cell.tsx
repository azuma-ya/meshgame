import { memo } from "react";
import { type Player, SEED_CONFIG, type TileState } from "../game/types";
import { cn } from "../lib/utils";

interface TileCellProps {
  x: number;
  y: number;
  tile: TileState;
  occupant: Player | undefined;
  isSelected: boolean;
  onClick: () => void;
}

const TILE_STAGE_NAMES: Record<string, string> = {
  PLANTED: "種まき",
  SPROUT: "発芽",
  GROWING: "成長中",
  MATURE: "収穫可能",
};

const GRASS_COLORS = ["#7cfc00", "#00ff00", "#adff2f"];
const SOIL_COLORS = ["#c18a5e", "#b57f53", "#a87448", "#bc8458", "#b07a4d"];
const FARMLAND_COLORS = ["#6d4c41", "#5d4037", "#4e342e"];

export const TileCell = memo<TileCellProps>(
  ({ x, y, tile, occupant, isSelected, onClick }) => {
    const getTileStyle = () => {
      const variant = tile.variant || 0;
      switch (tile.type) {
        case "GRASS":
          return {
            backgroundColor: GRASS_COLORS[variant % GRASS_COLORS.length],
          };
        case "SOIL":
          return { backgroundColor: SOIL_COLORS[variant % SOIL_COLORS.length] };
        case "FARMLAND":
          return {
            backgroundColor: FARMLAND_COLORS[variant % FARMLAND_COLORS.length],
          };
        case "WATER":
          return {}; // Handled by CSS animation
        default:
          return {};
      }
    };

    return (
      <button
        className={cn(
          "relative size-full flex items-center justify-center cursor-pointer transition-all duration-200 aspect-square group border border-foreground/40",
          `tile-${tile.type.toLowerCase()}`,
          isSelected
            ? "ring-6 ring-background ring-inset z-10 shadow-sm"
            : "hover:brightness-85 hover:z-50",
        )}
        style={getTileStyle()}
        onClick={onClick}
      >
        {/* Crop Visuals */}
        {tile.crop && (
          <div
            className={`relative z-10 flex items-center justify-center group ${tile.crop.stage === "MATURE" ? "pulse-glow" : ""}`}
          >
            {tile.crop.stage === "PLANTED" && (
              <div className="size-4 bg-[#8b4513] rounded-full scale-50 opacity-40 shadow-sm" />
            )}
            {tile.crop.stage === "SPROUT" && (
              <div className="size-8 bg-[#adff2f] rounded-t-full rounded-b-sm shadow-sm border border-green-600/20" />
            )}
            {tile.crop.stage === "GROWING" && (
              <div className="size-12 bg-[#00ff00] rounded-lg shadow-md border-2 border-green-700/30" />
            )}
            {tile.crop.stage === "MATURE" && (
              <div
                className={`size-14 rounded-full shadow-lg border-2 border-white/80 flex items-center justify-center font-bold text-[8px] text-white
                ${tile.crop.type === "TURNIP" ? "bg-purple-500" : ""}
                ${tile.crop.type === "CARROT" ? "bg-orange-500" : ""}
                ${tile.crop.type === "POTATO" ? "bg-yellow-700" : ""}
              `}
              >
                <p className="text-base font-bold whitespace-nowrap">
                  {SEED_CONFIG[tile.crop.type].label}
                </p>
              </div>
            )}

            {/* Subtle Stage Label on Hover */}
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[8px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
              {TILE_STAGE_NAMES[tile.crop.stage]}
            </div>
          </div>
        )}

        {/* Player Occupant */}
        {occupant && (
          <div
            className="absolute z-30 size-12 rounded-full shadow-md flex items-center justify-center animate-in zoom-in duration-300"
            style={{ backgroundColor: occupant.color }}
          >
            <p className="text-2xl text-white font-bold">
              {occupant.name[0].toUpperCase()}
            </p>
          </div>
        )}

        {/* Coordinate Debug (Subtle) */}
        <span className="absolute bottom-0.5 right-1 text-[6px] text-black/20 font-mono pointer-events-none">
          {x},{y}
        </span>
      </button>
    );
  },
);
