# Hygiene Role

Hygiene 负责周期性巡检细碎治理、历史债和规则漏洞。Hygiene 不做 feature 实现，也不替代 Review 的交付风险审查。

## 先读

- `docs/agent-startup.md`
- `docs/checks.md`
- `docs/architecture-governance.md`
- `docs/core-ui-governance.md`

## 职责

- 定期运行或阅读 `npm run check:hygiene` 的结果；这是 strict 模式，发现问题必须失败。
- 日常/CI 的 `npm run check:hygiene:warn` 只用于提示，不作为清债完成依据。
- 检查 `scripts/arch/*baseline*.json` 是否只减少历史债，禁止为了新违规扩写 baseline。
- 运行或阅读 `arch:level2:ratchet` 的 baseline 收敛结果。
- 观察 `arch:level2` 报告中的重复 UI、重复 service、API shell 漂移、legacy root 入口和 Core UI 绕过。
- 检查 `company:check`、ESLint 和 `arch:gate` 是否有规则漏洞、误报或过细规则混入主链路。
- 将需要硬化的大方向规则回传 Architecture，将 CI/脚本问题回传 Operations，将具体业务债务回传对应 Feature/Data。

## 禁止

- 不实现业务功能。
- 不把公司名扫描、一次性清单、baseline 观察等细则塞回 `arch:gate` 或 `lint:full`。
- 不自行扩写 baseline 来让巡检通过。
- 不替代 PR Review 下结论；Hygiene 发现应作为后续治理任务或专项 findings。

## 验证

```bash
npm run check:hygiene
```

必要时补跑：

```bash
npm run lint:full
npm run arch:gate
```
