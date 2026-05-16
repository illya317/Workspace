<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Weekly 项目架构

## 技术栈

- **框架**: Next.js 16 + React + TypeScript + Tailwind CSS
- **数据库**: Prisma ORM + SQLite (`prisma/dev.db`)
- **认证**: JWT Cookie + API Key (个人)
- **部署**: 本地 `npm run build` → standalone 输出 → rsync 到服务器 → PM2 (`weekly`)
- **Excel**: `xlsx` 库读写

## 数据库模型

| 模型 | 说明 | 关键字段 |
|------|------|---------|
| `User` | 系统登录用户 | `wxUserId`, `username`, `password`, `name`, `departmentId`, `isWorkListAdmin`, `canSelectAnyWeek`, `canAccessHR`, `canLogin`, `apiKey`, `employeeId` |
| `Employee` | 花名册（HR导入） | `employeeId`(5位随机String), `name`, `company`, `dept1`, `dept2`, `position`, `status`(在职/离职), `leaveDate` |
| `FieldPermission` | 字段级权限例外 | `field`, `userId`, `canRead`, `canEdit` |
| `ReportGroup` | 周报部门分组 | `name`, `members`(部门ID), `viewers`(用户ID) |
| `WeeklyReport` | 周报 | `userId`, `reportGroupId`, `weekNumber`, `year`, `items` |
| `ReportItem` | 周报条目 | `reportId`, `category`, `plan`, `completion`, `nextGoal` |
| `WorkItem` | 工作清单 | `departmentId`, `category`, `content`, `importance`, `urgency`, `participants` |

**关联**: `User.employeeId` ↔ `Employee.employeeId`（通过姓名初始化匹配）

## 关键路由

| 页面 | 路径 | 权限 |
|------|------|------|
| 登录 | `/login` | 公开 |
| 入口 | `/portal` | 登录 |
| 填写周报 | `/dashboard` | 登录 |
| 历史记录 | `/history` | 登录 |
| 工作清单 | `/works` | 登录 |
| 人事行政 | `/hr` | `canAccessHR` |
| 管理后台 | `/admin` | `isWorkListAdmin` |
| API接入 | `/api-guide` | 登录 |
| 设置 | `/settings` | 登录 |

| API | 路径 | 说明 |
|-----|------|------|
| 花名册 | `GET /api/employees` | 列表+导出，按权限过滤字段 |
| 花名册更新 | `PUT /api/employees/[id]` | 单字段更新，支持字段级权限 |
| 联想 | `GET /api/employees/autocomplete` | 部门/人员联想（Autocomplete） |
| 员工权限 | `GET/PUT /api/admin/employee-permissions` | 花名册+权限合并管理 |
| 字段权限 | `GET/PUT/DELETE /api/field-permissions` | 字段级例外规则 |
| 个人API | `GET/POST /api/my-api-key` | 申请/查看个人API Key |
| 周报 | `GET/POST /api/reports` | 周报CRUD |
| 工作清单 | `GET/POST /api/works` | 工作清单CRUD |

## 认证方式

1. **网页版**: Cookie JWT (`token`)
2. **API接入**: `X-API-Key`(个人) + `X-Username` + `X-Password`
3. **权限校验**: `auth.ts` 中统一校验 `canLogin`（离职人员自动禁用）

## 部署流程

```bash
npm run build                          # 本地构建
rsync -avz --delete .next/standalone/ ubuntu@SERVER:/home/ubuntu/weekly/
# 服务器上：
cd /home/ubuntu/weekly
npx prisma db push                     # 同步schema
# 数据同步（Python脚本，无sqlite3 CLI）
pm2 restart weekly
```

## 数据同步（服务器无sqlite3 CLI）

本地导出JSON → 传到服务器 → Python参数化INSERT：
- 参考 `/tmp/sync_employee_v2.py`
- 或直接用 `scripts/import-roster.ts`（需Node环境）

## 花名册导入

```bash
npx tsx scripts/import-roster.ts       # 从Excel导入
npx tsx scripts/init-user-employee-link.ts  # 关联User和Employee
```

- Excel路径: `/Users/koito/Desktop/合并花名册.xlsx`
- ID: 1-999随机，5位补零（如 `00317`）
- 多岗: 同一人多行（Excel多行或单行按"、"拆分）
- 公司名清洗: `制药` → `丰华制药`

## Prisma 注意事项

- `binaryTargets = ["native", "debian-openssl-3.0.x"]` 跨平台
- 生成后修复: `cp node_modules/.prisma/client/index.js default.js`
- 部署后 `.env` 中 `DATABASE_URL` 需改为服务器绝对路径
