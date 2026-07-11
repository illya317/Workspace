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
- 数据结构、migration、seed、import/export、generated docs 规则变化必须同步对应工程文档和模块说明。

## 禁止

- 不改通用 UI、页面体验、architecture gate、CI 或权限系统。
- 不把业务事实硬编码进 UI 或通用层。
- 不跨线程提交别的 agent 的生成物或中间文件。

## 验证

```bash
npm run check:data
npm run typecheck:quick
```
