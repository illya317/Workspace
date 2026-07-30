#!/usr/bin/env tsx

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import {
  buildPermissionActionKnowledge,
  type PermissionActionKnowledge,
  type PermissionActionKnowledgeBinding,
  type PermissionActionKnowledgeEntry,
  type PermissionActionKnowledgeResource,
} from "../packages/platform/permission-action-knowledge";

const OUTPUT_PATH = path.resolve(import.meta.dirname, "../docs/generated/permission-actions.md");

function configuredPermissionActionTargets() {
  const configuredRoot = process.env.WORKSPACE_CONFIG_DIR?.trim();
  if (!configuredRoot || !path.isAbsolute(configuredRoot)) return [];
  const root = fs.realpathSync(configuredRoot);
  const profilePath = path.join(root, "config/tenant/profile.json");
  if (!fs.existsSync(profilePath)) return [];
  const profile = JSON.parse(fs.readFileSync(profilePath, "utf8")) as {
    docs?: { companyDocuments?: Array<{ source?: string; file?: string }> };
  };
  return (profile.docs?.companyDocuments ?? [])
    .filter((document) => document.source === "permission-actions" && document.file)
    .map((document) => {
      const resolved = path.resolve(root, document.file!);
      if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
        throw new Error(`Configured permission action document escapes WORKSPACE_CONFIG_DIR: ${document.file}`);
      }
      return resolved;
    });
}

function cell(value: unknown) {
  return String(value ?? "—")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>");
}

function inlineCode(value: string) {
  return `\`${value}\``;
}

function impliedActions(entry: { impliedActions: readonly string[] }) {
  return entry.impliedActions.length ? entry.impliedActions.map(inlineCode).join("、") : "无";
}

function renderBinding(binding: PermissionActionKnowledgeBinding) {
  const routeText = binding.role === "direct" && binding.routes.length
    ? `；${binding.routes.map((route) => `${route.method} ${route.path}`).join("、")}`
    : "";
  if (binding.role === "direct") {
    return `直接执行：${binding.label}（${inlineCode(binding.businessActionKey)}${routeText}）`;
  }
  if (binding.role === "workflow_submit") {
    return `流程发起资格：可发起“${binding.label}”对应流程（${inlineCode(binding.businessActionKey)}；具体对象范围仍由 workflow/service 决定）`;
  }
  return `流程处理资格：可作为“${binding.label}”所发起流程的处理人（${inlineCode(binding.businessActionKey)}；具体处理接口和对象范围仍由 workflow/service 决定）`;
}

function renderBindings(entry: PermissionActionKnowledgeEntry) {
  if (entry.bindings.length === 0) {
    return entry.bindingCoverage === "unregistered_high_risk"
      ? "⚠ 未登记具体 BusinessAction；授权前必须继续核对页面/API guard 和 service。"
      : "页面/API guard（无独立 BusinessAction）。";
  }
  return entry.bindings.map(renderBinding).join("<br>");
}

function resourceSummary(resource: PermissionActionKnowledgeResource) {
  return [
    `类型：${resource.statusLabel}`,
    resource.href ? `页面：${inlineCode(resource.href)}` : null,
    resource.ownerKey ? `owner：${inlineCode(resource.ownerKey)}` : null,
    resource.scopeTypes.length ? `scope：${resource.scopeTypes.map(inlineCode).join("、")}` : "scope：全局",
  ].filter(Boolean).join(" · ");
}

function renderActionDictionary(knowledge: PermissionActionKnowledge) {
  const lines = [
    "## Action 通用字典",
    "",
    "Action 只定义授权类别，不承诺跨资源具有同一个业务结果。最终含义必须读取完整的 `resource.action`。",
    "",
    "| Action | 分组 | 通用含义 | 自动包含 | 风险级别 |",
    "|---|---|---|---|---|",
  ];
  for (const action of knowledge.actions) {
    lines.push(`| ${cell(`${inlineCode(action.key)} ${action.label}`)} | ${cell(action.group)} | ${cell(action.meaning)} | ${cell(impliedActions(action))} | ${action.risk === "high" ? "高：按完整权限核对" : "基础"} |`);
  }
  lines.push("");
  return lines;
}

