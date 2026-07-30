import "server-only";

import type { Prisma } from "./prisma";

export async function recordNotificationEndpointDeliveryHealth(
  client: Prisma.TransactionClient,
  input: {
    endpointId: number;
    delivered: boolean;
    retrying: boolean;
    errorCode: string | null;
    errorSummary: string | null;
    observedAt: Date;
  },
) {
  await client.notificationChannelEndpoint.updateMany({
    where: {
      id: input.endpointId,
      AND: [
        {
          OR: [
            { lastSuccessAt: null },
            { lastSuccessAt: { lte: input.observedAt } },
          ],
        },
        {
          OR: [
            { lastFailureAt: null },
            {
              lastFailureAt: input.delivered
                ? { lt: input.observedAt }
                : { lte: input.observedAt },
            },
          ],
        },
      ],
    },
    data: input.delivered
      ? {
          healthStatus: "healthy",
          lastSuccessAt: input.observedAt,
          lastErrorCode: null,
          lastErrorSummary: null,
        }
      : {
          healthStatus: input.retrying ? "degraded" : "failing",
          lastFailureAt: input.observedAt,
          lastErrorCode: input.errorCode ?? "WECOM_DELIVERY_FAILED",
          lastErrorSummary: input.errorSummary ?? "企业微信投递失败",
        },
  });
}

export async function recordNotificationEndpointHeartbeatHealth(
  client: Prisma.TransactionClient,
  input: {
    endpointId: number;
    connected: boolean;
    observedAt: Date;
  },
) {
  if (input.connected) {
    await client.notificationChannelEndpoint.updateMany({
      where: {
        id: input.endpointId,
        OR: [
          { lastHeartbeatAt: null },
          { lastHeartbeatAt: { lte: input.observedAt } },
        ],
      },
      data: { lastHeartbeatAt: input.observedAt },
    });
    await client.notificationChannelEndpoint.updateMany({
      where: {
        id: input.endpointId,
        healthStatus: { in: ["unknown", "disconnected"] },
        AND: [
          {
            OR: [
              { lastSuccessAt: null },
              { lastSuccessAt: { lte: input.observedAt } },
            ],
          },
          {
            OR: [
              { lastFailureAt: null },
              { lastFailureAt: { lt: input.observedAt } },
            ],
          },
        ],
      },
      data: {
        healthStatus: "healthy",
        lastErrorCode: null,
        lastErrorSummary: null,
      },
    });
    return;
  }

  await client.notificationChannelEndpoint.updateMany({
    where: {
      id: input.endpointId,
      AND: [
        {
          OR: [
            { lastHeartbeatAt: null },
            { lastHeartbeatAt: { lte: input.observedAt } },
          ],
        },
        {
          OR: [
            { lastSuccessAt: null },
            { lastSuccessAt: { lte: input.observedAt } },
          ],
        },
        {
          OR: [
            { lastFailureAt: null },
            { lastFailureAt: { lte: input.observedAt } },
          ],
        },
      ],
    },
    data: {
      lastHeartbeatAt: input.observedAt,
      healthStatus: "disconnected",
      lastFailureAt: input.observedAt,
      lastErrorCode: "WECOM_WORKER_DISCONNECTED",
      lastErrorSummary: "企业微信通知 Worker 报告连接断开",
    },
  });
}
