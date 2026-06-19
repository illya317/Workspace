# Level 2 Agent Execution Guide

这份文档给 Feature / Data / Operations agent 开工用。Architecture agent 负责发现结构漂移、维护 gate/registry/API contract/baseline，并把问题拆成可执行任务包；其他 agent 按任务包执行，不重新定义规则。

## 1. Level 2 三件套

Level 2 当前只落地三类结构智能，不引入第二套架构系统：

| 能力 | 权威入口 | 用途 | 谁可以改 |
|---|---|---|---|
| AST / pattern scan | `scripts/arch/level2.ts` | 发现重复 UI pattern、API route 模板漂移、旧 service 债、app hook/UI 存量 | Architecture |
| Registry | `packages/platform/module-registry.ts` | 模块、资源、路由和 API guard 的注册锁 | Architecture |
| API Contract | `packages/platform/api-registry.ts` | 从 module registry 派生 API contract，识别未注册 route | Architecture |
| Core UI registry | `packages/core/ui/component-registry.ts` | 给 AST/pattern scan 提供可消费的 Core UI primitive/page shell 白名单 | Architecture/Core |

强制执行仍只通过 `npm run arch:gate`。`npm run arch:level2` 是报告和拆任务输入，不是独立 CI gate。

## 2. 角色启动规则

每个 agent 开工前必须先做：

```bash
git status --short --branch
```

然后按角色分流：

| 角色 | 执行重点 | 不要做 |
|---|---|---|
| Architecture | 规则、文档、`scripts/arch/*`、module/API registry、baseline ratchet、任务包 | 业务功能实现、业务体验细节、数据生成内容 |
| Feature | `packages/<domain>/ui`、`packages/<domain>/server`、`app/<domain>` 薄壳、`app/api/<domain>` 薄壳 | gate/CI/auth/module enforcement、未分配 baseline |
| Data | Prisma、migration、seed、导入脚本、生成脚本和生成物 | 通用 UI、页面体验、架构 gate |
| Operations | CI、部署、环境、package scripts、运行态脚本 | 领域业务规则、页面 UI、service 业务逻辑 |

如果任务会跨角色，先让 Architecture 或 Orchestrator 拆分；不要一个 agent 同时改 gate、业务 UI、schema 和 CI。

## 3. 任务包执行格式

Architecture 给出的任务包必须至少包含：

```txt
目标:
范围:
文件:
动作: move | delete | refactor | rewrite | ratchet
目标层: core | platform | package | app-shell | api-shell | data | ops
依赖:
禁止触碰:
验证:
风险:
```

Feature/Data/Operations agent 收到后按以下规则执行：

1. 只改 `文件` 字段列出的目标文件，或执行动作必需的紧邻文件。
2. 严格按 `依赖` 顺序走；不要先删旧代码再补新入口。
3. 发现需要改 `scripts/arch/*`、`packages/platform/module-registry.ts`、`packages/platform/api-registry.ts`、baseline 或 CI gate 时，停止并回传 Architecture。
4. 目标文件已有其他 agent 改动时，先读 diff，顺着已有改动继续；无法合并就回传，不覆盖。
5. 交付时说明完成了哪些文件动作、跑了哪些验证、哪些风险未处理。

## 4. 标准迁移顺序

Level 2 任务必须按依赖执行，常见顺序如下：

