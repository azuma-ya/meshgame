import type { Membership, PeerInfo } from "./types.js";

export * from "./types.js";

/**
 * Basic in-memory membership management.
 */
export class BasicMembership implements Membership {
  readonly self: PeerInfo;
  private peers = new Map<string, PeerInfo>();

  constructor(self: PeerInfo) {
    this.self = self;
  }

  getPeer(peerId: string): PeerInfo | undefined {
    if (peerId === this.self.peerId) return this.self;
    return this.peers.get(peerId);
  }

  getPeers(): PeerInfo[] {
    return [this.self, ...this.peers.values()];
  }

  addPeer(peer: PeerInfo): void {
    if (peer.peerId === this.self.peerId) return;
    this.peers.set(peer.peerId, peer);
  }

  removePeer(peerId: string): void {
    this.peers.delete(peerId);
  }
}
