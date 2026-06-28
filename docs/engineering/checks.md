# Checks

本项目把检查分成几类。命令可以在 CI 中串起来，但每类检查只负责自己的边界，避免把细碎治理塞进主 gate。

## 常用命令

| 场景 | 命令 | 说明 |
|---|---|---|
| 局部 TS/TSX 改动 | `npm run check:changed` | 跑 changed lint（含净增行 gate）和 quick typecheck。 |
| 仅检查本次净增行 | `npm run lint:net-lines` | 检查 staged diff；没有 staged diff 时检查 tracked changed + untracked。默认净增必须 `<= 0`。 |
| 架构、权限、API、registry、Core/Platform 边界 | `npm run check:arch` | 等价于 `npm run arch:gate`。 |
| Prisma schema、model、migration | `npm run check:data` | 跑 schema 合法性、schema governance 和 migration diff。 |
| PR / CI 权威检查 | `npm run check:ci` | 合并前主链路；hygiene 只以 warning 方式提示。 |
| 兼容旧入口 | `npm run check:full` | `check:ci` 的别名。 |
| 日常 hygiene 提示 | `npm run check:hygiene:warn` | 跑全部 hygiene 细项但永远退出 0。 |
| 周期性清债 | `npm run check:hygiene` | 强制巡检公司硬编码、Level 2 report 和 baseline 债务。 |

## 边界

### lint

`lint` 负责代码质量和局部静态规则，例如 ESLint warnings=0、基础 restricted imports、行数、明显不安全语法。它不承载架构模型，也不承载公司名、baseline 巡检这类细碎治理。

`lint:changed` 会先跑净增行检查，再跑 ESLint。净增行公式是 `tracked additions - tracked deletions + untracked source lines`；有 staged diff 时只看 staged 内容，没有 staged diff 时看工作区 changed + untracked。默认 `NET_LINE_GROWTH_LIMIT=0`，即本次变更不得净增加；确有一次性迁移需要例外时，必须显式设置 `NET_LINE_GROWTH_LIMIT=<allowed-net-lines>` 并在交付说明中说明原因。这个 gate 是为了防止“为了过单文件行数，把 400 行拆成 200+300 行”的假降复杂度。

### typecheck

`typecheck` 负责 TypeScript 类型正确性。它回答代码在类型系统里是否成立，不回答权限语义、业务规则或生产构建是否完整。

### arch:gate

`arch:gate` 负责大方向结构和访问模型：

- Core / Platform / domain / app shell 的依赖边界。
- API / route / resource / RBAC / API contract 的对应关系。
- Open API registry、scope wrapper 和 console route 对齐。
- 写入链路的 domain validation 收口。
- Core UI 治理的大方向约束。

`arch:gate` 不应该承载公司名扫描、baseline 债务观察、一次性迁移清单或其他 hygiene 细则。

### db/schema

`check:data` 负责数据库定义和迁移历史：

- `db:validate` 检查 Prisma schema 合法性。
- `schema:check` 检查 model 文件组织和项目 schema governance。
- `db:migration:check` 检查 migrations 文件、lock provider 和 schema/migration diff。

它不依赖真实业务数据，也不负责生产构建。

### build

`build` 负责生产构建。单独执行 `npm run build` 时会先生成 Prisma Client，再执行 `next build`。CI 中会在 typecheck 前显式运行 `db:generate`，最后用 `build:next` 只执行 Next 生产构建，避免重复 generate。

### deploy/runtime

deploy/runtime 检查回答目标环境能不能运行，例如 workspace manifest、真实 DB 文件、SQLite quick_check、核心表数据和 admin 账号。它依赖运行环境和真实数据，不属于 PR CI 主链路。

### hygiene

Hygiene 有 warning 和 strict 两种模式。日常/CI 使用 `check:hygiene:warn`，只提示不阻断；Hygiene Role 使用 `check:hygiene`，发现问题必须失败。两种模式都必须跑完全部 hygiene 子项，区别只在最终退出码。

Hygiene 负责细枝末节和历史债观察：

- 公司专有事实硬编码扫描。
- `arch:level2:ratchet` baseline 收敛检查。
- `arch:level2` 结构智能报告。
- 业务视觉 token 硬编码候选、Core 业务事实泄漏候选、组件内本地 UI config 候选。
- baseline JSON 是否只减少、不扩写。
- lint / arch gate 是否存在规则漏洞或误放到主链路的细则。

Hygiene findings 可以回传给 Architecture、Operations 或 Feature，但不要直接把细规则塞回 `arch:gate` 或 `lint:full`。
