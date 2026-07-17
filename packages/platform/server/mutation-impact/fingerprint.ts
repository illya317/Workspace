import { createHash } from "node:crypto";

import type { PlannedImpactGraph } from "./internal-types";

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}

export function digestStableValue(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

export function fingerprintGraph<TContext>(graph: PlannedImpactGraph<TContext>) {
  const effects = graph.edges
    .map((edge) => ({
      relationKey: edge.adapter.relationKey,
      policy: edge.policy,
      source: {
        entity: edge.source.entity,
        id: edge.source.id,
        intent: edge.source.intent,
        expectedVersion: edge.source.expectedVersion,
      },
      target: {
        entity: edge.target.entity,
        id: edge.target.id,
        intent: edge.target.intent,
        expectedVersion: edge.target.expectedVersion,
      },
      relationPath: edge.relationPath,
    }))
    .sort((left, right) => compareText(JSON.stringify(left), JSON.stringify(right)));

  return digestStableValue({
    root: {
      entity: graph.root.entity,
      id: graph.root.id,
      intent: graph.root.intent,
      expectedVersion: graph.root.expectedVersion,
    },
    effects,
  });
}
