import {
  BasicMembership,
  FirebaseSignalingClient,
  GameNode,
  LockstepOrdering,
  MemoryLogStore,
  type PeerEvent,
  SignaledMeshWebRtcTransport,
} from "@nodegame/core";
import {
  onChildAdded,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  set,
} from "firebase/database";
import { useCallback, useRef, useState } from "react";
import { db } from "../lib/firebase";
import { farmingEngine } from "./engine";
import type { GameAction, GameState, PlayerView } from "./types";
import { ORDERING_TICK_MS, TICK_MS } from "./types";

// Stable t0 for all peers to harmonize on
const GAME_T0 = 1739372400000; // 2025-02-12T15:00:00Z (approx)
// const GAME_T0 = Date.now();

export function useGameLogic() {
  const [selfId, setSelfId] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [view, setView] = useState<PlayerView>(
    farmingEngine.initialState as PlayerView,
  );

  const nodeRef = useRef<GameNode<GameState, GameAction, PlayerView>>(null);
  const userColorRef = useRef("");

  const connect = async (id: string, color: string) => {
    if (!id) return;
    setSelfId(id);
    userColorRef.current = color;

    // const signaling = new WebSocketSignalingClient(wsUrl);
    const signaling = new FirebaseSignalingClient(
      { db, ref, set, push, remove, onValue, onChildAdded, onDisconnect },
      "farming-game-room-v2",
    );
    const transport = new SignaledMeshWebRtcTransport(
      {
        self: id,
        // iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      },
      signaling,
    );

    const memberInfo = {
      peerId: id,
      role: "peer" as const,
      joinedAt: Date.now(),
    };
    const membership = new BasicMembership(memberInfo);

    const ordering = new LockstepOrdering(transport, membership, {
      t0Ms: GAME_T0,
      tickMs: ORDERING_TICK_MS,
      inputDelayTicks: 2, // Standard delay
      roomId: "farming-game-room-v2",
    });

    // const log = new IndexedDbLogStore({ dbName: `farming-game-log-${id}` });
    const log = new MemoryLogStore();

    const node = new GameNode(
      {
        ordering,
        playerId: id,
        log,
        tickIntervalMs: TICK_MS,
        orderingTickMs: ORDERING_TICK_MS,
        t0Ms: GAME_T0,
      },
      farmingEngine,
    );
    nodeRef.current = node;

    node.subscribe((v: PlayerView) => {
      setView(v);
    });

    node.onPeerEvent((ev: PeerEvent) => {
      if (ev.type === "peer_connected") {
        console.log(
          `[game] Peer connected: ${ev.peerId}. Scheduling JOIN re-announcement...`,
        );
        // Wait 1 second for clock sync to finish and connection stability before announcing
        setTimeout(() => {
          if (!nodeRef.current) return;
          console.log(`[game] Re-announcing JOIN for ${id}`);
          nodeRef.current.submit({
            type: "JOIN",
            playerId: id,
            name: id,
            color: userColorRef.current,
          });
        }, 1000);
      }
    });

    await node.start();

    setIsConnected(true);

    // Initial JOIN - only if not already started
    node.submit({ type: "JOIN", playerId: id, name: id, color });
  };

  const sendAction = useCallback((action: GameAction) => {
    if (!nodeRef.current) return;
    nodeRef.current.submit(action);
  }, []);

  return {
    selfId,
    view,
    isConnected,
    isPaused,
    setIsPaused,
    connect,
    sendAction,
  };
}
