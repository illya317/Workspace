import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import {
  claimWecomNotificationDeliveries,
  ensureWecomNotificationEndpoint,
  NotificationDeliveryOutboxError,
  recordWecomNotificationDeliveryResult,
  recordWecomNotificationWorkerHeartbeat,
} from "./notification-delivery-outbox";
import { prisma, type Prisma } from "./prisma";
import {
  authenticateWecomNotificationWorkerRequest,
  WECOM_NOTIFICATION_ENDPOINT_KEY,
} from "./wecom-notification-worker-auth";

const WORKER_REQUEST_RETENTION_MS = 24 * 60 * 60 * 1_000;
const WORKER_BODY_MAX_BYTES = 16 * 1_024;
const workerIdSchema = z.string().trim().min(1).max(120);

const claimSchema = z.object({
  workerId: workerIdSchema,
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
}).strict();

const resultSchema = z.object({
  workerId: workerIdSchema,
  leaseToken: z.string().uuid(),
  attemptNo: z.coerce.number().int().positive(),
  outcome: z.enum(["delivered", "retryable_failure", "permanent_failure"]),
  providerMessageId: z.string().trim().max(256).nullable().optional(),
  errorCode: z.string().trim().max(120).nullable().optional(),
  errorSummary: z.string().trim().max(500).nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.outcome !== "delivered" && !value.errorCode) {
    context.addIssue({
      code: "custom",
      path: ["errorCode"],
      message: "失败结果必须提供 errorCode",
    });
  }
});

const heartbeatSchema = z.object({
  workerId: workerIdSchema,
  connected: z.boolean(),
  workerVersion: z.string().trim().max(120).nullable().optional(),
}).strict();

type WorkerOperation = "claim" | "result" | "heartbeat";
type WorkerResponse = { status: number; body: Record<string, unknown> };

export async function handleWecomNotificationClaimRequest(request: Request) {
  return handleWorkerRequest(request, "claim", claimSchema, async (tx, body) => ({
    status: 200,
    body: {
      endpointKey: WECOM_NOTIFICATION_ENDPOINT_KEY,
      deliveries: await claimWecomNotificationDeliveries(tx, { limit: body.limit }),
    },
  }));
}

export async function handleWecomNotificationDeliveryResultRequest(
  request: Request,
  deliveryIdValue: string,
) {
  return handleWorkerRequest(request, "result", resultSchema, async (tx, body) => {
    const deliveryId = Number(deliveryIdValue);
    if (!Number.isSafeInteger(deliveryId) || deliveryId <= 0) {
      return {
        status: 400,
        body: { error: "企业微信投递 ID 无效", code: "DELIVERY_ID_INVALID" },
      };
    }
    return {
      status: 200,
      body: await recordWecomNotificationDeliveryResult(tx, deliveryId, body),
    };
  }, deliveryIdValue);
}

export async function handleWecomNotificationHeartbeatRequest(request: Request) {
  return handleWorkerRequest(request, "heartbeat", heartbeatSchema, async (tx, body) => ({
    status: 200,
    body: await recordWecomNotificationWorkerHeartbeat(tx, body),
  }));
}

async function handleWorkerRequest<TBody>(
  request: Request,
  operation: WorkerOperation,
  schema: z.ZodType<TBody>,
  execute: (tx: Prisma.TransactionClient, body: TBody) => Promise<WorkerResponse>,
  operationTarget = "",
) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > WORKER_BODY_MAX_BYTES) {
    return jsonResponse({ error: "Worker 请求体过大", code: "WORKER_BODY_TOO_LARGE" }, 413);
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > WORKER_BODY_MAX_BYTES) {
    return jsonResponse({ error: "Worker 请求体过大", code: "WORKER_BODY_TOO_LARGE" }, 413);
  }
  const authentication = authenticateWecomNotificationWorkerRequest(request, rawBody);
  if (!authentication.ok) {
    return jsonResponse({ error: authentication.error }, authentication.status);
  }

  let decoded: unknown;
  try {
    decoded = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return jsonResponse({ error: "Invalid JSON body", code: "WORKER_BODY_INVALID" }, 400);
  }
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) {
    return jsonResponse({
      error: parsed.error.issues[0]?.message ?? "Worker 请求无效",
      code: "WORKER_BODY_INVALID",
    }, 400);
  }

  const operationKey = operationTarget ? `${operation}:${operationTarget}` : operation;
  const requestFingerprint = fingerprintWorkerRequest(operationKey, rawBody);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const endpoint = await ensureWecomNotificationEndpoint(tx);
      const replay = await tx.notificationDeliveryWorkerRequest.findUnique({
        where: {
          endpointId_requestId: {
            endpointId: endpoint.id,
            requestId: authentication.requestId,
          },
        },
      });
      if (replay) return replayResponse(replay, operationKey, requestFingerprint);

      let response: WorkerResponse;
      try {
        response = await execute(tx, parsed.data);
      } catch (error) {
        if (!(error instanceof NotificationDeliveryOutboxError)) throw error;
        response = {
          status: error.status,
          body: { error: error.message, code: error.code },
        };
      }
      await tx.notificationDeliveryWorkerRequest.create({
        data: {
          endpointId: endpoint.id,
          requestId: authentication.requestId,
          operation: operationKey,
          requestFingerprint,
          responseStatus: response.status,
          responseJson: JSON.stringify(response.body),
          expiresAt: new Date(Date.now() + WORKER_REQUEST_RETENTION_MS),
        },
      });
      return response;
    });
    return jsonResponse(result.body, result.status);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const replay = await loadConcurrentReplay(
        authentication.requestId,
        operationKey,
        requestFingerprint,
      );
      if (replay) return jsonResponse(replay.body, replay.status);
    }
    console.error("WeCom notification worker request failed", {
      operation: operationKey,
      requestId: authentication.requestId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return jsonResponse({ error: "企业微信通知 Worker 请求处理失败", code: "WORKER_REQUEST_FAILED" }, 500);
  }
}

async function loadConcurrentReplay(
  requestId: string,
  operation: string,
  requestFingerprint: string,
) {
  const endpoint = await prisma.notificationChannelEndpoint.findUnique({
    where: { key: WECOM_NOTIFICATION_ENDPOINT_KEY },
    select: { id: true },
  });
  if (!endpoint) return null;
  const replay = await prisma.notificationDeliveryWorkerRequest.findUnique({
    where: { endpointId_requestId: { endpointId: endpoint.id, requestId } },
  });
  return replay ? replayResponse(replay, operation, requestFingerprint) : null;
}

function replayResponse(
  replay: {
    operation: string;
    requestFingerprint: string;
    responseStatus: number;
    responseJson: string;
  },
  operation: string,
  requestFingerprint: string,
): WorkerResponse {
  if (replay.operation !== operation || replay.requestFingerprint !== requestFingerprint) {
    return {
      status: 409,
      body: {
        error: "Worker request id 已用于不同请求",
        code: "WORKER_REQUEST_REPLAY_CONFLICT",
      },
    };
  }
  try {
    const parsed = JSON.parse(replay.responseJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { status: replay.responseStatus, body: parsed as Record<string, unknown> }
      : invalidStoredReplay();
  } catch {
    return invalidStoredReplay();
  }
}

function invalidStoredReplay(): WorkerResponse {
  return {
    status: 500,
    body: {
      error: "Worker 幂等回执损坏",
      code: "WORKER_REPLAY_CORRUPT",
    },
  };
}

function fingerprintWorkerRequest(operation: string, rawBody: string) {
  return createHash("sha256").update(JSON.stringify({ operation, rawBody })).digest("hex");
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
}
