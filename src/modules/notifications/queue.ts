/**
 * Minimal job-queue port (docs/architecture.md §10). The worker binds it to
 * pg-boss; tests use `InMemoryQueue`. Application code never imports pg-boss.
 */
export const JOBS = {
  dispatch: "notification.dispatch",
  sendEmail: "notification.sendEmail",
  reminderSend: "reminder.send",
  reminderSweep: "reminder.sweep",
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];

export type SendJobOptions = {
  /** Deliver no earlier than this instant. */
  startAfter?: Date;
  /** At most one queued/active job with this key (pg-boss singleton). */
  singletonKey?: string;
};

export interface JobQueue {
  send(
    name: JobName,
    data: Record<string, unknown>,
    options?: SendJobOptions,
  ): Promise<string | null>;
}

export type RecordedJob = {
  name: JobName;
  data: Record<string, unknown>;
  options?: SendJobOptions;
};

/** Records jobs instead of running them; tests drain it explicitly. */
export class InMemoryQueue implements JobQueue {
  readonly jobs: RecordedJob[] = [];
  private seq = 0;

  async send(
    name: JobName,
    data: Record<string, unknown>,
    options?: SendJobOptions,
  ): Promise<string | null> {
    if (
      options?.singletonKey &&
      this.jobs.some((j) => j.name === name && j.options?.singletonKey === options.singletonKey)
    ) {
      return null;
    }
    this.jobs.push({ name, data, options });
    this.seq += 1;
    return `mem-${this.seq}`;
  }

  take(name: JobName): RecordedJob[] {
    const out = this.jobs.filter((j) => j.name === name);
    for (const job of out) this.jobs.splice(this.jobs.indexOf(job), 1);
    return out;
  }

  reset(): void {
    this.jobs.length = 0;
  }
}
