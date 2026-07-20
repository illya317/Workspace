import type {
  ImpactPlan,
  MutationImpactPolicy,
  MutationImpactResolution,
  MutationImpactRoot,
} from "../../mutation-impact-contract";
import type {
  MutationImpactAdapter,
  MutationImpactNode,
  MutationImpactRecord,
  MutationImpactTokenResolutionClaim,
} from "./types";

export interface PlannedImpactEdge<TContext> {
  adapter: MutationImpactAdapter<TContext>;
  source: MutationImpactNode;
  target: MutationImpactNode;
  record: MutationImpactRecord;
  policy: MutationImpactPolicy;
  reason: string;
  recommendation?: string;
  requiresPerItemPermission: boolean;
  depth: number;
  relationPath: readonly string[];
}

export interface PlannedImpactGraph<TContext> {
  root: MutationImpactRoot;
  edges: readonly PlannedImpactEdge<TContext>[];
}

export type UnsignedImpactPlan = Omit<ImpactPlan, "token" | "expiresAt">;

export interface BuiltImpactPlan<TContext> {
  graph: PlannedImpactGraph<TContext>;
  unsignedPlan: UnsignedImpactPlan;
  resolutionClaims: readonly MutationImpactTokenResolutionClaim[];
}

export interface SelectedImpactOperation<TContext> {
  edge: PlannedImpactEdge<TContext>;
  resolution: MutationImpactResolution;
}
