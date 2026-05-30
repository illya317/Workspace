# 简单版浮窗 Agent 实施计划

## 目标

做一个可拖动、可交互的内部系统小助手。它以小机器人形象悬浮在页面右下角，能根据当前登录人的权限和职责查询数据、生成报告，并在用户确认后执行允许的修改操作。

第一版重点是安全可控，不追求全自动。Agent 可以建议修改，但不能绕过用户确认直接写库，且永远不提供删除能力。

## 产品形态

### 入口

- 全站右下角浮窗按钮，显示小机器人基础形象。
- 点击后展开为小型对话窗。
- 浮窗可拖动，记住上次位置。
- 闲置时可轻微漂移或眨眼，但不能遮挡主要操作区域。

### 状态

Agent 至少有这些状态：

| 状态 | 表现 | 触发 |
|---|---|---|
| idle | 微笑、待命 | 默认 |
| listening | 眼睛亮起 | 用户输入 |
| thinking | 小幅晃动、加载点 | 查询或分析中 |
| success | 开心表情 | 查询成功、报告生成 |
| warning | 疑惑表情 | 权限不足、参数缺失 |
| confirm | 认真表情 | 等待用户确认写入 |
| error | 沮丧表情 | API 错误 |

### 报告呈现

建议采用“两级报告”：

1. 对话窗内显示摘要，适合短结果。
2. 右侧抽屉或弹窗显示完整报告，适合表格、筛选结果、变更说明。

暂不建议第一版做独立页面。独立页面适合长期留档，放到第二版：`/agent/reports/[id]`。

## 视觉资产计划

### 已有资产

- 基础小机器人正面图：白色圆润机身、绿色状态灯、友好表情。

### 后续资产

| 阶段 | 资产 | 用途 |
|---|---|---|
| A1 | 基础正面 PNG/WebP | 浮窗按钮 |
| A2 | 三视图：正面、侧面、背面 | 统一建模参考 |
| A3 | 表情包：idle/listening/thinking/success/warning/confirm/error | 状态切换 |
| A4 | 小动作序列：眨眼、点头、漂移 | 轻量动效 |

第一版可以先用一张基础图 + CSS 动效。表情先用 face overlay 或替换图片，不要一开始做复杂动画。

## 架构设计

### 前端目录

```txt
app/components/agent/
  AgentFloatingButton.tsx
  AgentPanel.tsx
  AgentMessageList.tsx
  AgentInput.tsx
  AgentReportDrawer.tsx
  AgentConfirmModal.tsx
  AgentAvatar.tsx
  useAgentPosition.ts
  useAgentSession.ts
  types.ts
```

### 后端目录

```txt
app/api/agent/
  route.ts                # 对话入口：查询、计划、报告
  proposals/route.ts      # 创建待确认变更
  proposals/[id]/confirm/route.ts
  reports/[id]/route.ts   # 第二版可做

server/services/agent/
  orchestrator.ts         # 解析用户意图、选择工具
  permissions.ts          # 根据 SessionUser 生成能力清单
  tools.ts                # 工具注册表
  report.ts               # 统一报告格式
  proposals.ts            # 待确认变更
```

### 数据模型

第一版可以先不建表，用内存或直接返回 proposal。若要留痕，建议新增：

```prisma
model AgentProposal {
  id          Int      @id @default(autoincrement())
  userId      Int
  status      String   // pending | confirmed | cancelled | expired | failed
  actionKey   String
  targetType  String
  payloadJson String
  diffJson    String?
  resultJson  String?
  createdAt   DateTime @default(now())
  confirmedAt DateTime?
}

model AgentReport {
  id          Int      @id @default(autoincrement())
  userId      Int
  title       String
  summary     String?
  contentJson String
  createdAt   DateTime @default(now())
}
```

如果第一版不需要长期留痕，可以暂缓 `AgentReport`，但建议保留 `AgentProposal`，因为写入确认需要审计。

## 权限原则

Agent 不能有自己的超级权限。它只能使用当前登录人的权限。

### 允许

- 当前用户有 `access` 的模块：可查询。
- 当前用户有 `write` 的模块：可提出修改建议。
- 当前用户确认后：才执行写入。

### 禁止

- Agent 不能执行 DELETE。
- Agent 不能调用绕过权限的 service。
- Agent 不能替用户批量修改超出当前模块范围的数据。
- Agent 不能读取用户本来无权访问的数据。
- Agent 不能保存用户输入中的敏感密码。

### 权限映射示例

| 用户权限 | Agent 能力 |
|---|---|
| `people.access` | 查询员工、部门、岗位 |
| `people.write` | 提议修改员工/雇佣/部门信息 |
| `finance.ledger.access` | 查询科目、凭证、余额 |
| `finance.budget.access` | 查询预算版本和预算数据 |
| `finance.budget.write` | 提议导入或激活预算版本 |
| `finance.cost.access` | 查询成本管理数据 |

## 工具注册表

Agent 后端不直接自由调用 API，而是调用白名单工具。

```ts
type AgentTool = {
  key: string;
  label: string;
  requiredResource: string;
  requiredAction: "access" | "write";
  mutates: boolean;
  execute: (ctx, input) => Promise<AgentToolResult>;
};
```

第一版工具建议：

| 工具 | 类型 | 权限 | 说明 |
|---|---|---|---|
| `hr.searchEmployees` | query | `people.access` | 查员工 |
| `hr.updateEmployeeDraft` | proposal | `people.write` | 提议修改员工信息 |
| `finance.queryBudget` | query | `finance.budget.access` | 查预算 |
| `finance.activateBudgetVersionDraft` | proposal | `finance.budget.write` | 提议激活预算版本 |
| `finance.queryBalance` | query | `finance.ledger.access` | 查余额 |
| `works.queryTasks` | query | `work.access` | 查工作清单 |

