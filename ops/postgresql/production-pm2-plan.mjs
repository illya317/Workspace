#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [command, ...argv] = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : "";
};
const fail = (message) => {
  console.error("[错误] " + message);
  process.exit(1);
};
const readJson = (file) => JSON.parse(readFileSync(file === "-" ? 0 : file, "utf8"));
const writePrivateJson = (file, value) => {
  const temporary = file + ".tmp-" + process.pid;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  renameSync(temporary, file);
};

const WORKSPACE_NAME = "workspace";
const MONOLITH_BOT_NAME = "workspace-wecom-agent";
const ASSISTANT_BOT_NAMES = {
  blue: "workspace-assistant-wecom-blue",
  green: "workspace-assistant-wecom-green",
};
const KNOWN_NAMES = new Set([
  WORKSPACE_NAME,
  MONOLITH_BOT_NAME,
  ...Object.values(ASSISTANT_BOT_NAMES),
]);
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const managedName = (name) => KNOWN_NAMES.has(name);
const SAFE_ENV = new Set([
  "PORT", "HOSTNAME", "BUILD_VERSION", "NEXT_PUBLIC_BUILD_VERSION", "NEXT_PUBLIC_BASE_PATH",
  "PG_POOL_MAX", "PG_APPLICATION_NAME", "WORKSPACE_DEPLOY_UNIT_ID", "WORKSPACE_DEPLOY_SLOT",
  "WORKSPACE_CONFIG_DIR", "WORKSPACE_DEPLOY_CURRENT_STATE_FILE", "WORKSPACE_INTERNAL_ORIGIN",
  "WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE", "WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE",
  "WORKSPACE_INTERNAL_REPLAY_DIRECTORY", "WECHAT_BOT_BRIDGE_URL",
  "PROJECT_NOTIFICATION_SCHEDULER_DISABLED",
]);
const FORBIDDEN_DATABASE_ENV = [
  "DIRECT_URL", "SHADOW_DATABASE_URL", "WORKSPACE_BACKUP_DATABASE_URL", "WORKSPACE_MONITOR_DATABASE_URL",
  "WORKSPACE_DATABASE_URL", "WORKSPACE_RUNTIME_DATABASE_PASSWORD", "WORKSPACE_MIGRATOR_DATABASE_PASSWORD",
  "WORKSPACE_BACKUP_DATABASE_PASSWORD", "WORKSPACE_MONITOR_DATABASE_PASSWORD",
  "PGPASSWORD", "PGPASSFILE", "PGSERVICE", "PGSERVICEFILE", "PGOPTIONS", "PGUSER", "PGHOST", "PGDATABASE",
];
const ALL_DATABASE_ENV = ["DATABASE_URL", ...FORBIDDEN_DATABASE_ENV];
const botForbiddenEnvironment = (environment) => Object.keys(environment).filter((key) => (
  ALL_DATABASE_ENV.includes(key)
  || /^PG[A-Z0-9_]*$/.test(key)
  || /^NEXTAUTH(?:_|$)/.test(key)
  || /^ONLYOFFICE(?:_|$)/.test(key)
  || /^WORKSPACE_(?:RUNTIME|MIGRATOR|BACKUP|MONITOR)_DATABASE/.test(key)
));

const safeStderrFirstLine = (value) => {
  const firstLine = String(value ?? "").split(/\r?\n/, 1)[0]
    .replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^@\s]+)@/gi, "$1$2:[REDACTED]@")
    .replace(/((?:^|[?&;\s])(?:password|secret|token|api[_-]?key)=)[^&;\s]*/gi, "$1[REDACTED]");
  return (firstLine || "[empty]").slice(0, 240);
};
const safeArgument = (value) => !/postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/i.test(value)
  && !/(?:password|secret|token|api[_-]?key)=/i.test(value);
