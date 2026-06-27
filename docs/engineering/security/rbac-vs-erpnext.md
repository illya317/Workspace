# 权限体系对比：我们的系统 vs ERPNext

> 调研日期：2026-06-04
> 对比目的：借鉴 ERPNext 成熟方案，确认我们当前 4 层动作模型的合理性。

---

## 1. 分层架构对比

| 层级 | **ERPNext** | **我们的系统** |
|------|-------------|----------------|
| **登录层** | `frappe.session.user` + session cookie | `authenticate()` + JWT cookie → `getCurrentUser()` |
| **用户类型层** | System User / Website User（`desk_access` 标志） | 无 |
| **角色层** | Role doctype + Has Role 子表 | `UserResourceRole` / `PositionResourceRole` / `DepartmentResourceRole` |
| **角色档案层** | Role Profile（预设角色包，一键分配多角色） | 无（岗位 + 部门间接实现角色包效果） |
| **页面层** | ❌ 无独立页面门禁，Desk 访问由 `desk_access` 控制 | ✅ `requireResourceAccess(resourceKey)` + `module-nav.tsx` 过滤 |
| **文档/对象层** | DocPerm（doctype JSON 中 `permissions` 数组） | Resource tree（`finance.tax`, `hr.roster`） |
| **字段层** | `permlevel`（0/1/2…）控制字段可见 | 无 |
| **数据范围层** | User Permission（限制用户能看到哪些文档实例） | 无（目前靠 `companyCode` 做粗过滤） |
| **状态层** | Workflow + `docstatus`（draft/submitted/cancelled） | 无 |
| **审批层** | Authorization Control（金额阈值审批） | 无 |

**核心差异**：ERPNext 是**文档为中心**——权限围绕 doctype（"Sales Order" 这种业务对象）配置；我们是**页面为中心**——权限围绕 resourceKey（`finance.tax` 这种页面路由）配置。

---

## 2. 动作层对比

| **ERPNext（14 层）** | **我们（4 层）** |
|----------------------|-----------------|
| `read` — 查看文档 | `access` — 页面可见 / 数据读取 |
| `write` — 编辑 | `write` — 编辑数据 |
| `create` — 新建 | （隐含在 `write` 中） |
| `delete` — 删除 | `delete` — 删除数据 |
| `submit` — 提交（状态流转） | （无） |
| `cancel` — 取消 | （无） |
| `amend` — 修正 | （无） |
| `print` — 打印 | （无） |
| `email` — 邮件 | （无） |
| `report` — 报表 | （无） |
| `export` — 导出 | （无） |
| `import` — 导入 | （无） |
| `share` — 分享 | （无） |
| `select` — 链接字段引用 | （无） |

### 缺口分析

| 缺口 | 影响 | 建议 |
|------|------|------|
| `create` 隐含在 `write` | 未来需要"能查看但不能新建"时无法满足 | 如需拆分，新增 `create` 动作 |
| `export` / `import` | 数据导入导出功能无独立权限控制 | 如需控制，可通过 `admin` 角色覆盖或新增动作 |
| `submit` / `cancel` / `amend` | 依赖工作流状态机 | 引入审批流后再考虑扩展动作层 |

---

## 3. 权限分配方式对比

| 分配方式 | **ERPNext** | **我们的系统** |
|----------|-------------|----------------|
| **直接分配** | User → Has Role 子表 | `UserResourceRole`（直接给用户赋权） |
| **间接分配** | Role Profile 角色包 | `PositionResourceRole`（岗位继承）+ `DepartmentResourceRole`（部门继承） |
| **默认角色** | `All`（全员）、`Guest`（访客） | 无 |
| **超级用户** | `Administrator`、`System Manager` | `isAdmin` 标志 |
| **祖先传播** | 无 | ✅ 子资源权限自动使祖先可见（`finance.tax` → `finance` 自动可见） |

---

## 4. 关键设计差异

| 差异点 | ERPNext | 我们的系统 |
|--------|---------|------------|
| **权限和什么绑定** | **Doctype（业务对象）** | **ResourceKey（页面路由）** |
| **页面门禁怎么做** | 没有页面门禁，Desk 角色 + doctype 权限决定用户能看到什么 | `requireResourceAccess("finance.tax")` 直接做路由门禁 |
| **菜单怎么过滤** | Desk 根据角色自动渲染工作台 | `module-nav.tsx` 根据 `visibleResourceKeys` 过滤 |
| **数据范围控制** | User Permission 限制能看到哪些具体文档 | 无（目前靠 `companyCode` 字段过滤） |
| **配置界面** | Permission Manager UI + doctype JSON | 纯代码配置（`scripts/seed-resources.ts`） |
| **硬约束** | 无 | ✅ `check-module-page-gates.js` + `check-module-nav-gates.js` |

---

## 5. 可借鉴项

### ERPNext 的优点（值得参考）

1. **字段级权限（permlevel）**
   - 可以控制"谁能看到价格字段、银行账户"
   - 我们目前无此能力，敏感字段靠 UI 隐藏，后端无强制校验

2. **数据范围权限（User Permission）**
   - 可以限制"销售 A 只能看到自己的客户"
   - 我们目前靠 `companyCode` 做粗过滤，无法实现行级权限

3. **状态流转权限（submit / cancel / amend）**
   - 本质上是工作流状态机
   - 如果有审批流需求，这套动作层很成熟

### 我们的优点（ERPNext 没有的）

1. **页面级权限**：ERPNext 没有"页面门禁"概念，Desk 是统一的，我们是 page-level 的
2. **祖先传播**：子权限自动让父页面可见，ERPNext 没有这个机制
3. **硬约束**：代码层面强制"菜单声明了什么权限，页面就必须有对应门禁"
4. **三层继承**：用户 + 岗位 + 部门三层叠加，ERPNext 只有直接分配和 Role Profile 两层

---

## 6. 结论

- 我们的 **4 层动作（access / write / delete / admin）** 对当前系统够用
- 如果要借鉴 ERPNext，最值得的是 **字段级权限** 和 **数据范围权限**
- 动作层不需要扩展到 14 层，除非引入状态机或审批流

## 7. 当前决策

Workspace 不集成 ERPNext，也不维护 ERPNext 角色、连接器或用户绑定。本文仅作为权限设计对比资料保留；后续模块生命周期使用 `workspace-owned`、`workspace-analysis`、`external-system`、`legacy-fallback` 等不绑定具体 ERP 产品的标记。

高风险写回（凭证、付款、发票、采购单、销售单、库存出入库、结账、成本核算）不通过 ERPNext 路线推进。若未来需要对接外部系统，按独立 connector 和审批边界重新设计。

---

## 参考

- `docs/engineering/security/rbac.md` — 本系统 RBAC 完整文档
- `docs/engineering/security/permission-matrix.md` — 资源权限矩阵
