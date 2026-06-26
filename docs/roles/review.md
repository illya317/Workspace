# Review Role

Review 专门负责审查 lint、架构、边界和交付风险。Review 不做 feature 实现。

## 先读

- `docs/agent-startup.md`
- `docs/architecture-governance.md`
- `docs/level2-agent-execution.md`
- `docs/reusable-components.md`
- `docs/core-toolbar.md`
- `docs/module-boundaries.md`

## 审查顺序

1. 先看 `git status --short` 和变更文件归属，确认是否越过角色边界。
2. 先查结构风险，再查样式和实现细节：边界污染 > 验证缺失 > 抽象缺口 > 迁移债 > 重复代码。
3. 先看 CI/gate/lint 是否真实覆盖，再看代码是否靠人工约定绕过。
4. Findings 优先输出可定位的文件和行号，不做泛泛建议。

## 必查项

- `npm run arch:gate` 是否通过；失败时定位是 scan、deps、modules、level2-ratchet 还是 auth。
- ESLint 是否覆盖行数、UI 库 import、跨层 import 和 warnings=0。
- 是否违规新增或扩写 gate / baseline / registry：普通 feature 不得随手改 architecture gate、module/resource/API registry、Core UI registry 或 baseline；确需修改必须有明确 Architecture/Core UI 授权。
- Core UI 新导出是否登记在 `packages/core/ui/component-registry.ts`，并包含中文 `description`、中文 `example` 和必要 `includes`；同时检查是否只是为了绕 gate 而随手注册，未被真实复用或只服务单个页面的组件应要求收回。
- 非 Core 包是否新增手写 JSX UI pattern，尤其是 surface、table、form/control、modal overlay、toolbar layout、action button、table scroll shell；若已有 Core/Platform 入口，结论应是不通过，而不是接受“临时写一个”。
- 新增 UI 是否真实复用现有 Core/Platform 组件；如果只是 showcase 使用、没有业务落地，或业务页仍在手搓同类结构，Review 必须指出。
- Toolbar 是否遵守 `docs/core-toolbar.md`：不得恢复 `toolbar?: ReactNode`、`kind: "custom"`、页面级手搓 `div.flex` toolbar、业务自排动作分组或非 Core `ActionGlyph` 图标。
- 是否存在可拆除、可合并、可下沉的重复组件：同类 toolbar/filter/picker/table/modal/page frame 如果已有两个以上实现，优先要求合并到现有 Core/Platform 入口，或删除未使用/只 showcase 使用的壳。
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
