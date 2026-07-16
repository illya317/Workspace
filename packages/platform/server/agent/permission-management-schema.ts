import { z } from "zod";
import { PERMISSION_ACTION_KEYS } from "@workspace/platform/permission-actions";

export const agentPermissionSubjectTypeSchema = z.enum(["user", "position", "department"]);

export const agentActionCeilingUpdateSchema = z.object({
  actionKeys: z.array(z.enum(PERMISSION_ACTION_KEYS)).max(PERMISSION_ACTION_KEYS.length),
}).strict();

export const agentPermissionGrantQuerySchema = z.object({
  subjectType: agentPermissionSubjectTypeSchema.default("user"),
  resourceKey: z.string().trim().min(1).max(120),
}).strict();

const agentPermissionGrantChangeSchema = z.object({
  subjectType: agentPermissionSubjectTypeSchema,
  subjectId: z.number().int().positive(),
  resourceKey: z.string().trim().min(1).max(120),
  actionKey: z.enum(PERMISSION_ACTION_KEYS),
  value: z.boolean(),
}).strict();

export const agentPermissionGrantBatchSchema = z.object({
  changes: z.array(agentPermissionGrantChangeSchema).min(1).max(100),
}).strict();

export type AgentActionCeilingUpdateRequest = z.infer<typeof agentActionCeilingUpdateSchema>;
export type AgentPermissionGrantQuery = z.infer<typeof agentPermissionGrantQuerySchema>;
export type AgentPermissionGrantBatchRequest = z.infer<typeof agentPermissionGrantBatchSchema>;
