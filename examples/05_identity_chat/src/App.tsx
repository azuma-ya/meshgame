import {
  generateKeyPair,
  type KeyPair,
  type PeerEvent,
  SignaledMeshWebRtcTransport,
  SignedTransport,
  type TransportMessage,
  WebSocketSignalingClient,
} from "@nodegame/core";
import { type ClassValue, clsx } from "clsx";
import {
  Fingerprint,
  Lock,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  User,
  Users,
  Wifi,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  verified: boolean;
}

const DEFAULT_WS_URL = "ws://localhost:8080";

export default function App() {
  const [identity, setIdentity] = useState<KeyPair | null>(null);
  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL);
  const [isStarted, setIsStarted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [peers, setPeers] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const [connectStatus, setConnectStatus] = useState("");

  const transportRef = useRef<SignedTransport | null>(null);

  // ---- Logic ----

  useEffect(() => {
    // Generate initial identity
    generateKeyPair().then(setIdentity);
  }, []);

  const regenerateIdentity = async () => {
    const kp = await generateKeyPair();
    setIdentity(kp);
  };

  const log = useCallback((type: "info" | "error" | "sig", text: string) => {
    console.log(`[${type}] ${text}`);
  }, []);

  const handleStart = async () => {
    if (!identity || !wsUrl.trim()) return;

    setIsConnecting(true);
    try {
      const signaling = new WebSocketSignalingClient(wsUrl);

      // 1. Create inner transport with Public Key as ID
      const inner = new SignaledMeshWebRtcTransport(
        { self: identity.publicKeyHex },
        signaling,
      );

      // 2. Wrap with SignedTransport
      const t = new SignedTransport(inner, identity);
      transportRef.current = t;

      t.onPeerEvent((ev: PeerEvent) => {
        log("info", `Peer event: ${ev.type} - ${ev.peerId}`);
        // SignedTransport doesn't change peer events, but the IDs are public keys
        setPeers(inner.connectedPeers);
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
            verified: true, // If it arrived here, it's verified by SignedTransport
          },
        ]);
      });

      t.onVerificationFailure((from, _envelope, reason) => {
        console.warn(`[Security] Verification failed from ${from}: ${reason}`);
        log("error", `Security alert: Invalid signature from ${from}`);
      });

      await t.start();
      setIsStarted(true);
      log(
        "info",
        `Started as ${identity.publicKeyHex.substring(0, 8)}..., signaling via ${wsUrl}`,
      );
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
          verified: true,
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
              <Fingerprint className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Identity Chat
            </h1>
            <p className="text-sm text-muted-foreground">
              Secure P2P Chat with ECDSA Signatures
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">
                Your Identity (Public Key)
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    readOnly
                    value={identity ? identity.publicKeyHex : "Generating..."}
                    className="flex h-9 w-full rounded-md border border-input bg-muted/50 pl-9 pr-3 py-1 text-xs font-mono shadow-sm"
                  />
                </div>
                <button
                  onClick={regenerateIdentity}
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 w-9"
                  title="Regenerate Identity"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                This key cryptographically proves your messages are yours.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">
                Signaling Server URL
              </label>
              <div className="relative">
                <Wifi className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={wsUrl}
                  onChange={(e) => setWsUrl(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm shadow-sm"
                />
              </div>
            </div>

            <button
              onClick={handleStart}
              disabled={isConnecting || !identity}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 w-full transition-colors disabled:opacity-50"
            >
              {isConnecting ? "Connecting..." : "Connect & Verify"}
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
            <Fingerprint className="w-5 h-5 text-primary" />
          </div>
          <div className="overflow-hidden">
            <h1 className="text-lg font-semibold leading-none">
              Identity Chat
            </h1>
            <p
              className="text-xs text-muted-foreground mt-1 font-mono truncate max-w-[200px] md:max-w-md"
              title={identity?.publicKeyHex}
            >
              ID: <span className="text-primary">{identity?.publicKeyHex}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 bg-secondary text-secondary-foreground text-xs font-medium rounded-full border">
            <ShieldCheck className="w-3 h-3 text-green-600" />
            Verified
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Peer Management */}
        <section className="lg:col-span-1 space-y-6">
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
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                        <User className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-xs font-mono truncate" title={id}>
                        {id}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <ShieldCheck className="w-3 h-3 text-green-500" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Chat Area */}
        <section className="lg:col-span-2 bg-card rounded-lg border shadow-sm flex flex-col h-[600px] overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Verified Messages</h2>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">
              <Lock className="w-3 h-3 text-primary" />
              End-to-End Signed
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth bg-background">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30">
                <div className="mb-4 p-4 bg-muted/50 rounded-full">
                  <Fingerprint className="w-10 h-10" />
                </div>
                <p className="text-sm font-medium">Secure Chat Ready</p>
                <p className="text-xs">
                  All messages are cryptographically signed
                </p>
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
                  <span
                    className="text-[10px] font-mono text-muted-foreground truncate max-w-[150px]"
                    title={m.from}
                  >
                    {m.from === "me" ? "Me" : m.from.substring(0, 8) + "..."}
                  </span>
                  {m.verified && (
                    <ShieldCheck className="w-3 h-3 text-green-500" />
                  )}
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
              <div className="relative flex-1">
                <input
                  type="text"
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleBroadcast()}
                  disabled={peers.length === 0}
                  placeholder={
                    peers.length === 0
                      ? "Waiting for peers..."
                      : "Type a secure message..."
                  }
                  className="w-full bg-background border border-input rounded-md px-3 py-1.5 pl-9 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                />
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
              </div>

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
