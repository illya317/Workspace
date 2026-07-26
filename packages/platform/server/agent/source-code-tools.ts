import type { AgentExecutionContext } from "./execution";

import { buildCnbPullRequestProposalDraft } from "./cnb-pr";
import { createProposal } from "./proposals";
import { resolveSourceRepo } from "./source-repository";
import {
  sourceQueryHints,
  sourceSeedFiles,
  sourceTermMatches,
  uniqueStrings,
  type SourceQueryHints,
  type SourceRepositoryReader,
} from "./source-route-context";
import type { AgentTool, AgentToolResult } from "./tools";

const MAX_CANDIDATE_FILES = 900;
const MAX_SNIPPETS = 8;
const MAX_STARTUP_DOC_CHARS = 2_400;
const MAX_PR_FIELD_CHARS = 1_200;
const MAX_PR_PATCH_CHARS = 180_000;

const REQUIRED_STARTUP_FILES = [
  "AGENTS.md",
  "docs/README.md",
  "docs/engineering/project-overview.md",
  "docs/engineering/agent-startup.md",
] as const;

type SourceSnippet = { file: string; line: number; text: string };

type StartupDoc = {
  file: string;
  role: "required" | "routed";
  excerpt: string;
  truncated: boolean;
};

function normalizeQuery(value: unknown) {
  return String(value ?? "").trim().slice(0, 300);
}

