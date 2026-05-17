# Weekly/HR 项目 — 子 Agent 开发规范

## 技术栈

- **框架**: Next.js 16 + React + TypeScript + Tailwind CSS
- **数据库**: Prisma ORM + SQLite (`prisma/dev.db`)
- **认证**: JWT Cookie + API Key
- **部署**: 本地 `npm run build` → standalone → rsync → PM2 (`weekly`)

## 数据库模型速查

| 模型 | 关键字段 |
|------|---------|
| `User` | `id`, `name`, `username`, `company`, `isWorkListAdmin`, `canAccessHR`, `canAccessWorks`, `canSelectAnyWeek`, `canLogin`, `employeeId` |
| `Employee` | `id`, `employeeId`, `name`, `company`, `dept1`, `dept2`, `position`, `status`, `alias` |
| `CompanyCode` | `code`(001-999), `name` |
| `DepartmentCode` | `code`(companyCode+3位如004001), `name`, `companyCode` |
| `PositionCode` | `code`(companyCode+3位如004001), `name`, `companyCode` |
| `UserPosition` | `id`(userId+deptCode+posCode), `userId`, `companyCode`, `deptCode`, `positionCode`, `canAccessWorks`, `canSelectAnyWeek`, `canAccessHR`, `isPrimary` |
| `WeeklyReport` | `userId`, `reportGroupId`, `weekNumber`, `year`, `items` |
| `WorkItem` | `departmentId`, `category`, `content` |

**公司编码**: 001丰华生物、002丰华天力通、003丰华悦通、004丰华制药、005加拿大

## 编码规范

- 所有 API 返回 JSON: `{ success: true }` 或 `{ error: "..." }`
- 路由权限校验用 `authenticate()` 或 `requireAdmin()`
- Prisma 查询后断开: `await prisma.$disconnect()` (脚本中)
- 前端状态用 `useState`，副作用用 `useEffect`

## 前端交互规范

- **禁止**用 `window.confirm()` / `window.alert()` —— 用自定义确认框组件
- **禁止**用浏览器原生弹框 —— 统一用页面内模态框
- 搜索框支持拼音首字母（已集成 `pinyin-pro`）
- 表格行 hover 效果: `hover:bg-gray-50`
- 成功提示: `bg-green-50 text-green-700`
- 错误提示: `bg-red-50 text-red-700`

## 公司隔离规则

- 非管理员用户只能访问自己 `User.company` 的数据
- 系统管理员(`isWorkListAdmin`)可访问所有公司数据
- API 传参: `company` 或 `companyCode`
- 前端默认按用户 company 过滤，管理员可切换

## 部署流程

```bash
npm run build
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
rsync -avz --delete --exclude='.env' -e "ssh -i /Users/koito/Desktop/.System/tencent/fenghua.pem" .next/standalone/ ubuntu@49.235.213.225:/home/ubuntu/weekly/.next/standalone/
rsync -avz -e "ssh -i /Users/koito/Desktop/.System/tencent/fenghua.pem" prisma/dev.db ubuntu@49.235.213.225:/home/ubuntu/weekly/prisma/dev.db
ssh -i /Users/koito/Desktop/.System/tencent/fenghua.pem ubuntu@49.235.213.225 "cd /home/ubuntu/weekly/.next/standalone && pm2 restart weekly"
```

## 关键文件位置

| 功能 | 文件 |
|------|------|
| 花名册 | `app/hr/page.tsx` |
| 管理后台 | `app/admin/page.tsx` |
| 入口 | `app/portal/page.tsx` |
| 员工 API | `app/api/employees/route.ts` |
| 部门编码 API | `app/api/admin/department-codes/route.ts` |
| 岗位编码 API | `app/api/admin/position-codes/route.ts` |
| 权限 API | `app/api/admin/employee-permissions/route.ts` |
| 认证 | `lib/auth.ts` |
| Schema | `prisma/schema.prisma` |

## 修改后必须执行

1. 如改 schema: `npx prisma db push --accept-data-loss`
2. 构建验证: `npm run build`
3. 如有数据变更: 同步 `prisma/dev.db` 到服务器
