import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, sha256 } from "./deploy-unit-provenance.mjs";

function fail(message) {
  throw new Error(message);
}

function readJson(file, label) {
  let value;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    fail(`${label} is not valid JSON: ${file}`);
  }
  return value;
}

function signedInternalRpcEdges(graph) {
  if (!Array.isArray(graph?.units)) fail("deploy graph units are invalid");
  const unitIds = new Set(graph.units.map((unit) => unit?.id));
  const edges = [];
  for (const unit of graph.units) {
    if (typeof unit?.id !== "string" || !Array.isArray(unit.runtimeDependencies)) {
      fail("deploy graph signed internal RPC contract is invalid");
    }
    for (const dependency of unit.runtimeDependencies) {
      if (dependency?.protocol !== "signed-internal-rpc") continue;
      if (typeof dependency.unitId !== "string" || !unitIds.has(dependency.unitId)) {
        fail(`signed internal RPC dependency target is invalid for ${unit.id}`);
      }
      edges.push({ callerUnitId: unit.id, targetUnitId: dependency.unitId });
    }
  }
  return edges;
}

export function unitParticipatesInSignedInternalRpc(graph, unitId) {
  return signedInternalRpcEdges(graph).some(
    (edge) => edge.callerUnitId === unitId || edge.targetUnitId === unitId,
  );
}

export function assertDirectUnitActionAllowed({ action, graph, unitId }) {
  if (action !== "activate" && action !== "rollback") fail(`unsupported direct unit action: ${action}`);
  if (!graph.units.some((unit) => unit.id === unitId)) fail(`unknown deploy unit: ${unitId}`);
  signedInternalRpcEdges(graph);
}

export function assertSignedInternalRpcPromotion({ graph, promotion }) {
  if (!Array.isArray(promotion?.stateOverrides)) fail("profile promotion state overrides are invalid");
  const promotionBody = Object.fromEntries(
    Object.entries(promotion).filter(([key]) => key !== "promotionSha256"),
  );
  if (promotion.promotionSha256 !== sha256(canonicalJson(promotionBody))) {
    fail("profile promotion digest drifted");
  }
  if (promotion.graphSha256 !== sha256(canonicalJson(graph))) {
    fail("profile promotion deploy graph digest does not match the guarded graph");
  }
  const selectedUnitIds = new Set(promotion.stateOverrides.map((item) => item?.unitId));
  const edges = signedInternalRpcEdges(graph);
  const touchesSignedInternalRpc = edges.some(
    (edge) => selectedUnitIds.has(edge.callerUnitId) || selectedUnitIds.has(edge.targetUnitId),
  );
  if (!touchesSignedInternalRpc) return;
  for (const edge of edges) {
    const callerSelected = selectedUnitIds.has(edge.callerUnitId);
    const targetSelected = selectedUnitIds.has(edge.targetUnitId);
    if (callerSelected !== targetSelected) {
      fail(`signed internal RPC promotion is not dependency-closed: ${edge.callerUnitId} -> ${edge.targetUnitId}`);
    }
  }
}

function option(argv, name, required = true) {
  const index = argv.indexOf(name);
  if (index === -1) {
    if (required) fail(`missing ${name}`);
    return "";
  }
  if (index === argv.length - 1) fail(`missing value for ${name}`);
  return argv[index + 1];
}

function main(argv) {
  const [command] = argv;
  const graph = readJson(option(argv, "--graph"), "deploy graph");
  if (command === "direct") {
    assertDirectUnitActionAllowed({
      action: option(argv, "--action"),
      graph,
      unitId: option(argv, "--unit"),
    });
    return;
  }
  if (command === "promotion") {
    assertSignedInternalRpcPromotion({
      graph,
      promotion: readJson(option(argv, "--promotion"), "profile promotion"),
    });
    return;
  }
  fail("usage: internal-rpc-deployment-guard.mjs direct|promotion ...");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[internal-rpc-deployment-guard] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
