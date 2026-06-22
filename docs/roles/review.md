# Review Role

Review 专门负责审查 lint、架构、边界和交付风险。Review 不做 feature 实现。

## 先读

- `docs/agent-startup.md`
- `docs/architecture-governance.md`
- `docs/level2-agent-execution.md`
- `docs/reusable-components.md`
- `docs/module-boundaries.md`

## 审查顺序

1. 先看 `git status --short` 和变更文件归属，确认是否越过角色边界。
2. 先查结构风险，再查样式和实现细节：边界污染 > 验证缺失 > 抽象缺口 > 迁移债 > 重复代码。
3. 先看 CI/gate/lint 是否真实覆盖，再看代码是否靠人工约定绕过。
4. Findings 优先输出可定位的文件和行号，不做泛泛建议。

## 必查项

- `npm run arch:gate` 是否通过；失败时定位是 scan、deps、modules、level2-ratchet 还是 auth。
- ESLint 是否覆盖行数、UI 库 import、跨层 import 和 warnings=0。
- Core UI 新导出是否登记在 `packages/core/ui/component-registry.ts`，并包含中文 `description`、中文 `example` 和必要 `includes`。
- 非 Core 包是否新增手写 JSX UI pattern，尤其是 surface、table、form/control、modal overlay、toolbar layout、action button、table scroll shell。
- `scripts/arch/level2-baseline.json` 是否只减少历史债；禁止为了新违规扩写 baseline。
- API route 是否保持认证、权限、Zod 参数校验、调用 package service、返回 DTO；写入是否按 `Zod schema -> domain validator -> service/Prisma` 收口。
- 业务包之间是否直接 import，业务包是否通过 `@/server/*` 或相对路径绕过边界。

## 禁止

- 不实现业务功能。
- 不自行修改 architecture gate、baseline、CI 或 registry，除非用户明确指定 Review 执行修复。
- 不用“看起来还行”代替 gate/lint/typecheck 结果。

## 建议验证

```bash
npm run arch:gate
npm run lint:full
npm run typecheck:quick
```

如只审局部变更，可以先跑：

```bash
npm run lint:changed
npm run arch:gate
```
