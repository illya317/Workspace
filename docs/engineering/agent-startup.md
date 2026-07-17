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
2. 读 `docs/engineering/project-overview.md`，确认项目地图、事实来源和文档新鲜度。
3. 按任务选角色文档：Coordinator / Feature / Data / Architecture / Operations / Review / Hygiene。
4. 读对应模块 `ARCHITECTURE.md`，再动文件。
5. 只改本任务文件；看到别人的脏文件，不回滚、不格式化、不提交。
6. 收尾按风险跑检查。架构相关只认 `npm run arch:gate`。

## 2. 按任务开工

| 任务 | 先读 | 常改文件 | 第一判断 |
|---|---|
| 多 agent、跨模块、需要拆包或集成收口 | `docs/roles/coordinator.md` | 任务包、文档入口、最终 diff 范围 | 是否需要分配 Feature/Data/Architecture/Ops/Hygiene，以及最终是否需要独立 Review |
| 改 UI | `docs/roles/feature.md`, `docs/engineering/reusable-components.md` | `packages/<domain>/ui/**`，必要时 `packages/core/ui/**` | Core/Platform 有没有现成壳、表格、筛选、搜索、日期、确认、Toast、分栏 |
| 修 BUG | `docs/roles/feature.md`, 模块 `ARCHITECTURE.md` | 从 `app` 壳追到 package UI/service | BUG 属于 UI 展示、API contract、domain 规则、service 落库还是数据 |
| 写 API/保存 | `docs/engineering/architecture-governance.md`, `docs/engineering/security/rbac.md` | `app/api/modules/<domain>/**`, `packages/<domain>/server/**` | 是否满足 `Zod -> domain -> service`，route 是否只做壳 |
| 权限/入口 | `docs/engineering/security/rbac.md`, `packages/platform/module-registry.ts` | registry、page shell、API route | 四件套是否统一，是否从 registry 推导 |
| 新模块/L2 | `docs/engineering/new-module-checklist.md` | registry、route shell、API shell、package | 先定 URL/resource/API，再写 UI/service |
| 现有模块加能力 | `docs/engineering/existing-module-feature-checklist.md` | 对应 domain package | 复用现有 resource 和 Core/Platform 基础设施 |

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
- Work 项目管理主入口是 `/work/project`；项目空间执行入口是 `/work/project/:projectId/space`。若处理项目页左右分栏体验，只补 Core UI 稳定入口，Work 只接业务数据。
- Production/QC Data 线程可能修改 `.workspace/config/scripts/generate-product-stage-tests.mjs` 和生成的 pharma-qc JSON/cache。其他 agent 不要提交这些文件。

## 5. Structure Scan 使用方式

- `npm run arch:structure` 只用于发现结构漂移和拆任务，不是 architecture gate。
- 强制检查只有 `npm run arch:gate`。
- Structure baseline ratchet 已拆成 domain/ui/hygiene scope；baseline 只能减少，不能为新违规扩写。
- 公司硬编码、baseline 债务和 lint/arch 规则漏洞巡检归 Hygiene Role，不进主 CI 阻断链路。
- 细则见 `docs/engineering/structure-agent-execution.md`。

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
- 多 agent 并行时，小任务可以由各 agent 自己收口，但不要让同一台机器对同一代码快照重复跑同类 npm 检查。谁先把 lint/typecheck/gate 类检查跑通都可以，后续 agent 遇到相同快照应复用结果；只有代码快照、命令参数或相关环境变量变化时才需要重跑。
- 只有这些情况主动跑 npm 检查：用户明确要求；当前 agent 是收口/集成/提交前验证角色；改动触及共享脚本、CI、package 配置、schema、权限/registry/gate 或跨模块 contract；或局部自查无法判断风险。
- Coordinator 收口自检不等于最终 Review；全部完成后需要独立 Review 审查最终 diff 和交付风险。
- 本地重型检查走项目锁串行执行。`lint`、`typecheck`、`gate:*`、`arch:gate`、`build` 等 npm script 已包或应包 `scripts/check/with-check-lock.js`；如果终端提示 `Waiting for project check lock`，说明别的 agent 正在跑检查，等待即可，不要再开并行检查。lint/typecheck/gate 类检查会按命令和代码快照复用已通过结果；看到 `Reusing cached ... check result` 表示同一快照已经有人跑通过，本次没有重复执行。
- 收口/集成/提交前验证时按风险选命令：文档改动跑 `npm run docs:check`；普通 TS/TSX 跑 `npm run check:changed`；涉及边界、权限、registry、Core/Platform 或 API contract 时加 `npm run check:blockers`；只碰业务访问模型跑 `npm run gate:domain`；只碰结构性 UI 边界跑 `npm run gate:ui`；清债/重构专项跑 `npm run check:refactor`；schema/model/migration 跑 `npm run check:data`；CI 收口跑 `npm run check:ci`；周期性简单清债跑 `npm run check:hygiene`。净增行预算只在 `complexity:line-budget` 中显式执行，日常 `check:changed` 不跑。
- pre-commit 默认只运行 staged/changed 增量；只有显式 `PRE_COMMIT_FULL=1` 才运行 `npm run check:ci` 并按当前 tree 写入全量通过记录。pre-push 使用风险分类运行 `npm run check:push`，显式 `PRE_PUSH_FULL=1` 才全量；`publish.sh push` 走 GitHub 候选 PR，`publish.sh deploy` 默认走受治理 SSH hotfix。只有用户明确指定 `publish.sh deploy --full` 时，才对当前已提交 tree 运行或复用一次本地 `check:ci` 凭证，再交给 CNB 构建 Linux standalone 并部署。不要手动用 `--no-verify` 绕过检查。
- 本地开发只允许一个 3000 端口 dev server。需要开 dev 前先查 `lsof -nP -iTCP:3000 -sTCP:LISTEN`。
