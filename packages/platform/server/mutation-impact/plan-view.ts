import type {
  ImpactPlan,
  MutationImpactAllowedResolution,
  MutationImpactGroup,
  MutationImpactPolicy,
  MutationImpactResolution,
  MutationImpactTotals,
} from "../../mutation-impact-contract";
import { MutationImpactConfigurationError } from "./errors";
import { digestStableValue, fingerprintGraph } from "./fingerprint";
import type { BuiltImpactPlan, PlannedImpactEdge, PlannedImpactGraph, UnsignedImpactPlan } from "./internal-types";
import { nodeKey } from "./planner";
import type { MutationImpactLimits, MutationImpactTokenResolutionClaim } from "./types";

const RESOLUTION_ORDER: readonly MutationImpactResolution[] = ["unlink", "cascade", "transition_related"];

interface MutableGroup<TContext> {
  relationKey: string;
  sourceEntity: string;
  policy: MutationImpactPolicy;
  edges: PlannedImpactEdge<TContext>[];
  targets: Map<string, PlannedImpactEdge<TContext>>;
  reasons: Set<string>;
  recommendations: Set<string>;
  requiresPerItemPermission: boolean;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function allowedForPolicy(policy: MutationImpactPolicy): readonly MutationImpactResolution[] {
  switch (policy) {
    case "confirm_unlink":
      return ["unlink"];
    case "confirm_cascade":
      return ["cascade"];
    case "confirm_unlink_or_cascade":
      return ["unlink", "cascade"];
    case "confirm_transition_related":
      return ["transition_related"];
    default:
      return [];
  }
}

function groupCategory(policy: MutationImpactPolicy) {
  if (policy === "block") return "blockers" as const;
  if (allowedForPolicy(policy).length) return "confirmableEffects" as const;
  return "informationalEffects" as const;
}

function makeGroup<TContext>(
  group: MutableGroup<TContext>,
  expandedNodes: ReadonlySet<string>,
  maxSamples: number,
): MutationImpactGroup {
  const targets = [...group.targets.values()].sort((left, right) => compareText(nodeKey(left.target), nodeKey(right.target)));
  const targetKeys = targets.map((edge) => nodeKey(edge.target));
  return {
    relationKey: group.relationKey,
    sourceEntity: group.sourceEntity,
    targetEntities: [...new Set(targets.map((edge) => edge.target.entity))].sort(compareText),
    policy: group.policy,
    count: targets.length,
    samples: targets.slice(0, maxSamples).map((edge) => ({
      entity: edge.target.entity,
      id: edge.target.id,
      label: edge.target.label,
    })),
    idsDigest: digestStableValue(targetKeys),
    pathCount: group.edges.length,
    reason: [...group.reasons].sort(compareText).join("；"),
    recommendation: [...group.recommendations].sort(compareText).join("；") || undefined,
    requiresPerItemPermission: group.requiresPerItemPermission,
    hasNestedImpact: targets.some((edge) => expandedNodes.has(nodeKey(edge.target))),
    allowedResolutions: allowedForPolicy(group.policy),
  };
}

function collectGroups<TContext>(graph: PlannedImpactGraph<TContext>, maxSamples: number) {
  const mutable = new Map<string, MutableGroup<TContext>>();
  const expandedNodes = new Set(graph.edges.map((edge) => nodeKey(edge.source)));
  for (const edge of graph.edges) {
    const relationKey = edge.adapter.relationKey;
    const existing = mutable.get(relationKey);
    if (existing && (existing.policy !== edge.policy || existing.sourceEntity !== edge.adapter.sourceEntity)) {
      throw new MutationImpactConfigurationError(
        `关系 ${relationKey} 在同一影响计划中返回了不一致的策略或来源实体`,
      );
    }
    const created: MutableGroup<TContext> = {
      relationKey,
      sourceEntity: edge.adapter.sourceEntity,
      policy: edge.policy,
      edges: [],
      targets: new Map(),
      reasons: new Set(),
      recommendations: new Set(),
      requiresPerItemPermission: false,
    };
    const group = existing ?? created;
    group.edges.push(edge);
    group.targets.set(nodeKey(edge.target), edge);
    group.reasons.add(edge.reason);
    if (edge.recommendation) group.recommendations.add(edge.recommendation);
    group.requiresPerItemPermission ||= edge.requiresPerItemPermission;
    mutable.set(relationKey, group);
  }

  const result = {
    blockers: [] as MutationImpactGroup[],
    confirmableEffects: [] as MutationImpactGroup[],
    informationalEffects: [] as MutationImpactGroup[],
  };
  for (const group of [...mutable.values()].sort((left, right) => compareText(left.relationKey, right.relationKey))) {
    const rendered = makeGroup(group, expandedNodes, maxSamples);
    const category = groupCategory(group.policy);
    if (category === "blockers") result.blockers.push(rendered);
    else if (category === "confirmableEffects") result.confirmableEffects.push(rendered);
    else result.informationalEffects.push(rendered);
  }
  return result;
}

function collectTotals<TContext>(graph: PlannedImpactGraph<TContext>): MutationImpactTotals {
  const affected = new Set<string>();
  const blocked = new Set<string>();
  const unlink = new Set<string>();
  const cascade = new Set<string>();
  const transition = new Set<string>();
  const retained = new Set<string>();

  for (const edge of graph.edges) {
    const key = `${edge.target.entity}\u0000${edge.target.id}`;
    const allowed = allowedForPolicy(edge.policy);
    affected.add(key);
    if (edge.policy === "block") blocked.add(key);
    if (allowed.includes("unlink")) unlink.add(key);
    if (allowed.includes("cascade") || edge.policy === "auto_cascade_owned") cascade.add(key);
    if (allowed.includes("transition_related")) transition.add(key);
    if (edge.policy === "retain") retained.add(key);
  }
  return {
    affected: affected.size,
    unlink: unlink.size,
    cascade: cascade.size,
    transition: transition.size,
    blocked: blocked.size,
    retained: retained.size,
  };
}

function resolutionClaims(groups: ReturnType<typeof collectGroups>): readonly MutationImpactTokenResolutionClaim[] {
  if (groups.blockers.length) return [];
  return groups.confirmableEffects.map((group) => ({
    relationKey: group.relationKey,
    resolutions: group.allowedResolutions,
  }));
}

function globalResolutions(
  blockers: readonly MutationImpactGroup[],
  claims: readonly MutationImpactTokenResolutionClaim[],
): readonly MutationImpactAllowedResolution[] {
  if (blockers.length) return ["return"];
  const allowed = new Set(claims.flatMap((claim) => claim.resolutions));
  return ["return", ...RESOLUTION_ORDER.filter((resolution) => allowed.has(resolution))];
}

export function buildImpactPlanView<TContext>(
  graph: PlannedImpactGraph<TContext>,
  policyRevision: string,
  limits: MutationImpactLimits,
): BuiltImpactPlan<TContext> {
  const groups = collectGroups(graph, limits.maxSamplesPerGroup);
  const claims = resolutionClaims(groups);
  const unsignedPlan: UnsignedImpactPlan = {
    fingerprint: fingerprintGraph(graph),
    policyRevision,
    root: graph.root,
    blockers: groups.blockers,
    confirmableEffects: groups.confirmableEffects,
    informationalEffects: groups.informationalEffects,
    allowedResolutions: globalResolutions(groups.blockers, claims),
    totals: collectTotals(graph),
  };
  return { graph, unsignedPlan, resolutionClaims: claims };
}

export function withSignedToken<TContext>(
  built: BuiltImpactPlan<TContext>,
  token: string,
  expiresAt: string,
): ImpactPlan {
  return { ...built.unsignedPlan, token, expiresAt };
}
