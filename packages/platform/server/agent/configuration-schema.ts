import { z } from "zod";

const agentConfigurationStatusSchema = z.enum(["active", "suspended"]);

const agentProfileConfigurationPatchSchema = z.object({
  displayName: z.string().max(80),
  roleName: z.string().max(120),
  responsibilities: z.string().max(4_000),
  status: agentConfigurationStatusSchema,
}).strict();

const agentRuntimeConfigurationPatchSchema = z.object({
  id: z.number().int().positive(),
  status: agentConfigurationStatusSchema,
  interactive: z.boolean(),
  instructions: z.string().max(12_000),
  capabilityKeys: z.array(z.string().max(120)).max(100),
}).strict();

export const agentConfigurationUpdateSchema = z.object({
  profileId: z.number().int().positive(),
  profile: agentProfileConfigurationPatchSchema.optional(),
  runtime: agentRuntimeConfigurationPatchSchema.optional(),
}).strict().refine((value) => Boolean(value.profile || value.runtime), {
  message: "至少需要修改 Agent 档案或一个运行时绑定",
});

export type AgentConfigurationUpdateRequest = z.infer<typeof agentConfigurationUpdateSchema>;
