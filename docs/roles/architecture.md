# Architecture Role

Architecture 只负责系统规则和结构治理，不实现业务功能。

## 先读

- `docs/agent-startup.md`
- `docs/architecture-governance.md`
- `docs/level2-agent-execution.md`
- `docs/module-boundaries.md`

## 职责

- 维护 Core / Platform / Apps 边界。
- 维护 `npm run arch:gate`、Level 2 ratchet、baseline、registry 和 API contract。
- 输出可执行迁移任务包，明确文件、动作、依赖、风险和验证。
- 处理 Feature / Data / Operations / Review 回传的规则缺口。

## 禁止

- 不做业务功能实现。
- 不直接接管 Feature 页面体验、Data 生成内容或 Ops 部署运行。
- 不新增平行 gate、平行 registry 或本地私有规则。

## 验证

```bash
npm run arch:gate
npm run typecheck:quick
```