| 场景 | 正确顺序 |
|---|---|
| API route 缩薄 | 先补 `packages/<domain>/server` service/schema -> route 改为认证/权限/校验/service/DTO -> 删除 route 内 Prisma/业务计算 -> ratchet baseline |
| UI pattern 收口 | 先确认 Core/Platform 是否已有入口 -> 缺通用入口则由 Core 补齐 -> domain 组件改为薄业务包装 -> 删除 app/一次性组件 -> ratchet baseline |
| 搜索框收口 | 先确认 `SearchInput` / `FKSearchInput` / `SelectField` / `OptionPicker` 是否覆盖场景 -> 删除 app/业务包一次性搜索控件 -> 业务侧只传 value/options/fkKey -> 确认 `nativeSearchInputFiles` 仍为 0 |
| 页面设计壳收口 | 先确认 `packages/core/ui/component-registry.ts` 是否已有 PageShell/PageContent/PanelCard/SectionCard/SplitWorkspace/DataTable/FilterToolbar 等入口 -> 缺失则 Architecture/Core 先登记并导出 -> Feature 改业务页消费 Core -> 删除业务包内手写 `bg-white + rounded + shadow/border` 页面壳 -> ratchet `pageDesignDriftFiles` baseline |
| Core UI 新入口 | 先实现 Core primitive/page shell -> 写入 `packages/core/ui/component-registry.ts` 并补中文 `description`、中文 `example` 和 `includes` 组合信息 -> 从 `packages/core/ui/index.ts` 导出 -> 如需可视化示例则在 `RegistryBrowserCard` 的 `ComponentPreview` 增加 case -> 跑 `arch:gate` 确认 `unregisteredCoreUiExports` 和 `duplicateCoreUiRegistrations` 仍为 0 |
| module/API contract 漂移 | 先更新 module registry 或 API contract -> route/service 对齐 -> 跑 `arch:level2` 确认无新增漂移 -> 跑 `arch:gate` |
| 旧目录迁移 | 先在 package 建真实实现 -> 旧 `app/components`、`app/hooks`、`lib` 改 re-export -> 更新 import -> 删除无引用旧文件 |

优先级固定为：

```txt
boundary corruption > validation weakness > abstraction gap > migration debt > duplication
```

## 5. Baseline 规则

baseline 是历史债锁，不是白名单。

- 只能减少，不能为了新违规扩写。
- 迁移消除一项债务后，同步从对应 baseline 删除。
- Feature/Data/Operations 不主动改 baseline，除非任务包明确授权 `动作: ratchet`。
- 常见 baseline：
  - `scripts/arch/level15-baseline.json`
  - `scripts/arch/level2-baseline.json`
  - `scripts/check/level1-api-baseline.json`

`pageDesignDriftFiles` 是非 Core 包手写页面壳的历史债。Feature/UI 每迁走一个文件后，Architecture 负责从 `scripts/arch/level2-baseline.json` 删除对应项；Feature/Data/Operations 不要为了通过 gate 自行扩写该 baseline。

`nativeSearchInputFiles` 是搜索型原生 input 的硬约束，baseline 必须保持空数组。Feature/UI 发现旧的一次性搜索控件时应删除并改用 Core `SearchInput` / `FKSearchInput` / `SelectField` / `OptionPicker`，不要维护旧控件，也不要为新文件扩写 baseline。

`unregisteredCoreUiExports` 和 `duplicateCoreUiRegistrations` 的 baseline 必须保持空数组。新增 Core UI 组件时，不能只从 `packages/core/ui/index.ts` 导出；必须同步登记到 `packages/core/ui/component-registry.ts`，并填写中文 `description` 与中文 `example`。`example` 会自动显示在 Core UI 注册表页面；没有 `example` 会被 TypeScript 的 registry 类型拦住。如果导出的是 hook、className helper、registry set 等非组件能力，只能由 Architecture 在 `scripts/arch/level2.ts` 的非组件导出集合中显式说明。

## 6. 当前并行避让

- Work 业务包是 `packages/work`，不是 `packages/project`。工作计划、工作清单、工作汇报、历史记录归 Work；不要把 Project / EmployeeProject 修回 HR。
- Work Feature 线程可能改 `/work`、`app/work/*`、`app/api/work/*`、`packages/work/*`，以及必要的 Core 分栏/页面骨架入口。其他 agent 避免提交这些范围。
- Production/QC Data 线程可能改 `.workspace/config/scripts/generate-product-stage-tests.mjs` 和 pharma-qc 生成物。其他 agent 不要提交、格式化或回滚这些文件。
- Architecture 线程改文档、gate、registry、API contract 和 baseline。Feature/Data/Operations 不要私自修改这些文件。

## 7. 最低验证

按角色选择验证，不需要为了小文档改动跑完整 build：

| 角色 | 最低验证 |
|---|---|
| Architecture | `npm run docs:check`; 改 gate/registry/baseline 时加 `npm run arch:gate` |
| Feature | `npm run arch:gate`; `npm run typecheck:quick`; 涉及 UI 时按需浏览器验证 |
| Data | `npm run arch:gate`; `npm run db:validate`; 涉及生成脚本时跑对应生成/审计命令 |
| Operations | `npm run arch:gate`; 相关 CI/script dry run |

本地 dev server 只允许 3000 端口一个实例。需要启动前先查：

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```