function renderPermissionReviewGuide() {
  return [
    "## 定期复查与异常通报",
    "",
    "生产环境由发布运维 Agent 按租户业务时区每日 08:00 全量复查；后台授权事务提交后还会立即执行一次复查。两条路径共用同一份租户核准基线和异常判定，不会各自维护规则。",
    "",
    "复查覆盖：L1/L2 新增、移除和归属转移；任意未经核准的显式授权与漏撤销；直接授权用户调岗；持权岗位/部门换人；停用主体或停用资源仍有授权；非法或资源不支持的 action；提交/填报与审批/复核职责未分离；隐式全资源授权管理员岗位变化。异常会按 action 风险分级，但普通 `entry/read/update` 错授也会立即通报。",
    "",
    "真正的错授、漏撤、停用主体残留等异常会形成需要确认的站内强提醒，并在未解决期间按 24 小时再次提醒。提交/审批资格重合只形成一次普通流程提示：两类权限可以授给同一人，具体单据由 workflow/service 阻止提交人本人处理。所有结果都会写入服务器结构化日志。",
    "",
    "合法新增 L2、资源转移或显式授权变更，必须先由权限责任人复核，再运行 `npm run --silent permission-review:baseline` 生成纯 JSON 候选基线并提交租户配置；不能通过自动采纳当前数据库来消除报警。只读核查使用 `npm run permission-review:check`。",
    "",
  ];
}

function renderApproveGuide(
  resources: readonly PermissionActionKnowledgeResource[],
  permissionsByKey: ReadonlyMap<string, PermissionActionKnowledgeEntry>,
) {
  const rows = resources.filter((resource) => resource.supportedActions.includes("approve"));
  const lines = [
    "## `approve` 到底是什么意思",
    "",
    "`approve` 不是一个全局岗位，也不是 capability 名称。它是挂在具体业务资源上的高风险 action。它自动带来该资源的 `read + entry`，但不会带来 `submit`、`reject`、`create` 或 `update`。",
    "",
    "| 完整权限 | 资源 | 直接动作 / 流程资格 | 建议授权对象 | 配置方式 |",
    "|---|---|---|---|---|",
  ];
  for (const resource of rows) {
    const permission = permissionsByKey.get(`${resource.key}.approve`)!;
    lines.push(`| ${cell(inlineCode(permission.key))} | ${cell(resource.name)} | ${cell(renderBindings(permission))} | ${cell(permission.recommendedHolders)} | ${cell(permission.grantDescription)} |`);
  }
  lines.push("");
  return lines;
}

function renderResourceCatalog(
  resources: readonly PermissionActionKnowledgeResource[],
  permissionsByKey: ReadonlyMap<string, PermissionActionKnowledgeEntry>,
) {
  const groups = new Map<string, PermissionActionKnowledgeResource[]>();
  for (const resource of resources) {
    const groupKey = `${resource.moduleLabel}\u0000${resource.moduleKey}`;
    groups.set(groupKey, [...groups.get(groupKey) ?? [], resource]);
  }
  const lines = [
    "## 全项目资源 Action 清单",
    "",
    "每一行都是一个可独立判断的权限点。没有业务绑定不等于没有权限效果，只表示当前效果主要来自页面/API guard 或对象级 service；这种权限在授权前更需要查看资源说明。",
    "",
  ];
  for (const [groupKey, groupResources] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
    const [moduleLabel, moduleKey] = groupKey.split("\u0000");
    lines.push(`### ${moduleLabel}（${inlineCode(moduleKey)}）`, "");
    for (const resource of [...groupResources].sort((left, right) => left.key.localeCompare(right.key))) {
      lines.push(`#### ${resource.name}（${inlineCode(resource.key)}）`, "");
      lines.push(resourceSummary(resource), "");
      if (resource.notes) lines.push(`资源说明：${resource.notes}`, "");
      lines.push("| Action | 通用含义 | 直接动作 / 流程资格 | 配置与继承 | 自动包含 |", "|---|---|---|---|---|");
      for (const permissionKey of resource.permissionKeys) {
        const permission = permissionsByKey.get(permissionKey)!;
        lines.push(`| ${cell(`${inlineCode(permission.key)}<br>${permission.label}`)} | ${cell(permission.meaning)} | ${cell(renderBindings(permission))} | ${cell(permission.grantDescription)} | ${cell(impliedActions(permission))} |`);
      }
      lines.push("");
    }
  }
  return lines;
}