const canonicalValue = (value) => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, canonicalValue(nested)]));
};
const canonicalJson = (value) => JSON.stringify(canonicalValue(value));
const sha256File = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const pathEntry = (file) => {
  try {
    return lstatSync(file);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    fail("无法读取 Gateway path identity");
  }
};
const readRegularJson = (file, label) => {
  const identity = pathEntry(file);
  if (!identity?.isFile() || identity.isSymbolicLink()) fail(label + " 必须是普通文件");
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    fail(label + " 不是合法 JSON");
  }
};
const assertGenerationFile = (generation, relativePath, required) => {
  const matches = generation.manifest.files.filter((entry) => entry?.path === relativePath);
  const file = path.join(generation.directory, relativePath);
  const identity = pathEntry(file);
  if (!required && !identity && matches.length === 0) return null;
  if (matches.length !== 1 || !identity?.isFile() || identity.isSymbolicLink()) {
    fail("Gateway generation file receipt 不一致: " + relativePath);
  }
  const receipt = matches[0];
  const content = readFileSync(file);
  if (!Number.isSafeInteger(receipt.size) || receipt.size !== content.length
      || !DIGEST_PATTERN.test(receipt.sha256 ?? "")
      || createHash("sha256").update(content).digest("hex") !== receipt.sha256) {
    fail("Gateway generation file digest 不一致: " + relativePath);
  }
  return file;
};
const gatewayActiveNames = (gateway) => [
  WORKSPACE_NAME,
  gateway.owner === "assistant" ? ASSISTANT_BOT_NAMES[gateway.slot] : MONOLITH_BOT_NAME,
];
const gatewayInactiveBotNames = (gateway) => [
  MONOLITH_BOT_NAME,
  ...Object.values(ASSISTANT_BOT_NAMES),
].filter((name) => !gatewayActiveNames(gateway).includes(name));

const assistantRuntimeContract = (root, active) => {
  let releaseDir;
  try {
    releaseDir = realpathSync(path.resolve(active.releaseDir));
  } catch {
    fail("Gateway Assistant active release 不可解析");
  }
  if (releaseDir !== path.resolve(active.releaseDir)) {
    fail("Gateway Assistant active release 必须是规范绝对路径");
  }
  const descriptor = readRegularJson(
    path.join(releaseDir, ".assistant-runtime.json"),
    "Gateway Assistant runtime descriptor",
  );
  const sidecars = descriptor?.sidecars;
  if (!Array.isArray(sidecars) || sidecars.length !== 1) {
    fail("Gateway Assistant runtime descriptor sidecar contract 无效");
  }
  const sidecar = sidecars[0];
  if (sidecar?.processName !== "workspace-assistant-wecom"
      || typeof sidecar.entry !== "string" || !sidecar.entry
      || path.isAbsolute(sidecar.entry)
      || typeof sidecar.bridgePath !== "string" || !sidecar.bridgePath.startsWith("/")) {
    fail("Gateway Assistant runtime descriptor process contract 无效");
  }
  let executable;
  try {
    executable = realpathSync(path.resolve(releaseDir, sidecar.entry));
  } catch {
    fail("Gateway Assistant runtime entry 不可解析");
  }
  if (!executable.startsWith(releaseDir + "/")) fail("Gateway Assistant runtime entry 越界");
  const artifact = readRegularJson(
    path.join(releaseDir, "artifact.manifest.json"),
    "Gateway Assistant artifact manifest",
  );
  const basePath = artifact?.build?.basePath;
  if (typeof basePath !== "string" || !basePath.startsWith("/")
      || /[\u0000-\u001f\u007f]/.test(basePath + sidecar.bridgePath)
      || !Number.isSafeInteger(active.port) || active.port < 1 || active.port > 65535) {
    fail("Gateway Assistant bridge contract 无效");
  }
  return {
    releaseDir,
    executable,
    bridgeUrl: `http://127.0.0.1:${active.port}${basePath}${sidecar.bridgePath}`,
    stateFile: path.join(root, "current", "unit-states", "assistant.json"),
  };
};

