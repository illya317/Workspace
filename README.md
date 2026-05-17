# 丰华生物周报 & HR 系统

企业内部周报填报 + 人事行政管理，含花名册、岗位、编码、权限管理。

## 技术栈

- **框架**：Next.js 16 + React + TypeScript + Tailwind CSS
- **数据库**：Prisma 5 + SQLite
- **认证**：JWT Cookie + API Key
- **部署**：`./deploy.sh` → standalone → rsync → PM2

## 快速开始

```bash
npm install
npx prisma db push
npm run dev
```

## 项目结构

```
├── app/
│   ├── admin/                    # 管理后台（周报管理+权限管理）
│   ├── hr/                       # 人事行政（花名册/员工/岗位/编码）
│   │   ├── page.tsx              # HR 主页面 + RosterTab + CodeTab
│   │   ├── EmployeeTab.tsx       # 员工信息编辑
│   │   └── PositionTab.tsx       # 岗位关联编辑
│   ├── dashboard/                # 周报填写
│   ├── works/                    # 工作清单
│   ├── components/               # 共享组件
│   │   ├── EditToolbar.tsx       # 编辑工具栏（编辑→保存+取消+版本）
│   │   ├── ConfirmModal.tsx      # 确认弹框
│   │   ├── Toast.tsx             # 通知提示
│   │   └── FilterBar.tsx         # 筛选栏容器
│   ├── hooks/
│   │   └── useToast.ts           # Toast hook
│   └── api/                      # API 路由
├── lib/
│   ├── auth.ts                   # 认证 + 权限校验
│   ├── prisma.ts                 # Prisma Client
│   ├── company.ts                # 公司常量和辅助函数
│   ├── search.ts                 # 拼音搜索
│   └── week.ts                   # 周数计算
├── prisma/
│   └── schema.prisma             # 数据库模型（24 张表）
├── docs/
│   ├── tables.md                 # 表结构说明
│   └── database.md               # 数据库设计
└── scripts/
    ├── import-users.ts           # 从 Excel 导入 User
    ├── init-user-employee-link.ts # 关联 User ↔ Employee
    └── seed-permissions.ts       # 权限系统种子数据
```

## 权限系统

新增权限只需 INSERT 一行：

```sql
INSERT INTO Permission (key, categoryId, name, description)
VALUES ('module.reports', 2, '报表查看', '可查看数据报表');
```

Admin 页面自动发现，无需改代码。

## 部署

```bash
./deploy.sh              # 普通部署
./deploy.sh --push-db    # schema 变更时
```
