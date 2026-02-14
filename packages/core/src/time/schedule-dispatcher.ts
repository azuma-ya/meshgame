// packages/core/src/time/schedule-dispatcher.ts

export type ScheduledJob<S> = {
  id: string;
  atOrderingTick: number;
  /** state を更新したいならここで更新（純粋関数推奨） */
  run: (state: S, ctx: { orderingTick: number }) => S;
};

export class ScheduleDispatcher<S> {
  private readonly jobsByTick = new Map<number, ScheduledJob<S>[]>();
  private lastExecutedTick = -1;

  /**
   * orderingTick 時点で実行する job を登録
   * 同じ tick に複数登録可
   */
  schedule(job: ScheduledJob<S>): void {
    const arr = this.jobsByTick.get(job.atOrderingTick) ?? [];
    arr.push(job);
    this.jobsByTick.set(job.atOrderingTick, arr);
  }

  /**
   * commit が進んだタイミング（onCommit）で呼ぶ
   * - lastExecutedTick+1..committedTick を順に実行
   */
  onCommittedTick(state: S, committedTick: number): S {
    let s = state;

    for (let t = this.lastExecutedTick + 1; t <= committedTick; t++) {
      const jobs = this.jobsByTick.get(t);
      if (jobs && jobs.length > 0) {
        // id で安定化したい場合はここで sort してもOK（決定的に）
        jobs.sort((a, b) => a.id.localeCompare(b.id));
        for (const job of jobs) {
          s = job.run(s, { orderingTick: t });
        }
        this.jobsByTick.delete(t);
      }
      this.lastExecutedTick = t;
    }

    return s;
  }
}
