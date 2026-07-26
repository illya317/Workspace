import "server-only";

import { z } from "zod";
import { failCommand, okCommand } from "./domain-validation";
import { getDataQualityChannelAvailability } from "./data-quality-policy";

export const dataQualityAdminActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run") }),
  z.object({ action: z.literal("test_wecom") }),
]);

export type DataQualityAdminAction = z.infer<typeof dataQualityAdminActionSchema>;

export function buildDataQualityAdminAction(input: DataQualityAdminAction) {
  if (input.action === "test_wecom" && !getDataQualityChannelAvailability().wecomGroup.configured) {
    return failCommand("企微群机器人未配置，请先设置 WECOM_DATA_QUALITY_WEBHOOK_URL", 409, "action");
  }
  return okCommand(input);
}
