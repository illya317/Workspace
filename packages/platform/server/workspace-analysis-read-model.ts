import "server-only";

import type {
  WorkspaceAnalysisSourceDefinition,
  WorkspaceAnalysisSourceFieldDefinition,
  WorkspaceAnalysisSourceParameterDefinition,
  WorkspaceAnalysisSourceParameterConstraint,
  WorkspaceAnalysisSourceScopeBinding,
  WorkspaceAnalysisSourceScopeType,
} from "../workspace-analysis-source-contract";
import { findApiContract } from "../api-registry";
import type {
  WorkspaceAnalysisOwnerDerivedRegistration,
  WorkspaceAnalysisWorkspaceGetRegistration,
} from "./workspace-analysis-source-registry";

export const WORKSPACE_ANALYSIS_FIELD_OMISSION_REASONS = [
  "binary",
  "controlPlane",
  "credential",
  "derivedDuplicate",
  "nonScalar",
  "notPublic",
  "unstable",
] as const;

export type WorkspaceAnalysisFieldOmissionReason = (typeof WORKSPACE_ANALYSIS_FIELD_OMISSION_REASONS)[number];

type FieldCapabilities = WorkspaceAnalysisSourceFieldDefinition["capabilities"];

export type WorkspaceAnalysisReadModelField = {
  readonly classification: "field";
  readonly label: string;
  readonly description: string;
  readonly valueKind: WorkspaceAnalysisSourceFieldDefinition["kind"];
  readonly sensitivity: WorkspaceAnalysisSourceFieldDefinition["sensitivity"];
  readonly exportPolicy: WorkspaceAnalysisSourceFieldDefinition["exportPolicy"];
  readonly fieldPath?: string;
  readonly capabilities?: Partial<FieldCapabilities>;
};

export type WorkspaceAnalysisReadModelChild = {
  readonly classification: "childSource";
  readonly sourceKey: string;
  readonly description: string;
};

export type WorkspaceAnalysisReadModelOmission = {
  readonly classification: "omit";
  readonly reason: WorkspaceAnalysisFieldOmissionReason;
  readonly description: string;
};

export type WorkspaceAnalysisReadModelFieldClassification =
  | WorkspaceAnalysisReadModelField
  | WorkspaceAnalysisReadModelChild
  | WorkspaceAnalysisReadModelOmission;

/**
 * Forces the owner to account for every field of its public row DTO. A field is
 * either analytical, delegated to a child source, or omitted for a named data-
 * shape reason. This is schema coverage, not another permission decision.
 */
export type WorkspaceAnalysisReadModelFields<TRow extends object> = {
  readonly [Key in Extract<keyof TRow, string>]-?: WorkspaceAnalysisReadModelFieldClassification;
};

export type WorkspaceAnalysisReadModelScope = WorkspaceAnalysisSourceScopeBinding & {
  readonly query?: Readonly<Record<string, "requesterId" | "scopeId" | "scopeType">>;
};

export type WorkspaceAnalysisReadModelParameter = WorkspaceAnalysisSourceParameterDefinition & {
  readonly queryKey: string;
};

type WorkspaceAnalysisReadModelCoreInput<TRow extends object> = {
  readonly sourceKey: string;
  readonly version: number;
  readonly label: string;
  readonly description: string;
  readonly parameterConstraints?: readonly WorkspaceAnalysisSourceParameterConstraint[];
  readonly fields: WorkspaceAnalysisReadModelFields<TRow>;
  readonly limits: WorkspaceAnalysisSourceDefinition["limits"];
};

export type WorkspaceAnalysisReadModelInput<TRow extends object> = WorkspaceAnalysisReadModelCoreInput<TRow> & {
  readonly apiPath: string;
  readonly rowsPath: string;
  readonly totalPath: string;
  readonly scopes: Readonly<Partial<Record<WorkspaceAnalysisSourceScopeType, WorkspaceAnalysisReadModelScope>>>;
  readonly parameters?: readonly WorkspaceAnalysisReadModelParameter[];
  readonly pagination: {
    readonly pageParam: string;
    readonly pageSizeParam: string;
    readonly pageSize: number;
    readonly maxPages: number;
  };
  readonly migration?: WorkspaceAnalysisWorkspaceGetRegistration["migration"];
};

