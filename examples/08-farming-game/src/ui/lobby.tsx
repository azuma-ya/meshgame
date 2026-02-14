import { Server, User } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { cn } from "../lib/utils";

interface LobbyProps {
  onStart: (name: string, wsUrl: string, color: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({ onStart }) => {
  const [name, setName] = useState("");
  const [wsUrl, setWsUrl] = useState("ws://localhost:8080");
  const [color, setColor] = useState("#18181b");

  const colors = [
    "#18181b",
    "#2563eb",
    "#dc2626",
    "#d97706",
    "#7c3aed",
    "#db2777",
    "#0891b2",
    "#65a30d",
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 animate-in fade-in duration-500">
      <div className="w-full max-w-md bg-card p-8 rounded-lg shadow-sm border border-border space-y-8">
        <div className="text-left space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            ファーミング・ノード
          </h1>
          <p className="text-muted-foreground text-sm">
            名前を入力してシミュレーションを開始してください。
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-1.5">
            <label className="text-sm font-medium leading-none flex items-center gap-2">
              <User className="size-4 text-muted-foreground mr-1" /> 表示名
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="名前を入力..."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium leading-none flex items-center gap-2">
              <Server className="size-4 text-muted-foreground mr-1" />
              シグナリングサーバー URL
            </label>
            <input
              type="text"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">テーマカラー</p>
            <div className="grid grid-cols-4 gap-2 place-items-center">
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "size-8 rounded-full transition-all border-2",
                    color === c
                      ? "border-primary ring-2 ring-ring ring-offset-2"
                      : "border-transparent hover:opacity-80",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={() => onStart(name, wsUrl, color)}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
        >
          セッションに参加
        </button>
      </div>
    </div>
  );
};