function queryTerms(query: string, hints: SourceQueryHints = sourceQueryHints(query)) {
  const terms = new Set<string>();
  const normalized = query.toLowerCase();
  hints.contextTerms.forEach((term) => terms.add(term));
  hints.routePages.forEach((file) => terms.add(file));
  query
    .split(/[\s,，。！？!?、:：/\\()[\]{}'"`]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .forEach((term) => terms.add(term));

  if (/hr|人事|员工|花名册|组织|岗位/.test(normalized)) {
    ["hr", "roster", "hr.roster", "员工资料", "员工信息表", "人事基础资料"].forEach((term) => terms.add(term));
  }
  if (/组织信息|组织架构|部门岗位|部门|岗位|现用|归档/.test(normalized)) {
    [
      "department-position",
      "DepartmentPositionTab",
      "department-detail-pane",
      "department-detail",
      "position-editor",
      "navigation-panels",
      "use-department-position-actions",
      "保存组织信息",
      "departmentDraft",
      "canEditDepartmentDraft",
      "isGovernanceOrganizationReadonly",
      "hierarchyKind",
      "组织编码",
      "组织名称",
      "负责人岗位",
      "positionDepartmentReadOnly",
      "organization",
    ].forEach((term) => terms.add(term));
  }
  if (/输入|编辑|禁用|只读|不可输入|不给输入|readOnly|disabled/.test(normalized)) {
    ["readOnly", "disabled", "canEdit", "canArchive", "positionDepartmentReadOnly"].forEach((term) => terms.add(term));
  }
  if (/权限|资源|rbac|resource|guard|鉴权|授权/.test(normalized)) {
    ["resourceKey", "RBAC", "permission", "requireRouteAccess", "requireApiAccess", "module-registry"].forEach((term) => terms.add(term));
  }
  if (/agent|助手|智能体|源码|架构|代码|cnb|github/.test(normalized)) {
    ["agent", "module-registry", "project-overview", "architecture-governance"].forEach((term) => terms.add(term));
  }
  if (/api|接口|route|路由/.test(normalized)) {
    ["api", "route", "apiGuards", "apiPrefixes"].forEach((term) => terms.add(term));
  }

  return [...terms].slice(0, 28);
}

function includesIgnoreCase(haystack: string, needle: string) {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

function candidatePath(file: string, terms: string[], hints: SourceQueryHints, seedFileSet: Set<string>) {
  const lowerFile = file.toLowerCase();
  if (file.includes("node_modules/") || file.includes(".next/") || file.includes("generated/prisma/")) return false;
  if (!/\.(ts|tsx|md|json|yml|yaml|prisma)$/.test(file) && file !== "AGENTS.md" && file !== "package.json") return false;
  if (seedFileSet.has(file)) return true;
  if (hints.routePages.includes(file)) return true;
  if (hints.moduleKey) {
    const modulePrefixes = [
      `packages/${hints.moduleKey}/ui/`,
      `packages/${hints.moduleKey}/constants/`,
      `packages/${hints.moduleKey}/types`,
      `app/(modules)/${hints.moduleKey}/`,
    ];
    if (modulePrefixes.some((prefix) => file.startsWith(prefix))) return true;
  }
  if (terms.some((term) => lowerFile.includes(term.toLowerCase()))) return true;
  if (file.startsWith("docs/") || file === "AGENTS.md" || file === "package.json") return true;
  if (file === "packages/platform/module-registry.ts") return true;
  if (file.startsWith("packages/platform/server/agent/")) return true;
  if (file.startsWith("packages/platform/permission") || file.startsWith("packages/platform/server/auth/")) return true;
  if (file.startsWith("app/api/agent/")) return true;
  if (file.startsWith("app/(modules)/")) return true;
  if (file.startsWith("app/(system)/")) return true;
  if (terms.some((term) => /hr|roster|员工|人事/.test(term.toLowerCase())) && file.startsWith("packages/hr/")) return true;
  if (terms.some((term) => /finance|预算|财务/.test(term.toLowerCase())) && file.startsWith("packages/finance/")) return true;
  if (terms.some((term) => /work|项目|任务/.test(term.toLowerCase())) && file.startsWith("packages/work/")) return true;
  return false;
}

function lineSnippet(lines: string[], index: number) {
  const start = Math.max(0, index - 2);
  const end = Math.min(lines.length, index + 3);
  return redactText(lines.slice(start, end).map((line, offset) => `${start + offset + 1}: ${line}`).join("\n"));
}

async function searchSource(query: string): Promise<AgentToolResult> {
  if (!query) return { type: "error", message: "缺少源码查询关键词" };

  const repo = await resolveSourceRepo();
  const startupContext = await readStartupContext(repo.reader, query);
  const sourceHints = sourceQueryHints(query);
  const terms = queryTerms(query, sourceHints);
  const seedFiles = await sourceSeedFiles(repo.reader, sourceHints, terms);
  const seedFileSet = new Set(seedFiles);
  const repoFiles = (await repo.listFiles())
    .filter((file) => candidatePath(file, terms, sourceHints, seedFileSet));
  const files = uniqueStrings([...seedFiles, ...repoFiles])
    .slice(0, MAX_CANDIDATE_FILES);
  const snippets: SourceSnippet[] = [];

  for (const file of files) {
    const content = await repo.reader.readText(file);
    if (!content) continue;
    const lower = content.toLowerCase();
    const lowerFile = file.toLowerCase();
    const matchedTerms = terms.filter((term) => lower.includes(term.toLowerCase()) || lowerFile.includes(term.toLowerCase()));
    if (matchedTerms.length === 0 && !seedFileSet.has(file)) continue;

    const lines = content.split(/\r?\n/);
    const firstIndex = lines.findIndex((line) => matchedTerms.some((term) => includesIgnoreCase(line, term)));
    const snippetIndex = firstIndex >= 0 ? firstIndex : firstInterestingLine(lines);
    snippets.push({ file, line: snippetIndex + 1, text: lineSnippet(lines, snippetIndex) });
  }

  const ranked = snippets
    .sort((a, b) => scoreSnippet(b, terms, sourceHints, seedFileSet) - scoreSnippet(a, terms, sourceHints, seedFileSet))
    .slice(0, MAX_SNIPPETS);

  const sourceLabel = repo.mode === "local" ? "本地源码" : "CNB 源码";
  if (ranked.length === 0) {
    return {
      type: "empty",
      message: `已读取${sourceLabel} ${repo.commit.slice(0, 8)}，但没有找到与"${query}"匹配的片段。`,
      data: { sourceMode: repo.mode, repoUrl: repo.repoUrl, branch: repo.branch, commit: repo.commit, dirtySummary: repo.dirtySummary, startupContext, routeContext: { ...sourceHints, seedFiles }, terms, snippets: [] },
    };
  }

  return {
    type: "data",
    message: `从${sourceLabel} ${repo.commit.slice(0, 8)} 找到 ${ranked.length} 个相关片段。`,
    data: { sourceMode: repo.mode, repoUrl: repo.repoUrl, branch: repo.branch, commit: repo.commit, dirtySummary: repo.dirtySummary, startupContext, routeContext: { ...sourceHints, seedFiles }, terms, snippets: ranked },
  };
}

function scoreSnippet(snippet: SourceSnippet, terms: string[], hints: SourceQueryHints, seedFileSet: Set<string>) {
  const haystack = `${snippet.file}\n${snippet.text}`.toLowerCase();
  const file = snippet.file.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term.toLowerCase())) score += term.length > 4 ? 2 : 1;
  }
  if (seedFileSet.has(snippet.file)) score += 18;
  if (hints.routePages.includes(snippet.file)) score += 12;
  if (hints.moduleKey && file.startsWith(`packages/${hints.moduleKey}/ui/`)) score += 4;
  if (hints.moduleKey === "settings" && file.startsWith("packages/platform/ui/admin/")) score += 10;
  if (hints.moduleKey === "settings" && file.startsWith("app/(system)/settings/")) score += 8;
  if (hints.contextTerms.some((term) => sourceTermMatches(snippet.file, [term]))) score += 8;
  if (snippet.file.includes("module-registry")) score += 5;
  if (file.startsWith("packages/hr/ui/tabs/department-position/")) score += 10;
  if (file.includes("department-detail-pane")) score += 12;
  if (file.includes("department-position")) score += 6;
  if (file.startsWith("packages/hr/")) score += 5;
  if (file.startsWith("app/(modules)/hr/")) score += 4;
  if (snippet.file.includes("ARCHITECTURE.md")) score += 4;
  if (snippet.file.includes("docs/engineering/security")) score += 4;
  if (snippet.file.includes("project-overview")) score += 3;
  return score;
}

