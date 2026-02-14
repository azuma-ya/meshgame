import {
  BasicMembership,
  FirebaseSignalingClient,
  GameNode,
  LockstepOrdering,
  MemoryLogStore,
  SignaledMeshWebRtcTransport,
  WebSocketSignalingClient,
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
  const [view, setView] = useState<PlayerView>(farmingEngine.initialState);

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
    const transport = new SignaledMeshWebRtcTransport({ self: id }, signaling);

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

    node.subscribe((v) => {
      setView(v);
    });

    node.onPeerEvent((ev) => {
      if (ev.type === "peer_connected") {
        // Re-announce JOIN so the new peer knows about us
        node.submit({
          type: "JOIN",
          playerId: id,
          name: id,
          color: userColorRef.current,
        });
        // } else if (ev.type === "peer_disconnected") {
        //   node.submit({
        //     type: "LEAVE",
        //     playerId: ev.peerId,
        //   });
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
