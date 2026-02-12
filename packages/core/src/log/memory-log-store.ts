import type { ActionCommit, ActionLog } from "./types.js";

export class MemoryLogStore implements ActionLog {
  private commits: ActionCommit[] = [];

  async append(commit: ActionCommit): Promise<void> {
    const expectedHeight = this.latestHeight() + 1;
    if (commit.height !== expectedHeight) {
      throw new Error(
        `MemoryLogStore: Height mismatch. Expected ${expectedHeight}, got ${commit.height}`,
      );
    }
    this.commits.push(commit);
  }

  async getRange(
    fromHeight: number,
    toHeight: number,
  ): Promise<ActionCommit[]> {
    const startIndex = Math.max(0, fromHeight - 1);
    const endIndex = Math.min(this.commits.length, toHeight);

    if (startIndex >= this.commits.length) {
      return [];
    }
    return this.commits.slice(startIndex, endIndex);
  }

  latestHeight(): number {
    return this.commits.length;
  }
}
