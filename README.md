# 丰华内部管理系统

这是一个正在从“周报 + HR”成长为多业务模块的内部管理系统。后续会继续加入财务成本、绩效、采购、生产等数据模块，所以本项目的核心不是单个页面，而是一个可持续扩展的业务系统框架。

看这个项目时，建议用四张地图理解，而不是只看文件夹名字：

1. 业务领域：HR、财务、库存、合同、工作汇报等。
2. 平台能力：登录、权限、账号、审计、搜索、导入、共享组件。
3. 数据链路：外部数据 -> DB schema -> service -> API -> UI -> 文档/检查。
4. 目录契约：每类代码必须放在固定位置，避免越长越乱。

## 技术栈

- 框架：Next.js 16 + React + TypeScript + Tailwind CSS
- 数据库：Prisma ORM + SQLite (`prisma/dev.db`)
- 认证：JWT Cookie + API Key
- 权限：RBAC，动作统一为 `access / write / delete / admin`
- 部署：`npm run build` -> `./deploy.sh`

## 快速开始

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

提交或交付前至少运行：

```bash
npm run arch:check
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm run build
```

## 当前业务模块

| 业务模块 | 页面入口 | API 入口 | 主要职责 |
|---|---|---|---|
| 入口门户 | `/portal` | `/api/auth/me` | 登录后模块入口、用户菜单 |
| 工作汇报 | `/reports` | `/api/reports` | 周报填写、历史版本、周期选择 |
| 工作清单 | `/works` | `/api/works` | 工作事项、参与人、评分 |
| HR 人事行政 | `/hr` | `/api/hr/*` | 员工、雇佣、部门、岗位、项目、编码 |
| 管理后台 | `/admin` | `/api/admin/*` | 用户账号、权限矩阵、系统配置 |
| 财务总账 | `/finance` | `/api/finance/*` | 科目、凭证、期间、余额、报表 |
| 财务成本 | `/finance/cost` | `/api/finance/cost/*` | 发货、成本构成、成本分析、车间、工资 |
| 库存 | `/inventory` | `/api/inventory/*` | 原料、包材、成品、出入库、报表 |
| 合同 | `/contracts` | `/api/contracts` | 合同台账、筛选、编辑 |
| 文档中心 | `/docs` | `/api/position-descriptions` | 岗位说明书、内部文档 |
| API 接入 | `/api-guide` | `/api/my-api-key` | 个人 API Key 和接口说明 |
| 设置 | `/settings` | `/api/user/*` | 当前用户设置 |

后续新增绩效、采购、生产等模块时，应按同一模式加入：

```txt
app/<domain>/              # 页面和前端组件
app/api/<domain>/          # API route handlers
server/services/<domain>/  # 业务逻辑、计算、导入
prisma/models/<domain>.prisma 或 prisma/schema.prisma 对应分区
app/<domain>/ARCHITECTURE.md
```

## 横向平台能力

| 能力 | 主要位置 | 规则 |
|---|---|---|
| 认证/session | `server/auth/`, `lib/auth.ts`, `lib/with-auth.ts` | 页面和 API 不要自己解析 token |
| 权限/RBAC | `server/rbac/`, `lib/permissions.ts`, `/admin` | 新资源先注册权限，再做页面/API |
| 数据库 | `prisma/`, `lib/prisma.ts` | schema 改动必须同步文档和检查 |
| 业务服务 | `server/services/*` | 计算、导入、聚合不要写在 API route 里 |
| API 响应 | `app/api/*`, `server/api/response.ts` | route 只做认证、参数、调用 service、返回 DTO |
| 前端共享组件 | `app/components/`, `app/hooks/` | 弹窗、Toast、搜索、筛选不要重复造 |
| HR 专用组件 | `app/hr/components/`, `app/hr/hooks/` | 只给 HR 领域复用 |
| 数据导入脚本 | `scripts/` | 脚本要可重复运行，导入前支持检查或 dry-run |
| 文档 | `docs/`, `app/*/ARCHITECTURE.md` | 改架构必须改文档 |

## 目录契约

