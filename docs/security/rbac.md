# RBAC 权限模型

## 角色语义（v2025-05-28）

| 角色 | 含义 | HTTP 方法映射 |
|------|------|--------------|
| `access` | 访问/查看 | GET |
| `write` | 新增/编辑 | POST / PUT / PATCH |
| `delete` | 删除 | DELETE |
| `admin` | 管理该资源及子资源的权限授权 | 后台权限矩阵操作 |

重要区分：
- **`resource.admin`**（如 `people.admin`、`finance.admin`）= 模块管理员
  - 可管理该模块及子资源的权限分配
  - **不能**创建账号、重置密码、管理 API Key
  - **不能**授予 `system.admin`
  - **不能**管理其他模块
- **`system.admin`** = 超级管理员
  - 可管理全部资源、账号、系统配置
  - 唯一可授予 `system.admin` 的身份

普通 `people.access` / `people.write` / `people.delete` 持有者**不能**进入后台授权页面。

---

## 当前等级：RBAC0（基础）

```
Resource（资源）── Role（角色）── User（用户）
    有什么              能干什么          谁
```

### 表结构

```prisma
model Resource {
  id          Int     @id @default(autoincrement())
  key         String  @unique   // "system" | "module.hr" | "module.works" | "department" | "report_group"
  name        String            // "系统功能" | "人事行政" | "部门" | "周报分组" | "字段"
  description String?
  sortOrder   Int     @default(0)
}

model Role {
  id          Int     @id @default(autoincrement())
  key         String  @unique   // "access" | "write" | "delete" | "admin"
  name        String            // "可进入" | "编辑" | "可删除" | "管理"
  description String?
  sortOrder   Int     @default(0)
}

model UserResourceRole {
  id           Int       @id @default(autoincrement())
  userId       Int
  resourceId   Int
  roleId       Int
  scopeId      String?   // null=全局，非null=资源实例（如 departmentId、reportGroupId）
  user         User      @relation(fields: [userId], references: [id])
  resource     Resource  @relation(fields: [resourceId], references: [id])
  role         Role      @relation(fields: [roleId], references: [id])

  @@unique([userId, resourceId, roleId, scopeId])
}
```

### 数据示例

```
userId | resourceKey    | roleKey | scopeId
-------|----------------|---------|--------
7      | system         | access  | null       ← 可登录
7      | module.hr      | access  | null       ← 可进HR
7      | department     | admin   | 12         ← 原液车间管理员
26     | department     | admin   | 1          ← 总裁办管理员
7      | report_group   | member  | 5          ← 研发周报成员
```

### 权限层级

| 层 | scopeId | 含义 | Admin 操作 |
|----|---------|------|-----------|
| 2 | null | 全局开关（能否进） | toggle 开关 |
| 3 | 有值 | 范围分配（在哪干什么） | 列表 + 添加/移除 |

---

## RBAC1：角色继承（预留）

**场景**：部门经理自动拥有部门员工的所有权限。

### 新增表

```prisma
model RoleHierarchy {
  id         Int   @id @default(autoincrement())
  parentRoleId Int   // 上级角色（如 "部门经理"）
  childRoleId  Int   // 下级角色（如 "部门员工"）

  @@unique([parentRoleId, childRoleId])
}
```

### 判断逻辑

```typescript
// 用户拥有某角色，或其任意祖先角色
async function hasRole(userId: number, resourceId: number, roleId: number, scopeId?: string) {
  const direct = await db.userResourceRole.findFirst({ where: { userId, resourceId, roleId, scopeId } });
  if (direct) return true;
  
  // 查找继承链：roleId 的所有祖先
  const ancestors = await getAncestorRoles(roleId);
  for (const a of ancestors) {
    const inherited = await db.userResourceRole.findFirst({ where: { userId, resourceId, roleId: a.id, scopeId } });
    if (inherited) return true;
  }
  return false;
}
```

**不上线 RBAC1 的原因**：无实际业务需求，且会增加继承冲突复杂度。

---

## RBAC2：约束（预留）

**场景**：互斥角色（申请人和审批人不能同一人）、角色数量限制、前置条件。

### 新增表

```prisma
model RoleConstraint {
  id        Int     @id @default(autoincrement())
  type      String  // "mutex" | "cardinality" | "prerequisite"
  roleId    Int     // 被约束的角色
  refRoleId Int?    // 关联角色（互斥时用）
  maxCount  Int?    // 数量上限（基数约束时用）
}
```

**不上线 RBAC2 的原因**：当前人数规模不需要互斥和基数约束。

---

## RBAC3：统一（预留）

RBAC1 + RBAC2 合并，完整 RBAC 模型。当前项目不需要。

---

## 迁移对照

| 旧表 | 新表 / 处理 |
|------|------------|
| `PermissionCategory` | 废弃 |
| `Permission` | → `Resource` |
| (无) | → `Role` |
| `UserPermission` | → `UserResourceRole`（scopeId=null） |
| `DepartmentAdmin` | → `UserResourceRole`（resource=department, role=admin, scopeId=departmentId） |
| `ReportGroupMembership` | → `UserResourceRole`（resource=report_group, role按原role字段, scopeId=reportGroupId） |
| `FieldPermission` | → `UserResourceRole`（resource=field, role=read/write, scopeId=fieldName） |
| `GlobalFieldPermission` | → `UserResourceRole`（userId=0 表示全局默认） |
| `ReportGroupAdmin` | 废弃（已有 Membership） |
| `ReportGroupMember` | 废弃（已有 Membership） |
| `ReportGroupViewer` | 废弃（已有 Membership） |
