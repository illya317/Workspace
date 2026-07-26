export const MUTATION_IMPACT_REQUIRED_CODE = "MUTATION_IMPACT_REQUIRED" as const;

export type MutationIntent =
  | "delete"
  | "archive"
  | "restore"
  | "reparent"
  | "unlink"
  | "transition";

export type MutationImpactPolicy =
  | "block"
  | "confirm_unlink"
  | "confirm_cascade"
  | "confirm_unlink_or_cascade"
  | "auto_cascade_owned"
  | "confirm_transition_related"
  | "retain";

export type MutationImpactResolution = "unlink" | "cascade" | "transition_related";
export type MutationImpactAllowedResolution = "return" | MutationImpactResolution;

export interface MutationImpactRoot {
  entity: string;
  id: string;
  label: string;
  intent: MutationIntent;
  expectedVersion?: string | number;
}

export interface MutationImpactSample {
  entity: string;
  id: string;
  label: string;
}

export interface MutationImpactGroup {
  relationKey: string;
  sourceEntity: string;
  targetEntities: readonly string[];
  policy: MutationImpactPolicy;
  count: number;
  samples: readonly MutationImpactSample[];
  idsDigest: string;
  pathCount: number;
  reason: string;
  recommendation?: string;
  requiresPerItemPermission: boolean;
  hasNestedImpact: boolean;
  allowedResolutions: readonly MutationImpactResolution[];
}

export interface MutationImpactTotals {
  affected: number;
  unlink: number;
  cascade: number;
  transition: number;
  blocked: number;
  retained: number;
}

export interface ImpactPlan {
  token: string;
  fingerprint: string;
  policyRevision: string;
  expiresAt: string;
  root: MutationImpactRoot;
  blockers: readonly MutationImpactGroup[];
  confirmableEffects: readonly MutationImpactGroup[];
  informationalEffects: readonly MutationImpactGroup[];
  allowedResolutions: readonly MutationImpactAllowedResolution[];
  totals: MutationImpactTotals;
}

export interface ImpactResolutionChoice {
  relationKey: string;
  resolution: MutationImpactResolution;
}

export interface ImpactResolutionInput {
  impactToken: string;
  resolutions: readonly ImpactResolutionChoice[];
}

export interface MutationImpactRequiredResponse {
  code: typeof MUTATION_IMPACT_REQUIRED_CODE;
  message: string;
  impact: ImpactPlan;
}
