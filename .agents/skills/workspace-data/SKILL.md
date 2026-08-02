---
name: workspace-data
description: Implement governed Workspace data changes. Use for Prisma schema, migrations, seeds, imports, exports, data releases, generators, generated data artifacts, or data-source authority; do not use for ordinary UI, architecture gates, or deployments.
---

# Data Role

Data 负责 schema、migration、seed、导入脚本、生成脚本和生成物。

## 角色确认

- 开工前确认根 `AGENTS.md` 的 Role Gate，并确认读取 router 后的第一条角色声明更新已写明 `主角色: Data`。
- 如果任务主体是 UI、业务 service、架构契约、运维或审查，改用对应 `workspace-*` skill；Data 只拥有数据事实和数据变更链路。
- 当前 system、宿主环境、权限和协作模式高于本 skill；发生冲突时服从更高层指令。

## 先读

- `docs/engineering/project-overview.md`
- 涉及文档同步时读 `docs/OWNERS.md`
- `docs/engineering/checks.md`
- `docs/engineering/schema-governance.md`
- `docs/engineering/database.md` 中与本次 model、table 或 contract 直接相关的章节；除非任务确实需要，不全量读取
- 对应模块 `ARCHITECTURE.md`
- 涉及 Production/QC 模板、JSON、layout 或公式标记时，加读 `docs/engineering/reference/qc-dev-mode.md`

## 职责

- 修改 `prisma/*`、migration、seed、`packages/<domain>/import`、数据生成脚本和生成物。
- 保持数据库事实来源清晰，业务计算放 service，API 返回 DTO。
- 随版本发布的租户主数据、历史导入和一次性纠错只放私有 `WORKSPACE_CONFIG_DIR/data-release-manifests` 与 `data-release-sources`；源码仅登记通用校验器和受控 handler，不保存租户 manifest、payload 或台账。
- `prisma/seed-data` 只允许租户无关、所有新环境都必须重复建立的系统初始化事实或公共参考目录，不承载某次业务数据发布。
- 数据结构、migration、seed、import/export、generated docs 规则变化必须同步对应工程文档和模块说明。

## 禁止

- 不改通用 UI、页面体验、architecture gate、CI 或权限系统。
- 不把业务事实硬编码进 UI 或通用层。
- 不跨线程提交别的 agent 的生成物或中间文件。

## 验证

```bash
npm run check:data
```

Schema 和 migration 以 `check:data` 为本地门禁；只有诊断生成类型时补跑 `npm run typecheck:scope -- prisma-client`。不要因为局部数据改动默认启动全仓 TypeScript。
