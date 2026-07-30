#!/usr/bin/env node
import { readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const [command, ...argv] = process.argv.slice(2);
const valueAfter = (flag) => { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1] : ""; };
const fail = (message) => { console.error("[错误] " + message); process.exit(1); };
const readJson = (file) => JSON.parse(readFileSync(file === "-" ? 0 : file, "utf8"));
const writePrivateJson = (file, value) => {
  const temporary = file + ".tmp-" + process.pid;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  renameSync(temporary, file);
};
const REQUIRED_NAMES = new Set(["workspace", "workspace-wecom-agent"]);
const managedName = (name) => REQUIRED_NAMES.has(name);
const SAFE_ENV = new Set([
  "PORT", "HOSTNAME", "BUILD_VERSION", "NEXT_PUBLIC_BUILD_VERSION", "PG_POOL_MAX",
  "PG_APPLICATION_NAME", "WORKSPACE_DEPLOY_UNIT_ID", "WORKSPACE_INTERNAL_ORIGIN",
  "WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE", "WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE",
  "WORKSPACE_INTERNAL_REPLAY_DIRECTORY", "WECHAT_BOT_BRIDGE_URL",
]);
const FORBIDDEN_DATABASE_ENV = [
  "DIRECT_URL", "SHADOW_DATABASE_URL", "WORKSPACE_BACKUP_DATABASE_URL", "WORKSPACE_MONITOR_DATABASE_URL",
  "PGPASSWORD", "PGPASSFILE", "PGSERVICE", "PGSERVICEFILE", "PGOPTIONS", "PGUSER", "PGHOST", "PGDATABASE",
];
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
if (command === "create") {
  const input = valueAfter("--input");
  const output = valueAfter("--output");
  const remoteRootInput = path.resolve(valueAfter("--remote-root"));
  let remoteRoot;
  try { remoteRoot = realpathSync(remoteRootInput); } catch { fail("remote root 不存在"); }
  if (!input || !output || remoteRoot === path.parse(remoteRoot).root) fail("create 参数不完整");
  const source = readJson(input);
  if (!Array.isArray(source)) fail("PM2 snapshot 不是数组");
  const unexpected = source.map((entry) => String(entry?.name ?? ""))
    .filter((name) => name.startsWith("workspace") && !managedName(name));
  if (unexpected.length) fail("存在未纳入迁移的 Workspace 进程: " + unexpected.sort().join(", "));
  const processes = source.filter((entry) => managedName(entry?.name)).map((entry) => {
    const env = entry.pm2_env ?? {};
    let executable;
    let cwd;
    try {
      executable = realpathSync(path.resolve(String(env.pm_exec_path ?? "")));
      cwd = realpathSync(path.resolve(String(env.pm_cwd ?? "")));
    } catch { fail(entry.name + " 的 exec/cwd 不存在"); }
    const systemNode = realpathSync(process.execPath);
    if ((!executable.startsWith(remoteRoot + "/") && executable !== systemNode) || !cwd.startsWith(remoteRoot + "/")) {
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
  }).sort((left, right) => left.name.localeCompare(right.name));
  for (const required of REQUIRED_NAMES) {
    if (processes.filter((entry) => entry.name === required).length !== 1) fail("PM2 snapshot 必须且只能有一个 " + required);
  }
  writePrivateJson(output, { schemaVersion: 1, kind: "workspace-production-pm2-migration", createdAt: new Date().toISOString(), processes });
  process.stdout.write("planned " + processes.length + " Workspace process(es)\n");
} else if (command === "read-pid") {
  const file = valueAfter("--file");
  if (!file) fail("PM2 PID 文件参数缺失");
  let value;
  try { value = readFileSync(file, "utf8"); } catch { fail("PM2 PID 文件不可读"); }
  const match = /^([1-9][0-9]*)\n?$/.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[1]))) fail("PM2 PID 文件格式无效");
  process.stdout.write(match[1]);
} else if (command === "apply" || command === "delete") {
  const plan = readJson(valueAfter("--plan"));
  const runner = valueAfter("--runner");
  if (plan?.kind !== "workspace-production-pm2-migration" || !runner) fail("plan/runner 无效");
  for (const processSpec of plan.processes) {
    const args = command === "delete" ? ["delete", processSpec.name]
      : [
          "start", processSpec.executable, "--name", processSpec.name,
          "--cwd", processSpec.cwd, "--update-env",
          ...(processSpec.args.length > 0 ? ["--", ...processSpec.args] : []),
        ];
    const result = spawnSync(runner, args, {
      encoding: "utf8",
      env: { PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", ...processSpec.env },
    });
    if (result.status !== 0) {
      const status = Number.isInteger(result.status) ? result.status : "signal";
      fail(command + " " + processSpec.name + " 失败 exit=" + status + " stderr=" + safeStderrFirstLine(result.stderr));
    }
  }
} else if (command === "verify" || command === "pids") {
  const plan = readJson(valueAfter("--plan"));
  const runner = valueAfter("--runner");
  if (plan?.kind !== "workspace-production-pm2-migration" || !Array.isArray(plan.processes) || !runner) fail("plan/runner 无效");
  const result = spawnSync(runner, ["jlist"], { encoding: "utf8", env: { PATH: process.env.PATH ?? "/usr/bin" } });
  if (result.status !== 0) fail("无法读取隔离 PM2 状态");
  const actual = JSON.parse(result.stdout || "[]");
  const unexpected = actual.map((entry) => String(entry?.name ?? ""))
    .filter((name) => name.startsWith("workspace") && !managedName(name));
  if (unexpected.length) fail("隔离 PM2 存在额外 Workspace 进程: " + unexpected.sort().join(", "));
  const pids = [];
  for (const expected of plan.processes) {
    const matches = actual.filter((entry) => entry?.name === expected.name);
    if (matches.length !== 1) fail(expected.name + " 进程数不等于 1");
    const match = matches[0];
    if (match?.pm2_env?.status !== "online") fail(expected.name + " 未 online");
    const pid = Number(match?.pid);
    if (!Number.isSafeInteger(pid) || pid <= 0) fail(expected.name + " 无有效 PID");
    const processEnv = { ...(match.pm2_env.env ?? {}), ...match.pm2_env };
    const leaked = FORBIDDEN_DATABASE_ENV.filter((key) => Object.hasOwn(processEnv, key));
    if (leaked.length) fail(expected.name + " 泄露 control-plane PostgreSQL 环境: " + leaked.join(", "));
    let user = "";
    try { user = decodeURIComponent(new URL(String(processEnv.DATABASE_URL || "")).username); } catch {}
    if (user !== "workspace_runtime") fail(expected.name + " 未使用 workspace_runtime");
    pids.push(`${expected.name}|${pid}`);
  }
  process.stdout.write(command === "pids"
    ? pids.join("\n") + "\n"
    : "verified " + plan.processes.length + " Workspace process(es)\n");
} else {
  fail("用法: production-pm2-plan.mjs create|read-pid|apply|delete|verify|pids ...");
}
