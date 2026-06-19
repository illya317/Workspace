# Agent Startup Protocol

这是一张给新 agent 的开工卡片。先按这里完成分流，再进入对应专题文档。

## 0. 当前执行模式

- Workspace 处于 **Level 2 / Level 2.5**：Architecture 负责发现结构漂移、判断根因、拆成可执行任务包；Feature/Data/Ops 负责按任务包执行。
- 所有强制校验仍只有一个入口：`npm run arch:gate`。不要新增本地私有 gate、CI 旁路检查或第二套 registry。
- Level 2 当前只认三件套：`scripts/arch/level2.ts` 负责 AST/pattern scan，`packages/platform/module-registry.ts` 负责模块注册锁，`packages/platform/api-registry.ts` 负责 API Contract。详细执行规则见 `docs/level2-agent-execution.md`。
- Architecture 输出必须是文件级或模块级动作；Feature/Data/Ops 收到任务后只改自己负责范围。发现任务需要改 gate、baseline、registry 或跨包规则时，先回传 Architecture。
- 历史债可以由 baseline 锁定，但 baseline 只能减少，不能为了新违规扩写。

## 1. 开工顺序

1. 运行 `git status --short --branch`，确认当前分支和已有脏文件。
2. 判断自己属于哪类 agent：Architecture、Feature、Data、Ops/CI。
3. 读取 `AGENTS.md` 的“开工先读”表，以及本任务命中的专题文档。
4. 如果收到 Architecture 拆出的 Level 2 任务包，先读 `docs/level2-agent-execution.md`，确认目标文件、动作、依赖和禁止触碰范围。
5. 写清楚本次只会改哪些文件；发现别的 agent 文件已修改时，只保留，不回滚、不格式化、不提交。
6. 改完按风险运行验证；架构相关验证只跑 `npm run arch:gate` 这一条入口。

## 2. 角色边界

| 角色 | 可以改 | 不能改 |
|---|---|---|
| Architecture | `AGENTS.md`、`docs/*` 架构治理、`scripts/arch/*`、`scripts/check/*`、`packages/platform/module-registry.ts`、`packages/platform/api-registry.ts`、baseline ratchet、迁移归属表、可执行任务包 | 业务体验细节、业务数据生成内容、运行时任务分派、领域功能实现 |
| Feature | 对应 `packages/<domain>/ui`、`packages/<domain>/server`、`app/<domain>` 薄壳、`app/api/<domain>` 薄壳；必要时补 Core UI 基建 | architecture gate、CI 规则、auth/module enforcement、无关业务包、未分配的 baseline/rule 改动 |
| Data | `prisma/*`、seed、导入脚本、生成脚本和生成物 | 通用 UI、页面体验、架构 gate、权限系统 |
| Ops/CI | CI、部署、环境、package scripts、运行脚本 | 业务功能、领域 UI、service 业务规则、平行架构 gate |

## 3. 放置规则

| 需要新增的东西 | 放哪里 |
|---|---|
| 通用控件、页面骨架、表格、筛选、日期、确认、Toast、分页、拼音搜索 | `packages/core` |
| 登录、权限、导航、模块注册、Portal、审计、用户、平台壳 | `packages/platform` |
| HR / Finance / Production / Work / Administration / Library 业务 UI、server、types、constants、import | `packages/<domain>` |
| Next 页面入口 | `app/<domain>/page.tsx`，只做鉴权、必要预取、挂载 package component |
| Next API 入口 | `app/api/<domain>/*/route.ts`，只做认证、权限、参数校验、调用 package service、返回 DTO |
| 兼容旧入口 | `app/components`、`app/hooks`、`lib`，只做 re-export 或极少量 Next 必须入口 |

## 4. 当前并行注意

- Work 已确定为 `packages/work`，不是 `packages/project`。工作计划、工作清单、工作汇报、历史记录归 Work；不要把 Project / EmployeeProject 修回 HR。
- Work Feature 线程正在处理 `/work/plans` 左右分栏体验。若需要通用分栏，只补 Core UI 稳定入口，Work 只接业务数据。
- Production/QC Data 线程可能修改 `config/scripts/generate-product-stage-tests.mjs` 和生成的 pharma-qc JSON/cache。其他 agent 不要提交这些文件。

## 5. Level 2 使用方式

- `npm run arch:level2` 是结构智能报告，用来发现重复 UI pattern、API route contract 缺口、route 模板漂移、旧 service 债和 app hook/UI 存量。
- 报告发现不能直接变成私有规则；要强制就接入唯一 `npm run arch:gate`。
- baseline 只代表历史债锁定。迁移减少历史债时要同步 ratchet；新增违规不能通过扩写 baseline 放行。
- Level 2 任务排序固定按系统影响：边界污染 > 校验薄弱 > 抽象缺口 > 迁移债 > 重复代码。
- Feature/Data/Ops 不需要重新做全量架构分析；执行任务前只确认目标文件、动作类型、依赖顺序和并行避让范围。
- API Contract 的权威来源是 `packages/platform/api-registry.ts`，并且从 `packages/platform/module-registry.ts` 派生；业务包不得维护第二套 API 清单。
- 任务执行和 baseline ratchet 细则见 `docs/level2-agent-execution.md`。

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
文件: app/api/finance/periods/route.ts, packages/finance/server/ledger/periods.ts
动作: refactor
目标层: api-shell + package
依赖: 先补 package service，再缩薄 route，最后 ratchet baseline
禁止触碰: packages/work, config/scripts/generate-product-stage-tests.mjs
验证: npm run arch:gate; npm run typecheck:quick
风险: medium
```

## 7. 本地提交纪律

- 提交前再次运行 `git status --short`。只 stage 本任务文件。
- 看到别的 agent 的脏文件时，不要 `git checkout --`、不要批量格式化、不要带进 commit。
- 需要临时隔离时，先 stage 自己的文件，再使用 `git stash push --keep-index --include-untracked`，验证后恢复；不要 `stash pop` 未确认来源的 stash。
- 本地开发只允许一个 3000 端口 dev server。需要开 dev 前先查 `lsof -nP -iTCP:3000 -sTCP:LISTEN`。
