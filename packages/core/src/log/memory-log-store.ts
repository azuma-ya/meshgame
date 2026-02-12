import type { ActionLog, Commit } from "./types.js";

export class MemoryLogStore implements ActionLog {
  private commits: Commit[] = [];

  async append(commit: Commit): Promise<void> {
    const expectedSeq = (await this.latestHeight()) + 1;
    if (commit.seq !== expectedSeq) {
      throw new Error(
        `MemoryLogStore: Sequence mismatch. Expected ${expectedSeq}, got ${commit.seq}`,
      );
    }
    this.commits.push(commit);
  }

  async getRange(fromHeight: number, toHeight: number): Promise<Commit[]> {
    const startIndex = Math.max(0, fromHeight - 1);
    const endIndex = Math.min(this.commits.length, toHeight);

    if (startIndex >= this.commits.length) {
      return [];
    }
    return this.commits.slice(startIndex, endIndex);
  }

  async latestHeight(): Promise<number> {
    return this.commits.length;
  }

  async clear(): Promise<void> {
    this.commits = [];
  }
}
