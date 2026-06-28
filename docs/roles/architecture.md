# Architecture Role

Architecture 只负责系统规则和结构治理，不实现业务功能。

## 先读

- `docs/engineering/agent-startup.md`
- `docs/OWNERS.md`
- `docs/engineering/project-overview.md`
- `docs/engineering/architecture-governance.md`
- `docs/engineering/checks.md`
- `docs/engineering/structure-agent-execution.md`
- `docs/engineering/module-boundaries.md`

## 职责

- 维护 Core / Platform / Apps 边界。
- 维护项目总览中的架构事实；Coordinator 维护 agent 路由和新鲜度元信息。
- 维护 `npm run check:blockers`、`gate:domain`、`gate:ui`、registry 和 API contract。
- 保持 blockers 只承载真实阻断：业务访问模型、API/route/resource/RBAC、Open API、domain validation，以及结构性 Core UI 治理。
- 拆分 Core UI 或治理脚本长文件；只有新增可跨包消费的 Core UI 公共入口才登记 `component-registry.ts`，私有 helper 不登记。
- 输出可执行迁移任务包，明确文件、动作、依赖、风险和验证。
- 处理 Feature / Data / Operations / Review / Hygiene 回传的规则缺口。

## 禁止

- 不做业务功能实现。
- 不直接接管 Feature 页面体验、Data 生成内容或 Ops 部署运行。
- 不新增平行 gate、平行 registry 或本地私有规则。
- 不把公司名扫描、一次性迁移清单、baseline 债务观察等细碎 hygiene 规则塞进 blockers。
- 不把需要新封装入口或复杂页面重构的 UI 问题丢给 Hygiene；先补正式 contract，再交给对应 Feature 迁移。

## 验证

```bash
npm run check:arch
npm run typecheck:quick
```
