# Docs Editor Template Spaces

Owner: Platform Docs / Feature.

用途：记录 `/docs/editor` 文档模板编辑器的空间、权限和 QC 官方模板归属。修改模板空间、空间权限、QC 官方模板同步或 Work/Docs 共用权限组件时，必须同步更新本文件。

## 空间模型

Docs Editor 使用和 Work Tasks 一致的业务空间入口，但不复用 Work 的业务表：

| 空间 | 目标 | 创建方式 | 自然权限 |
|---|---|---|---|
| 个人 | `targetType=personal`, `targetId=userId` | 用户进入编辑器时自动确保 | 本人 `manager` |
| 公司 | `targetType=company`, `targetId=companyId` | 只取一个集团公司空间 | 无自然成员权限；可由管理员显式授权 |
| 部门 | `targetType=department`, `targetId=departmentId` | 按组织部门列出和确保 | 部门负责人 `manager`，部门其他人员 `viewer` |

`DocumentTemplateSpace` 只表示空间归属，不再存旧的 `kind/ownerUserId/departmentId` 组合字段。空间唯一性由 `targetType + targetId` 保证。

## 权限模型

模板权限收敛到空间级，不再存在模板级授权。

| 角色 | 能力 |
|---|---|
| `viewer` | 查看空间和模板 |
| `editor` | 编辑模板草稿、复制模板、申请发布 |
| `delete` | 包含编辑能力，并允许删除草稿 |
| `manager` | 包含删除能力，并允许发布、管理空间授权 |

空间角色由自然权限和显式授权取最大值。显式授权写入 `DocumentTemplateSpacePermission`，以 `targetType + targetId + userId + kind` 唯一；当前 `kind` 固定为 `template`，用于和 Work 共用 Platform 权限面板时保持语义清晰。

`docs.editor.access` 只控制能否进入模板编辑器。进入后具体能看到、编辑、删除或管理哪个个人/公司/部门空间，由 Docs Editor 空间权限计算。

## UI 和 API 边界

- Work Tasks 和 Docs Editor 复用 `packages/platform/ui/SpacePermissionsPanel.tsx` 与 `packages/platform/permissions.ts` 的业务空间角色工具。
- Docs Editor 通过 `/api/modules/docs/editor/spaces/[spaceId]/permissions` 读写空间授权。
- 用户选择候选走 Docs Editor 自己的 `reference-options` API 和 FK registration，不能直接复用 Work 的 FK key。
- Docs Editor 页面 tab 固定为 `文档模版` 和 `权限管理`；只有当前空间 `manager` 才显示权限管理。

## QC 官方模板

QC 官方模板属于真实部门空间，不再作为虚拟空间或虚拟模板 ID 暴露。

- 部门解析优先使用 `Department.code = FUN701`，找不到时回退到 `Department.name = 质量控制部`。
- `generated/docs-editor/qc/products/*.json` 是同步源快照，不是前端直接选择的模板空间。
- Docs Editor 服务进入空间列表时会确保质量控制部空间，并把 QC 快照 upsert 成真实 `DocumentTemplate`。
- 官方模板使用 `sourceKind=production.qc.official` 和 `sourceProductKey` 标识同一产品模板，重复同步更新同一真实模板。
- 复制官方模板时，副本清空 `sourceKind/sourceProductKey`，避免用户副本参与官方同步。

Production QC 批次和检验记录仍由 `production.qcBatches` 负责；模板浏览、编辑、复制、发布和授权归 `/docs/editor`。