const resolveGatewayOwner = (gatewayRootInput) => {
  if (!path.isAbsolute(gatewayRootInput || "")) fail("Gateway root 必须是绝对路径");
  const root = path.resolve(gatewayRootInput);
  const current = path.join(root, "current");
  const marker = path.join(root, "committed-generation");
  const currentIdentity = pathEntry(current);
  const markerIdentity = pathEntry(marker);
  if (!currentIdentity && !markerIdentity) {
    return {
      schemaVersion: 1,
      root,
      mode: "legacy",
      generationId: null,
      owner: "fallback",
      slot: null,
      generationManifestSha256: null,
      routeMapSha256: null,
      assistantStateSha256: null,
      assistantRuntime: null,
    };
  }
  if (!currentIdentity?.isSymbolicLink()) fail("Gateway current 缺失或不是符号链接");

  let directory;
  let generations;
  try {
    directory = realpathSync(current);
    generations = realpathSync(path.join(root, "generations"));
  } catch {
    fail("Gateway current generation 不可解析");
  }
  const generationId = path.basename(directory);
  if (path.dirname(directory) !== generations || !DIGEST_PATTERN.test(generationId)) {
    fail("Gateway current generation 越界或 identity 无效");
  }

  const manifestFile = path.join(directory, "generation-manifest.json");
  const manifest = readRegularJson(manifestFile, "Gateway generation manifest");
  if (manifest?.schemaVersion !== 1 || manifest.kind !== "workspace-gateway-generation"
      || manifest.generationId !== generationId || !Array.isArray(manifest.files)) {
    fail("Gateway generation manifest contract 无效");
  }
  const duplicateFiles = manifest.files.map((entry) => String(entry?.path ?? ""));
  if (new Set(duplicateFiles).size !== duplicateFiles.length) fail("Gateway generation manifest file 重复");
  const generation = { directory, manifest };
  const routeMapFile = assertGenerationFile(generation, "route-map.json", true);
  const routeMap = readRegularJson(routeMapFile, "Gateway route map");
  if (routeMap?.schemaVersion !== 1 || routeMap.kind !== "workspace-gateway-route-map"
      || routeMap.generationId !== generationId || !Array.isArray(routeMap.activeUnits)) {
    fail("Gateway route map contract 无效");
  }

  const assistantStatePath = path.join(directory, "unit-states", "assistant.json");
  const assistantStateIdentity = pathEntry(assistantStatePath);
  const assistantStateReceipts = manifest.files.filter(
    (entry) => entry?.path === "unit-states/assistant.json",
  );
  const assistantActivations = routeMap.activeUnits.filter((entry) => entry?.unitId === "assistant");
  if (!markerIdentity) {
    if (assistantStateIdentity || assistantStateReceipts.length > 0 || assistantActivations.length > 0) {
      fail("Gateway committed marker 缺失但存在 Assistant owner state");
    }
    return {
      schemaVersion: 1,
      root,
      mode: "legacy-fallback-generation",
      generationId,
      owner: "fallback",
      slot: null,
      generationManifestSha256: sha256File(manifestFile),
      routeMapSha256: sha256File(routeMapFile),
      assistantStateSha256: null,
      assistantRuntime: null,
    };
  }
  if (!markerIdentity.isFile() || markerIdentity.isSymbolicLink()) {
    fail("Gateway committed marker 必须是普通文件");
  }
  const markerValue = readFileSync(marker, "utf8");
  if (!new RegExp("^" + generationId + "\\n?$").test(markerValue)) {
    fail("Gateway current 与 committed generation 不一致");
  }

  if (!assistantStateIdentity) {
    if (assistantStateReceipts.length !== 0 || assistantActivations.length !== 0) {
      fail("Gateway Assistant route/receipt 缺少 state");
    }
    return {
      schemaVersion: 1,
      root,
      mode: "committed",
      generationId,
      owner: "fallback",
      slot: null,
      generationManifestSha256: sha256File(manifestFile),
      routeMapSha256: sha256File(routeMapFile),
      assistantStateSha256: null,
      assistantRuntime: null,
    };
  }
  const assistantStateFile = assertGenerationFile(generation, "unit-states/assistant.json", true);
  const state = readRegularJson(assistantStateFile, "Gateway Assistant state");
  const active = state?.active;
  if (state?.schemaVersion !== 1 || state.kind !== "workspace-deploy-unit-state"
      || state.unitId !== "assistant" || active?.unitId !== "assistant"
      || !Object.hasOwn(ASSISTANT_BOT_NAMES, active?.slot)
      || typeof active?.releaseDir !== "string" || !path.isAbsolute(active.releaseDir)) {
    fail("Gateway Assistant state contract 无效");
  }
  if (assistantActivations.length !== 1
      || canonicalJson(assistantActivations[0]) !== canonicalJson(active)) {
    fail("Gateway Assistant route/state 不一致");
  }
  return {
    schemaVersion: 1,
    root,
    mode: "committed",
    generationId,
    owner: "assistant",
    slot: active.slot,
    generationManifestSha256: sha256File(manifestFile),
    routeMapSha256: sha256File(routeMapFile),
    assistantStateSha256: sha256File(assistantStateFile),
    assistantRuntime: assistantRuntimeContract(root, active),
  };
};