function firstInterestingLine(lines: string[]) {
  const index = lines.findIndex((line) => line.trim() && !line.trim().startsWith("import "));
  return index >= 0 ? index : 0;
}

function routedStartupFiles(query: string) {
  const normalized = query.toLowerCase();
  const files = new Set<string>(REQUIRED_STARTUP_FILES);

  if (/架构|边界|权限|资源|rbac|api|contract|registry|源码|agent|cnb|github/.test(normalized)) {
    files.add("docs/roles/architecture.md");
  }
  if (/ui|页面|功能|业务|员工|人事|hr|toolbar|入口/.test(normalized)) {
    files.add("docs/roles/feature.md");
  }
  if (/运维|部署|ci|环境|服务器|日志|告警/.test(normalized)) {
    files.add("docs/roles/operations.md");
  }
  if (/review|审核|pr|pull request|合并/.test(normalized)) {
    files.add("docs/roles/review.md");
  }
  if (/schema|migration|seed|导入|数据/.test(normalized)) {
    files.add("docs/roles/data.md");
  }
  if (/协调|拆任务|多 agent|集成/.test(normalized)) {
    files.add("docs/roles/coordinator.md");
  }

  return [...files];
}

async function readStartupContext(reader: SourceRepositoryReader, query: string): Promise<StartupDoc[]> {
  const requiredFiles = new Set<string>(REQUIRED_STARTUP_FILES);
  const docs: StartupDoc[] = [];

  for (const file of routedStartupFiles(query)) {
    const content = await reader.readText(file);
    if (!content) continue;
    const redacted = redactText(content.trim());
    docs.push({
      file,
      role: requiredFiles.has(file) ? "required" : "routed",
      excerpt: truncateText(redacted, MAX_STARTUP_DOC_CHARS),
      truncated: redacted.length > MAX_STARTUP_DOC_CHARS,
    });
  }

  return docs;
}

