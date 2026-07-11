import { z } from "zod";

export const departmentCollaborationWriteSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  collaborationType: z.enum(["routine", "periodic", "event", "temporary"]),
  triggerRule: z.string().optional(),
  scopeDescription: z.string().optional(),
  inputRequirement: z.string().optional(),
  deliverable: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  responseTargetHours: z.coerce.number().int().positive().nullable().optional(),
  deliveryTargetDays: z.coerce.number().int().positive().nullable().optional(),
  effectiveFrom: z.string().nullable().optional(),
  effectiveTo: z.string().nullable().optional(),
  escalationPolicy: z.string().optional(),
  responsibleDepartmentId: z.coerce.number(),
  enablingDepartmentIds: z.array(z.coerce.number()).min(1),
  responsiblePositionIds: z.array(z.coerce.number()).min(1),
  executorPositionIds: z.array(z.coerce.number()).min(1),
}).strip();
