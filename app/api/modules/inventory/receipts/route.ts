import { z } from "zod";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import {
  InventoryReceiptCreateSchema,
  executeCreateReceiptCommand,
  listInventoryReceipt,
} from "@workspace/inventory/server/receipts/index";

const optionalText = z.preprocess((value) => typeof value === "string" && value.trim() ? value.trim() : undefined, z.string().optional());
const querySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  q: optionalText,
});

export const GET = createCommandRoute({
  querySchema,
  buildCommand: ({ query }) => okCommand(query),
  action: listInventoryReceipt,
});

export const POST = createCommandRoute({
  bodySchema: InventoryReceiptCreateSchema,
  buildCommand: ({ body, user }) => okCommand({ body, userId: user.userId }),
  action: executeCreateReceiptCommand,
});
