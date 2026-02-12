import { Crown, Play, Swords, Users } from "lucide-react";
import { useState } from "react";
import { GameLog } from "./components/GameLog";
import { PlayerCard } from "./components/PlayerCard";
import { useGameLogic } from "./useGameLogic";

export default function App() {
  const { selfId, gameState, isConnected, connect, sendAction } =
    useGameLogic();

  const [inputName, setInputName] = useState("");
  const [wsUrl, setWsUrl] = useState("ws://localhost:8080");

  const handleConnect = () => {
    if (inputName && wsUrl) {
      connect(inputName, wsUrl);
    }
  };

  const handleStartGame = () => {
    sendAction({ type: "START_GAME" });
  };

  const handleSelectTarget = (targetId: string) => {
    sendAction({ type: "SELECT_TARGET", playerId: selfId, targetId });
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md bg-card p-8 rounded-xl shadow-lg border space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-block p-4 bg-primary/10 rounded-full mb-2">
              <Swords size={32} className="text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tighter">
              Secret Target
            </h1>
            <p className="text-muted-foreground">
              Deception & Strategy Game for 3 Players
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Your Name</label>
              <input
                type="text"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                className="w-full p-2 rounded-md border bg-background"
                placeholder="Enter your name..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Signaling Server</label>
              <input
                type="text"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                className="w-full p-2 rounded-md border bg-background"
                placeholder="ws://..."
              />
            </div>
            <button
              onClick={handleConnect}
              disabled={!inputName || !wsUrl}
              className="w-full py-2 bg-primary text-primary-foreground rounded-md font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              Enter Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="p-4 border-b bg-card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Swords size={24} className="text-primary" />
          <h1 className="font-bold text-xl hidden md:block">Secret Target</h1>
          <div className="h-6 w-px bg-border mx-2" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono bg-muted px-2 py-0.5 rounded text-foreground">
              {selfId}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Connected
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Users size={16} />
            <span>{Object.keys(gameState.players).length} Players</span>
          </div>
          {gameState.status === "LOBBY" && (
            <button
              onClick={handleStartGame}
              disabled={Object.keys(gameState.players).length < 2}
              className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play size={16} />
              Start Game
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto w-full">
        {/* Game Board */}
        <section className="lg:col-span-2 space-y-6">
          {gameState.status === "GAME_OVER" && (
            <div className="p-6 bg-primary/10 border border-primary rounded-xl flex items-center gap-4 animate-in fade-in zoom-in duration-500">
              <Crown size={32} className="text-yellow-500" />
              <div>
                <h2 className="text-2xl font-bold">Game Over!</h2>
                <p className="text-muted-foreground">
                  Winner:{" "}
                  <span className="font-bold text-foreground">
                    {gameState.winner}
                  </span>
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.values(gameState.players).map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                isSelf={player.id === selfId}
                canSelect={
                  gameState.status === "PLAYING" &&
                  gameState.players[selfId]?.isAlive &&
                  !gameState.players[selfId]?.selectedTarget
                }
                onSelectTarget={handleSelectTarget} // This is attack action
              />
            ))}
          </div>

          <div className="p-6 bg-card border rounded-xl shadow-sm text-center space-y-2">
            <h3 className="text-lg font-semibold">Turn {gameState.turn}</h3>
            <p className="text-sm text-muted-foreground">
              {gameState.status === "LOBBY"
                ? "Waiting for players to start..."
                : gameState.status === "GAME_OVER"
                  ? "Game has ended."
                  : "Choose your target secretly. Damage is dealt simultaneously."}
            </p>
          </div>
        </section>

        {/* Sidebar */}
        <aside className="lg:col-span-1 h-[600px] lg:h-auto">
          <GameLog logs={gameState.logs} />
        </aside>
      </main>
    </div>
  );
}
