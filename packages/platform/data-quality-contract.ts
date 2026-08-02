import { z } from "zod";

export const DATA_QUALITY_SEVERITIES = ["critical", "warning", "info"] as const;
export const DATA_QUALITY_TRIGGER_MODES = ["manual", "scheduled", "mutation"] as const;

export const dataQualitySeveritySchema = z.enum(DATA_QUALITY_SEVERITIES);
export const dataQualityTriggerSchema = z.enum(DATA_QUALITY_TRIGGER_MODES);

export const dataQualityCheckDefinitionSchema = z.object({
  key: z.string().trim().min(1),
  domain: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  defaultSeverity: dataQualitySeveritySchema,
  triggerModes: z.array(dataQualityTriggerSchema).min(1),
});

export const dataQualityFindingSchema = z.object({
  fingerprint: z.string().trim().min(1),
  checkKey: z.string().trim().min(1),
  domain: z.string().trim().min(1),
  severity: dataQualitySeveritySchema,
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  count: z.number().int().positive(),
  resourceKey: z.string().trim().min(1).nullable().optional(),
  departmentId: z.number().int().positive().nullable().optional(),
  href: z.string().trim().startsWith("/").nullable().optional(),
  samples: z.array(z.object({
    key: z.string().trim().min(1),
    label: z.string().trim().min(1),
  })).max(10).default([]),
});

export const dataQualityEvaluationRequestSchema = z.object({
  trigger: dataQualityTriggerSchema,
  requestedAt: z.string().datetime(),
});

export const dataQualityEvaluationResponseSchema = z.object({
  schemaVersion: z.literal(1),
  providerKey: z.string().trim().min(1),
  evaluatedAt: z.string().datetime(),
  checks: z.array(dataQualityCheckDefinitionSchema).min(1),
  findings: z.array(dataQualityFindingSchema),
}).superRefine((value, context) => {
  const checkKeys = new Set(value.checks.map((check) => check.key));
  for (const [index, finding] of value.findings.entries()) {
    if (!checkKeys.has(finding.checkKey)) {
      context.addIssue({
        code: "custom",
        path: ["findings", index, "checkKey"],
        message: "finding checkKey must be declared by the provider",
      });
    }
  }
});

export type DataQualitySeverity = z.infer<typeof dataQualitySeveritySchema>;
export type DataQualityTrigger = z.infer<typeof dataQualityTriggerSchema>;
export type DataQualityCheckDefinition = z.infer<typeof dataQualityCheckDefinitionSchema>;
export type DataQualityFinding = z.infer<typeof dataQualityFindingSchema>;
export type DataQualityEvaluationRequest = z.infer<typeof dataQualityEvaluationRequestSchema>;
export type DataQualityEvaluationResponse = z.infer<typeof dataQualityEvaluationResponseSchema>;
