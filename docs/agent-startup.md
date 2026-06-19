# Agent Startup Protocol

这是一张给新 agent 的开工卡片。先按这里完成分流，再进入对应专题文档。

## 1. 开工顺序

1. 运行 `git status --short --branch`，确认当前分支和已有脏文件。
2. 判断自己属于哪类 agent：Architecture、Feature、Data、Ops/CI。
3. 读取 `AGENTS.md` 的“开工先读”表，以及本任务命中的专题文档。
4. 写清楚本次只会改哪些文件；发现别的 agent 文件已修改时，只保留，不回滚、不格式化、不提交。
5. 改完按风险运行验证；架构相关验证只跑 `npm run arch:gate` 这一条入口。

## 2. 角色边界

| 角色 | 可以改 | 不能改 |
|---|---|---|
| Architecture | `AGENTS.md`、`docs/*` 架构治理、`scripts/arch/*`、`scripts/check/*`、`packages/platform/module-registry.ts`、`packages/platform/api-registry.ts`、baseline ratchet、Platform/API/service 收敛 | 业务体验细节、业务数据生成内容、运行时任务分派 |
| Feature | 对应 `packages/<domain>/ui`、`packages/<domain>/server`、`app/<domain>` 薄壳、`app/api/<domain>` 薄壳；必要时补 Core UI 基建 | architecture gate、CI 规则、auth/module enforcement、无关业务包 |
| Data | `prisma/*`、seed、导入脚本、生成脚本和生成物 | 通用 UI、页面体验、架构 gate、权限系统 |
| Ops/CI | CI、部署、环境、package scripts、运行脚本 | 业务功能、领域 UI、service 业务规则 |

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

## 6. 交接格式

给下一个 agent 的任务请写成可执行项：

```txt
目标:
范围:
文件:
动作: move | delete | refactor | rewrite
禁止触碰:
验证:
风险:
```
