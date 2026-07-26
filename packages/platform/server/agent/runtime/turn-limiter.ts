export const MAX_CONCURRENT_AGENT_TURNS = 3;
export const MAX_QUEUED_AGENT_TURNS = 30;

type Waiter = {
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

function abortError() {
  return new DOMException("Agent turn aborted", "AbortError");
}

export class AgentTurnLimiter {
  private active = 0;
  private readonly waiting: Waiter[] = [];

  constructor(
    readonly maxConcurrent = MAX_CONCURRENT_AGENT_TURNS,
    readonly maxQueued = MAX_QUEUED_AGENT_TURNS,
  ) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new Error("Agent turn concurrency must be a positive integer");
    }
    if (!Number.isInteger(maxQueued) || maxQueued < 0) {
      throw new Error("Agent turn queue limit must be a non-negative integer");
    }
  }

  get activeCount() {
    return this.active;
  }

  get waitingCount() {
    return this.waiting.length;
  }

  async run<T>(signal: AbortSignal | undefined, task: () => Promise<T>): Promise<T> {
    const release = await this.acquire(signal);
    try {
      return await task();
    } finally {
      release();
    }
  }

  private acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(abortError());
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return Promise.resolve(this.createRelease());
    }
    if (this.waiting.length >= this.maxQueued) {
      return Promise.reject(new Error("Agent 请求队列已满，请稍后重试"));
    }

    return new Promise((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, signal };
      if (signal) {
        waiter.onAbort = () => {
          const index = this.waiting.indexOf(waiter);
          if (index >= 0) this.waiting.splice(index, 1);
          reject(abortError());
        };
        signal.addEventListener("abort", waiter.onAbort, { once: true });
      }
      this.waiting.push(waiter);
    });
  }

  private createRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.startNext();
    };
  }

  private startNext() {
    while (this.waiting.length > 0 && this.active < this.maxConcurrent) {
      const waiter = this.waiting.shift();
      if (!waiter) return;
      if (waiter.onAbort) waiter.signal?.removeEventListener("abort", waiter.onAbort);
      if (waiter.signal?.aborted) {
        waiter.reject(abortError());
        continue;
      }
      this.active += 1;
      waiter.resolve(this.createRelease());
    }
  }
}

const runtimeGlobal = globalThis as typeof globalThis & {
  __workspaceAgentTurnLimiterV1?: AgentTurnLimiter;
};
const globalTurnLimiter = runtimeGlobal.__workspaceAgentTurnLimiterV1 ?? new AgentTurnLimiter();
runtimeGlobal.__workspaceAgentTurnLimiterV1 = globalTurnLimiter;

export function runWithAgentTurnLimit<T>(signal: AbortSignal | undefined, task: () => Promise<T>) {
  return globalTurnLimiter.run(signal, task);
}
