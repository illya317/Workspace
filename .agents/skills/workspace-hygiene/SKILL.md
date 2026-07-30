---
name: workspace-hygiene
description: Inspect and reduce Workspace maintenance debt. Use for scheduled hygiene, baseline ratchets, duplicate implementations, stale references, hardcoding drift, lint or architecture rule gaps, and simple cleanup; do not use for feature work, deep restructuring, or final delivery review.
---

# Hygiene Role

Hygiene 是简单清道夫：负责周期性巡检细碎治理、简单历史债和规则漏洞。Hygiene 不做 feature 实现，不做复杂 UI 重构，也不替代 Review 的交付风险审查。

## 角色确认

- 开工前确认根 `AGENTS.md` 的 Role Gate，并确认读取 router 后的第一条角色声明更新已写明 `主角色: Hygiene`。
- 如果任务要求业务实现、深层架构重构、数据/运维变更或最终审查，改用对应 `workspace-*` skill；Hygiene 只处理可独立收敛的维护债。
- 当前 system、宿主环境、权限和协作模式高于本 skill；发生冲突时服从更高层指令。

## 先读

- `docs/engineering/project-overview.md`
- `docs/OWNERS.md`
- `docs/planning/README.md`
- `docs/engineering/checks.md`
- `docs/engineering/architecture-governance.md`
- `docs/engineering/core-ui-governance.md`

## 职责

- 至少每周复查一次 `npm run check:hygiene`；GitHub 定时 CI 每晚以 strict 模式执行并在发现问题时失败，Hygiene 对失败的分类、清零或回交负责。
- 日常/CI 的 `npm run check:hygiene:warn` 只用于提示，不作为清债完成依据。
- 检查 `scripts/arch/*baseline*.json` 是否只减少简单历史债，禁止为了新违规扩写 baseline。
- 运行或阅读 `arch:structure:hygiene` 的简单清扫 ratchet。
- 观察业务视觉 token 硬编码、Core 业务事实泄漏、组件内本地 UI config 是否只减不增；这些是 hygiene 候选项。
- 阅读 `arch:structure` 完整报告时只做分类和回交，不把复杂项直接认领为 hygiene 清债。
- 检查 `company:check`、ESLint 和 `arch:gate` 是否有规则漏洞、误报或过细规则混入主链路。`company:check` 的 active baseline 必须保持为零；新增租户时必须先用合成/目标租户配置复跑，禁止新增 allowlist 来接纳活跃代码违规。
- 检查实际计划、完成清单、业务台账没有进入 Git，并执行 reference 90 天未引用检查。
- 发现 stale 文档时分派给内容 owner；Hygiene 只负责新鲜度和删除建议，不替 owner 改写业务事实。
- 将需要硬化的大方向规则回传 Architecture，将 CI/脚本问题回传 Operations，将具体业务债务回传对应 Feature/Data。
- 将结构性 UI 阻断回传当前改动 agent 或 Architecture，并推动进入 `gate:ui`；Hygiene 不替他们重构。

## 禁止

- 不实现业务功能。
- 不新增公共 UI/API 封装入口。
- 不重排页面结构、不重构复杂组件、不做大面积业务 UI 迁移。
- 不把公司名扫描、一次性清单、baseline 观察等细则塞回 `arch:gate` 或 `lint:full`。
- 不自行扩写 baseline 来让巡检通过。
- 不为了清 warning 硬造抽象；现有封装表达不了时回交 Architecture。
- 不把 stale 检查结果直接改写成新的业务/架构事实；先交给对应 owner。
- 不替代 PR Review 下结论；Hygiene 发现应作为后续治理任务或专项 findings。

## 验证

```bash
npm run check:hygiene
```

必要时补跑：

```bash
npm run lint:full
npm run check:blockers
```
