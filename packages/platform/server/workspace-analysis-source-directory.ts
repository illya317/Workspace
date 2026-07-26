import "server-only";

import type {
  WorkspaceAnalysisSourceDefinition,
  WorkspaceAnalysisSourceScopeType,
} from "../workspace-analysis-source-contract";
import { validateWorkspaceAnalysisSourceDefinition } from "./workspace-analysis-source-registry";
import type {
  WorkspaceAnalysisLoadedSource,
  WorkspaceAnalysisSourceLoadRequest,
  WorkspaceAnalysisSourceLoader,
} from "./workspace-analysis-source-execution-contract";
import { isWorkspaceAnalysisSourceRuntimeEnabled } from "./workspace-analysis-source-enabled";
import { workspaceAnalysisSourceBelongsToUnit } from "./workspace-analysis-source-owner";

const DEFAULT_PROVIDER_TIMEOUT_MS = 2_000;

export type WorkspaceAnalysisSourceDirectoryContext = {
  readonly requesterId: number;
  readonly targetType: WorkspaceAnalysisSourceScopeType;
  readonly targetId: number;
};

export type WorkspaceAnalysisSourceProvider = {
  readonly ownerUnitId: string;
  readonly supportedTargetTypes?: readonly WorkspaceAnalysisSourceScopeType[];
  readonly timeoutMs?: number;
  readonly loadSource?: WorkspaceAnalysisSourceLoader;
  listAvailableSources(
    context: WorkspaceAnalysisSourceDirectoryContext,
    signal?: AbortSignal,
  ): Promise<readonly WorkspaceAnalysisSourceDefinition[]>;
};

export type WorkspaceAnalysisSourceProviderStatus = {
  readonly ownerUnitId: string;
  readonly status: "available" | "unavailable" | "not_applicable";
  readonly sourceCount: number;
};

export type WorkspaceAnalysisSourceDirectoryResult = {
  readonly sources: readonly WorkspaceAnalysisSourceDefinition[];
  readonly providers: readonly WorkspaceAnalysisSourceProviderStatus[];
  readonly authorizedSources: WorkspaceAnalysisAuthorizedSourceLookup;
};

export type WorkspaceAnalysisAuthorizedSourceLookup = {
  readonly context: WorkspaceAnalysisSourceDirectoryContext;
  get(sourceKey: string, version: number): WorkspaceAnalysisSourceDefinition | null;
  providerOwnerUnitId(sourceKey: string, version: number): string | null;
  canLoad(sourceKey: string, version: number): boolean;
  loadSource(request: WorkspaceAnalysisSourceLoadRequest): Promise<WorkspaceAnalysisLoadedSource>;
};

const authorizedSourceLookups = new WeakSet<object>();

export class WorkspaceAnalysisSourceDirectoryConflictError extends Error {
  constructor(readonly sourceIdentities: readonly string[]) {
    super(`经营分析数据源重复: ${sourceIdentities.join(", ")}`);
    this.name = "WorkspaceAnalysisSourceDirectoryConflictError";
  }
}

export function createWorkspaceAnalysisSourceDirectory(
  providers: readonly WorkspaceAnalysisSourceProvider[],
) {
  const providerIds = providers.map((provider) => provider.ownerUnitId);
  const duplicateProviderIds = duplicateValues(providerIds);
  if (duplicateProviderIds.length) {
    throw new Error(`经营分析 provider 重复: ${duplicateProviderIds.join(", ")}`);
  }
  providers.forEach(validateProvider);

  return {
    async list(context: WorkspaceAnalysisSourceDirectoryContext): Promise<WorkspaceAnalysisSourceDirectoryResult> {
      validateDirectoryContext(context);
      const settled = await Promise.allSettled(providers.map(async (provider) => {
        if (provider.supportedTargetTypes && !provider.supportedTargetTypes.includes(context.targetType)) {
          return { status: "not_applicable" as const, sources: [] as readonly WorkspaceAnalysisSourceDefinition[] };
        }
        const returnedSources = await listProviderSources(provider, context);
        validateProviderSources(provider, context, returnedSources);
        const sources = returnedSources.filter(isWorkspaceAnalysisSourceRuntimeEnabled);
        return { status: "available" as const, sources };
      }));
      const statuses: WorkspaceAnalysisSourceProviderStatus[] = [];
      const sources: WorkspaceAnalysisSourceDefinition[] = [];
      const sourceOwners = new Map<string, string>();
      settled.forEach((result, index) => {
        const ownerUnitId = providers[index]!.ownerUnitId;
        if (result.status === "rejected") {
          statuses.push({ ownerUnitId, status: "unavailable", sourceCount: 0 });
          return;
        }
        statuses.push({ ownerUnitId, status: result.value.status, sourceCount: result.value.sources.length });
        sources.push(...result.value.sources);
        result.value.sources.forEach((source) => sourceOwners.set(sourceIdentity(source), ownerUnitId));
      });

      const stableSources = sources.map((source) => deepFreeze(structuredClone(source))).sort(compareSources);
      const duplicateSources = duplicateValues(stableSources.map((source) => sourceIdentity(source)));
      if (duplicateSources.length) throw new WorkspaceAnalysisSourceDirectoryConflictError(duplicateSources);
      const authorizedSources = buildAuthorizedSourceLookup(context, stableSources, sourceOwners, providers);
      return {
        sources: stableSources,
        providers: statuses.sort((left, right) => left.ownerUnitId.localeCompare(right.ownerUnitId)),
        authorizedSources,
      };
    },
  };
}

