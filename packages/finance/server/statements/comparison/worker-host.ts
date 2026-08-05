import { Worker } from "node:worker_threads";

import { INGEST_WORKER_SOURCE, INGEST_WORKER_SOURCE_MARKER } from "./ingest-worker-source";
import {
  defaultWorkbookIngestLimits,
  type WorkbookIngestLimits,
} from "./limits";
import {
  validateParsedWorkbookPayload,
  WorkbookDtoValidationError,
  type ParsedWorkbookPayload,
} from "./workbook-dto";

/**
 * 隔离解析宿主（计划 §5.2「Parser execution：隔离 worker + wall-time/heap 上限」）。
 *
 * - 解析在独立 node worker_threads 中执行，带 resourceLimits（heap）与 wall-time 上限。
 * - worker 崩溃 / 超时 / 退出码非零 / 返回形状不合法 → 一律 fail closed。
 * - 绝不回退到请求线程解析不可信文件：worker 不可用时返回 worker_unavailable，
 *   调用方必须拒绝上传，功能开关保持 fail-closed。
 */

export type WorkbookWorkerFailureCode =
  | "worker_timeout"
  | "worker_crash"
  | "worker_unavailable"
  | "worker_result_invalid"
  // 以下由 worker 内部 fail-closed 透传
  | "parser_unavailable"
  | "parse_failed"
  | "external_links"
  | "too_many_sheets"
  | "too_many_cells"
  | "too_many_formulas"
  | "formula_too_long"
  | "external_reference_formula";

export type WorkbookWorkerOutcome =
  | { ok: true; result: ParsedWorkbookPayload }
  | { ok: false; failureCode: WorkbookWorkerFailureCode; message: string };

export interface ParseInWorkerOptions {
  bytes: Buffer;
  limits?: WorkbookIngestLimits;
  /** 测试注入：替换 worker 源码（挂起/崩溃/非法返回 fixture）。 */
  workerSource?: string;
  timeoutMs?: number;
  heapMb?: number;
}

function workerFailure(failureCode: WorkbookWorkerFailureCode, message: string): WorkbookWorkerOutcome {
  return { ok: false, failureCode, message };
}

/**
 * 在隔离 worker 中执行 SheetJS parse。
 * 传入字节必须先通过 preflightWorkbookUpload；本函数不再重复 archive 检查，
 * 但 worker 内部仍按 sheet/cell/formula 限额与网络/外部引用公式 fail closed。
 */
export async function parseWorkbookInWorker(options: ParseInWorkerOptions): Promise<WorkbookWorkerOutcome> {
  const limits = options.limits ?? defaultWorkbookIngestLimits();
  const timeoutMs = options.timeoutMs ?? limits.workerWallTimeMs;
  const heapMb = options.heapMb ?? limits.workerHeapMb;
  const source = options.workerSource ?? INGEST_WORKER_SOURCE;

  let worker: Worker;
  try {
    worker = new Worker(source, {
      eval: true,
      workerData: { buffer: options.bytes, limits },
      resourceLimits: {
        maxOldGenerationSizeMb: heapMb,
        maxYoungGenerationSizeMb: 64,
        stackSizeMb: 4,
      },
      // worker 只吃 workerData，不需要 stdout/stderr/env。
      stdout: false,
      stderr: false,
    });
  } catch (error) {
    return workerFailure(
      "worker_unavailable",
      `无法启动隔离解析 worker：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return new Promise<WorkbookWorkerOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: WorkbookWorkerOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(outcome);
    };

    const timer = setTimeout(() => {
      finish(workerFailure("worker_timeout", `解析超过 ${timeoutMs}ms wall-time 上限`));
    }, timeoutMs);
    // 超时是纯防御：wall-time 是宿主强制的，worker 无权延长。
    timer.unref?.();

    worker.once("message", (message: unknown) => {
      const record = message && typeof message === "object" ? (message as Record<string, unknown>) : null;
      if (!record || record.marker !== INGEST_WORKER_SOURCE_MARKER) {
        finish(workerFailure("worker_result_invalid", "worker 返回了无法识别的消息"));
        return;
      }
      if (record.ok !== true) {
        const failureCode = typeof record.failureCode === "string" ? record.failureCode : "parse_failed";
        const messageText = typeof record.message === "string" ? record.message : "worker 解析失败";
        finish(workerFailure(failureCode as WorkbookWorkerFailureCode, messageText));
        return;
      }
      try {
        finish({ ok: true, result: validateParsedWorkbookPayload(record.result) });
      } catch (error) {
        if (error instanceof WorkbookDtoValidationError) {
          finish(workerFailure("worker_result_invalid", `worker 返回形状不合法：${error.message}`));
          return;
        }
        finish(workerFailure("worker_result_invalid", "worker 返回无法校验"));
      }
    });
    worker.once("error", (error) => {
      finish(workerFailure("worker_crash", `隔离解析 worker 崩溃：${error.message}`));
    });
    worker.once("exit", (code) => {
      if (code !== 0) {
        finish(workerFailure("worker_crash", `隔离解析 worker 以退出码 ${code} 终止`));
      }
    });
  });
}
