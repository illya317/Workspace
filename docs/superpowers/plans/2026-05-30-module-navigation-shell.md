# 全局模块导航统一

> 2026-05-30 | 已完成 | 参考: `app/lib/module-nav.tsx`

## 三层结构

```
L0 /portal      入口页 → MODULES 按 requiredPerm 过滤显示一级模块卡片
L1 /<module>    模块首页 → ModuleHome 按 requiredPerm 过滤显示子板块卡片
L2 /<module>/x  业务页 → AppShell (统一顶栏 + 返回上级)
```

## 共享组件

| 组件 | 文件 | 用途 |
|------|------|------|
| `module-nav.tsx` | `app/lib/module-nav.tsx` | 全站模块注册表，定义 ModuleDef/SubModuleDef，`getAccessibleModules()` / `getSubModules()` |
| `AppShell` | `app/components/AppShell.tsx` | L2 统一顶栏：Logo | 标题 | ← 返回上级 | UserMenu |
| `ModuleHome` | `app/components/ModuleHome.tsx` | L1 统一卡片网格：标题 + desc + 权限过滤 + 空状态提示 |

## 注册规则

新增模块必须：
1. 在 `MODULES` 数组添加 `ModuleDef`
2. `requiredPerm` 设为 SessionUser 上对应的 `canAccess*` 字段名（`undefined` = 所有人可见）
3. 子板块在 `children` 数组添加 `SubModuleDef`
4. L2 页面使用 `AppShell` 组件，`backHref` 指向 L1 模块首页

## 已迁移模块

- Portal: 使用 `getAccessibleModules()` 渲染卡片
- HR: `/hr` = ModuleHome, `/hr/roster` = 原 HRClient
- Administration: 服务端 auth + ModuleHome
- Production: 新模块首页，子板块 = inventory

## 未迁移模块

- Finance: 保留独立 `FinanceShell`（其他 agent 活跃开发中）
- Reports/Works/History: 暂未纳入三层结构
