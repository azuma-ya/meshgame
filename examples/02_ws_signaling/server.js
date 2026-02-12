/**
 * Minimal WebSocket signaling server for WebRTC peer discovery.
 *
 * Protocol:
 *   1. Client sends: { type: "register", peerId: string }
 *   2. Client sends: { type: "offer"|"answer", from, to, payload }
 *   3. Server relays signaling messages to the peer identified by `msg.to`.
 *   4. Server broadcasts { type: "peer_list", peers: string[] } to all
 *      connected clients whenever a peer registers or disconnects.
 *
 * Start:  node server.js
 */

import { WebSocketServer } from "ws";

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

/** @type {Map<string, import("ws").WebSocket>} */
const peers = new Map();

/** Broadcast the current peer list to all registered clients. */
function broadcastPeerList() {
  const msg = JSON.stringify({
    type: "peer_list",
    peers: Array.from(peers.keys()),
  });

  for (const ws of peers.values()) {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(msg);
    }
  }
}

wss.on("connection", (ws) => {
  let registeredId = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.type === "register" && typeof msg.peerId === "string") {
      registeredId = msg.peerId;
      peers.set(registeredId, ws);
      console.log(`[server] Registered: ${registeredId}  (total: ${peers.size})`);
      broadcastPeerList();
      return;
    }

    // Relay signaling messages (offer / answer)
    if (msg.to && peers.has(msg.to)) {
      const target = peers.get(msg.to);
      if (target && target.readyState === 1 /* OPEN */) {
        target.send(JSON.stringify(msg));
        console.log(`[server] Relayed ${msg.type} ${msg.from} → ${msg.to}`);
      }
    }
  });

  ws.on("close", () => {
    if (registeredId) {
      peers.delete(registeredId);
      console.log(`[server] Disconnected: ${registeredId}  (total: ${peers.size})`);
      broadcastPeerList();
    }
  });
});

console.log(`[signaling-server] Listening on ws://localhost:${PORT}`);
