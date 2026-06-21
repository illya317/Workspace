# Agent 智能助手 — 架构文档

## 定位

平台级 Agent 编排层。不是独立应用，也不属于 HR/Finance 子模块。

## 目录

```text
app/components/agent/       # 浮窗、面板、输入、报告抽屉、确认弹窗
app/api/agent/              # 对话入口 + capabilities + proposals
packages/platform/server/agent/ # 编排、能力清单、工具契约、prompt、proposal、LLM provider
packages/hr/server/agent-tools.ts # HR 工具适配器与 HR proposal 执行器
packages/finance/server/agent-tools.ts # Finance 工具适配器
public/assets/agent/avatar/ # 头像图片资产
```

## 请求流程

```txt
AgentPanel
  → POST /api/agent {message, history}
    → authenticate (getCurrentUser)
    → inject domain agent tools
    → buildCapabilities(user, tools) → 白名单工具列表
    → buildClassifyPrompt → LLM classifyIntent (MiniMax / noop fallback)
    → findTool(tools) → 二次权限校验
    → tool.execute → 调用领域 service
    → 查询: LLM summarizeResult → answer
    → 写入: createProposal → proposal (不写库)
  → AgentPanel 展示
    → 查询: 气泡 + 查看报告 → AgentReportDrawer
    → 写入: AgentConfirmModal → confirm → POST /api/agent/proposals/:id/confirm
```

## 权限原则

- Agent 只能使用当前登录人的权限
- Platform 只拥有 Agent 内核；HR/Finance 工具适配器由对应业务包暴露
- 所有工具通过 app/api/agent 注入，mutates=true 只能返回 proposal
- confirm 时二次鉴权（同用户 + pending + 未过期 + write 权限）
- 永无删除能力

## 工具注册

```txt
hr.searchEmployees     mutates=false  hr.roster.access
hr.updateEmployee      mutates=true   canEditHR
hr.batchUpdateEmployee mutates=true   canEditHR
finance.queryBudget    mutates=false  finance.budget.access
```

## 数据模型

`AgentProposal` — 待确认变更审计记录，见 `prisma/models/agent.prisma`

## Batch 状态

- Batch 1 ✓ 浮窗 UI
- Batch 2 ✓ 后端框架 + 2 查询工具
- Batch 3 ✓ 报告抽屉 + 动态能力清单
- Batch 4 ✓ 写入 proposal + confirm/cancel + 批量修改
- Batch 5 □ 文档硬约束（本文件即 Batch 5）
