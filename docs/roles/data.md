# Data Role

Data 负责 schema、migration、seed、导入脚本、生成脚本和生成物。

## 先读

- `docs/engineering/agent-startup.md`
- 涉及文档同步时读 `docs/OWNERS.md`
- `docs/engineering/checks.md`
- `docs/engineering/schema-governance.md`
- `docs/engineering/database.md`
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
