import type {
  ImpactResolutionChoice,
  ImpactResolutionInput,
  MutationImpactResolution,
} from "../../mutation-impact-contract";
import {
  MutationImpactConfirmationError,
  MutationImpactConfigurationError,
  MutationImpactRequiredError,
} from "./errors";
import { executeImpactOperations } from "./executor";
import type { BuiltImpactPlan } from "./internal-types";
import { buildImpactPlanView, withSignedToken } from "./plan-view";
import { planImpactGraph } from "./planner";
import { validateImpactConfirmation } from "./token-validation";
import type {
  MutationImpactEngine,
  MutationImpactEngineOptions,
  MutationImpactExecuteRequest,
  MutationImpactLimits,
  MutationImpactPlanRequest,
  MutationImpactTokenClaims,
} from "./types";

const DEFAULT_LIMITS: MutationImpactLimits = {
  maxDepth: 8,
  maxNodes: 1_000,
  maxSamplesPerGroup: 3,
};
const DEFAULT_TOKEN_TTL_MS = 5 * 60 * 1_000;

function requiredText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new MutationImpactConfigurationError(`${label} 不能为空`);
  return normalized;
}

function positiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new MutationImpactConfigurationError(`${label} 必须是正整数`);
  }
  return value;
}

function validateOptions<TContext>(options: MutationImpactEngineOptions<TContext>) {
  const relationKeys = new Set<string>();
  for (const adapter of options.adapters) {
    const relationKey = requiredText(adapter.relationKey, "relationKey");
    requiredText(adapter.sourceEntity, `关系 ${relationKey} sourceEntity`);
    if (!adapter.intents.length) throw new MutationImpactConfigurationError(`关系 ${relationKey} 未声明 intent`);
    if (relationKeys.has(relationKey)) throw new MutationImpactConfigurationError(`关系 ${relationKey} 重复注册`);
    relationKeys.add(relationKey);
  }
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  positiveInteger(limits.maxDepth, "maxDepth");
  positiveInteger(limits.maxNodes, "maxNodes");
  positiveInteger(limits.maxSamplesPerGroup, "maxSamplesPerGroup");
  return {
    limits,
    tokenTtlMs: positiveInteger(options.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS, "tokenTtlMs"),
  };
}

function tokenClaims<TContext>(
  request: MutationImpactPlanRequest<TContext>,
  built: BuiltImpactPlan<TContext>,
  expiresAt: string,
): MutationImpactTokenClaims {
  return {
    version: 1,
    actorKey: request.actorKey,
    scopeKey: request.scopeKey,
    root: {
      entity: built.graph.root.entity,
      id: built.graph.root.id,
      intent: built.graph.root.intent,
      expectedVersion: built.graph.root.expectedVersion,
    },
    fingerprint: built.unsignedPlan.fingerprint,
    policyRevision: built.unsignedPlan.policyRevision,
    allowedResolutions: built.resolutionClaims,
    expiresAt,
  };
}

function selectedResolutions(choices: ReadonlyMap<string, MutationImpactResolution>) {
  return [...choices.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([relationKey, resolution]): ImpactResolutionChoice => ({
      relationKey,
      resolution,
    }));
}

function confirmationResolutionHints(input: ImpactResolutionInput) {
  const valid = new Set<MutationImpactResolution>(["unlink", "cascade", "transition_related"]);
  return new Map(input.resolutions.flatMap(({ relationKey, resolution }) => (
    typeof relationKey === "string" && valid.has(resolution) ? [[relationKey, resolution] as const] : []
  )));
}

function selectsDualCascade<TContext>(
  built: BuiltImpactPlan<TContext>,
  choices: ReadonlyMap<string, MutationImpactResolution>,
) {
  return built.graph.edges.some((edge) => (
    edge.policy === "confirm_unlink_or_cascade"
    && choices.get(edge.adapter.relationKey) === "cascade"
  ));
}