const assertGatewaySnapshot = (expected) => {
  if (!expected || expected.schemaVersion !== 1 || !path.isAbsolute(expected.root ?? "")) {
    fail("plan Gateway owner 无效");
  }
  const actual = resolveGatewayOwner(expected.root);
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    fail("Gateway committed owner 自 plan 创建后已变化");
  }
  return actual;
};
const classifyProcess = (entry) => {
  const status = entry?.pm2_env?.status;
  const pid = Number(entry?.pid ?? 0);
  if (status === "online" && Number.isSafeInteger(pid) && pid > 0) return "online";
  if (status === "stopped" && pid === 0) return "inactive";
  return "invalid";
};
const matchesFor = (processes, name) => processes.filter((entry) => entry?.name === name);
const assertKnownProcesses = (processes) => {
  if (!Array.isArray(processes)) fail("PM2 snapshot 不是数组");
  const unexpected = processes.map((entry) => String(entry?.name ?? ""))
    .filter((name) => name.startsWith("workspace") && !managedName(name));
  if (unexpected.length) fail("存在未纳入迁移的 Workspace 进程: " + [...new Set(unexpected)].sort().join(", "));
  for (const name of KNOWN_NAMES) {
    if (matchesFor(processes, name).length > 1) fail("PM2 进程重复: " + name);
  }
};
const assertOwnerTopology = (processes, gateway, { requireOnline }) => {
  assertKnownProcesses(processes);
  const activeNames = gatewayActiveNames(gateway);
  for (const name of activeNames) {
    const matches = matchesFor(processes, name);
    if (requireOnline && (matches.length !== 1 || classifyProcess(matches[0]) !== "online")) {
      fail(name + " 必须且只能有一个 online");
    }
    if (!requireOnline && matches.length === 1 && classifyProcess(matches[0]) === "invalid") {
      fail(name + " 状态无法安全分类");
    }
  }
  if (gateway.owner === "assistant" && requireOnline) {
    const monolith = matchesFor(processes, MONOLITH_BOT_NAME);
    if (monolith.length !== 1 || classifyProcess(monolith[0]) !== "inactive") {
      fail(MONOLITH_BOT_NAME + " 在 Assistant owner 下必须且只能有一个 inactive 定义");
    }
  }
  for (const name of gatewayInactiveBotNames(gateway)) {
    const matches = matchesFor(processes, name);
    if (matches.length === 1 && classifyProcess(matches[0]) !== "inactive") {
      fail(name + " 作为非 owner 必须 absent/inactive");
    }
  }
};
const processEnvironment = (entry) => ({ ...(entry?.pm2_env?.env ?? {}), ...(entry?.pm2_env ?? {}) });
const assertAssistantProcessAlignment = (entry, gateway) => {
  if (gateway.owner !== "assistant" || !gateway.assistantRuntime) return;
  let executable;
  let cwd;
  try {
    executable = realpathSync(path.resolve(String(entry?.pm2_env?.pm_exec_path ?? entry?.executable ?? "")));
    cwd = realpathSync(path.resolve(String(entry?.pm2_env?.pm_cwd ?? entry?.cwd ?? "")));
  } catch {
    fail("committed Assistant sidecar exec/cwd 不可解析");
  }
  const environment = entry?.pm2_env ? processEnvironment(entry) : (entry?.env ?? {});
  const expectedName = ASSISTANT_BOT_NAMES[gateway.slot];
  if (entry?.name !== expectedName || executable !== gateway.assistantRuntime.executable
      || cwd !== gateway.assistantRuntime.releaseDir
      || environment.WORKSPACE_DEPLOY_UNIT_ID !== "assistant"
      || environment.WORKSPACE_DEPLOY_SLOT !== gateway.slot
      || environment.WORKSPACE_DEPLOY_CURRENT_STATE_FILE !== gateway.assistantRuntime.stateFile
      || environment.WECHAT_BOT_BRIDGE_URL !== gateway.assistantRuntime.bridgeUrl) {
    fail("committed Assistant sidecar 与 Gateway active runtime 不一致");
  }
};
const assertPreservableAssistantOwner = (entry, gateway) => {
  assertAssistantProcessAlignment(entry, gateway);
  const leaked = botForbiddenEnvironment(processEnvironment(entry));
  if (leaked.length) {
    fail(String(entry?.name ?? "committed Assistant sidecar")
      + " 无法安全保留，存在数据库或 Web control-plane 环境: " + leaked.join(", "));
  }
};
const processSpec = (entry, remoteRoot) => {
  const env = entry.pm2_env ?? {};
  let executable;
  let cwd;
  try {
    executable = realpathSync(path.resolve(String(env.pm_exec_path ?? "")));
    cwd = realpathSync(path.resolve(String(env.pm_cwd ?? "")));
  } catch {
    fail(entry.name + " 的 exec/cwd 不存在");
  }
  const systemNode = realpathSync(process.execPath);
  if ((!executable.startsWith(remoteRoot + "/") && executable !== systemNode)
      || !cwd.startsWith(remoteRoot + "/")) {
    fail(entry.name + " 的 exec/cwd 不在 Workspace runtime root");
  }
  const runtimeEnv = {};
  for (const key of SAFE_ENV) {
    const value = env[key];
    if (typeof value === "string" && value) runtimeEnv[key] = value;
  }
  const args = Array.isArray(env.args) ? env.args.map(String) : [];
  if (args.some((value) => !safeArgument(value))) fail(entry.name + " 的 argv 疑似包含 secret");
  return { name: entry.name, executable, cwd, args, env: runtimeEnv };
};

