import { useGameLogic } from "../game/use-game-logic";
import { GameShell } from "../ui/game-shell";
import { Lobby } from "../ui/lobby";

export default function App() {
  const {
    selfId,
    view,
    isConnected,
    isPaused,
    setIsPaused,
    connect,
    sendAction,
  } = useGameLogic();

  const handleStart = (name: string, wsUrl: string, color: string) => {
    connect(name, wsUrl, color);
  };

  if (!isConnected) {
    return <Lobby onStart={handleStart} />;
  }

  return (
    <GameShell
      view={view}
      onAction={sendAction}
      onTogglePause={() => setIsPaused(!isPaused)}
      isPaused={isPaused}
      selfId={selfId}
    />
  );
}
