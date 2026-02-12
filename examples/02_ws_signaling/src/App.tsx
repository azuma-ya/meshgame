import {
  type PeerEvent,
  SignaledMeshWebRtcTransport,
  type TransportMessage,
  WebSocketSignalingClient,
} from "@nodegame/core";
import { type ClassValue, clsx } from "clsx";
import {
  MessageSquare,
  Network,
  Radio,
  Send,
  Server,
  ShieldCheck,
  Terminal,
  User,
  Users,
  Wifi,
  Zap,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

/** Utility for Tailwind class merging */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ChatMessage {
  id: string;
  from: string;
  text: string;
  timestamp: number;
}

const DEFAULT_WS_URL = "ws://localhost:8080";

export default function App() {
  const [selfId, setSelfId] = useState("");
  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL);
  const [isStarted, setIsStarted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [peers, setPeers] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const [connectStatus, setConnectStatus] = useState("");

  const transportRef = useRef<SignaledMeshWebRtcTransport | null>(null);

  // ---- Logic ----

  const log = useCallback((type: "info" | "error" | "sig", text: string) => {
    console.log(`[${type}] ${text}`);
  }, []);

  const handleStart = async () => {
    if (!selfId.trim() || !wsUrl.trim()) return;

    setIsConnecting(true);
    try {
      const signaling = new WebSocketSignalingClient(wsUrl);
      const t = new SignaledMeshWebRtcTransport({ self: selfId }, signaling);
      transportRef.current = t;

      t.onPeerEvent((ev: PeerEvent) => {
        log("info", `Peer event: ${ev.type} - ${ev.peerId}`);
        setPeers(t.connectedPeers);
      });

      t.onMessage((from: string, msg: TransportMessage) => {
        const text = new TextDecoder().decode(msg.payload);
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substring(7),
            from,
            text,
            timestamp: Date.now(),
          },
        ]);
      });

      await t.start();
      setIsStarted(true);
      log("info", `Started as ${selfId}, signaling via ${wsUrl}`);
    } catch (err) {
      log("error", `Failed to start: ${err}`);
      setConnectStatus(`Failed to connect: ${err}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleBroadcast = async () => {
    if (!transportRef.current || !msgInput.trim()) return;
    try {
      const msg: TransportMessage = {
        topic: "chat",
        payload: new TextEncoder().encode(msgInput),
      };
      await transportRef.current.broadcast(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substring(7),
          from: "me",
          text: msgInput,
          timestamp: Date.now(),
        },
      ]);
      setMsgInput("");
    } catch (err) {
      log("error", `Failed to broadcast: ${err}`);
    }
  };

  // ---- Components ----

  if (!isStarted) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 bg-card p-6 rounded-lg border border-border shadow-sm">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 bg-primary/10 rounded-full mb-2">
              <Server className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">NodeGame</h1>
            <p className="text-sm text-muted-foreground">
              WebSocket Signaling + P2P Transport
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="wsUrl"
                className="text-sm font-medium leading-none"
              >
                Signaling Server URL
              </label>
              <div className="relative">
                <Wifi className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  id="wsUrl"
                  type="text"
                  value={wsUrl}
                  onChange={(e) => setWsUrl(e.target.value)}
                  placeholder="ws://localhost:8080"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="selfId"
                className="text-sm font-medium leading-none"
              >
                Your Peer ID
              </label>
              <input
                id="selfId"
                type="text"
                value={selfId}
                onChange={(e) => setSelfId(e.target.value)}
                placeholder="e.g. alice"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <button
              onClick={handleStart}
              disabled={isConnecting || !selfId.trim() || !wsUrl.trim()}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 w-full"
            >
              {isConnecting ? "Connecting..." : "Connect to Signaling Server"}
            </button>
            {connectStatus && (
              <p className="text-xs text-destructive text-center">
                {connectStatus}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 flex flex-col gap-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between pb-6 border-b">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-md">
            <Terminal className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-none">
              Signaling Console
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Node: <span className="font-mono text-primary">{selfId}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 bg-muted text-muted-foreground text-[10px] font-medium rounded-full border">
            <Radio className="w-3 h-3" />
            {wsUrl}
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-secondary text-secondary-foreground text-xs font-medium rounded-full border">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Live
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Peer Management */}
        <section className="lg:col-span-1 space-y-6">
          {/* Auto Mesh Status */}
          <div className="bg-card rounded-lg border shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <Zap className="w-4 h-4" /> Auto Mesh
            </h2>
            <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50 border">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <p className="text-xs text-muted-foreground">
                Peers are discovered and connected automatically via the
                signaling server. No manual action required.
              </p>
            </div>
            {connectStatus && (
              <p className="text-[10px] text-destructive">{connectStatus}</p>
            )}
          </div>

          {/* Peer List */}
          <div className="bg-card rounded-lg border shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <Users className="w-4 h-4" /> Connected Peers
            </h2>
            {peers.length === 0 ? (
              <div className="text-center py-8 border border-dashed rounded-lg bg-muted/20">
                <p className="text-xs text-muted-foreground italic">
                  No peers connected
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {peers.map((id) => (
                  <div
                    key={id}
                    className="flex items-center justify-between p-2 rounded-md border bg-accent/30"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                        <User className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-sm font-medium">{id}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                        P2P
                      </span>
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                    </div>
                  </div>
                ))}
                {peers.length >= 2 && (
                  <div className="flex items-center gap-1.5 justify-center pt-2">
                    <Network className="w-3 h-3 text-primary" />
                    <span className="text-[10px] text-primary font-medium">
                      Full mesh established
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Chat Area */}
        <section className="lg:col-span-2 bg-card rounded-lg border shadow-sm flex flex-col h-150 overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">P2P Communications</h2>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">
              <ShieldCheck className="w-3 h-3 text-green-500" />
              End-to-End P2P
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth bg-background">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30">
                <div className="mb-4 p-4 bg-muted/50 rounded-full">
                  <MessageSquare className="w-10 h-10" />
                </div>
                <p className="text-sm font-medium">No messages yet</p>
                <p className="text-xs">Connect to a peer and start chatting</p>
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex flex-col gap-1.5 max-w-[85%]",
                  m.from === "me" ? "ml-auto items-end" : "mr-auto items-start",
                )}
              >
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] font-mono font-bold text-primary italic">
                    {m.from}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(m.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div
                  className={cn(
                    "px-4 py-2.5 rounded-lg text-sm shadow-sm",
                    m.from === "me"
                      ? "bg-primary text-primary-foreground rounded-tr-none"
                      : "bg-secondary text-secondary-foreground border rounded-tl-none",
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-muted/30 border-t">
            <div className="flex gap-2">
              <input
                type="text"
                value={msgInput}
                onChange={(e) => setMsgInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBroadcast()}
                disabled={peers.length === 0}
                placeholder={
                  peers.length === 0
                    ? "Connect to a peer to start chatting"
                    : "Type a message..."
                }
                className="flex-1 bg-background border border-input rounded-md px-3 py-1.5 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              />
              <button
                onClick={handleBroadcast}
                disabled={peers.length === 0 || !msgInput.trim()}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 w-9"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
