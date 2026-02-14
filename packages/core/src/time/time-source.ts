// packages/core/src/time/time-source.ts

export type TimeSource = {
  /** 合意済みの orderingTick（= committed tick） */
  getCommittedOrderingTick(): number;

  /** authoritative な gameTime（全員一致） */
  getAuthoritativeGameTimeMs(): number;

  /**
   * 見た目用の gameTime（滑らか表示用）
   * ※ゲーム結果の計算には使わない
   */
  getDisplayGameTimeMs(nowMs: number): number;
};

export function createTimeSource(cfg: {
  t0Ms: number;
  orderingTickMs: number;
  /** Ordering が保持する committed tick を参照するための getter */
  getCommittedOrderingTick: () => number;
  /**
   * Ordering tick の「開始時刻」を推定するための補助。
   * 使わないなら t0Ms + committedTick*orderingTickMs を使う。
   */
  getOrderingTickStartMs?: (orderingTick: number) => number;
}): TimeSource {
  const getTickStartMs =
    cfg.getOrderingTickStartMs ??
    ((t: number) => cfg.t0Ms + t * cfg.orderingTickMs);

  return {
    getCommittedOrderingTick: cfg.getCommittedOrderingTick,

    getAuthoritativeGameTimeMs(): number {
      const t = cfg.getCommittedOrderingTick();
      return t * cfg.orderingTickMs;
    },

    getDisplayGameTimeMs(nowMs: number): number {
      const committed = cfg.getCommittedOrderingTick();
      const tickStart = getTickStartMs(committed);
      const dt = nowMs - tickStart;

      // committed tick の範囲内でだけ前に進める（はみ出した分は次 commit まで止める）
      const clamped = Math.max(0, Math.min(cfg.orderingTickMs, dt));
      return committed * cfg.orderingTickMs + clamped;
    },
  };
}
