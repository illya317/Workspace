# HR 模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 人事管理主页 | `/hr` | `app/hr/page.tsx` (Tab式页面) |
| 人力分析 | `/hr/analytics` | `app/hr/analytics/page.tsx` |
| 考勤绩效 | `/hr/performance` | `app/hr/performance/page.tsx` (占位) |

## HR 主页结构

`page.tsx` 渲染一个 Tab 切换界面，每个 Tab 是一个独立的 `*Tab.tsx` 组件：

| Tab | 组件 | 说明 |
|-----|------|------|
| 员工信息 | EmployeeTab | 基于 `GenericTableTab`，employeeConfig |
| 雇佣记录 | EmploymentTab | 基于 `GenericTableTab`，employmentConfig |
| 用户账号 | RosterTab | 独立实现，关联Employee.userId |
| 部门管理 | DepartmentTab | 基于 `CodeTab`（编码管理） |
| 岗位管理 | PositionTab | 基于 `CodeTab` |
| 员工岗位 | EDPTab | 基于 `GenericTableTab` |
| 合同信息 | ContractTab | 基于 `GenericTableTab` |
| 公司管理 | CompanyTab | 基于 `CodeTab` |
| 公司关系 | CompanyRelationTab | 基于 `GenericTableTab` |
| 项目 | ProjectTab | 基于 `CodeTab` |
| 项目信息 | ProjectInfoTab | 基于 `GenericTableTab` |
| 员工项目 | EmployeeProjectTab | 基于 `GenericTableTab` |

## 核心组件链

```
page.tsx
  └─ TabConfig (tabConfigs.ts)
       ├─ GenericTableTab (GenericTableTab.tsx + useGenericTab.ts)
       │    ├─ EditableTable (EditableTable.tsx)        — 表格渲染+编辑
       │    ├─ FilterModal (FilterModal.tsx)            — 筛选弹窗
       │    ├─ FKInput (FKInput.tsx)                    — 外键字段输入
       │    └─ EntitySearchInput / FilterSearchInput     — 搜索输入
       │
       ├─ CodeTab (code/CodeTab.tsx + code/useCodeTab.ts)
       │    ├─ CodeTable (code/CodeTable.tsx)           — 编码表格
       │    ├─ EditToolbar                              — 编辑工具栏
       │    └─ AuditLogModal                            — 历史记录弹窗
       │
       └─ RosterTab (RosterTab.tsx)                     — 独立员工账号关联
```

## 数据流

1. **tabConfigs.ts** 定义每个 Tab 的字段配置（FieldConfig[]）、FK 映射、API 端点
2. **useGenericTab.ts** 提供通用 CRUD hook：加载/创建/更新/搜索/筛选/审计日志
3. **GenericTableTab.tsx** 消费 hook，渲染表格 + 工具栏 + 弹窗
4. **API 路由** 在 `app/api/hr/` 下，统一使用 `lib/crud.ts` 模板或 `matchAnyField` 搜索

## Tab 配置 (tabConfigs.ts)

```ts
export interface FieldConfig {
  key: string;          // 字段名
  label: string;        // 显示标签
  type: "text" | "fk" | "boolean" | "date" | "select" | "hidden";
  editable?: boolean;   // 是否可编辑
  hidden?: boolean;     // 是否隐藏
  displayField?: string;// 显示时取的字段路径（点号分隔）
}

export interface TabConfig {
  entityType: string;   // 实体类型名
  modelKey: string;     // Prisma 模型名
  fields: FieldConfig[];
  fkFields?: Record<string, { entity: string; displayField: string }>;
  apiPath: string;      // API 基础路径
}
```

## 搜索模块

所有搜索统一走 `lib/search.ts`（唯一 import `pinyin-pro` 的地方）：
- `matchEmployee(obj, keyword)` — 姓名+别名+工号+拼音首字母
- `getInitials(text)` — 拼音首字母提取
- `matchAnyField(record, keyword, modelName)` — 通用字段搜索（`lib/search-schema.ts`）
- `useSearch(config)` — 客户端搜索 hook（`lib/useSearch.ts`），默认带拼音

## API 路由规范

HR API 在 `app/api/hr/` 下，采用统一 CRUD 模板：
- `GET` — 列表（支持 `?keyword=` 搜索，`?company=` 筛选）
- `POST` — 创建（body 为 JSON，含必填字段校验）
- `PUT` — 更新（body 含 `id` + 变更字段）
- `DELETE` — 删除（`?id=` 参数，已对大部分实体禁用）

## HR 权限标准

HR 页面和 API 使用同一套 RBAC 权限：

- `people.access` — 控制进入页面和查看数据（GET）
- `people.write` — 控制新增、编辑（POST / PUT / PATCH）
- `people.delete` — 控制删除（DELETE）
- `system.admin` — 拥有全部 HR 权限

**权限继承规则**：
- 岗位授权和部门授权也会生效（通过 `positionResourceRole` / `departmentResourceRole`）
- 有 `people.write` 或 `people.delete` 的用户自动可以进入 HR 页面（隐含 `access`）
- 前端只做显示控制（隐藏编辑按钮），API 必须做最终权限校验

**API 权限映射**：
- `GET` → `checkHRAccess(userId, "access")`
- `POST` / `PUT` / `PATCH` → `checkHRAccess(userId, "write")`
- `DELETE` → `checkHRAccess(userId, "delete")`

所有路由使用 `authenticate()` + 按 HTTP 方法区分的权限检查鉴权。
