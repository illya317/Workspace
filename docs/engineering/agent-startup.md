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
- Production/QC Data 线程可能修改 `.workspace/tools/qc/generate-product-stage-tests.mjs` 和生成的 pharma-qc JSON/cache。其他 agent 不要提交这些文件。

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
禁止触碰: packages/work, .workspace/tools/qc/generate-product-stage-tests.mjs
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
- pre-commit 默认只运行 staged/changed 增量；只有显式 `PRE_COMMIT_FULL=1` 才运行 `npm run check:ci` 并按当前 tree 写入全量通过记录。pre-push 使用风险分类运行 `npm run check:push`，显式 `PRE_PUSH_FULL=1` 才全量；`publish.sh push` 走 GitHub 候选 PR。正式发布先用 `publish.sh prepare` 冻结 release tree、校验私有配置并写候选回执，再由唯一生产入口 `publish.sh deploy` 交给 CNB；CNB 对 Full/单模块先运行同一套 collect-all 完整 CI、production build 和全量 E2E，拿到完整结果后回 main 一次修复，禁止首错即停后反复触发。不要手动用 `--no-verify` 绕过检查。
- 本地开发固定使用 3000 端口且全机只允许一个实例。统一运行 `npm run dev`，不得附加端口参数；3000 已占用时复用现有 Workspace 实例，不得改用其他端口。需要人工确认时运行 `lsof -nP -iTCP:3000 -sTCP:LISTEN`。
- `npm run dev` 在 macOS 上会安静监测 Next listener 的物理内存占用；持续两次超过机器自适应硬阈值时只重启 Next 子进程，不重复 migration、源码分析或 `.next` 清理。开始依赖 3000 连续性的浏览器调试、E2E 或本地写入流程前，先运行 `npm run dev:guard -- pause 30m --reason "<用途>"`，保存返回的 lease ID；完成后用 `npm run dev:guard -- resume <lease-id>` 提前释放，租约最长 2 小时并会自动过期。运行 `npm run dev:status` 可查看 generation、内存状态和所有有效租约。
- 当前代码包含新 migration 时，本地功能验证必须同步更新 `.env` 指向的开发库，不能只运行 `npm run db:generate`。新启动的 `npm run dev` 会在 Next 前自动执行已提交 migration；复用已经运行的 3000 实例时，先运行 `scripts/runtime/run-with-repo-node.sh npx --no-install prisma migrate deploy --schema=./prisma`，并用同一 wrapper 执行 `npx --no-install prisma migrate status --schema=./prisma` 确认没有 pending migration。