function renderDerivedResourceCatalog(resources: readonly PermissionActionKnowledgeResource[]) {
  const lines = [
    "## 派生空间与流程配置资源",
    "",
    "这些资源同样属于完整权限集合，但其 action 语义来自空间投影或流程配置树，不重复展开逐 action 表。空间权限必须连同具体 `scopeId` 判断；流程配置 capability 只控制流程规则，不授予业务数据审批权。",
    "",
    "| 资源 | 名称 | 类型 | Actions | 来源 / owner |",
    "|---|---|---|---|---|",
  ];
  for (const resource of resources) {
    const source = resource.notes?.match(/projection of ([^.]+(?:\.[^.]+)*)\./)?.[1]
      ?? resource.ownerKey
      ?? "系统派生";
    lines.push(`| ${cell(inlineCode(resource.key))} | ${cell(resource.name)} | ${cell(resource.statusLabel)} | ${cell(resource.supportedActions.map(inlineCode).join("、"))} | ${cell(inlineCode(source))} |`);
  }
  lines.push("");
  return lines;
}

export function renderPermissionActionDocs(knowledge = buildPermissionActionKnowledge()) {
  const primaryResources = knowledge.resources.filter((resource) => !resource.derived);
  const derivedResources = knowledge.resources.filter((resource) => resource.derived);
  const permissionsByKey = new Map(knowledge.permissions.map((permission) => [permission.key, permission]));
  const lines = [
    "<!-- AUTO-GENERATED by scripts/generate-permission-action-docs.ts. DO NOT EDIT. -->",
    "",
    "# 全项目权限 Action 授权手册",
    "",
    "## 目录",
    "",
    "| 问题 | 章节或结构化入口 |",
    "|---|---|",
    "| 授权前必须遵守什么 | 授权前先看这四条 |",
    "| 权限如何复查和报警 | 定期复查与异常通报 |",
    "| action 的通用含义 | Action 通用字典 |",
    "| approve 在不同资源的含义 | approve 到底是什么意思 |",
    "| 某个资源有哪些 action | 全项目资源 Action 清单 |",
    "| 派生空间和流程配置权限 | 派生空间与流程配置资源 |",
    "| 精确查询单个权限或 API 绑定 | `GET /api/modules/docs/company/permission-actions` |",
    "",
    `当前共 ${knowledge.summary.actionCount} 个 permission action、${knowledge.summary.resourceCount} 个资源策略、${knowledge.summary.businessActionCount} 个已注册 BusinessAction。`,
    "",
    "事实来源：`action-registry.ts`、`permission-resource-policy.ts`、`module-registry.ts` 与 `business-action-registry.ts`。业务写入的状态、校验和持久化细节继续以 `action-contracts.md` 为准。",
    "",
    "## 授权前先看这四条",
    "",
    "1. 永远按完整的 `resource.action` 授权，不能只看 `approve`、`update` 这样的 action 名。",
    "2. `approve` 可能表示审批、复核、启用、发布或关闭表决；下方的业务绑定才是它在当前资源里的真实含义。",
    "3. `显式配置` 只表示不能从父资源继承，仍然可以配置给用户、岗位或部门；岗位/部门成员会获得有效权限。",
    "4. 有 action 权限不等于能操作所有对象。scope、对象归属、状态机、职责分离和 service guard 仍会继续收紧。",
    "",
    "相关文档：[`RBAC 权限模型`](../engineering/security/rbac.md) · [`权限矩阵`](../engineering/security/permission-matrix.md) · [`ActionContract Registry`](./action-contracts.md)",
    "",
    ...renderPermissionReviewGuide(),
    ...renderActionDictionary(knowledge),
    ...renderApproveGuide(primaryResources, permissionsByKey),
    ...renderResourceCatalog(primaryResources, permissionsByKey),
    ...renderDerivedResourceCatalog(derivedResources),
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}

function main() {
  const rendered = renderPermissionActionDocs();
  const configuredTargets = configuredPermissionActionTargets();
  if (process.argv.includes("--check")) {
    const staleTargets = [OUTPUT_PATH, ...configuredTargets].filter((target) => {
      const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
      return current !== rendered;
    });
    if (staleTargets.length > 0) {
      process.stderr.write("Generated permission action documentation is stale. Run `npm run docs:permission-actions`.\n");
      for (const target of staleTargets) process.stderr.write(`- ${target}\n`);
      process.exit(1);
    }
    process.stdout.write("✓ Generated permission action documentation is current.\n");
    return;
  }
  fs.writeFileSync(OUTPUT_PATH, rendered, "utf8");
  for (const target of configuredTargets) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, rendered, "utf8");
  }
  process.stdout.write(`Generated ${[OUTPUT_PATH, ...configuredTargets].map((target) => path.relative(process.cwd(), target)).join(", ")}.\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
