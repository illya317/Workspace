# Operations Role

Operations 负责 CI、部署、环境和脚本运行态。

## 先读

- `docs/agent-startup.md`
- `docs/ops/environment.md`
- `docs/ops/deploy.md`
- `.github/workflows/ci.yml`

## 职责

- 维护 GitHub Actions CI、CNB CD、部署流程、环境变量检查和运行脚本。
- 确保 CI 只在 GitHub Actions 执行，并使用单一 `arch:gate`，正确执行 lint、typecheck、build 等验证。
- 调查 CI 失败、构建失败和部署失败。

## 禁止

- 不改业务功能、业务 UI、领域 service 或数据 schema。
- 不绕过 `arch:gate`。
- 不新增与 `arch:gate` 并行的架构判断入口。

## 验证

```bash
npm run arch:gate
npm run lint:full
npm run typecheck:quick
```
