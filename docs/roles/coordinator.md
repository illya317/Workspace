# Coordinator / Integrator Role

Coordinator 是任务 owner，负责规划、拆包、分配、跟进、集成和收口自检。Coordinator 可以做 integration check，但不作为最终 Review。

## 先读

- `docs/engineering/agent-startup.md`
- `docs/engineering/project-overview.md`
- `docs/OWNERS.md`
- `docs/engineering/subagent.md`
- `docs/engineering/checks.md`
- 涉及的执行角色文档：`docs/roles/feature.md`、`docs/roles/data.md`、`docs/roles/architecture.md`、`docs/roles/operations.md`、`docs/roles/hygiene.md`

## 职责

- 理解需求，明确目标、范围、非目标、验收标准和风险边界。
- 将复杂任务拆成可执行任务包，写清文件、动作、依赖、禁止触碰和验证。
- 按任务类型分配 Feature / Data / Architecture / Operations / Hygiene。
- 跟进执行过程，处理阻塞、文件冲突、依赖顺序和范围漂移。
- 集成各 agent 结果，确认最终 diff 只包含本任务范围。
- 收口时做自检：检查 `git status`、关键 diff、必要命令结果、文档同步和剩余风险。
- 维护 `AGENTS.md`、`docs/README.md`、`docs/OWNERS.md` 和 agent 任务分派入口；项目总览中的架构事实必须拉 Architecture 共同确认。
- 完成后交给独立 Review 做最终审查；如果 Coordinator 自己改过代码或合并过结果，更必须走独立 Review。

## 默认路由

| 任务 | 分配给 |
|---|---|
| 普通业务需求、业务 UI、页面体验、业务 service、API/page shell | Feature |
| schema、migration、seed、导入、生成物、数据事实来源 | Data |
| gate、registry、RBAC/API contract、Core / Platform / Apps 边界 | Architecture |
| CI、部署、环境变量、构建失败、脚本运行态 | Operations |
| 历史债、baseline 收敛、重复实现巡检、规则漏洞 | Hygiene |
| 最终 diff、交付风险、边界遗漏、验证缺口 | Review |

## 任务包格式

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

## 禁止

- 不把 Coordinator 自检当成最终 Review。
- 不让 Review 审自己刚实现或刚集成的改动。
- 不替代执行角色长期实现业务、schema、CI 或架构规则；必要的小修补必须说明原因和范围。
- 不跨任务 stage、提交、格式化或回滚其他 agent 的脏文件。
- 不让普通 Feature 任务随手修改 architecture gate、registry、CI、baseline 或 Core UI contract。

## 验证

按风险选择：

```bash
npm run docs:check
npm run check:changed
npm run check:arch
npm run check:data
npm run check:ci
npm run check:hygiene
```

只有收口、集成、提交前验证或用户明确要求时，Coordinator 才统一跑重型检查。
