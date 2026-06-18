# HR 模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 人事管理主页 | `/hr` | `app/hr/page.tsx` (Tab式页面) |
| 人事基础资料 | `/hr/roster` | `app/hr/roster/page.tsx` + `HRClient` |
| 员工详情表单 | `/hr/roster/employees/[id]` | `app/hr/profile/EmployeeProfileClient.tsx` |
| 人力分析 | `/hr/analytics` | `app/hr/analytics/page.tsx` |
| 考勤绩效 | `/hr/performance` | `app/hr/performance/page.tsx` (占位) |

## HR 基础资料结构

`/hr/roster` 现在采用主数据拆分入口：

- `员工资料`：默认入口，先显示员工列表，再进入 `/hr/roster/employees/[id]` 维护单个员工的多维资料。
- `部门`：部门主数据维护。
- `岗位`：岗位主数据维护。
- `项目`：项目/虚拟团队主数据维护。
- `员工信息表`：保留原有多人表格编辑方式，用于集中修正员工、雇佣、合同、部门岗位、项目员工数据。

员工详情页只维护员工相关维度：基本信息、雇佣关系、合同、部门岗位、项目员工、历史记录。部门、岗位、项目仍作为主数据独立维护，详情页只通过 FK 搜索选择。

员工详情页的合同与部门岗位使用专用卡片布局：

- 合同：拆分为合同概况、首签、续签一、续签二、长期与协议，标识当前合同/历史合同。
- 雇佣关系：维护员工层面的在职、入离职、办公地点、人员类型、职级、职务，并在同页维护合同。
- 部门岗位：只维护员工-部门-岗位关系事实，标识当前岗位/历史岗位，当前岗位工作占比合计必须等于 1。
- 历史记录：读取 `EditHistory`，展示编辑人、编辑时间、实体、版本和字段级变更。

`员工信息表` 下每个 Tab 是一个独立的 `*Tab.tsx` 组件：

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

员工详情页的数据流：

1. `GET /api/hr/employee-profiles/[id]` 聚合读取员工、雇佣、合同、部门岗位、项目员工。
2. 基本信息保存复用 `PUT /api/hr/employees/[id]`。
3. 雇佣、合同、部门岗位、项目员工写入复用现有行级 CRUD API。
4. 员工详情页的部门岗位保存走 `PUT /api/hr/employee-profiles/[id]/edps`，按员工整组保存并校验当前岗位工作占比合计为 1。
5. 合同仍读取并写入 `Employment.contracts` JSON，前端沿用 `employmentId * 1000 + index` 的合成合同 ID。

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
