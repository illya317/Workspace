import type { MutationImpactPolicy, MutationImpactRoot, MutationIntent } from "../../mutation-impact-contract";
import { MutationImpactConfigurationError, MutationImpactLimitError } from "./errors";
import type { PlannedImpactEdge, PlannedImpactGraph } from "./internal-types";
import type {
  MutationImpactAdapter,
  MutationImpactLimits,
  MutationImpactNode,
  MutationImpactPlanRequest,
  MutationImpactRecord,
} from "./types";

const RECURSIVE_POLICIES = new Set<MutationImpactPolicy>([
  "confirm_cascade",
  "auto_cascade_owned",
  "confirm_transition_related",
]);

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function nodeKey(node: Pick<MutationImpactNode, "entity" | "id" | "intent">) {
  return `${node.entity}\u0000${node.id}\u0000${node.intent}`;
}

function requiredText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new MutationImpactConfigurationError(`${label} 不能为空`);
  return normalized;
}

function inferIntent(policy: MutationImpactPolicy, currentIntent: MutationIntent, record: MutationImpactRecord) {
  if (record.intent) return record.intent;
  return policy === "confirm_transition_related" ? "transition" : currentIntent;
}

function normalizeRecord(
  policy: MutationImpactPolicy,
  currentIntent: MutationIntent,
  record: MutationImpactRecord,
): { record: MutationImpactRecord; target: MutationImpactNode } {
  const entity = requiredText(record.entity, "影响对象 entity");
  const id = requiredText(record.id, "影响对象 id");
  const label = requiredText(record.label, "影响对象 label");
  const intent = inferIntent(policy, currentIntent, record);
  return {
    record: { ...record, entity, id, label, intent },
    target: { entity, id, label, intent, expectedVersion: record.expectedVersion },
  };
}

function assertResolutionAdapter<TContext>(adapter: MutationImpactAdapter<TContext>, policy: MutationImpactPolicy) {
  const missing =
    policy === "confirm_unlink" ? !adapter.unlink
      : policy === "confirm_cascade" || policy === "auto_cascade_owned" ? !adapter.cascade
        : policy === "confirm_transition_related" ? !adapter.transition
          : policy === "confirm_unlink_or_cascade" ? !adapter.unlink || !adapter.cascade
            : false;
  if (missing) {
    throw new MutationImpactConfigurationError(
      `关系 ${adapter.relationKey} 的策略 ${policy} 缺少对应执行 adapter`,
    );
  }
}

function defaultPermissionRequirement(policy: MutationImpactPolicy) {
  return policy === "confirm_unlink"
    || policy === "confirm_cascade"
    || policy === "confirm_unlink_or_cascade"
    || policy === "confirm_transition_related";
}

function sortAndDedupeRecords(
  policy: MutationImpactPolicy,
  currentIntent: MutationIntent,
  records: readonly MutationImpactRecord[],
) {
  const normalized = records.map((record) => normalizeRecord(policy, currentIntent, record));
  normalized.sort((left, right) => compareText(nodeKey(left.target), nodeKey(right.target)));
  const deduped = new Map<string, (typeof normalized)[number]>();
  for (const entry of normalized) {
    const key = nodeKey(entry.target);
    const existing = deduped.get(key);
    if (existing && existing.target.expectedVersion !== entry.target.expectedVersion) {
      throw new MutationImpactConfigurationError(`影响对象 ${entry.target.entity}:${entry.target.id} 版本不一致`);
    }
    if (!existing) deduped.set(key, entry);
  }
  return [...deduped.values()];
}

export async function planImpactGraph<TContext>(
  request: MutationImpactPlanRequest<TContext>,
  adapters: readonly MutationImpactAdapter<TContext>[],
  limits: MutationImpactLimits,
  resolvePolicy: (input: {
    context: TContext;
    relationKey: string;
    intent: MutationIntent;
  }) => Promise<MutationImpactPolicy | null>,
  recursiveResolutions: ReadonlyMap<string, "unlink" | "cascade" | "transition_related"> = new Map(),
): Promise<PlannedImpactGraph<TContext>> {
  const root: MutationImpactRoot = {
    ...request.root,
    entity: requiredText(request.root.entity, "root entity"),
    id: requiredText(request.root.id, "root id"),
    label: requiredText(request.root.label, "root label"),
  };
  const edges: PlannedImpactEdge<TContext>[] = [];
  const discovered = new Set([nodeKey(root)]);
  const expanded = new Set([nodeKey(root)]);
  const sortedAdapters = [...adapters].sort((left, right) => compareText(left.relationKey, right.relationKey));

  const walk = async (current: MutationImpactNode, depth: number, relationPath: readonly string[]): Promise<void> => {
    const applicable = sortedAdapters.filter(
      (adapter) => adapter.sourceEntity === current.entity && adapter.intents.includes(current.intent),
    );
    for (const adapter of applicable) {
      const policy = await resolvePolicy({
        context: request.context,
        relationKey: adapter.relationKey,
        intent: current.intent,
      });
      if (!policy) {
        throw new MutationImpactConfigurationError(
          `关系 ${adapter.relationKey} 未声明 ${current.intent} 运行时策略，已阻断变更`,
        );
      }
      const inspected = await adapter.inspect({
        context: request.context,
        actorKey: request.actorKey,
        scopeKey: request.scopeKey,
        root,
        current,
        depth,
        relationPath,
      });
      if (!inspected?.records.length) continue;
      if (inspected.policy && inspected.policy !== policy) {
        throw new MutationImpactConfigurationError(
          `关系 ${adapter.relationKey} 的 adapter 策略 ${inspected.policy} 与目录策略 ${policy} 不一致`,
        );
      }
      assertResolutionAdapter(adapter, policy);
      const reason = requiredText(inspected.reason, `关系 ${adapter.relationKey} reason`);
      const records = sortAndDedupeRecords(policy, current.intent, inspected.records);

      for (const entry of records) {
        const targetDepth = depth + 1;
        if (targetDepth > limits.maxDepth) {
          throw new MutationImpactLimitError(`变更影响深度超过上限 ${limits.maxDepth}`);
        }
        const targetKey = nodeKey(entry.target);
        if (!discovered.has(targetKey)) {
          discovered.add(targetKey);
          if (discovered.size > limits.maxNodes) {
            throw new MutationImpactLimitError(`变更影响节点数超过上限 ${limits.maxNodes}`);
          }
        }
        const nextPath = [...relationPath, adapter.relationKey];
        edges.push({
          adapter,
          source: current,
          target: entry.target,
          record: entry.record,
          policy,
          reason,
          recommendation: inspected.recommendation?.trim() || undefined,
          requiresPerItemPermission:
            inspected.requiresPerItemPermission ?? defaultPermissionRequirement(policy),
          depth: targetDepth,
          relationPath: nextPath,
        });

        const recursivelySelected = policy === "confirm_unlink_or_cascade"
          ? recursiveResolutions.get(adapter.relationKey) === "cascade"
          : RECURSIVE_POLICIES.has(policy);
        if (recursivelySelected && !expanded.has(targetKey)) {
          expanded.add(targetKey);
          await walk(entry.target, targetDepth, nextPath);
        }
      }
    }
  };

  await walk(root, 0, []);
  return { root, edges };
}
