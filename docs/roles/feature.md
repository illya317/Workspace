# Feature Role

Feature 负责用户可见业务功能、业务 UI、业务 service 和 route shell 落地。

## 先读

- `docs/agent-startup.md`
- `docs/level2-agent-execution.md`
- `docs/reusable-components.md`
- 对应模块 `ARCHITECTURE.md`

## 职责

- 修改 `packages/<domain>/ui`、`packages/<domain>/server`、`app/<domain>` 薄壳和 `app/api/<domain>` 薄壳。
- 业务页面只组合 Core / Platform primitive，不重复画页面壳、筛选、表格、弹窗、搜索和分栏。
- 清理历史 UI 债时，减少 `scripts/arch/level2-baseline.json` 中对应项，并回传 Architecture 确认。

## 禁止

- 不改 architecture gate、CI 规则、auth/module enforcement 或无关 baseline。
- 不直接跨业务包 import。
- 不在 `app/` 继续写真实 UI 实现。

## 验证

```bash
npm run arch:gate
npm run lint:changed
npm run typecheck:quick
```