export type WorkspaceAnalysisDerivedReadModelInput<TRow extends object> = WorkspaceAnalysisReadModelCoreInput<TRow> & {
  /** Protected business GET used only to inherit its authorization contract. */
  readonly authorizationApiPath: string;
  readonly derivation: {
    readonly kind: "partitionedSnapshot" | "boundedRelationSnapshot";
    readonly description: string;
  };
  readonly scopes: Readonly<Partial<Record<WorkspaceAnalysisSourceScopeType, WorkspaceAnalysisSourceScopeBinding>>>;
  readonly parameters?: readonly WorkspaceAnalysisSourceParameterDefinition[];
  readonly pagination: {
    readonly pageSize: number;
    readonly maxPages: number;
  };
};

export function defineWorkspaceAnalysisReadModel<TRow extends object>() {
  return (input: WorkspaceAnalysisReadModelInput<TRow>): WorkspaceAnalysisWorkspaceGetRegistration => {
    const parameterQuery = Object.fromEntries((input.parameters ?? []).map((parameter) => (
      [parameter.key, parameter.queryKey]
    )));
    const parameters = (input.parameters ?? []).map(({ queryKey: _queryKey, ...parameter }) => parameter);
    const scopeBindings = Object.fromEntries(Object.entries(input.scopes).map(([scopeType, scope]) => (
      [scopeType, { mode: scope.mode, description: scope.description }]
    )));
    const scopeQuery = Object.fromEntries(Object.entries(input.scopes).flatMap(([scopeType, scope]) => (
      scope?.query ? [[scopeType, scope.query]] : []
    )));
    const core = createWorkspaceAnalysisReadModelCore({
      input,
      authorizationApiPath: input.apiPath,
      scopeBindings,
      parameters,
    });

    return {
      definition: core.definition,
      fieldCoverage: core.fieldCoverage,
      ...(input.migration ? { migration: input.migration } : {}),
      adapter: {
        kind: "workspaceGet",
        path: input.apiPath,
        rowsPath: input.rowsPath,
        fieldPaths: core.fieldPaths,
        scopeQuery,
        parameterQuery,
        pagination: {
          pageParam: input.pagination.pageParam,
          pageSizeParam: input.pagination.pageSizeParam,
          totalPath: input.totalPath,
          pageSize: input.pagination.pageSize,
          maxPages: input.pagination.maxPages,
        },
      },
    };
  };
}

export function defineWorkspaceAnalysisDerivedReadModel<TRow extends object>() {
  return (input: WorkspaceAnalysisDerivedReadModelInput<TRow>): WorkspaceAnalysisOwnerDerivedRegistration => {
    const core = createWorkspaceAnalysisReadModelCore({
      input,
      authorizationApiPath: input.authorizationApiPath,
      scopeBindings: input.scopes,
      parameters: input.parameters ?? [],
    });
    return {
      definition: core.definition,
      fieldCoverage: core.fieldCoverage,
      adapter: {
        kind: "ownerDerived",
        path: input.authorizationApiPath,
        derivation: { ...input.derivation },
        fieldPaths: core.fieldPaths,
        pagination: {
          pageSize: input.pagination.pageSize,
          maxPages: input.pagination.maxPages,
        },
      },
    };
  };
}

