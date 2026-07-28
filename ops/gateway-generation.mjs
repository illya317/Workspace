#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  readDeployUnitState,
  writePrivateJson,
} from "./deploy-unit-release.mjs";

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const UNIT_PATTERN = /^[a-z][a-z0-9-]*$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const GRAPH_KIND = "workspace-gateway-route-map";
const GENERATION_KIND = "workspace-gateway-generation";
const REQUIRED_GENERATION_FILES = ["deploy-graph.json", "route-map.json", "workspace-gateway.conf"];

function fail(message) {
  throw new Error(message);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, canonicalValue(nested)]));
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function digestFile(file) {
  return sha256(readFileSync(file));
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || !value) fail(`${label} is required`);
  return value;
}

function requireDigest(value, label) {
  if (!DIGEST_PATTERN.test(value ?? "")) fail(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function requireTimestamp(value, label) {
  if (!TIMESTAMP_PATTERN.test(value ?? "")) fail(`${label} must be an ISO UTC timestamp`);
  return value;
}

function requireUnit(value, label = "unit id") {
  if (!UNIT_PATTERN.test(value ?? "")) fail(`${label} is invalid`);
  return value;
}

function requirePort(value, label) {
  if (!Number.isInteger(value) || value < 1024 || value > 65535) fail(`${label} must be a valid internal port`);
  return value;
}

function requirePathPrefix(value, label) {
  const candidate = requireString(value, label);
  if (!candidate.startsWith("/") || candidate.includes("//") || (candidate.length > 1 && candidate.endsWith("/"))) {
    fail(`${label} must be a normalized absolute path prefix`);
  }
  return candidate;
}

function isPathPrefix(parent, child) {
  return parent === child || child.startsWith(`${parent}/`);
}

function collapsePrefixes(prefixes) {
  const ordered = [...new Set(prefixes)].sort((left, right) => left.length - right.length || left.localeCompare(right));
  const collapsed = [];
  for (const prefix of ordered) {
    if (!collapsed.some((parent) => isPathPrefix(parent, prefix))) collapsed.push(prefix);
  }
  return collapsed;
}

function publicRoute(basePath, route) {
  return route === "/" ? basePath : `${basePath}${route}`;
}

export function normalizeDeployGraph(value) {
  const graph = requireObject(value, "deploy graph");
  if (graph.schemaVersion !== 1 || !Array.isArray(graph.units)) fail("deploy graph contract is invalid");
  const gateway = requireObject(graph.lifecycle?.gateway, "deploy graph Gateway contract");
  requirePathPrefix(gateway.basePath, "Gateway base path");
  if (gateway.legacyFallback?.host !== "127.0.0.1") fail("legacy Gateway fallback must stay on loopback");
  requirePort(gateway.legacyFallback?.port, "legacy Gateway fallback port");
  const seenUnits = new Set();
  const seenPorts = new Set();
  for (const unit of graph.units) {
    const id = requireUnit(unit?.id);
    if (seenUnits.has(id)) fail(`duplicate deploy unit: ${id}`);
    seenUnits.add(id);
    if (!new Set(["planned", "candidate", "active"]).has(unit.maturity)) fail(`${id} maturity is invalid`);
    if (!Array.isArray(unit.pageRoutes) || !Array.isArray(unit.apiPrefixes)) fail(`${id} route claims are invalid`);
    for (const route of [...unit.pageRoutes, ...unit.apiPrefixes]) requirePathPrefix(route, `${id} route`);
    for (const [slot, slotSpec] of Object.entries(unit.runtime?.slots ?? {})) {
      if (slot !== "blue" && slot !== "green") fail(`${id} runtime slot is invalid: ${slot}`);
      const port = requirePort(slotSpec?.port, `${id} ${slot} port`);
      if (seenPorts.has(port)) fail(`deploy graph repeats runtime port: ${port}`);
      seenPorts.add(port);
    }
    if (!unit.runtime?.slots?.blue || !unit.runtime?.slots?.green) fail(`${id} must declare blue and green slots`);
  }
  if (graph.units.filter((unit) => unit.kind === "workspace-shell").length !== 1) {
    fail("deploy graph must contain exactly one workspace-shell");
  }
  return graph;
}

export function readDeployGraph(file) {
  return normalizeDeployGraph(JSON.parse(readFileSync(file, "utf8")));
}

function validateActivation(unit, activation) {
  if (!activation || activation.unitId !== unit.id) fail(`${unit.id} state has no matching active release`);
  if (activation.slot !== "blue" && activation.slot !== "green") fail(`${unit.id} active slot is invalid`);
  const expectedPort = unit.runtime.slots[activation.slot].port;
  if (activation.port !== expectedPort) fail(`${unit.id} active port mismatch: expected ${expectedPort}, received ${activation.port}`);
  requireDigest(activation.receiptSha256, `${unit.id} activation receipt digest`);
}

function targetFor(activation) {
  return {
    host: "127.0.0.1",
    port: activation.port,
    unitId: activation.unitId,
    releaseId: activation.releaseId,
    slot: activation.slot,
  };
}

function routesForUnit(unit, activation, basePath) {
  const target = targetFor(activation);
  return [
    ...collapsePrefixes(unit.apiPrefixes.map((route) => publicRoute(basePath, route)))
      .map((prefix) => ({ kind: "api", prefix, target })),
    ...(unit.runtime.assetPrefix ? [{ kind: "asset", prefix: unit.runtime.assetPrefix, target }] : []),
    ...collapsePrefixes(unit.pageRoutes.filter((route) => route !== "/").map((route) => publicRoute(basePath, route)))
      .map((prefix) => ({ kind: "page", prefix, target })),
  ];
}

function loadActiveStates(graph, stateRoot, overrides = {}) {
  const unknownOverrides = Object.keys(overrides).filter((unitId) => !graph.units.some((unit) => unit.id === unitId));
  if (unknownOverrides.length > 0) fail(`state override references unknown deploy unit: ${unknownOverrides.join(", ")}`);
  const states = [];
  for (const unit of graph.units) {
    if (unit.maturity !== "active") {
      if (overrides[unit.id]) fail(`${unit.id} is ${unit.maturity} and cannot enter a Gateway generation`);
      continue;
    }
    const stateFile = overrides[unit.id] ?? path.join(stateRoot, `${unit.id}.json`);
    if (!overrides[unit.id] && !existsSync(stateFile)) continue;
    const state = readDeployUnitState(stateFile);
    if (state.unitId !== unit.id) fail(`${unit.id} state file belongs to ${state.unitId}`);
    validateActivation(unit, state.active);
    states.push(state);
  }
  return states.sort((left, right) => left.unitId.localeCompare(right.unitId));
}

function proxyBlock(target, indentation = "    ") {
  return [
    `${indentation}proxy_pass http://${target.host}:${target.port};`,
    `${indentation}proxy_http_version 1.1;`,
    `${indentation}proxy_set_header Host $http_host;`,
    `${indentation}proxy_set_header X-Real-IP $remote_addr;`,
    `${indentation}proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`,
    `${indentation}proxy_set_header X-Forwarded-Proto $scheme;`,
    `${indentation}proxy_read_timeout 3600s;`,
    `${indentation}proxy_send_timeout 3600s;`,
    `${indentation}proxy_buffering off;`,
  ].join("\n");
}

function locationPair(prefix, target) {
  return [
    `location = ${prefix} {`,
    proxyBlock(target),
    "}",
    `location ^~ ${prefix}/ {`,
    proxyBlock(target),
    "}",
  ].join("\n");
}

export function renderNginxGatewayInclude(routeMap) {
  return [
    `# workspace-gateway-generation ${routeMap.generationId}`,
    ...routeMap.routes.map((route) => locationPair(route.prefix, route.target)),
    locationPair(routeMap.basePath, routeMap.fallback),
    "",
  ].join("\n\n");
}

export function createGatewayRouteMap({ graph, states, generatedAt }) {
  const normalizedGraph = normalizeDeployGraph(graph);
  const activeByUnit = new Map(states.map((state) => [state.unitId, state.active]));
  const shell = normalizedGraph.units.find((unit) => unit.kind === "workspace-shell");
  const shellActivation = activeByUnit.get(shell.id);
  const fallback = shellActivation
    ? targetFor(shellActivation)
    : { ...normalizedGraph.lifecycle.gateway.legacyFallback, unitId: "legacy-monolith" };
  const routes = normalizedGraph.units
    .filter((unit) => unit.kind !== "workspace-shell")
    .flatMap((unit) => {
      const activation = activeByUnit.get(unit.id);
      return activation ? routesForUnit(unit, activation, normalizedGraph.lifecycle.gateway.basePath) : [];
    })
    .sort((left, right) => right.prefix.length - left.prefix.length
      || left.prefix.localeCompare(right.prefix)
      || left.kind.localeCompare(right.kind));
  const stateSetSha256 = sha256(canonicalJson(states));
  const body = {
    schemaVersion: 1,
    kind: GRAPH_KIND,
    graphSha256: sha256(canonicalJson(normalizedGraph)),
    stateSetSha256,
    basePath: normalizedGraph.lifecycle.gateway.basePath,
    fallback,
    routes,
    activeUnits: states.map((state) => state.active),
  };
  return {
    ...body,
    generationId: sha256(canonicalJson(body)),
    generatedAt: requireTimestamp(generatedAt, "Gateway generation time"),
  };
}

function generationFiles(root) {
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) fail(`Gateway generation cannot contain symlink: ${relative}`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && relative !== "generation-manifest.json") files.push(relative);
      else if (!entry.isFile()) fail(`Gateway generation contains unsupported entry: ${relative}`);
    }
  }
  visit(root);
  return files.sort();
}

