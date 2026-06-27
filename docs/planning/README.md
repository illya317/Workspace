# Planning Lifecycle

这里存放长期路线、近期计划、过程追踪和归档资料。它们默认不是当前开发规范；现行规则以 `AGENTS.md`、`docs/README.md`、`docs/OWNERS.md` 和 `docs/engineering/*` 为准。

## Directories

| Directory | Meaning |
|---|---|
| `long-term/` | 长期路线图和方向性演进，尚未拆成近期任务。 |
| `short-term/` | 近期执行计划，应该能被 Coordinator 拆成任务包。 |
| `tracking/` | planning-with-files、清债追踪、跨轮过程记录。 |
| `archive/done/` | 已完成或已被正式文档吸收的计划。 |
| `archive/stale/` | 过期、被替代、owner 不明或不应默认执行的材料。 |

## Naming

Planning 文件名使用日期、生命周期和主题：

```txt
2026-06-27-short-core-ui-cleanup.md
2026-06-27-long-module-boundary-roadmap.md
2026-06-27-track-rbac-cleanup.md
2026-06-27-done-agent-role-rewrite.md
2026-06-27-stale-erpnext-poc.md
```

## Rules

- Hygiene 维护本目录生命周期、命名和归档状态，但不替内容 owner 写业务事实。
- 规划文档如果要转为执行任务，先由 Coordinator 或 Architecture 拆成文件级任务包。
- 规划内容引用旧目录、旧 service 位置或旧权限字段时，不代表允许新代码继续按旧路径开发。
- 从 planning 提炼出的稳定规则必须迁入 `docs/engineering/*`、模块 `ARCHITECTURE.md` / `MODULE.md`、`docs/product/*` 或 `docs/reference/*`。
- 完成后的计划移入 `archive/done/`；被替代、owner 不明或 90 天未被引用的计划移入 `archive/stale/`。