function createWorkspaceAnalysisReadModelCore<TRow extends object>(input: {
  readonly input: WorkspaceAnalysisReadModelCoreInput<TRow>;
  readonly authorizationApiPath: string;
  readonly scopeBindings: Readonly<Partial<Record<WorkspaceAnalysisSourceScopeType, WorkspaceAnalysisSourceScopeBinding>>>;
  readonly parameters: readonly WorkspaceAnalysisSourceParameterDefinition[];
}) {
  const contract = findApiContract("GET", input.authorizationApiPath);
  if (
    !contract
    || contract.access !== "protected"
    || contract.apiKind !== "business"
    || !contract.resourceKey
    || !contract.ownerModuleKey
  ) {
    throw new Error(`${input.input.sourceKey} 必须引用受保护的业务 GET contract`);
  }

  const classifiedFields = Object.entries(input.input.fields) as Array<[string, WorkspaceAnalysisReadModelFieldClassification]>;
  const fieldEntries = classifiedFields.filter((entry): entry is [string, WorkspaceAnalysisReadModelField] => (
    entry[1].classification === "field"
  ));
  const fieldCoverage = classifiedFields.map(([fieldKey, classification]) => {
    if (classification.classification === "field") {
      return { fieldKey, disposition: "analytical" as const };
    }
    if (classification.classification === "childSource") {
      return {
        fieldKey,
        disposition: "childSource" as const,
        sourceKey: classification.sourceKey,
        description: classification.description,
      };
    }
    return {
      fieldKey,
      disposition: "omit" as const,
      reason: classification.reason,
      description: classification.description,
    };
  });

  return {
    definition: {
      sourceKey: input.input.sourceKey,
      version: input.input.version,
      label: input.input.label,
      description: input.input.description,
      ownerModuleKey: contract.ownerModuleKey,
      authorization: {
        resourceKey: contract.resourceKey,
        requiredActions: [...contract.requiredActions],
        projection: contract.authorization.projection,
        enforcement: contract.runtimeEnforcement,
      },
      scopeBindings: input.scopeBindings,
      parameters: input.parameters,
      ...(input.input.parameterConstraints ? { parameterConstraints: [...input.input.parameterConstraints] } : {}),
      fields: fieldEntries.map(([key, field]) => ({
        key,
        label: field.label,
        description: field.description,
        kind: field.valueKind,
        sensitivity: field.sensitivity,
        exportPolicy: field.exportPolicy,
        capabilities: mergeCapabilities(field.valueKind, field.capabilities),
      })),
      limits: { ...input.input.limits },
    },
    fieldCoverage,
    fieldPaths: Object.fromEntries(fieldEntries.map(([key, field]) => [key, field.fieldPath ?? key])),
  };
}

function mergeCapabilities(
  kind: WorkspaceAnalysisSourceFieldDefinition["kind"],
  overrides: WorkspaceAnalysisReadModelField["capabilities"],
): FieldCapabilities {
  const defaults = defaultCapabilities(kind);
  return {
    displayable: overrides?.displayable ?? defaults.displayable,
    filterOperators: overrides?.filterOperators ?? defaults.filterOperators,
    groupable: overrides?.groupable ?? defaults.groupable,
    aggregateOperations: overrides?.aggregateOperations ?? defaults.aggregateOperations,
  };
}

function defaultCapabilities(kind: WorkspaceAnalysisSourceFieldDefinition["kind"]): FieldCapabilities {
  if (kind === "text") {
    return {
      displayable: true,
      filterOperators: ["equals", "contains", "in"],
      groupable: true,
      aggregateOperations: ["count", "distinctCount"],
    };
  }
  if (kind === "date") {
    return {
      displayable: true,
      filterOperators: ["equals", "range", "year", "month"],
      groupable: true,
      aggregateOperations: ["count", "distinctCount"],
    };
  }
  if (kind === "boolean") {
    return {
      displayable: true,
      filterOperators: ["equals", "in"],
      groupable: true,
      aggregateOperations: ["count", "distinctCount"],
    };
  }
  return {
    displayable: true,
    filterOperators: ["equals", "range"],
    groupable: false,
    aggregateOperations: ["count", "distinctCount", "sum", "average", "min", "max"],
  };
}