```txt
app/
  <domain>/                 # 业务页面。允许组件、hooks、types、ARCHITECTURE.md
  api/<domain>/             # API 路由。不要堆复杂业务逻辑
  components/               # 全站共享 UI
  hooks/                    # 全站共享 hook

server/
  auth/                     # 认证/session
  rbac/                     # 权限计算、授权来源、资源树
  services/<domain>/        # 业务服务、聚合、计算、导入
  dal/                      # 通用数据访问辅助
  api/                      # API 通用响应/错误工具

lib/
  prisma.ts                 # Prisma client
  permissions.ts            # RBAC 资源和动作常量
  types.ts                  # 全站共享类型
  company.ts                # 公司/体系判断
  schemas.ts                # 通用请求校验 schema
  *.ts                      # 历史共享工具。新 server-only 逻辑优先放 server/

prisma/
  schema.prisma             # 当前数据库模型入口
  migrations/               # 数据库迁移记录
  seed/                     # seed JSON

scripts/
  check-*.js                # 硬约束检查
  import-*.js/ts/py         # 数据导入/迁移脚本
  gen-*.js/ts               # 文档/快照生成

docs/
  architecture-governance.md # 架构治理规则
  *.md/html                  # 部署、数据库、RBAC、API 等文档

web/
  *.json                    # 旧 seed/说明书来源数据

public/
  static assets only
```

## 从数据到页面的标准流程

新增一个业务模块或一批新数据时，按这个顺序走：

1. 定义业务边界：这个数据属于哪个 domain，例如 `finance-cost`、`performance`、`procurement`、`production`。
2. 写架构说明：创建或更新 `app/<domain>/ARCHITECTURE.md`，说明数据来源、事实字段、计算字段、权限、页面。
3. 注册权限：在 `lib/permissions.ts` 增加资源 key，例如 `finance.cost.access` 对应的资源树。
4. 设计 schema：DB 只存事实字段、来源追溯和必要状态，不存可计算结果。
5. 写 service：在 `server/services/<domain>/` 放业务计算、汇总、导入逻辑。
6. 写 API：在 `app/api/<domain>/` 做鉴权、参数校验、调用 service。
7. 写 UI：在 `app/<domain>/` 做页面、组件、hook、types。
8. 补文档和检查：更新 README/AGENTS/ARCHITECTURE，运行 lint/type/build。

重要原则：

```txt
DB 存事实。
Service 算结果。
API 返回 DTO。
UI 展示结果。
文档解释边界。
CI 拦住越界。
```

## 数据原则

很多 Excel 或 normalized JSON 里的字段是算出来的，不应该全部入库。

| 类型 | 是否入库 |
|---|---|
| 人工录入的事实字段 | 是 |
| 外部系统原始业务字段 | 是 |
| sourceFile/sourceSheet/sourceRow/importId | 是 |
| 合计、小计、百分比、完成率 | 否 |
| 未回款、毛利、单位成本、趋势 | 否，放 service 计算 |
| 暂不确定但需要追溯的原始行 | 放 `rawPayload`，不要拆成一堆不稳定列 |

## 权限原则

权限动作统一为：

```txt
access  访问
write   编辑
delete  删除
admin   管理
```

页面权限和 API 权限必须一致：

```txt
GET              -> access
POST/PUT/PATCH   -> write
DELETE           -> delete
授权/系统配置      -> admin 或 system.admin
```

前端隐藏按钮只是体验优化，不是安全边界。真正安全必须在 API 校验。

## 文件大小建议

这是维护性红线，不是审美问题：

| 文件类型 | 建议上限 | 超过后处理 |
|---|---:|---|
| 页面 facade | 150 行 | 拆 components/hooks |
| 组件 | 220 行 | 拆子组件 |
| hook | 220 行 | 拆 data/edit/table/filter |
| API route | 120 行 | 把逻辑移到 service |
| service | 260 行 | 按 query/import/summary 拆 |
| Prisma 单领域文件 | 350 行 | 按领域继续拆 |

已有历史文件超过上限时，改动不要继续加大它；先提取再新增。

## 常用命令

```bash
npm run dev
npm run arch:check
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm run build
npm run env:check
npm run db:check
npm run db:docs
```

部署：

```bash
./deploy.sh
./deploy.sh --push-db
```

## 重要文档

| 文档 | 用途 |
|---|---|
| `AGENTS.md` / `CLAUDE.md` | agent 工作规则和项目边界 |
| `docs/architecture-governance.md` | 新模块、目录、schema、API、文档治理规则 |
| `docs/planning/architecture-optimization-roadmap.md` | 现状架构优化路线图 |
| `docs/security/rbac.md` | 权限模型 |
| `docs/database.md` | 数据库说明 |
| `docs/ops/environment.md` | 环境变量 |
| `docs/ops/deploy.md` | 部署流程 |
| `app/hr/ARCHITECTURE.md` | HR 模块架构 |

如果 README 和代码不一致，先更新 README 或对应 `ARCHITECTURE.md`，再让 agent 继续写代码。项目还小的时候把地图画清楚，以后扩模块才不会每次都重新摸路。
