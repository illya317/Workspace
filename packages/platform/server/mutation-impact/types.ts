import type {
  ImpactPlan,
  ImpactResolutionChoice,
  ImpactResolutionInput,
  MutationImpactPolicy,
  MutationImpactResolution,
  MutationImpactRoot,
  MutationIntent,
} from "../../mutation-impact-contract";

type Awaitable<T> = T | Promise<T>;

export type MutationImpactNode = MutationImpactRoot;

export interface MutationImpactRecord {
  entity: string;
  id: string;
  label: string;
  intent?: MutationIntent;
  /** Include the transaction-read revision to bind stale detection and restore audit freshness. */
  expectedVersion?: string | number;
  /** Transaction-local adapter data. It is never copied into the token or fingerprint. */
  payload?: unknown;
}

export interface MutationImpactInspection<TContext> {
  context: TContext;
  actorKey: string;
  scopeKey: string;
  root: MutationImpactRoot;
  current: MutationImpactNode;
  depth: number;
  relationPath: readonly string[];
}

export interface MutationImpactInspectionResult {
  /** Optional compatibility assertion. Runtime policy is resolved from the authoritative catalog/transition policy source. */
  policy?: MutationImpactPolicy;
  records: readonly MutationImpactRecord[];
  reason: string;
  recommendation?: string;
  requiresPerItemPermission?: boolean;
}

export interface MutationImpactEffect {
  source: MutationImpactNode;
  target: MutationImpactNode;
  record: MutationImpactRecord;
  depth: number;
  relationPath: readonly string[];
}

export interface MutationImpactAdapterExecution<TContext> {
  context: TContext;
  actorKey: string;
  scopeKey: string;
  root: MutationImpactRoot;
  relationKey: string;
  resolution: MutationImpactResolution;
  effects: readonly MutationImpactEffect[];
}

export interface MutationImpactAdapter<TContext> {
  relationKey: string;
  sourceEntity: string;
  intents: readonly MutationIntent[];
  /** Lower values execute first among effects at the same graph depth. */
  executionPriority?: number;
  inspect(input: MutationImpactInspection<TContext>): Awaitable<MutationImpactInspectionResult | null>;
  unlink?(input: MutationImpactAdapterExecution<TContext>): Awaitable<void>;
  cascade?(input: MutationImpactAdapterExecution<TContext>): Awaitable<void>;
  transition?(input: MutationImpactAdapterExecution<TContext>): Awaitable<void>;
}

export interface MutationImpactPlanRequest<TContext> {
  context: TContext;
  actorKey: string;
  scopeKey: string;
  root: MutationImpactRoot;
}

export interface MutationImpactExecuteRequest<TContext, TResult> extends MutationImpactPlanRequest<TContext> {
  confirmation?: ImpactResolutionInput;
  /** Must use the same caller-owned transaction represented by `context`. */
  commitRoot(context: TContext): Awaitable<TResult>;
}

export interface MutationImpactTokenResolutionClaim {
  relationKey: string;
  resolutions: readonly MutationImpactResolution[];
}

export interface MutationImpactTokenClaims {
  version: 1;
  actorKey: string;
  scopeKey: string;
  root: Pick<MutationImpactRoot, "entity" | "id" | "intent" | "expectedVersion">;
  fingerprint: string;
  policyRevision: string;
  allowedResolutions: readonly MutationImpactTokenResolutionClaim[];
  expiresAt: string;
}

export interface MutationImpactTokenCodec {
  /** Production adapters must authenticate the returned opaque token. */
  seal(claims: MutationImpactTokenClaims): Awaitable<string>;
  /** Production adapters must reject altered or unauthenticated tokens. */
  open(token: string): Awaitable<unknown>;
}

export interface MutationImpactLimits {
  maxDepth: number;
  maxNodes: number;
  maxSamplesPerGroup: number;
}

export interface MutationImpactAuditEffect {
  relationKey: string;
  resolution: MutationImpactResolution;
  entity: string;
  id: string;
  beforeRevision?: string | number;
  depth: number;
  relationPath: readonly string[];
}

export interface MutationImpactAuditInput<TContext> {
  context: TContext;
  actorKey: string;
  scopeKey: string;
  root: MutationImpactRoot;
  plan: ImpactPlan;
  selectedResolutions: readonly ImpactResolutionChoice[];
  executedEffects: readonly MutationImpactAuditEffect[];
}

export type MutationImpactAttemptStatus =
  | "blocked"
  | "confirmation_required"
  | "stale_confirmation"
  | "failed";

export interface MutationImpactAttemptAuditInput<TContext> {
  context: TContext;
  actorKey: string;
  scopeKey: string;
  root: MutationImpactRoot;
  plan?: ImpactPlan;
  status: MutationImpactAttemptStatus;
  resultCode: string;
  resultMessage: string;
}

export interface MutationImpactEngineOptions<TContext> {
  adapters: readonly MutationImpactAdapter<TContext>[];
  resolvePolicy(input: {
    context: TContext;
    relationKey: string;
    intent: MutationIntent;
  }): Awaitable<MutationImpactPolicy | null>;
  tokenCodec: MutationImpactTokenCodec;
  getPolicyRevision(context: TContext): Awaitable<string>;
  now?: () => Date;
  tokenTtlMs?: number;
  limits?: Partial<MutationImpactLimits>;
  /** Runs after the root commit in the same caller-owned transaction/context. */
  audit?(input: MutationImpactAuditInput<TContext>): Awaitable<void>;
  /** Records non-successful attempts outside the caller-owned business transaction. */
  auditAttempt?(input: MutationImpactAttemptAuditInput<TContext>): Awaitable<void>;
}

export interface MutationImpactEngine<TContext> {
  plan(request: MutationImpactPlanRequest<TContext>): Promise<ImpactPlan>;
  /**
   * The caller must invoke this inside its transaction and pass a context/root freshly read there.
   * The engine deliberately never creates or commits a transaction of its own.
   */
  execute<TResult>(request: MutationImpactExecuteRequest<TContext, TResult>): Promise<TResult>;
}
