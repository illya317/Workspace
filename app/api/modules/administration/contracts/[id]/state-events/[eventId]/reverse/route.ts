import { z } from "zod";
import { readRequestExpectedVersion } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";
import {
  ContractStateReverseSchema,
  executeReverseContractStateEvent,
} from "@workspace/administration/server";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
  eventId: z.coerce.number().int().positive(),
});

export const POST = createCommandRoute({
  paramsSchema,
  bodySchema: ContractStateReverseSchema,
  paramsError: "无效ID",
  buildCommand: ({ params, body, request, user }) => {
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    return idempotencyKey ? okCommand({
      contractId: params.id,
      eventId: params.eventId,
      body,
      userId: user.userId,
      expectedVersion: readRequestExpectedVersion(request),
      idempotencyKey,
    }) : failCommand("缺少 Idempotency-Key 请求头");
  },
  action: executeReverseContractStateEvent,
});
