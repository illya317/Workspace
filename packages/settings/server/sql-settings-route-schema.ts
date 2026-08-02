import { z } from "zod";

const reasonSchema = z.string()
  .trim()
  .min(4, "请填写至少 4 个字的变更原因")
  .max(200, "变更原因最多 200 个字")
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "变更原因不能包含控制字符");

export const sqlSettingOperationSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("set-runtime-setting"),
    settingKey: z.string().min(1).max(80),
    value: z.string().min(1).max(40),
    expectedCurrentValueMs: z.number().int().positive().max(86_400_000),
    reason: reasonSchema,
  }).strict(),
  z.object({
    operation: z.literal("rotate-runtime-password"),
    reason: reasonSchema,
    confirmation: z.string().min(1).max(32),
  }).strict(),
]);

export type SqlSettingOperationRouteInput = z.infer<typeof sqlSettingOperationSchema>;
