import type { ActionLog, Commit } from "./types.js";

/**
 * Persistent Log Store using IndexedDB.
 */
export class IndexedDbLogStore implements ActionLog {
  private db: IDBDatabase | null = null;
  private readonly dbName: string;
  private readonly storeName = "commits";

  constructor(options: { dbName?: string } = {}) {
    this.dbName = options.dbName ?? "nodegame-log";
  }

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "seq" });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  async append(commit: Commit): Promise<void> {
    await this.init();
    if (!this.db) throw new Error("DB not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);

      // Check height before insertion?
      // MemoryLogStore does height mismatch check.
      // For persistent IDB, we might want to allow resuming, but let's keep it simple.

      const request = store.put(commit);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getRange(fromHeight: number, toHeight: number): Promise<Commit[]> {
    await this.init();
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, "readonly");
      const store = transaction.objectStore(this.storeName);
      const range = IDBKeyRange.bound(fromHeight, toHeight);
      const request = store.getAll(range);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async latestHeight(): Promise<number> {
    await this.init();
    if (!this.db) return 0;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.openCursor(null, "prev");

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          resolve(cursor.key as number);
        } else {
          resolve(0);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}
