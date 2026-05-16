# 丰华生物周报系统

企业内部周报填报系统，支持按部门/项目/个人维度提交周期性工作报告，支持版本回溯。

## 技术栈

- **框架**：Next.js 16 + React + TypeScript
- **样式**：Tailwind CSS
- **ORM**：Prisma 5 + SQLite
- **认证**：JWT（jose），开发模式为模拟登录

## 项目结构

```
├── app/
│   ├── page.tsx                  # 入口（自动跳转 dashboard/login）
│   ├── layout.tsx                # 根布局
│   ├── login/page.tsx            # 开发模式登录页（姓名 + 部门名称）
│   ├── dashboard/page.tsx        # 周报填写/编辑页
│   ├── history/page.tsx          # 历史周报列表页
│   └── api/
│       ├── auth/
│       │   ├── dev-login/route.ts    # 开发模式登录（生成 JWT）
│       │   └── me/route.ts           # 获取当前用户信息
│       ├── reports/
│       │   ├── route.ts              # GET 列表 / POST 创建周报
│       │   └── [id]/
│       │       ├── route.ts          # PUT 更新周报
│       │       └── versions/
│       │           ├── route.ts      # GET 版本列表
│       │           └── [version]/
│       │               └── route.ts  # GET 指定版本快照
│       ├── user/
│       │   └── routine/route.ts      # GET/PUT 日常工作模板
│       └── week-info/route.ts        # GET 当前周信息
├── lib/
│   ├── auth.ts                   # JWT 签发/校验/从 Cookie 读取
│   ├── prisma.ts                 # Prisma Client 单例
│   └── week.ts                   # 周数计算工具（周一为周首）
├── prisma/
│   └── schema.prisma             # 数据库模型定义
└── public/
    └── logo.png                  # 企业 Logo
```

## 数据库结构

### User（用户）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int @id | 自增主键 |
| wxUserId | String @unique | 企业微信用户唯一标识 |
| name | String | 姓名 |
| departmentId | Int | 部门编号（开发模式由部门名称哈希生成） |
| departmentName | String? | 部门名称 |
| avatar | String? | 头像 URL |
| routineItems | String? | 日常工作模板（JSON: `[{plan, nextGoal}, ...]`） |
| createdAt | DateTime | 注册时间 |
| reports | WeeklyReport[] | 关联的周报（作为填写人） |

### WeeklyReport（周报）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int @id | 自增主键 |
| userId | Int | 最后填写人 |
| year | Int | 年份 |
| weekNumber | Int | 周期序号（周/月/季等，依 periodType） |
| periodType | String @default("weekly") | 周期类型：`daily` / `weekly` / `monthly` / `quarterly` / `yearly` |
| scopeType | String @default("department") | 归属维度：`personal` / `department` / `project` |
| scopeId | Int | 维度标识（personal=用户ID, department=部门ID, project=项目ID） |
| taskName | String | 任务名称/标题 |
| notes | String? | 备注 |
| version | Int @default(1) | 当前版本号 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |
| items | ReportItem[] | 工作条目 |
| history | ReportHistory[] | 历史版本快照 |

**唯一约束**：`@@unique([scopeType, scopeId, periodType, year, weekNumber])`
- 同一维度、同一周期只能有一份周报

### ReportItem（工作条目）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int @id | 自增主键 |
| reportId | Int | 关联周报 |
| category | String | 分类：`routine`（日常）/ `non-routine`（非日常） |
| plan | String | 本周计划 |
| completion | String? | 完成情况 |
| nextGoal | String? | 下周目标 |
| sortOrder | Int | 显示排序 |

### ReportHistory（历史版本快照）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int @id | 自增主键 |
| reportId | Int | 关联周报 |
| version | Int | 被快照的版本号（V2 对应快照 version=1） |
| taskName | String | 当时的标题 |
| notes | String? | 当时的备注 |
| itemsJson | String | 当时的所有条目（JSON 字符串） |
| createdAt | DateTime | 快照时间 |

**唯一约束**：`@@unique([reportId, version])`

## 接口说明

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/dev-login` | 开发登录（name, departmentName） |
| GET | `/api/auth/me` | 获取当前用户 |
| GET | `/api/reports` | 获取周报列表（默认查当前部门） |
| POST | `/api/reports` | 创建周报（默认部门维度） |
| PUT | `/api/reports/:id` | 更新周报（同部门可编辑） |
| GET | `/api/reports/:id/versions` | 获取版本列表 |
| GET | `/api/reports/:id/versions/:version` | 获取指定版本（0=当前） |
| GET | `/api/user/routine` | 获取日常工作模板 |
| PUT | `/api/user/routine` | 保存日常工作模板 |
| GET | `/api/week-info` | 获取当前周信息 |

## 核心逻辑

### 归属维度（scope）

- **默认**：`scopeType="department"`，同部门所有人共享一份周报，均可编辑
- **个人**：`scopeType="personal"`，仅本人可见可编辑
- **项目**：`scopeType="project"`，预留扩展

权限校验逻辑：
- `department`：校验 `report.scopeId === token.departmentId`
- `personal`：校验 `report.userId === token.userId`

### 版本控制

每次 PUT 更新时：
1. 将当前数据快照存入 `ReportHistory`
2. 删除旧 `ReportItem`，重新创建
3. `version` 自增 +1

### 日常工作自动带入

首次填写时从 `User.routineItems` 模板加载。每周自动将上周日常工作的 `nextGoal` 带入本周 `plan`（灰色只读）。

### 非日常对照

填写页顶部显示上周非日常工作的 `plan` 列表（只读灰底），方便逐条对照填写本周 `completion`。

## 开发运行

```bash
npm install
npx prisma db push        # 同步数据库结构
npx prisma generate       # 生成 Prisma Client
npm run dev               # 启动开发服务器
```

开发模式登录：`/login`，输入姓名和部门名称即可。

## 待办

- [ ] 企业微信 OAuth 正式登录
- [ ] 项目维度权限管理
- [ ] 腾讯云 CloudBase 部署
