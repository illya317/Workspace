const HEARTBEAT_INTERVAL_MS = 15_000;

export type AgentStreamEvent<T> =
  | { event: "status"; message: string }
  | { event: "delta"; delta: string }
  | { event: "heartbeat" }
  | { event: "result"; data: T }
  | { event: "error"; message: string };

type AgentStreamExecutor<T> = (input: {
  emitDelta: (delta: string) => void;
  signal: AbortSignal;
}) => Promise<T>;

export function createAgentStreamResponse<T>(
  requestSignal: AbortSignal,
  execute: AgentStreamExecutor<T>,
) {
  const encoder = new TextEncoder();
  const turnController = new AbortController();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const abort = () => turnController.abort();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (event: AgentStreamEvent<T>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
          turnController.abort();
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        requestSignal.removeEventListener("abort", abort);
        try {
          controller.close();
        } catch {
          // The client already cancelled the stream.
        }
      };
      requestSignal.addEventListener("abort", abort, { once: true });
      if (requestSignal.aborted) abort();
      enqueue({ event: "status", message: "正在处理…" });
      heartbeat = setInterval(() => enqueue({ event: "heartbeat" }), HEARTBEAT_INTERVAL_MS);

      void execute({
        emitDelta: (delta) => enqueue({ event: "delta", delta }),
        signal: turnController.signal,
      }).then(
        (data) => enqueue({ event: "result", data }),
        (error) => enqueue({
          event: "error",
          message: error instanceof Error ? error.message : "智能体处理失败",
        }),
      ).finally(close);
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      requestSignal.removeEventListener("abort", abort);
      turnController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
