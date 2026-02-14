import type { Meta } from "./types";

export type Schedule<S> =
  | {
      kind: "every";
      everyTicks: number;
      startTick?: number;
      once?: false;
      except?: (s: S, m: Meta) => boolean;
    }
  | { kind: "once"; atTick: number; except?: (s: S, m: Meta) => boolean }
  | { kind: "manual"; shouldRun: (s: S, m: Meta) => boolean };

/**
 * Scheduler は tickLoop
 */
export interface Scheduler<S> {
  id: string;

  /**
   * Describe when this scheduler should run.
   * (You already have isDue(schedule, state, meta) so keep it.)
   */
  schedule: (state: S) => Schedule<S> | null;

  /**
   * Apply deterministic state transition when due.
   * Return null if no change.
   */
  apply: (state: S, meta: Meta) => S | null;
}

export function isDue<S>(schedule: Schedule<S>, state: S, meta: Meta): boolean {
  const except = "except" in schedule ? schedule.except : undefined;
  if (except?.(state, meta)) return false;

  switch (schedule.kind) {
    case "every": {
      const start = schedule.startTick ?? 0;
      if (meta.orderingTick < start) return false;
      const dt = meta.orderingTick - start;
      return dt % schedule.everyTicks === 0;
    }
    case "once":
      return meta.orderingTick === schedule.atTick;
    case "manual":
      return schedule.shouldRun(state, meta);
  }
}
