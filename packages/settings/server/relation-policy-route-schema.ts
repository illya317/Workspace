import { z } from "zod";

import { RELATION_POLICY_PRESETS } from "@workspace/platform/relation-registration-contract";

const relationPolicySettingsSchema = z.object({
  targetDelete: z.enum(RELATION_POLICY_PRESETS).optional(),
  businessRequired: z.enum(["required", "optional"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "保存关系策略时至少提交一个可配置字段",
});

export const relationPolicyPatchSchema = z.object({
  relationKey: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  policyKey: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  baselineHash: z.string().trim().toLowerCase().regex(/^[a-f0-9]{64}$/),
  expectedVersion: z.number().int().nonnegative(),
  settings: relationPolicySettingsSchema.optional(),
  reset: z.boolean().optional(),
  reason: z.string().trim().min(1).max(500),
}).strict().superRefine((value, context) => {
  if (value.reset === true && value.settings !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["settings"],
      message: "恢复代码基线时不能同时提交关系策略字段",
    });
  }
  if (value.reset !== true && value.settings === undefined) {
    context.addIssue({
      code: "custom",
      path: ["settings"],
      message: "保存关系策略时必须提交配置字段",
    });
  }
});
