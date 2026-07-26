import type { MutationImpactResolution } from "../../mutation-impact-contract";
import type { PlannedImpactEdge, SelectedImpactOperation } from "./internal-types";
import { nodeKey } from "./planner";
import type {
  MutationImpactAdapterExecution,
  MutationImpactAuditEffect,
  MutationImpactExecuteRequest,
} from "./types";

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function selectedResolution<TContext>(
  edge: PlannedImpactEdge<TContext>,
  choices: ReadonlyMap<string, MutationImpactResolution>,
): MutationImpactResolution | null {
  switch (edge.policy) {
    case "auto_cascade_owned":
      return "cascade";
    case "confirm_unlink":
    case "confirm_cascade":
    case "confirm_unlink_or_cascade":
    case "confirm_transition_related":
      return choices.get(edge.adapter.relationKey) ?? null;
    default:
      return null;
  }
}

function operationKey<TContext>(operation: SelectedImpactOperation<TContext>) {
  if (operation.resolution === "unlink") {
    return [
      operation.resolution,
      operation.edge.adapter.relationKey,
      nodeKey(operation.edge.source),
      nodeKey(operation.edge.target),
    ].join("\u0000");
  }
  return [operation.resolution, nodeKey(operation.edge.target)].join("\u0000");
}

function collectOperations<TContext>(
  edges: readonly PlannedImpactEdge<TContext>[],
  choices: ReadonlyMap<string, MutationImpactResolution>,
) {
  const operations = edges
    .map((edge) => ({ edge, resolution: selectedResolution(edge, choices) }))
    .filter((entry): entry is SelectedImpactOperation<TContext> => Boolean(entry.resolution));
  operations.sort((left, right) => {
    const leftKey = `${left.edge.depth}:${left.edge.adapter.relationKey}:${nodeKey(left.edge.source)}:${nodeKey(left.edge.target)}`;
    const rightKey = `${right.edge.depth}:${right.edge.adapter.relationKey}:${nodeKey(right.edge.source)}:${nodeKey(right.edge.target)}`;
    return compareText(leftKey, rightKey);
  });
  const deduped = new Map<string, SelectedImpactOperation<TContext>>();
  for (const operation of operations) {
    const key = operationKey(operation);
    if (!deduped.has(key)) deduped.set(key, operation);
  }
  return [...deduped.values()];
}

interface OperationBatch<TContext> {
  resolution: MutationImpactResolution;
  relationKey: string;
  depth: number;
  executionPriority: number;
  operations: SelectedImpactOperation<TContext>[];
}

function batchOperations<TContext>(
  operations: readonly SelectedImpactOperation<TContext>[],
  direction: "ascending" | "descending",
) {
  const batches = new Map<string, OperationBatch<TContext>>();
  for (const operation of operations) {
    const key = `${operation.resolution}\u0000${operation.edge.adapter.relationKey}\u0000${operation.edge.depth}`;
    const batch = batches.get(key) ?? {
      resolution: operation.resolution,
      relationKey: operation.edge.adapter.relationKey,
      depth: operation.edge.depth,
      executionPriority: operation.edge.adapter.executionPriority ?? 0,
      operations: [],
    };
    batch.operations.push(operation);
    batches.set(key, batch);
  }
  return [...batches.values()].sort((left, right) => {
    const depthOrder = direction === "ascending" ? left.depth - right.depth : right.depth - left.depth;
    if (depthOrder) return depthOrder;
    const priorityOrder = left.executionPriority - right.executionPriority;
    if (priorityOrder) return priorityOrder;
    const resolutionOrder = compareText(left.resolution, right.resolution);
    return resolutionOrder || compareText(left.relationKey, right.relationKey);
  });
}

async function runBatches<TContext>(
  request: MutationImpactExecuteRequest<TContext, unknown>,
  batches: readonly OperationBatch<TContext>[],
  auditEffects: MutationImpactAuditEffect[],
) {
  for (const batch of batches) {
    const edge = batch.operations[0]?.edge;
    if (!edge) continue;
    const input: MutationImpactAdapterExecution<TContext> = {
      context: request.context,
      actorKey: request.actorKey,
      scopeKey: request.scopeKey,
      root: request.root,
      relationKey: batch.relationKey,
      resolution: batch.resolution,
      effects: batch.operations.map((operation) => ({
        source: operation.edge.source,
        target: operation.edge.target,
        record: operation.edge.record,
        depth: operation.edge.depth,
        relationPath: operation.edge.relationPath,
      })),
    };
    if (batch.resolution === "unlink") await edge.adapter.unlink?.(input);
    else if (batch.resolution === "cascade") await edge.adapter.cascade?.(input);
    else await edge.adapter.transition?.(input);
    auditEffects.push(...batch.operations.map((operation) => ({
      relationKey: operation.edge.adapter.relationKey,
      resolution: operation.resolution,
      entity: operation.edge.target.entity,
      id: operation.edge.target.id,
      beforeRevision: operation.edge.target.expectedVersion,
      depth: operation.edge.depth,
      relationPath: operation.edge.relationPath,
    })));
  }
}

export async function executeImpactOperations<TContext, TResult>(input: {
  request: MutationImpactExecuteRequest<TContext, TResult>;
  edges: readonly PlannedImpactEdge<TContext>[];
  choices: ReadonlyMap<string, MutationImpactResolution>;
}) {
  const operations = collectOperations(input.edges, input.choices).filter((operation) => {
    if (operation.resolution === "unlink") return true;
    return operation.edge.target.entity !== input.request.root.entity
      || operation.edge.target.id !== input.request.root.id;
  });
  const unlink = operations.filter((operation) => operation.resolution === "unlink");
  const related = operations.filter((operation) => operation.resolution !== "unlink");
  const auditEffects: MutationImpactAuditEffect[] = [];

  await runBatches(input.request, batchOperations(unlink, "descending"), auditEffects);
  if (input.request.root.intent === "restore") {
    const result = await input.request.commitRoot(input.request.context);
    await runBatches(input.request, batchOperations(related, "ascending"), auditEffects);
    return { result, auditEffects };
  }
  await runBatches(input.request, batchOperations(related, "descending"), auditEffects);
  const result = await input.request.commitRoot(input.request.context);
  return { result, auditEffects };
}
