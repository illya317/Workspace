# 内部管理系统

## 系统地图

```text
/portal          L0 入口 — 按权限显示可用模块卡片

/hr              L1 人事管理首页 — 人事基础资料 / 考勤绩效 / 人力分析
  /hr/roster        人事基础资料（花名册、雇佣、部门、岗位、EDP、项目）
  /hr/performance   考勤绩效
  /hr/analytics     人力分析

/finance         L1 财务管理首页 — 总账基础 / 财务报表 / 预算 / 分析 / 成本 / 导入
  /finance/ledger    总账基础（科目、凭证、余额、期间）
  /finance/statements 财务报表
  /finance/budget    预算管理
  /finance/analysis  财务分析
  /finance/cost      成本管理
  /finance/import    数据导入

/administration  L1 行政管理首页 — 合同台账
  /contracts         合同台账

/production      L1 生产管理首页 — 库存管理
  /inventory         库存管理

/docs            文档中心
/reports         工作汇报
/settings        设置
```

## 技术栈

Next.js 16 + React + TypeScript + Tailwind CSS + Prisma + SQLite

## 项目结构

| 目录 | 用途 |
|------|------|
| `app/<domain>/` | 业务页面、组件、ARCHITECTURE.md |
| `app/api/<domain>/` | API route handler |
| `app/components/` | 全站复用 UI（AppShell, ModuleHome, UserMenu 等） |
| `app/lib/` | 应用级工具（module-nav.tsx 全站菜单注册表） |
| `server/services/<domain>/` | 业务逻辑 |
| `server/auth/` | 认证授权 |
| `prisma/` | 数据模型、迁移、seed |
| `lib/` | 跨端工具（类型、常量、权限） |
| `docs/` | 治理文档、架构设计 |

## 关键规则

- **新增业务模块必须注册到 `app/lib/module-nav.tsx`**
- 模块首页用 `ModuleHome`，子页面用 `AppShell`
- 权限走 `SessionUser` 布尔字段，禁止页面内重复获取
- DB 存事实，Service 算结果，API 返回 DTO
- 详见 `docs/architecture-governance.md` 和 `rules.md`