export function createLocalWorkspaceAnalysisSourceProvider(input: {
  readonly ownerUnitId: string;
  readonly sourceCatalog: { list(): readonly WorkspaceAnalysisSourceDefinition[] };
  readonly canDiscover: (context: WorkspaceAnalysisSourceDirectoryContext & {
    readonly source: WorkspaceAnalysisSourceDefinition;
  }) => Promise<boolean> | boolean;
  readonly loadSource?: WorkspaceAnalysisSourceLoader;
}): WorkspaceAnalysisSourceProvider {
  validateUnitId(input.ownerUnitId);
  const supportedTargetTypes = [...new Set(input.sourceCatalog.list().flatMap((source) => (
    Object.keys(source.scopeBindings) as WorkspaceAnalysisSourceScopeType[]
  )))];
  return {
    ownerUnitId: input.ownerUnitId,
    supportedTargetTypes,
    loadSource: input.loadSource,
    async listAvailableSources(context) {
      validateDirectoryContext(context);
      const candidates = input.sourceCatalog.list().filter((source) => (
        source.scopeBindings[context.targetType]
        && isWorkspaceAnalysisSourceRuntimeEnabled(source)
      ));
      const decisions = await Promise.all(candidates.map((source) => (
        Promise.resolve().then(() => input.canDiscover({ ...context, source }))
      )));
      return candidates.filter((_source, index) => decisions[index] === true);
    },
  };
}

export function validateWorkspaceAnalysisUnitId(value: string) {
  validateUnitId(value);
}

export function isWorkspaceAnalysisAuthorizedSourceLookup(
  value: unknown,
): value is WorkspaceAnalysisAuthorizedSourceLookup {
  return Boolean(value && typeof value === "object" && authorizedSourceLookups.has(value));
}

function validateDirectoryContext(context: WorkspaceAnalysisSourceDirectoryContext) {
  if (!["personal", "department", "project"].includes(context.targetType)) {
    throw new Error(`经营分析空间类型无效: ${context.targetType}`);
  }
  if (!Number.isInteger(context.requesterId) || context.requesterId <= 0) {
    throw new Error("经营分析请求用户无效");
  }
  if (!Number.isInteger(context.targetId) || context.targetId <= 0) {
    throw new Error("经营分析目标空间无效");
  }
}

function validateUnitId(value: string) {
  if (!/^[a-z][a-z0-9-]*$/.test(value)) throw new Error(`经营分析 unitId 无效: ${value}`);
}

function validateProvider(provider: WorkspaceAnalysisSourceProvider) {
  validateUnitId(provider.ownerUnitId);
  if (provider.timeoutMs !== undefined && (
    !Number.isInteger(provider.timeoutMs) || provider.timeoutMs < 100 || provider.timeoutMs > 30_000
  )) {
    throw new Error(`经营分析 provider ${provider.ownerUnitId} timeoutMs 无效`);
  }
  if (provider.supportedTargetTypes) {
    const scopes = provider.supportedTargetTypes;
    if (!scopes.length || new Set(scopes).size !== scopes.length || scopes.some((scope) => !SCOPE_TYPES.includes(scope))) {
      throw new Error(`经营分析 provider ${provider.ownerUnitId} 支持空间无效`);
    }
  }
}