const assertPlanGateway = (gateway) => {
  if (!gateway || gateway.schemaVersion !== 1 || !path.isAbsolute(gateway.root ?? "")
      || !["fallback", "assistant"].includes(gateway.owner)) {
    fail("plan Gateway owner 无效");
  }
  if (gateway.owner === "assistant") {
    if (!Object.hasOwn(ASSISTANT_BOT_NAMES, gateway.slot)
        || !gateway.assistantRuntime
        || !path.isAbsolute(gateway.assistantRuntime.releaseDir ?? "")
        || !path.isAbsolute(gateway.assistantRuntime.executable ?? "")
        || !path.isAbsolute(gateway.assistantRuntime.stateFile ?? "")
        || typeof gateway.assistantRuntime.bridgeUrl !== "string") {
      fail("plan Assistant Gateway runtime 无效");
    }
  } else if (gateway.slot !== null || gateway.assistantRuntime !== null) {
    fail("plan fallback Gateway runtime 无效");
  }
};
const planContext = ({ requireRunner, gatewayMode, requireCurrentSpecs = false }) => {
  const plan = readJson(valueAfter("--plan"));
  const runner = valueAfter("--runner");
  if (plan?.schemaVersion !== 2 || plan.kind !== "workspace-production-pm2-migration"
      || !Array.isArray(plan.processes) || !Array.isArray(plan.capturedProcessNames)
      || (requireRunner && !runner)) {
    fail(requireRunner ? "plan/runner 无效" : "plan 无效");
  }
  assertPlanGateway(plan.gateway);
  const names = plan.processes.map((entry) => String(entry?.name ?? ""));
  if (new Set(names).size !== names.length || names.some((name) => !managedName(name))) {
    fail("plan 进程名称无效");
  }
  if (new Set(plan.capturedProcessNames).size !== plan.capturedProcessNames.length
      || plan.capturedProcessNames.some((name) => !managedName(name))
      || canonicalJson([...names].sort()) !== canonicalJson([...plan.capturedProcessNames].sort())) {
    fail("plan captured 进程名称无效");
  }
  const preparedActiveNames = gatewayActiveNames(plan.gateway);
  for (const entry of plan.processes) {
    const expectedState = preparedActiveNames.includes(entry.name) ? "online" : "inactive";
    if (entry.desiredState !== expectedState || !Array.isArray(entry.args)
        || !entry.env || typeof entry.env !== "object"
        || !path.isAbsolute(entry.executable ?? "") || !path.isAbsolute(entry.cwd ?? "")) {
      fail("plan process spec/state 无效: " + entry.name);
    }
  }
  for (const name of preparedActiveNames) {
    if (!names.includes(name)) fail("plan 缺少 prepared owner process spec: " + name);
  }
  if (plan.gateway.owner === "assistant") {
    if (!names.includes(MONOLITH_BOT_NAME)) fail("plan 缺少 inactive monolith process spec");
    if (gatewayMode === "prepared") {
      assertAssistantProcessAlignment(
        plan.processes.find((entry) => entry.name === ASSISTANT_BOT_NAMES[plan.gateway.slot]),
        plan.gateway,
      );
    }
  }
  const gateway = gatewayMode === "prepared"
    ? assertGatewaySnapshot(plan.gateway)
    : resolveGatewayOwner(plan.gateway.root);
  if (requireCurrentSpecs) {
    for (const name of gatewayActiveNames(gateway)) {
      if (!names.includes(name)) fail("plan 缺少 current owner process spec: " + name);
    }
    if (gateway.owner === "assistant") {
      assertAssistantProcessAlignment(
        plan.processes.find((entry) => entry.name === ASSISTANT_BOT_NAMES[gateway.slot]),
        gateway,
      );
    }
  }
  return { plan, runner, gateway };
};
const runtimeProcesses = (runner) => {
  const result = spawnSync(runner, ["jlist"], {
    encoding: "utf8",
    env: { PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" },
  });
  if (result.status !== 0) fail("无法读取隔离 PM2 状态");
  let actual;
  try {
    actual = JSON.parse(result.stdout || "[]");
  } catch {
    fail("隔离 PM2 状态不是合法 JSON");
  }
  if (!Array.isArray(actual)) fail("隔离 PM2 状态不是数组");
  return actual;
};
const runProcessCommand = (runner, args, label) => {
  const result = spawnSync(runner, args, {
    encoding: "utf8",
    env: { PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" },
  });
  if (result.status !== 0) {
    const status = Number.isInteger(result.status) ? result.status : "signal";
    fail(label + " 失败 exit=" + status + " stderr=" + safeStderrFirstLine(result.stderr));
  }
};

if (command === "create") {
  const input = valueAfter("--input");
  const output = valueAfter("--output");
  const gatewayRoot = valueAfter("--gateway-root");
  const remoteRootInput = path.resolve(valueAfter("--remote-root"));
  let remoteRoot;
  try {
    remoteRoot = realpathSync(remoteRootInput);
  } catch {
    fail("remote root 不存在");
  }
  if (!input || !output || !gatewayRoot || remoteRoot === path.parse(remoteRoot).root) {
    fail("create 参数不完整");
  }
  const gateway = resolveGatewayOwner(gatewayRoot);
  const source = readJson(input);
  assertOwnerTopology(source, gateway, { requireOnline: true });
  const activeNames = gatewayActiveNames(gateway);
  if (gateway.owner === "assistant") {
    assertAssistantProcessAlignment(matchesFor(source, ASSISTANT_BOT_NAMES[gateway.slot])[0], gateway);
  }
  const processes = source.filter((entry) => managedName(String(entry?.name ?? "")))
    .map((entry) => ({
      ...processSpec(entry, remoteRoot),
      desiredState: activeNames.includes(entry.name) ? "online" : "inactive",
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const capturedProcessNames = processes.map((entry) => entry.name);
  writePrivateJson(output, {
    schemaVersion: 2,
    kind: "workspace-production-pm2-migration",
    createdAt: new Date().toISOString(),
    gateway,
    capturedProcessNames,
    processes,
  });
  process.stdout.write("planned " + activeNames.length + " active and "
    + (processes.length - activeNames.length) + " inactive Workspace process definition(s) for "
    + (gateway.owner === "assistant" ? "Assistant/" + gateway.slot : "fallback") + "\n");
} else if (command === "read-pid") {
  const file = valueAfter("--file");
  if (!file) fail("PM2 PID 文件参数缺失");
  let value;
  try {
    value = readFileSync(file, "utf8");
  } catch {
    fail("PM2 PID 文件不可读");
  }
  const match = /^([1-9][0-9]*)\n?$/.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[1]))) fail("PM2 PID 文件格式无效");
  process.stdout.write(match[1]);
} else if (command === "names") {
  const gatewayMode = argv.includes("--require-prepared-owner") ? "prepared" : "current";
  planContext({
    requireRunner: false,
    gatewayMode,
    requireCurrentSpecs: argv.includes("--require-current-specs"),
  });
  process.stdout.write([...KNOWN_NAMES].sort().join("\n") + "\n");
} else if (command === "reconcile") {
  const { runner, gateway } = planContext({ requireRunner: true, gatewayMode: "prepared" });
  const actual = runtimeProcesses(runner);
  assertOwnerTopology(actual, gateway, { requireOnline: false });
  const assistantOwnerName = gateway.owner === "assistant" ? ASSISTANT_BOT_NAMES[gateway.slot] : null;
  const assistantOwner = assistantOwnerName ? matchesFor(actual, assistantOwnerName)[0] : null;
  if (assistantOwner && classifyProcess(assistantOwner) === "online") {
    assertPreservableAssistantOwner(assistantOwner, gateway);
  }
  const preservedOwnerName = assistantOwnerName && classifyProcess(assistantOwner) === "online"
    ? assistantOwnerName
    : null;
  const deletedNames = actual.map((entry) => String(entry?.name ?? ""))
    .filter((name) => managedName(name) && name !== preservedOwnerName);
  for (const name of deletedNames) runProcessCommand(runner, ["delete", name], "reconcile delete " + name);
  const remaining = runtimeProcesses(runner);
  assertOwnerTopology(remaining, gateway, { requireOnline: false });
  const remainingWorkspace = remaining.filter((entry) => String(entry?.name ?? "").startsWith("workspace"));
  if (preservedOwnerName) {
    if (remainingWorkspace.length !== 1 || remainingWorkspace[0]?.name !== preservedOwnerName
        || classifyProcess(remainingWorkspace[0]) !== "online") {
      fail("隔离 PM2 reconcile 未保留 committed Assistant owner: " + preservedOwnerName);
    }
  } else if (remainingWorkspace.length) {
    fail("隔离 PM2 reconcile 后仍有 Workspace 进程: "
      + remainingWorkspace.map((entry) => String(entry?.name ?? "")).sort().join(", "));
  }
  process.stdout.write("reconciled " + deletedNames.length + " owner-bound Workspace process(es)"
    + (preservedOwnerName ? "; preserved " + preservedOwnerName : "") + "\n");
} else if (command === "apply" || command === "delete") {
  const gatewayMode = argv.includes("--current-owner") ? "current" : "prepared";
  const { plan, runner, gateway } = planContext({
    requireRunner: true,
    gatewayMode,
    requireCurrentSpecs: gatewayMode === "current",
  });
  const actual = runtimeProcesses(runner);
  assertOwnerTopology(actual, gateway, { requireOnline: false });
  const assistantOwner = gateway.owner === "assistant"
    ? matchesFor(actual, ASSISTANT_BOT_NAMES[gateway.slot])[0]
    : null;
  if (command === "apply" && assistantOwner && classifyProcess(assistantOwner) === "online") {
    assertPreservableAssistantOwner(assistantOwner, gateway);
  }
  const preservedOwnerName = command === "apply" && gateway.owner === "assistant"
    && classifyProcess(assistantOwner) === "online"
    ? ASSISTANT_BOT_NAMES[gateway.slot]
    : null;
  for (const processSpecValue of plan.processes) {
    if (processSpecValue.name === preservedOwnerName) continue;
    const desiredState = gatewayActiveNames(gateway).includes(processSpecValue.name)
      ? "online"
      : "inactive";
    if (command === "apply" && desiredState === "inactive") {
      const existing = matchesFor(actual, processSpecValue.name);
      if (existing.length === 1) {
        runProcessCommand(runner, ["delete", processSpecValue.name], "apply reset " + processSpecValue.name);
      }
    }
    const args = command === "delete" ? ["delete", processSpecValue.name] : [
          "start", processSpecValue.executable, "--name", processSpecValue.name,
          "--cwd", processSpecValue.cwd, "--update-env",
          ...(desiredState === "inactive" ? ["--no-autostart"] : []),
          ...(processSpecValue.args.length > 0 ? ["--", ...processSpecValue.args] : []),
        ];
    const environment = command === "delete"
      ? { PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" }
      : { PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", ...processSpecValue.env };
    const result = spawnSync(runner, args, { encoding: "utf8", env: environment });
    if (result.status !== 0) {
      const status = Number.isInteger(result.status) ? result.status : "signal";
      fail(command + " " + processSpecValue.name + " 失败 exit=" + status
        + " stderr=" + safeStderrFirstLine(result.stderr));
    }
  }
} else if (command === "verify" || command === "pids") {
  const { runner, gateway } = planContext({ requireRunner: true, gatewayMode: "current" });
  const actual = runtimeProcesses(runner);
  assertOwnerTopology(actual, gateway, { requireOnline: true });
  if (gateway.owner === "assistant") {
    assertAssistantProcessAlignment(
      matchesFor(actual, ASSISTANT_BOT_NAMES[gateway.slot])[0],
      gateway,
    );
  }
  for (const botName of [MONOLITH_BOT_NAME, ...Object.values(ASSISTANT_BOT_NAMES)]) {
    const match = matchesFor(actual, botName)[0];
    if (!match) continue;
    const leaked = botForbiddenEnvironment(processEnvironment(match));
    if (leaked.length) fail(botName + " 泄露数据库或 Web control-plane 环境: " + leaked.join(", "));
  }
  const pids = [];
  for (const name of gatewayActiveNames(gateway)) {
    const match = matchesFor(actual, name)[0];
    const pid = Number(match.pid);
    if (name === WORKSPACE_NAME) {
      const environment = processEnvironment(match);
      const leaked = FORBIDDEN_DATABASE_ENV.filter((key) => Object.hasOwn(environment, key));
      if (leaked.length) fail(name + " 泄露 control-plane PostgreSQL 环境: " + leaked.join(", "));
      let user = "";
      try {
        user = decodeURIComponent(new URL(String(environment.DATABASE_URL || "")).username);
      } catch {}
      if (user !== "workspace_runtime") fail(name + " 未使用 workspace_runtime");
    }
    pids.push(`${name}|${pid}`);
  }
  process.stdout.write(command === "pids"
    ? pids.join("\n") + "\n"
    : "verified " + gatewayActiveNames(gateway).length + " Gateway-owned Workspace process(es)\n");
} else {
  fail("用法: production-pm2-plan.mjs create|read-pid|names|reconcile|apply|delete|verify|pids ...");
}
