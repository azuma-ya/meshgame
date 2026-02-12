import {
  BasicMembership,
  GameNode,
  HostlessLockstepOrdering,
  IndexedDbLogStore,
  SignaledMeshWebRtcTransport,
  WebSocketSignalingClient,
} from "@nodegame/core";
import { useRef, useState } from "react";
import { secretTargetEngine } from "./engine";
import type { GameAction, GameState, PlayerView } from "./types";

export function useGameLogic() {
  const [selfId, setSelfId] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [gameState, setGameState] = useState<PlayerView>(
    secretTargetEngine.initialState,
  );

  const nodeRef = useRef<GameNode<GameState, GameAction, PlayerView>>(null);

  const connect = async (id: string, wsUrl: string) => {
    if (!id || !wsUrl) return;
    setSelfId(id);

    // 1. Setup Transport
    const signaling = new WebSocketSignalingClient(wsUrl);
    const transport = new SignaledMeshWebRtcTransport({ self: id }, signaling);

    // 2. Setup Membership
    const memberInfo = {
      peerId: id,
      role: "peer" as const,
      joinedAt: Date.now(),
    };
    const membership = new BasicMembership(memberInfo);

    const ordering = new HostlessLockstepOrdering(transport, membership, {
      t0Ms: 0,
      tickMs: 100,
      inputDelayTicks: 2,
      roomId: "secret-target-room",
    });

    // Use unique DB name per peer for local testing isolation
    // const log = new IndexedDbLogStore({ dbName: `nodegame-log-${id}` });

    // 4. Setup GameNode
    const node = new GameNode(
      {
        ordering,
        playerId: id,
      },
      secretTargetEngine,
    );
    nodeRef.current = node;

    // 5. Hook into state updates
    node.subscribe((view) => {
      setGameState(view);
      console.log("[GameLog] State updated:", view);
    });

    // 6. Handle peer discovery
    node.onPeerEvent((ev) => {
      if (ev.type === "peer_connected") {
        console.log(`[GameLog] Peer connected: ${ev.peerId}, re-joining...`);
        node.submit({ type: "JOIN", playerId: id });
      }
    });

    await node.start();
    setIsConnected(true);

    // Initial JOIN action
    node.submit({ type: "JOIN", playerId: id });
  };

  const sendAction = (action: GameAction) => {
    if (!nodeRef.current) return;
    nodeRef.current.submit(action);
  };

  return {
    selfId,
    gameState,
    isConnected,
    peers: Object.keys(gameState?.players ?? {}),
    connect,
    sendAction,
  };
}
