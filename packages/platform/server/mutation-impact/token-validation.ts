import type {
  ImpactPlan,
  ImpactResolutionInput,
  MutationImpactResolution,
  MutationImpactRoot,
  MutationIntent,
} from "../../mutation-impact-contract";
import { MutationImpactConfirmationError } from "./errors";
import type {
  MutationImpactTokenClaims,
  MutationImpactTokenCodec,
  MutationImpactTokenResolutionClaim,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const INTENTS = new Set<MutationIntent>(["delete", "archive", "restore", "reparent", "unlink", "transition"]);
const RESOLUTIONS = new Set<MutationImpactResolution>(["unlink", "cascade", "transition_related"]);

function isIntent(value: unknown): value is MutationIntent {
  return typeof value === "string" && INTENTS.has(value as MutationIntent);
}

function isResolution(value: unknown): value is MutationImpactResolution {
  return typeof value === "string" && RESOLUTIONS.has(value as MutationImpactResolution);
}

function parseClaims(value: unknown, impact: ImpactPlan): MutationImpactTokenClaims {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.root) || !Array.isArray(value.allowedResolutions)) {
    throw new MutationImpactConfirmationError(
      "MUTATION_IMPACT_CONFIRMATION_INVALID",
      "影响确认 token 无效",
      impact,
    );
  }
  const resolutions = value.allowedResolutions.map((entry) => {
    if (
      !isRecord(entry)
      || typeof entry.relationKey !== "string"
      || !Array.isArray(entry.resolutions)
      || !entry.resolutions.every(isResolution)
    ) {
      throw new MutationImpactConfirmationError(
        "MUTATION_IMPACT_CONFIRMATION_INVALID",
        "影响确认 token 的处理范围无效",
        impact,
      );
    }
    return {
      relationKey: entry.relationKey,
      resolutions: entry.resolutions,
    };
  });
  if (!isIntent(value.root.intent)) {
    throw new MutationImpactConfirmationError(
      "MUTATION_IMPACT_CONFIRMATION_INVALID",
      "影响确认 token 的 intent 无效",
      impact,
    );
  }
  return {
    version: 1,
    actorKey: String(value.actorKey ?? ""),
    scopeKey: String(value.scopeKey ?? ""),
    root: {
      entity: String(value.root.entity ?? ""),
      id: String(value.root.id ?? ""),
      intent: value.root.intent,
      ...(value.root.expectedVersion === undefined ? {} : { expectedVersion: value.root.expectedVersion as string | number }),
    },
    fingerprint: String(value.fingerprint ?? ""),
    policyRevision: String(value.policyRevision ?? ""),
    allowedResolutions: resolutions,
    expiresAt: String(value.expiresAt ?? ""),
  };
}

function sameRoot(
  left: MutationImpactTokenClaims["root"],
  right: MutationImpactRoot,
) {
  return left.entity === right.entity
    && left.id === right.id
    && left.intent === right.intent
    && left.expectedVersion === right.expectedVersion;
}

function normalizedClaims(claims: readonly MutationImpactTokenResolutionClaim[]) {
  return claims.map((claim) => ({
    relationKey: claim.relationKey,
    resolutions: [...claim.resolutions].sort(),
  })).sort((left, right) => left.relationKey < right.relationKey ? -1 : left.relationKey > right.relationKey ? 1 : 0);
}

function claimsEqual(
  left: readonly MutationImpactTokenResolutionClaim[],
  right: readonly MutationImpactTokenResolutionClaim[],
) {
  return JSON.stringify(normalizedClaims(left)) === JSON.stringify(normalizedClaims(right));
}

function validateChoices(
  confirmation: ImpactResolutionInput,
  allowedClaims: readonly MutationImpactTokenResolutionClaim[],
  impact: ImpactPlan,
) {
  const choices = new Map<string, MutationImpactResolution>();
  for (const choice of confirmation.resolutions) {
    if (choices.has(choice.relationKey)) {
      throw new MutationImpactConfirmationError(
        "MUTATION_IMPACT_CONFIRMATION_INVALID",
        `关系 ${choice.relationKey} 重复选择了处理方式`,
        impact,
      );
    }
    choices.set(choice.relationKey, choice.resolution);
  }
  if (choices.size !== allowedClaims.length) {
    throw new MutationImpactConfirmationError(
      "MUTATION_IMPACT_CONFIRMATION_INVALID",
      "影响处理选择不完整或包含额外关系",
      impact,
    );
  }
  for (const claim of allowedClaims) {
    const selected = choices.get(claim.relationKey);
    if (!selected || !claim.resolutions.includes(selected)) {
      throw new MutationImpactConfirmationError(
        "MUTATION_IMPACT_CONFIRMATION_INVALID",
        `关系 ${claim.relationKey} 不允许选择 ${selected ?? "空"}`,
        impact,
      );
    }
  }
  return new Map(confirmation.resolutions.map((choice) => [choice.relationKey, choice.resolution]));
}

export async function validateImpactConfirmation(input: {
  tokenCodec: MutationImpactTokenCodec;
  confirmation: ImpactResolutionInput;
  actorKey: string;
  scopeKey: string;
  root: MutationImpactRoot;
  currentImpact: ImpactPlan;
  currentClaims: readonly MutationImpactTokenResolutionClaim[];
  now: Date;
}) {
  let opened: unknown;
  try {
    opened = await input.tokenCodec.open(input.confirmation.impactToken);
  } catch {
    throw new MutationImpactConfirmationError(
      "MUTATION_IMPACT_CONFIRMATION_INVALID",
      "影响确认 token 无效",
      input.currentImpact,
    );
  }
  const claims = parseClaims(opened, input.currentImpact);
  if (claims.actorKey !== input.actorKey || claims.scopeKey !== input.scopeKey || !sameRoot(claims.root, input.root)) {
    throw new MutationImpactConfirmationError(
      "MUTATION_IMPACT_CONFIRMATION_INVALID",
      "影响确认 token 与当前操作者、作用域或目标不匹配",
      input.currentImpact,
    );
  }
  const expiresAt = Date.parse(claims.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= input.now.getTime()) {
    throw new MutationImpactConfirmationError(
      "MUTATION_IMPACT_CONFIRMATION_STALE",
      "影响确认已过期，请刷新后重新确认",
      input.currentImpact,
    );
  }
  if (
    claims.policyRevision !== input.currentImpact.policyRevision
    || claims.fingerprint !== input.currentImpact.fingerprint
    || !claimsEqual(claims.allowedResolutions, input.currentClaims)
  ) {
    throw new MutationImpactConfirmationError(
      "MUTATION_IMPACT_CONFIRMATION_STALE",
      "关联影响或治理策略已变化，请刷新后重新确认",
      input.currentImpact,
    );
  }
  return validateChoices(input.confirmation, input.currentClaims, input.currentImpact);
}