export function createMutationImpactEngine<TContext>(
  options: MutationImpactEngineOptions<TContext>,
): MutationImpactEngine<TContext> {
  const config = validateOptions(options);
  const now = options.now ?? (() => new Date());

  const auditAttempt = async (input: Parameters<NonNullable<typeof options.auditAttempt>>[0]) => {
    await options.auditAttempt?.(input);
  };

  const build = async (
    request: MutationImpactPlanRequest<TContext>,
    recursiveResolutions: ReadonlyMap<string, MutationImpactResolution> = new Map(),
  ) => {
    const actorKey = requiredText(request.actorKey, "actorKey");
    const scopeKey = requiredText(request.scopeKey, "scopeKey");
    const policyRevision = requiredText(await options.getPolicyRevision(request.context), "policyRevision");
    const graph = await planImpactGraph(
      { ...request, actorKey, scopeKey },
      options.adapters,
      config.limits,
      async ({ context, relationKey, intent }) => options.resolvePolicy({ context, relationKey, intent }),
      recursiveResolutions,
    );
    const built = buildImpactPlanView(graph, policyRevision, config.limits);
    const issuedAt = now();
    if (!Number.isFinite(issuedAt.getTime())) throw new MutationImpactConfigurationError("now() 返回了无效时间");
    const expiresAt = new Date(issuedAt.getTime() + config.tokenTtlMs).toISOString();
    const normalizedRequest = { ...request, actorKey, scopeKey, root: graph.root };
    const token = await options.tokenCodec.seal(tokenClaims(normalizedRequest, built, expiresAt));
    requiredText(token, "impact token");
    return {
      built,
      normalizedRequest,
      impact: withSignedToken(built, token, expiresAt),
      plannedAt: issuedAt,
    };
  };

  return {
    async plan(request) {
      return (await build(request)).impact;
    },

    async execute<TResult>(request: MutationImpactExecuteRequest<TContext, TResult>) {
      let current: Awaited<ReturnType<typeof build>>;
      try {
        current = await build(request);
      } catch (error) {
        await auditAttempt({
          context: request.context,
          actorKey: request.actorKey,
          scopeKey: request.scopeKey,
          root: request.root,
          status: "failed",
          resultCode: error instanceof MutationImpactConfigurationError ? error.code : "MUTATION_IMPACT_PLAN_FAILED",
          resultMessage: error instanceof Error ? error.message : "变更影响规划失败",
        });
        throw error;
      }
      let choices = new Map<string, MutationImpactResolution>();
      if (request.confirmation) {
        const validateCandidate = (candidate: typeof current) => validateImpactConfirmation({
          tokenCodec: options.tokenCodec,
          confirmation: request.confirmation as ImpactResolutionInput,
          actorKey: candidate.normalizedRequest.actorKey,
          scopeKey: candidate.normalizedRequest.scopeKey,
          root: candidate.built.graph.root,
          currentImpact: candidate.impact,
          currentClaims: candidate.built.resolutionClaims,
          now: candidate.plannedAt,
        });
        try {
          choices = await validateCandidate(current);
        } catch (initialError) {
          const hints = confirmationResolutionHints(request.confirmation);
          if (selectsDualCascade(current.built, hints)) {
            const branched = await build(request, hints);
            try {
              choices = await validateCandidate(branched);
              current = branched;
            } catch (branchedError) {
              await auditConfirmationError(branchedError, branched);
              throw branchedError;
            }
          } else {
            await auditConfirmationError(initialError, current);
            throw initialError;
          }
        }

        if (selectsDualCascade(current.built, choices)) {
          const branched = await build(request, choices);
          if (branched.impact.fingerprint !== current.impact.fingerprint) {
            current = branched;
            const blocked = current.impact.blockers.length > 0;
            const message = blocked
              ? current.impact.blockers[0]?.reason ?? "级联分支存在未处理影响"
              : "级联分支发现更深层影响，请按刷新后的清单再次确认";
            await auditAttempt({
              context: request.context,
              actorKey: current.normalizedRequest.actorKey,
              scopeKey: current.normalizedRequest.scopeKey,
              root: current.built.graph.root,
              plan: current.impact,
              status: blocked ? "blocked" : "confirmation_required",
              resultCode: blocked
                ? "MUTATION_IMPACT_BLOCKED"
                : "MUTATION_IMPACT_BRANCH_CONFIRMATION_REQUIRED",
              resultMessage: message,
            });
            throw new MutationImpactRequiredError(
              message,
              current.impact,
              blocked ? "blocked" : "confirmation_required",
            );
          }
          current = branched;
        }

        async function auditConfirmationError(error: unknown, candidate: typeof current) {
          const stale = error instanceof MutationImpactConfirmationError
            && error.code === "MUTATION_IMPACT_CONFIRMATION_STALE";
          await auditAttempt({
            context: request.context,
            actorKey: candidate.normalizedRequest.actorKey,
            scopeKey: candidate.normalizedRequest.scopeKey,
            root: candidate.built.graph.root,
            plan: candidate.impact,
            status: stale ? "stale_confirmation" : "failed",
            resultCode: error instanceof MutationImpactConfirmationError
              ? error.code
              : "MUTATION_IMPACT_CONFIRMATION_FAILED",
            resultMessage: error instanceof Error ? error.message : "变更影响确认失败",
          });
        }
      }

      if (current.impact.blockers.length) {
        await auditAttempt({
          context: request.context,
          actorKey: current.normalizedRequest.actorKey,
          scopeKey: current.normalizedRequest.scopeKey,
          root: current.built.graph.root,
          plan: current.impact,
          status: "blocked",
          resultCode: "MUTATION_IMPACT_BLOCKED",
          resultMessage: current.impact.blockers[0]?.reason ?? "该变更仍有未处理的关联影响",
        });
        throw new MutationImpactRequiredError(
          current.impact.blockers[0]?.reason ?? "该变更仍有未处理的关联影响",
          current.impact,
          "blocked",
        );
      }
      if (current.impact.confirmableEffects.length && !request.confirmation) {
        await auditAttempt({
          context: request.context,
          actorKey: current.normalizedRequest.actorKey,
          scopeKey: current.normalizedRequest.scopeKey,
          root: current.built.graph.root,
          plan: current.impact,
          status: "confirmation_required",
          resultCode: "MUTATION_IMPACT_CONFIRMATION_REQUIRED",
          resultMessage: "该变更需要确认关联对象的处理方式",
        });
        throw new MutationImpactRequiredError(
          "该变更需要确认关联对象的处理方式",
          current.impact,
          "confirmation_required",
        );
      }

      try {
        const normalizedExecution = { ...request, ...current.normalizedRequest };
        const executed = await executeImpactOperations({
          request: normalizedExecution,
          edges: current.built.graph.edges,
          choices,
        });
        await options.audit?.({
          context: request.context,
          actorKey: current.normalizedRequest.actorKey,
          scopeKey: current.normalizedRequest.scopeKey,
          root: current.built.graph.root,
          plan: current.impact,
          selectedResolutions: selectedResolutions(choices),
          executedEffects: executed.auditEffects,
        });
        return executed.result;
      } catch (error) {
        await auditAttempt({
          context: request.context,
          actorKey: current.normalizedRequest.actorKey,
          scopeKey: current.normalizedRequest.scopeKey,
          root: current.built.graph.root,
          plan: current.impact,
          status: "failed",
          resultCode: "MUTATION_IMPACT_EXECUTION_FAILED",
          resultMessage: error instanceof Error ? error.message : "变更影响执行失败",
        });
        throw error;
      }
    },
  };
}
