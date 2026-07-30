import type {
  BusinessRequiredPolicy,
  RelationPolicyPreset,
} from "@workspace/platform/relation-registration-contract";

import type { DatabaseRelationDeleteAction } from "./database-schema-contract";

export type RelationPolicyFieldMode = "fixed" | "editable" | "invalid";

export interface RelationPolicyField<T> {
  mode: RelationPolicyFieldMode;
  baseline: T | null;
  effective: T | null;
  allowed: T[];
  overridden: boolean;
  reason: string | null;
}

export interface RelationPolicyEndpoint {
  entity: string;
  fields: string[];
  label?: string;
}

export interface RelationPolicyPhysicalEvidence {
  constraintName: string;
  sourceTable: string;
  sourceColumns: string[];
  targetTable: string;
  targetColumns: string[];
  sourceRequired: boolean;
  onDelete: DatabaseRelationDeleteAction;
}

export interface RelationPolicyGroupCatalogItem {
  policyKey: string;
  relationKeys: string[];
  baselineHash: string;
  version: number;
  overridden: boolean;
  stale: boolean;
  updatedAt: string | null;
  updatedByUserId: number | null;
}

export interface RelationPolicyCatalogItem {
  relationKey: string;
  moduleKey: string;
  title: string;
  source: RelationPolicyEndpoint;
  target: RelationPolicyEndpoint;
  nullable: boolean;
  semantics: string;
  policyGroup: RelationPolicyGroupCatalogItem | null;
  deleteLinkage: RelationPolicyField<RelationPolicyPreset>;
  businessRequired: RelationPolicyField<BusinessRequiredPolicy>;
  physicalEvidence: RelationPolicyPhysicalEvidence | null;
  orphanPhysical: boolean;
  issues: string[];
}

export interface RelationPolicyModuleCatalogItem {
  key: string;
  label: string;
  relationCount: number;
  editableRelationCount: number;
  invalidRelationCount: number;
}

export interface RelationPolicyCatalog {
  generatedAt: string;
  modules: RelationPolicyModuleCatalogItem[];
  relations: RelationPolicyCatalogItem[];
}

export interface RelationPolicyMutationSettings {
  targetDelete?: RelationPolicyPreset;
  businessRequired?: BusinessRequiredPolicy;
}

export interface RelationPolicyMutationCommand {
  relationKey: string;
  policyKey: string;
  baselineHash: string;
  expectedVersion: number;
  settings?: RelationPolicyMutationSettings;
  reset?: boolean;
  reason: string;
}