所有 `mutates=true` 的工具只能返回 proposal，不能直接写库。

## 写入确认流程

1. 用户输入：“把张三手机号改成 138xxx。”
2. Agent 判断意图和权限。
3. 后端生成 `AgentProposal`：
   - actionKey
   - 目标记录
   - 原值
   - 新值
   - 风险说明
4. 前端弹出确认框：
   - 显示修改前/修改后
   - 显示影响范围
   - 用户点击确认
5. 前端调用 `/api/agent/proposals/{id}/confirm`
6. 服务端再次校验：
   - 用户是否仍登录
   - proposal 是否属于当前用户
   - proposal 是否未过期
   - 当前用户是否仍有 write 权限
7. 校验通过后执行真实写入。
8. 返回执行结果和报告。

## API 设计

### `POST /api/agent`

输入：

```json
{
  "message": "查询 2026 年预算",
  "context": {
    "page": "/finance/budget"
  }
}
```

返回：

```json
{
  "type": "answer | report | proposal | clarification",
  "message": "已查询到 2026 年生效预算版本。",
  "report": {},
  "proposal": null
}
```

### `POST /api/agent/proposals`

仅创建待确认变更，不写库。

### `POST /api/agent/proposals/[id]/confirm`

确认后写库。

### `POST /api/agent/proposals/[id]/cancel`

取消待确认变更。

## 前端行为

### 浮窗

- 默认右下角。
- 可拖动。
- 拖动结束后写入 `localStorage.agentPosition`。
- 小屏幕自动贴边。
- 展开后宽度约 360px，高度不超过视口 70%。

### 自移动

第一版只做“轻微漂移”：

- idle 超过 10 秒，浮窗在 8px 范围内轻微移动。
- 用户鼠标靠近或页面滚动时停止。
- 不跨越屏幕中心，不遮挡表单按钮。

不要第一版做真正“自己乱跑”，会影响使用。

### 表情切换

`AgentAvatar` 接收状态：

```ts
type AgentMood = "idle" | "listening" | "thinking" | "success" | "warning" | "confirm" | "error";
```

第一版可以用同一张图 + 表情 emoji badge 或 CSS glow。

## 报告格式

统一报告结构：

```ts
interface AgentReport {
  title: string;
  summary: string;
  sections: Array<{
    title: string;
    type: "text" | "table" | "list" | "metric";
    content: unknown;
  }>;
  source: Array<{
    label: string;
    href?: string;
  }>;
}
```

查询结果不要直接 dump JSON，要转成业务语言。

## 第一版范围

### 必做

- 浮窗按钮。
- 可拖动。
- 点击展开对话窗。
- 基于当前用户权限生成可用能力列表。
- 支持 3-5 个查询工具。
- 支持 1-2 个写入 proposal 工具。
- 写入前必须确认。
- 查询后返回摘要和报告抽屉。

### 不做

- 不做删除。
- 不做跨系统自动执行。
- 不做长期记忆。
- 不做复杂多轮任务编排。
- 不做任意 SQL 查询。
- 不做自动替用户点击页面按钮。

## 实施批次

### Batch 1：基础 UI 壳

- 新增 `app/components/agent/*`
- 接入全局布局或 Portal 后的主页面
- 实现拖动、展开/收起、基础状态动画
- 使用基础机器人图作为头像

验收：

- 任意业务页面右下角出现小助手
- 可拖动
- 刷新后位置保留
- 不遮挡主要内容

### Batch 2：Agent 后端框架

- 新增 `server/services/agent/*`
- 新增 `/api/agent`
- 根据 `SessionUser` 输出 capability list
- 接入 2 个只读查询工具

验收：

- 无权限用户看不到相关能力
- 查询只返回当前权限范围内数据

### Batch 3：报告抽屉

- 新增 `AgentReportDrawer`
- Agent 查询结果转成标准 `AgentReport`
- 支持文字、列表、表格

验收：

- 查询完成后对话窗有摘要
- 点击“查看报告”打开右侧报告抽屉

### Batch 4：写入 proposal

- 新增 `AgentConfirmModal`
- 新增 proposal service/API
- 支持一个 HR 修改或预算版本激活场景
- confirm 时二次鉴权

验收：

- Agent 只能生成待确认变更
- 用户取消则无任何写入
- 用户确认后才写库
- 无 delete 工具和 delete API

### Batch 5：文档与硬约束

- 新增 `app/components/agent/ARCHITECTURE.md`
- 更新 `README.md`
- 更新 `AGENTS.md` / `CLAUDE.md`：Agent 不得删除、不直接写库、必须 proposal confirm
- 可选新增检查：`rg "delete" server/services/agent app/api/agent` 不允许出现删除工具

验收：

```bash
npm run ci
```

## 风险点

| 风险 | 处理 |
|---|---|
| Agent 越权查询 | 所有工具必须绑定 RBAC |
| Agent 直接写库 | mutating tool 只能创建 proposal |
| 用户误确认 | 确认框显示 diff 和影响范围 |
| 文件变长 | UI 拆 components/hooks，service 拆 tools/report/proposals |
| 幻觉式报告 | 报告必须基于 tool result，不允许编造数据 |

## 后续增强

- 三视图机器人模型。
- 表情包资产。
- 语音输入。
- 页面上下文感知，例如当前在预算页时优先预算工具。
- 长报告保存到 `/agent/reports/[id]`。
- 管理员可配置 Agent 能力开关。