export function createGatewayGeneration({
  graphFile,
  stateRoot,
  stateOverrides = {},
  outputRoot,
  generatedAt,
  fallbackOnly = false,
}) {
  const graph = readDeployGraph(graphFile);
  if (fallbackOnly && Object.keys(stateOverrides).length > 0) {
    fail("fallback-only Gateway generation cannot contain state overrides");
  }
  const states = fallbackOnly ? [] : loadActiveStates(graph, stateRoot, stateOverrides);
  const routeMap = createGatewayRouteMap({ graph, states, generatedAt });
  const finalDirectory = path.resolve(outputRoot, "generations", routeMap.generationId);
  const temporary = path.resolve(outputRoot, "generations", `.tmp-${routeMap.generationId}-${process.pid}-${randomUUID()}`);
  mkdirSync(path.dirname(temporary), { recursive: true, mode: 0o700 });
  mkdirSync(temporary, { recursive: false, mode: 0o700 });
  try {
    writePrivateJson(path.join(temporary, "route-map.json"), routeMap);
    writePrivateJson(path.join(temporary, "deploy-graph.json"), graph, normalizeDeployGraph);
    writeFileSync(path.join(temporary, "workspace-gateway.conf"), renderNginxGatewayInclude(routeMap), { mode: 0o600 });
    const stateDirectory = path.join(temporary, "unit-states");
    mkdirSync(stateDirectory, { mode: 0o700 });
    for (const state of states) writePrivateJson(path.join(stateDirectory, `${state.unitId}.json`), state);
    const files = generationFiles(temporary).map((relativePath) => {
      const absolute = path.join(temporary, relativePath);
      return { path: relativePath, size: statSync(absolute).size, sha256: digestFile(absolute) };
    });
    const manifest = {
      schemaVersion: 1,
      kind: GENERATION_KIND,
      generationId: routeMap.generationId,
      graphSha256: routeMap.graphSha256,
      stateSetSha256: routeMap.stateSetSha256,
      files,
      createdAt: routeMap.generatedAt,
    };
    writePrivateJson(path.join(temporary, "generation-manifest.json"), manifest);
    try {
      renameSync(temporary, finalDirectory);
    } catch (error) {
      if (error?.code !== "EEXIST" && error?.code !== "ENOTEMPTY") throw error;
      assertGatewayGeneration(finalDirectory);
      rmSync(temporary, { recursive: true, force: true });
    }
    return assertGatewayGeneration(finalDirectory);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

export function assertGatewayGeneration(directory) {
  const root = path.resolve(directory);
  const manifest = requireObject(JSON.parse(readFileSync(path.join(root, "generation-manifest.json"), "utf8")), "Gateway generation manifest");
  if (manifest.schemaVersion !== 1 || manifest.kind !== GENERATION_KIND) fail("Gateway generation manifest is invalid");
  requireDigest(manifest.generationId, "Gateway generation id");
  requireDigest(manifest.graphSha256, "Gateway graph digest");
  requireDigest(manifest.stateSetSha256, "Gateway state-set digest");
  requireTimestamp(manifest.createdAt, "Gateway generation creation time");
  if (path.basename(root) !== manifest.generationId) fail("Gateway generation directory does not match its identity");
  if (!Array.isArray(manifest.files)) fail("Gateway generation file manifest is missing");
  const expectedFiles = generationFiles(root);
  const declaredFiles = manifest.files.map((file) => file?.path);
  if (JSON.stringify(declaredFiles) !== JSON.stringify(expectedFiles)) fail("Gateway generation file set drifted");
  for (const file of manifest.files) {
    if (!Number.isSafeInteger(file.size) || file.size <= 0) fail(`Gateway generation file size is invalid: ${file.path}`);
    requireDigest(file.sha256, `${file.path} digest`);
    const absolute = path.join(root, file.path);
    if (statSync(absolute).size !== file.size || digestFile(absolute) !== file.sha256) {
      fail(`Gateway generation file drifted: ${file.path}`);
    }
  }
  for (const requiredFile of REQUIRED_GENERATION_FILES) {
    if (!declaredFiles.includes(requiredFile)) fail(`Gateway generation is missing ${requiredFile}`);
  }
  const routeMap = JSON.parse(readFileSync(path.join(root, "route-map.json"), "utf8"));
  if (routeMap.kind !== GRAPH_KIND || routeMap.generationId !== manifest.generationId
    || routeMap.graphSha256 !== manifest.graphSha256 || routeMap.stateSetSha256 !== manifest.stateSetSha256) {
    fail("Gateway route map does not match the generation manifest");
  }
  const graph = readDeployGraph(path.join(root, "deploy-graph.json"));
  if (sha256(canonicalJson(graph)) !== manifest.graphSha256) {
    fail("Gateway deploy graph does not match the generation manifest");
  }
  const nginx = readFileSync(path.join(root, "workspace-gateway.conf"), "utf8");
  if (!nginx.startsWith(`# workspace-gateway-generation ${manifest.generationId}\n`)) {
    fail("Gateway Nginx include does not match the generation manifest");
  }
  chmodSync(path.join(root, "generation-manifest.json"), 0o600);
  return manifest;
}

function parseArguments(argv) {
  const options = { states: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[++index];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) fail(`invalid argument: ${key ?? "<missing>"}`);
    if (key === "--state") options.states.push(value);
    else options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

function requiredOption(options, key) {
  return requireString(options[key], `--${key.replaceAll("_", "-")}`);
}

function stateOverrides(values) {
  const overrides = {};
  for (const value of values) {
    const separator = value.indexOf("=");
    if (separator <= 0 || separator === value.length - 1) fail(`--state must use unit=/absolute/state.json: ${value}`);
    const unitId = requireUnit(value.slice(0, separator), "state override unit id");
    const stateFile = value.slice(separator + 1);
    if (!path.isAbsolute(stateFile)) fail(`state override must be absolute: ${value}`);
    if (overrides[unitId]) fail(`duplicate state override: ${unitId}`);
    overrides[unitId] = stateFile;
  }
  return overrides;
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const options = parseArguments(rest);
  if (command === "create") {
    const manifest = createGatewayGeneration({
      graphFile: requiredOption(options, "graph"),
      stateRoot: requiredOption(options, "state_root"),
      stateOverrides: stateOverrides(options.states),
      outputRoot: requiredOption(options, "output_root"),
      generatedAt: requiredOption(options, "generated_at"),
    });
    process.stdout.write(`${manifest.generationId}\n`);
    return;
  }
  if (command === "create-fallback") {
    if (options.states.length > 0) fail("create-fallback does not accept --state");
    const manifest = createGatewayGeneration({
      graphFile: requiredOption(options, "graph"),
      outputRoot: requiredOption(options, "output_root"),
      generatedAt: requiredOption(options, "generated_at"),
      fallbackOnly: true,
    });
    process.stdout.write(`${manifest.generationId}\n`);
    return;
  }
  if (command === "assert") {
    const manifest = assertGatewayGeneration(requiredOption(options, "generation"));
    process.stdout.write(`${manifest.generationId}\n`);
    return;
  }
  if (command === "graph-digest") {
    process.stdout.write(`${sha256(canonicalJson(readDeployGraph(requiredOption(options, "graph"))))}\n`);
    return;
  }
  if (command === "graph-assert") {
    const actual = sha256(canonicalJson(readDeployGraph(requiredOption(options, "graph"))));
    const expected = requireDigest(requiredOption(options, "digest"), "expected graph digest");
    if (actual !== expected) fail(`deploy graph digest mismatch: expected ${expected}, received ${actual}`);
    process.stdout.write("MATCH\n");
    return;
  }
  fail(`unknown command: ${command ?? "<missing>"}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
