import { ScrollText } from "lucide-react";
import { useEffect, useRef } from "react";
import type { GameLog as LogType } from "../types";

interface GameLogProps {
  logs: LogType[];
}

export function GameLog({ logs }: GameLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full bg-muted/50 rounded-xl border overflow-hidden">
      <div className="p-3 border-b bg-muted/30 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <ScrollText size={16} />
        Battle Log
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {logs.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm italic py-8">
            Game has not started yet...
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="text-sm">
              <span className="text-xs text-muted-foreground opacity-70 mr-2">
                Turn {log.turn}
              </span>
              <span>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
