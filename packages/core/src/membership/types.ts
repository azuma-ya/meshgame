/**
 * Membership Layer Types
 */

export type NodeRole = "peer" | "observer";

export interface PeerInfo {
  peerId: string;
  role: NodeRole;
  joinedAt: number;
  meta?: Record<string, unknown>;
}

export interface Membership {
  readonly self: PeerInfo;

  getPeer(peerId: string): PeerInfo | undefined;
  getPeers(): PeerInfo[];
  addPeer(peer: PeerInfo): void;
  removePeer(peerId: string): void;
}
