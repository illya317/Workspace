import type {
  WorkspaceAnalysisSourceDefinition,
  WorkspaceAnalysisSourceScopeType,
} from "../workspace-analysis-source-contract";

export type WorkspaceApiV2MigrationDeclaration = {
  /** Owner proof that legacy endpoint rows are the same canonical rows. */
  readonly equivalence: "directRows";
  /** Maps every `[placeholder]` in the registered route to a canonical source parameter. */
  readonly pathParameters?: Readonly<Record<string, string>>;
  /** Canonical fields that may be migrated from the legacy row shape. */
  readonly fields: "all" | readonly string[];
};

type WorkspaceAnalysisSourceRegistrationBase = {
  readonly definition: WorkspaceAnalysisSourceDefinition;
  /** Exhaustive classification of the owner public row DTO. */
  readonly fieldCoverage?: readonly (
    | { readonly fieldKey: string; readonly disposition: "analytical" }
    | { readonly fieldKey: string; readonly disposition: "childSource"; readonly sourceKey: string; readonly description: string }
    | { readonly fieldKey: string; readonly disposition: "omit"; readonly reason: string; readonly description: string }
  )[];
};

export type WorkspaceAnalysisWorkspaceGetAdapter = {
  readonly kind: "workspaceGet";
  /** Protected business GET used both for authorization provenance and transport. */
  readonly path: string;
  readonly rowsPath: string;
  readonly fieldPaths: Readonly<Record<string, string>>;
  readonly scopeQuery: Readonly<Partial<Record<
    WorkspaceAnalysisSourceScopeType,
    Readonly<Record<string, "requesterId" | "scopeId" | "scopeType">>
  >>>;
  readonly parameterQuery: Readonly<Record<string, string>>;
  readonly pagination: {
    readonly pageParam: string;
    readonly pageSizeParam: string;
    readonly totalPath: string;
    readonly pageSize: number;
    readonly maxPages: number;
  };
};

export type WorkspaceAnalysisOwnerDerivedAdapter = {
  readonly kind: "ownerDerived";
  /**
   * Protected business GET whose contract supplies the exact authorization
   * boundary. The owner executes the derivation directly; this is not a claim
   * that the GET response contains the derived rows.
   */
  readonly path: string;
  readonly derivation: {
    readonly kind: "partitionedSnapshot" | "boundedRelationSnapshot";
    readonly description: string;
  };
  readonly fieldPaths: Readonly<Record<string, string>>;
  readonly pagination: {
    readonly pageSize: number;
    readonly maxPages: number;
  };
};

export type WorkspaceAnalysisWorkspaceGetRegistration = WorkspaceAnalysisSourceRegistrationBase & {
  readonly migration?: {
    readonly workspaceApiV2?: WorkspaceApiV2MigrationDeclaration;
  };
  readonly adapter: WorkspaceAnalysisWorkspaceGetAdapter;
};

export type WorkspaceAnalysisOwnerDerivedRegistration = WorkspaceAnalysisSourceRegistrationBase & {
  /** Owner-derived rows can never claim direct legacy workspace.api equivalence. */
  readonly migration?: never;
  readonly adapter: WorkspaceAnalysisOwnerDerivedAdapter;
};

export type WorkspaceAnalysisSourceRegistration =
  | WorkspaceAnalysisWorkspaceGetRegistration
  | WorkspaceAnalysisOwnerDerivedRegistration;
