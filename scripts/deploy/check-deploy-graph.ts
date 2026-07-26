#!/usr/bin/env node

import { resolveDeployGraph, summarizeDeployGraph } from "./deploy-graph";

function main(argv = process.argv.slice(2)) {
  const graph = resolveDeployGraph();
  if (argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(graph, null, 2)}\n`);
    return;
  }
  const summary = summarizeDeployGraph(graph);
  process.stdout.write(
    `Deploy graph contract passed: ${summary.deployUnitCount} units, `
      + `${summary.plannedUnitCount} planned, ${summary.candidateUnitCount} candidate, `
      + `${summary.activeUnitCount} active, `
      + `${summary.contributorEdgeCount} cross-unit contributor edge(s).\n`,
  );
  if (summary.frozenUnitIds.length > 0) {
    process.stdout.write(`Frozen final handoff: ${summary.frozenUnitIds.join(", ")}.\n`);
  }
}

main();