function truncateText(value: string, maxChars: number) {
  const normalized = value.trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}\n...[truncated]`;
}

function redactText(value: string) {
  return value
    .replace(/\b(Bearer)\s+[A-Za-z0-9._-]{12,}/gi, "$1 [REDACTED]")
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[REDACTED_TOKEN]")
    .replace(
      /\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY)[A-Z0-9_]*)(\s*[:=]\s*)["']?[^"'\s]+["']?/gi,
      "$1$2[REDACTED]",
    );
}

function normalizeText(value: unknown, maxChars = MAX_PR_FIELD_CHARS) {
  return truncateText(String(value ?? "").trim(), maxChars);
}

function normalizePatch(value: unknown) {
  return String(value ?? "").trim().slice(0, MAX_PR_PATCH_CHARS);
}

function normalizeTextArray(value: unknown, maxItems = 12) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item, 240)).filter(Boolean).slice(0, maxItems);
  }
  const text = normalizeText(value, 600);
  return text ? [text] : [];
}

function normalizeValidationArray(value: unknown) {
  const items = normalizeTextArray(value);
  const normalized = items.map((item) => {
    if (/\beslint\b/.test(item) && (/\.md\b/.test(item) || /\bdocs\//.test(item))) {
      return "npm run docs:check";
    }
    return item;
  });
  return [...new Set(normalized)];
}

export const sourceSearchTool: AgentTool = {
  key: "source.searchWorkspaceCode",
  label: "查询 Workspace 源码",
  description: "只读搜索 Workspace 源码、架构文档、模块 registry 和权限文档。配置 AGENT_SOURCE_WORKTREE 时读取本地 worktree（含未提交改动），否则读取 CNB 远端快照，用于解释页面、API、权限和实现路径。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "源码/架构/API/RBAC/页面问题。保留用户原问题，并补充模块关键词。",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  examples: [
    {
      user: "HR 页面资源怎么定义，agent 能读哪些结构？",
      arguments: { query: "HR 页面 resourceKey RBAC module-registry agent 源码权限边界" },
    },
    {
      user: "这个项目 agent 接源码应该走哪里？",
      arguments: { query: "agent source code tools AGENTS docs project overview orchestrator" },
    },
  ],
  requiredPermissions: [{ resourceKey: "agent.source", action: "read" }],
  delegatedExecution: true,
  requiresAgentProfile: true,
  mutates: false,

  async execute(params: Record<string, unknown>) {
    const query = normalizeQuery(params.query ?? params.keyword ?? params.question);
    return searchSource(query);
  },
};

export const prProposalTool: AgentTool = {
  key: "source.proposePullRequest",
  label: "提出 PR 草案",
  description: "基于已授权 Workspace 源码阅读结果生成待确认 CNB PR 草案，包含标题、范围、涉及文件、unified diff patch、验证方式和风险；只入库为 proposal，用户确认后才会推分支并创建 PR。",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "建议 PR 标题" },
      summary: { type: "string", description: "变更目标和主要思路" },
      files: {
        type: "array",
        items: { type: "string" },
        description: "建议改动的文件路径列表",
      },
      validation: {
        type: "array",
        items: { type: "string" },
        description: "建议运行的验证命令或人工检查点；只写项目里已有或适用的命令，Markdown 文档优先用 npm run docs:check 或人工核对，不要编造 eslint docs/*.md",
      },
      risks: {
        type: "array",
        items: { type: "string" },
        description: "需要 Codex 审核的风险点",
      },
      patch: {
        type: "string",
        description: "Unified diff patch，必须能被 git apply 应用。没有 patch 时只能保存草案，不能提交代码 PR。",
      },
    },
    required: ["title", "summary", "files", "validation", "patch"],
    additionalProperties: false,
  },
  examples: [
    {
      user: "给 agent 源码阅读能力提个 PR 草案",
      arguments: {
        title: "Add read-only source-code tools for agent answers",
        summary: "让 agent 在回答源码和架构问题前读取 AGENTS.md 与路由后的 docs，并用只读工具搜索已授权 Workspace 源码。",
        files: [
          "packages/platform/server/agent/source-code-tools.ts",
          "packages/platform/server/agent/orchestrator.ts",
        ],
        validation: ["npm run typecheck:quick -- --pretty false", "npx eslint packages/platform/server/agent"],
        risks: ["确认工具不会读取服务器运行数据", "确认漏洞问题在进入工具前被拒绝"],
        patch: "diff --git a/packages/platform/server/agent/source-code-tools.ts b/packages/platform/server/agent/source-code-tools.ts\n--- a/packages/platform/server/agent/source-code-tools.ts\n+++ b/packages/platform/server/agent/source-code-tools.ts\n@@\n-// TODO\n+// example patch\n",
      },
    },
  ],
  requiredPermissions: [{ resourceKey: "agent.source", action: "submit" }],
  delegatedExecution: true,
  requiresAgentProfile: true,
  mutates: true,

  async execute(params: Record<string, unknown>, execution: AgentExecutionContext) {
    const title = normalizeText(params.title, 180);
    const summary = normalizeText(params.summary);
    const validation = normalizeValidationArray(params.validation);
    const risks = normalizeTextArray(params.risks);
    const patch = normalizePatch(params.patch);

    if (!title || !summary || !patch) {
      return {
        type: "error",
        message: "PR 草案缺少标题、摘要、涉及文件或 patch。",
      };
    }

    let draft: Awaited<ReturnType<typeof buildCnbPullRequestProposalDraft>>;
    try {
      draft = await buildCnbPullRequestProposalDraft({ title, summary, files: params.files, validation, risks, patch });
    } catch (error) {
      return {
        type: "error",
        message: error instanceof Error ? error.message : "PR 草案目标或文件路径无效。",
      };
    }
    const { binding, diff, payload } = draft;
    const result = await createProposal(execution, {
      actionKey: "source.submitCnbPullRequest",
      toolKey: "source.proposePullRequest",
      targetType: "CnbPullRequest",
      targetId: binding.repositoryUrl,
      payload,
      diff,
    });

    return {
      type: "proposal",
      message: `已生成 CNB PR 草案 #${result.proposalId}：${title}。补丁 ${binding.patchSha256.slice(0, 12)}… 已绑定到 ${binding.repository}@${binding.baseBranch}，确认后才会推送 ${binding.branch} 并创建 PR。`,
      proposal: {
        id: result.proposalId,
        actionKey: "source.submitCnbPullRequest",
        targetType: "CnbPullRequest",
        targetId: binding.repositoryUrl,
        diff,
      },
    };
  },
};

export const sourceCodeAgentTools: AgentTool[] = [sourceSearchTool, prProposalTool];
