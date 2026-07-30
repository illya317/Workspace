import { z } from "zod";

const workerIdSchema = z.string().trim().min(1).max(120);

export const notificationDeliveryWorkerClaimSchema = z.object({
  workerId: workerIdSchema,
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
}).strict();

export const notificationDeliveryWorkerResultSchema = z.object({
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

export const notificationDeliveryWorkerHeartbeatSchema = z.object({
  workerId: workerIdSchema,
  connected: z.boolean(),
  workerVersion: z.string().trim().max(120).nullable().optional(),
}).strict();
