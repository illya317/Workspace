<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Agent Entry

本文件只放开工入口和硬红线。详细规则不要继续堆在这里，按 `docs/README.md` 分层进入。

## Start Here

1. 先读本文件，确认红线和角色入口。
2. 不要先扫全库；先读 `docs/engineering/project-overview.md`，确认项目地图、事实来源和新鲜度。
3. 按任务读对应 `docs/roles/*.md`。
4. 涉及具体模块时，再读 `app/(modules)/*/ARCHITECTURE.md` 或 `MODULE.md`。

| 任务 | 角色入口 |
|---|---|
| 规划、拆任务、多 agent 协调、集成收口 | `docs/roles/coordinator.md` |
| UI 改造、业务功能、页面/API、顺手业务修复 | `docs/roles/feature.md` |
| 架构边界、registry、RBAC/API contract、Core/Platform/App 规则 | `docs/roles/architecture.md` |
| schema、migration、seed、导入、生成数据 | `docs/roles/data.md` |
| CI、部署、环境、脚本运行态 | `docs/roles/operations.md` |
| 历史债、baseline、lint/arch 漏洞、重复实现清理 | `docs/roles/hygiene.md` |
| 最终独立 review | `docs/roles/review.md` |

## Document Map

| 层 | 位置 |
|---|---|
| 角色职责 | `docs/roles/*` |
| 工程规范 | `docs/engineering/*` |
| 生成文档 | `docs/generated/*` |
| 模块长期知识 | `app/(modules)/*/ARCHITECTURE.md`, `app/(modules)/*/MODULE.md` |
| 用户/产品文档 | `docs/product/*`, `app/(docs)/docs/*` |
| 文档 owner 和 stale 规则 | `docs/OWNERS.md` |
| 历史/待评审计划 | `docs/planning/*` |
| 特殊参考资料 | `docs/reference/*` |

## Hard Red Lines

1. **先读 Next.js 本地文档**：写 Next.js 相关代码前，先看 `node_modules/next/dist/docs/` 的对应说明。
2. **边界不能倒流**：Core 不依赖 Platform/Apps；Platform 不写业务 service/UI；业务包之间不直接 import。跨模块能力进 Platform contract 或 Core primitive。
3. **app 只做 shell**：`app/(modules)`、`app/(system)` 页面只做鉴权/预取/挂 package UI；API route 只做认证、权限、请求形状、调 service、返回 DTO。
4. **写入必须三段式**：`Zod schema -> domain validator -> service/Prisma`。不要让 Zod 或 route 承担业务授权、FK、状态、归属、跨字段规则。
5. **RBAC 四件套要同步**：app route、URL href、`resourceKey + RBAC`、API contract + guard 必须一致。改 registry resource 后跑 `npm run db:seed:resources`。
6. **Core UI 不随手改**：业务任务先组合 `@workspace/core/ui` 和 Platform primitives；改 `packages/core/ui/**`、Core UI registry、Settings UI preview 需要 UI-system/Architecture 授权。
7. **不重复造基础设施**：表格、筛选、搜索、日期、确认、Toast、FK、权限、CRUD factory、delete guard、审计、Toolbar 等先查 `docs/engineering/reusable-components.md` 和 Core/Platform 现有能力。
8. **同页状态不整页导航**：tab、筛选、选中记录这类客户端状态不要用 `router.push/replace` 或 `<Link>` 硬同步 URL；深链用状态 + history API。
9. **删除要闭环**：删 L1/L2、route、API、registry child/resource、docs、seed resource 要同步，不能留下 stale 入口。
10. **不为兼容污染协议**：破坏式收敛时，不要因为兼容旧调用点而在公开 contract、声明项或 kind 分支里增加额外选项；不兼容应暴露出来并通过迁移解决。
11. **提交只收本任务**：提交前必须看 `git status --short`，只 stage 本任务文件；不要回滚、格式化或提交别人的改动。

检查命令按 `docs/engineering/checks.md` 选择；多 agent 并行时通常由 Coordinator/Integrator 做最终统一验证。
