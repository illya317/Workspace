# Agent Startup Protocol

这是一张给新 agent 的开工卡片。目标是快速判断角色、文件位置和第一批检查点。

## 0. 项目特点

- 三层：`Core -> Platform -> Apps`。
- App route/API route 是壳；真实 UI/service 在 package。
- L2 权限四件套：`app route` / `URL href` / `resourceKey + RBAC` / `API contract + guard`。
- 写入三段式：`Zod schema -> domain validator -> service/Prisma`。
- Core/Platform 已有大量基础设施，先查再写。

## 1. 开工顺序

1. 运行 `git status --short --branch`，确认当前分支和已有脏文件。
2. 按任务选角色文档：Feature / Data / Architecture / Operations / Review。
3. 读对应模块 `ARCHITECTURE.md`，再动文件。
4. 只改本任务文件；看到别人的脏文件，不回滚、不格式化、不提交。
5. 收尾按风险跑检查。架构相关只认 `npm run arch:gate`。

## 2. 按任务开工

| 任务 | 先读 | 常改文件 | 第一判断 |
|---|---|
| 改 UI | `docs/roles/feature.md`, `docs/reusable-components.md` | `packages/<domain>/ui/**`，必要时 `packages/core/ui/**` | Core/Platform 有没有现成壳、表格、筛选、搜索、日期、确认、Toast、分栏 |
| 修 BUG | `docs/roles/feature.md`, 模块 `ARCHITECTURE.md` | 从 `app` 壳追到 package UI/service | BUG 属于 UI 展示、API contract、domain 规则、service 落库还是数据 |
| 写 API/保存 | `docs/architecture-governance.md`, `docs/security/rbac.md` | `app/api/modules/<domain>/**`, `packages/<domain>/server/**` | 是否满足 `Zod -> domain -> service`，route 是否只做壳 |
| 权限/入口 | `docs/security/rbac.md`, `packages/platform/module-registry.ts` | registry、page shell、API route | 四件套是否统一，是否从 registry 推导 |
| 新模块/L2 | `docs/new-module-checklist.md` | registry、route shell、API shell、package | 先定 URL/resource/API，再写 UI/service |
| 现有模块加能力 | `docs/existing-module-feature-checklist.md` | 对应 domain package | 复用现有 resource 和 Core/Platform 基础设施 |

## 3. 放置规则

| 需要新增的东西 | 放哪里 |
|---|---|
| 通用控件、页面骨架、表格、筛选、日期、确认、Toast、分页、拼音搜索 | `packages/core` |
| 登录、权限、导航、模块注册、Portal、审计、用户、平台壳 | `packages/platform` |
| HR / Finance / Production / Work / Administration / Library 业务 UI、server、types、constants、import | `packages/<domain>` |
| Next 页面入口 | `app/(modules)/<domain>/**/page.tsx`，只做鉴权、必要预取、挂载 package component；系统页放 `app/(system)/**` |
| Next API 入口 | `app/api/modules/<domain>/**/route.ts`，只做认证、权限、Zod 参数校验、调用 package service、返回 DTO；系统 API 放 `app/api/settings/**` |

## 4. 当前并行注意

- Work 已确定为 `packages/work`，不是 `packages/project`。工作计划、项目管理、工作汇报、历史记录归 Work；不要把 Project / EmployeeProject 修回 HR。
- Work Feature 线程正在处理 `/work/projects` 左右分栏体验。若需要通用分栏，只补 Core UI 稳定入口，Work 只接业务数据。
- Production/QC Data 线程可能修改 `.workspace/config/scripts/generate-product-stage-tests.mjs` 和生成的 pharma-qc JSON/cache。其他 agent 不要提交这些文件。

## 5. Level 2 使用方式

- `npm run arch:level2` 只用于发现结构漂移和拆任务，不是第二个 gate。
- 强制检查只有 `npm run arch:gate`。
- baseline 只能减少，不能为新违规扩写。
- 细则见 `docs/level2-agent-execution.md`。

## 6. 交接格式

给下一个 agent 的任务请写成可执行项：

```txt
目标:
范围:
文件:
动作: move | delete | refactor | rewrite
目标层: core | platform | package | app-shell | api-shell | data | ops
依赖:
禁止触碰:
验证:
风险:
```

任务包必须能直接开工。下面是最低合格粒度：

```txt
目标: Finance period API route 去业务逻辑化
范围: finance
文件: app/api/modules/finance/ledger/periods/route.ts, packages/finance/server/ledger/periods.ts
动作: refactor
目标层: api-shell + package
依赖: 先补 package service，再缩薄 route，最后 ratchet baseline
禁止触碰: packages/work, .workspace/config/scripts/generate-product-stage-tests.mjs
验证: npm run arch:gate; npm run typecheck:quick
风险: medium
```

## 7. 本地提交纪律

- 提交前再次运行 `git status --short`。只 stage 本任务文件。
- 不要每个小 patch 都高频跑完整检查；部署前、一个任务收口、或多文件/大量改动时按风险跑。
- 小文档改动优先 `npm run docs:check`；普通 TS/TSX 小改动优先 `npm run lint:changed` + `npm run typecheck:quick`；涉及边界、权限、registry、Core/Platform 或 API contract 时加 `npm run arch:gate`；schema、部署、构建链路或共享行为改动跑完整组。
- pre-commit 的 `check:quick` 是最后防线，不要用 `--no-verify` 绕过。检查失败时先判断是否由当前任务造成；无关并行失败要在交付说明里标明，不要顺手修或提交别人的文件。
- 本地开发只允许一个 3000 端口 dev server。需要开 dev 前先查 `lsof -nP -iTCP:3000 -sTCP:LISTEN`。
