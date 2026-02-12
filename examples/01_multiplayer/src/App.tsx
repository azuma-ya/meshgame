import {
  ManualWebRtcTransport,
  type PeerEvent,
  type TransportMessage,
} from "@nodegame/core";
import { type ClassValue, clsx } from "clsx";
import {
  ChevronRight,
  Copy,
  MessageSquare,
  Plus,
  Radio,
  Send,
  ShieldCheck,
  Terminal,
  User,
  Users,
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

export default function App() {
  const [selfId, setSelfId] = useState("");
  const [isStarted, setIsStarted] = useState(false);
  const [peers, setPeers] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgInput, setMsgInput] = useState("");

  // Offer Flow State
  const [offerPeerId, setOfferPeerId] = useState("");
  const [generatedOffer, setGeneratedOffer] = useState("");
  const [answerInput, setAnswerInput] = useState("");

  // Answer Flow State
  const [acceptPeerId, setAcceptPeerId] = useState("");
  const [offerInput, setOfferInput] = useState("");
  const [generatedAnswer, setGeneratedAnswer] = useState("");

  const transportRef = useRef<ManualWebRtcTransport | null>(null);

  // ---- Logic ----

  const log = useCallback((type: "info" | "error" | "sig", text: string) => {
    console.log(`[${type}] ${text}`);
    // In a real app we might show this in UI, but for now console is fine
  }, []);

  const handleStart = async () => {
    if (!selfId.trim()) return;

    const t = new ManualWebRtcTransport({ self: selfId });
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
    log("info", `Started as ${selfId}`);
  };

  const handleCreateOffer = async () => {
    if (!transportRef.current || !offerPeerId.trim()) return;
    try {
      log("sig", `Creating offer for ${offerPeerId}`);
      const offer = await transportRef.current.createOfferSdp(offerPeerId);
      setGeneratedOffer(offer);
    } catch (err) {
      log("error", `Failed to create offer: ${err}`);
    }
  };

  const handleAcceptAnswer = async () => {
    if (!transportRef.current || !offerPeerId.trim() || !answerInput.trim())
      return;
    try {
      log("sig", `Accepting answer from ${offerPeerId}`);
      await transportRef.current.acceptAnswerSdp(offerPeerId, answerInput);
      setGeneratedOffer("");
      setAnswerInput("");
      setOfferPeerId("");
    } catch (err) {
      log("error", `Failed to accept answer: ${err}`);
    }
  };

  const handleAcceptOffer = async () => {
    if (!transportRef.current || !acceptPeerId.trim() || !offerInput.trim())
      return;
    try {
      log("sig", `Accepting offer from ${acceptPeerId}`);
      const answer = await transportRef.current.acceptOfferAndCreateAnswerSdp(
        acceptPeerId,
        offerInput,
      );
      setGeneratedAnswer(answer);
    } catch (err) {
      log("error", `Failed to accept offer: ${err}`);
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    log("info", "Copied to clipboard");
  };

  // ---- Components ----

  if (!isStarted) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 bg-card p-6 rounded-lg border border-border shadow-sm">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 bg-primary/10 rounded-full mb-2">
              <Radio className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">NodeGame</h1>
            <p className="text-sm text-muted-foreground">
              Initialize your mesh identity
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="selfId"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Your Peer ID
              </label>
              <input
                id="selfId"
                type="text"
                value={selfId}
                onChange={(e) => setSelfId(e.target.value)}
                placeholder="e.g. alice"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <button
              onClick={handleStart}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 w-full"
            >
              Start Mesh
            </button>
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
            <h1 className="text-lg font-semibold leading-none">Mesh Console</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Node: <span className="font-mono text-primary">{selfId}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-secondary text-secondary-foreground text-xs font-medium rounded-full border">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Live
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Peer Management */}
        <section className="lg:col-span-1 space-y-6">
          <div className="bg-card rounded-lg border shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <Plus className="w-4 h-4" /> Connection
            </h2>

            {/* Create Offer Flow */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 text-xs font-medium bg-muted/50 p-2 rounded-md">
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                Outgoing Connection
              </div>
              <input
                type="text"
                placeholder="Target Peer ID"
                value={offerPeerId}
                onChange={(e) => setOfferPeerId(e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {!generatedOffer && (
                <button
                  onClick={handleCreateOffer}
                  className="inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3 w-full"
                >
                  Generate Offer
                </button>
              )}

              {generatedOffer && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="relative">
                    <textarea
                      readOnly
                      value={generatedOffer}
                      className="w-full bg-muted border rounded-md p-2 text-[10px] font-mono h-20 text-muted-foreground resize-none focus:outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(generatedOffer)}
                      className="absolute top-2 right-2 p-1 bg-background border rounded-sm hover:bg-accent transition-colors"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Paste Answer SDP"
                    value={answerInput}
                    onChange={(e) => setAnswerInput(e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm"
                  />
                  <button
                    onClick={handleAcceptAnswer}
                    className="inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors bg-primary text-primary-foreground shadow hover:bg-primary/90 h-8 px-3 w-full"
                  >
                    Accept Answer
                  </button>
                </div>
              )}
            </div>

            <div className="h-px bg-border my-4" />

            {/* Accept Offer Flow */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-medium bg-muted/50 p-2 rounded-md">
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                Incoming Connection
              </div>
              <input
                type="text"
                placeholder="Remote Peer ID"
                value={acceptPeerId}
                onChange={(e) => setAcceptPeerId(e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm"
              />
              <textarea
                placeholder="Paste Offer SDP"
                value={offerInput}
                onChange={(e) => setOfferInput(e.target.value)}
                className="w-full bg-muted border rounded-md p-2 text-[10px] font-mono h-20 text-muted-foreground resize-none focus:outline-none"
              />
              <button
                onClick={handleAcceptOffer}
                className="inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3 w-full"
              >
                Accept Offer & Reply
              </button>

              {generatedAnswer && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="relative">
                    <textarea
                      readOnly
                      value={generatedAnswer}
                      className="w-full bg-muted border rounded-md p-2 text-[10px] font-mono h-20 text-muted-foreground resize-none focus:outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(generatedAnswer)}
                      className="absolute top-2 right-2 p-1 bg-background border rounded-sm hover:bg-accent"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center italic">
                    Copy and send this answer back to {acceptPeerId}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Peer List */}
          <div className="bg-card rounded-lg border shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <Users className="w-4 h-4" /> Network
            </h2>
            {peers.length === 0 ? (
              <div className="text-center py-8 border border-dashed rounded-lg bg-muted/20">
                <p className="text-xs text-muted-foreground italic">
                  Disconnected from mesh
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
                        Active
                      </span>
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
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
              <h2 className="text-sm font-semibold">Mesh Communications</h2>
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
                <p className="text-sm font-medium">
                  No encrypted traffic detected
                </p>
                <p className="text-xs">Send a message to start the exchange</p>
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
                    ? "Establish connection to broadcast"
                    : "Type a secure message..."
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