async function listProviderSources(
  provider: WorkspaceAnalysisSourceProvider,
  context: WorkspaceAnalysisSourceDirectoryContext,
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort("timeout");
      reject(new Error(`经营分析 provider ${provider.ownerUnitId} 超时`));
    }, provider.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => provider.listAvailableSources(context, controller.signal)),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function validateProviderSources(
  provider: WorkspaceAnalysisSourceProvider,
  context: WorkspaceAnalysisSourceDirectoryContext,
  sources: readonly WorkspaceAnalysisSourceDefinition[],
) {
  if (!Array.isArray(sources)) throw new Error(`经营分析 provider ${provider.ownerUnitId} 返回值无效`);
  for (const source of sources) {
    validateWorkspaceAnalysisSourceDefinition(source);
    if (!workspaceAnalysisSourceBelongsToUnit(source.ownerModuleKey, provider.ownerUnitId)) {
      throw new Error(`经营分析 provider ${provider.ownerUnitId} 返回了其他 owner 的数据源`);
    }
    if (!source.scopeBindings[context.targetType]) {
      throw new Error(`经营分析 provider ${provider.ownerUnitId} 返回了不支持当前空间的数据源`);
    }
  }
}

function buildAuthorizedSourceLookup(
  context: WorkspaceAnalysisSourceDirectoryContext,
  sources: readonly WorkspaceAnalysisSourceDefinition[],
  sourceOwners: ReadonlyMap<string, string>,
  providers: readonly WorkspaceAnalysisSourceProvider[],
): WorkspaceAnalysisAuthorizedSourceLookup {
  const definitions = new Map(sources.map((source) => [sourceIdentity(source), source]));
  const providersByOwner = new Map(providers.map((provider) => [provider.ownerUnitId, provider]));
  const loaders = new Map([...sourceOwners].flatMap(([identity, ownerUnitId]) => {
    const loader = providersByOwner.get(ownerUnitId)?.loadSource;
    return loader ? [[identity, loader] as const] : [];
  }));
  const lookup: WorkspaceAnalysisAuthorizedSourceLookup = Object.freeze({
    context: Object.freeze({ ...context }),
    get(sourceKey: string, version: number) {
      const definition = definitions.get(`${sourceKey}@${version}`);
      return definition && isWorkspaceAnalysisSourceRuntimeEnabled(definition) ? definition : null;
    },
    providerOwnerUnitId(sourceKey: string, version: number) {
      const identity = `${sourceKey}@${version}`;
      const definition = definitions.get(identity);
      return definition && isWorkspaceAnalysisSourceRuntimeEnabled(definition)
        ? sourceOwners.get(identity) ?? null
        : null;
    },
    canLoad(sourceKey: string, version: number) {
      const identity = `${sourceKey}@${version}`;
      const definition = definitions.get(identity);
      return Boolean(definition && isWorkspaceAnalysisSourceRuntimeEnabled(definition) && loaders.has(identity));
    },
    loadSource(request: WorkspaceAnalysisSourceLoadRequest) {
      if (
        request.requesterId !== context.requesterId
        || request.targetType !== context.targetType
        || request.targetId !== context.targetId
      ) {
        return Promise.reject(new Error("Workspace analysis source execution context mismatch"));
      }
      const identity = `${request.sourceKey}@${request.sourceVersion}`;
      const definition = definitions.get(identity);
      const ownerUnitId = sourceOwners.get(identity);
      const loader = loaders.get(identity);
      if (
        !definition
        || !isWorkspaceAnalysisSourceRuntimeEnabled(definition)
        || !loader
        || request.ownerUnitId !== ownerUnitId
      ) {
        return Promise.reject(new Error("Workspace analysis source executor is unavailable"));
      }
      return loader(request);
    },
  });
  authorizedSourceLookups.add(lookup);
  return lookup;
}

function sourceIdentity(source: WorkspaceAnalysisSourceDefinition) {
  return `${source.sourceKey}@${source.version}`;
}

function compareSources(left: WorkspaceAnalysisSourceDefinition, right: WorkspaceAnalysisSourceDefinition) {
  return left.sourceKey.localeCompare(right.sourceKey) || left.version - right.version;
}

function duplicateValues(values: readonly string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

const SCOPE_TYPES: readonly WorkspaceAnalysisSourceScopeType[] = ["personal", "department", "project"];

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
