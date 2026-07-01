# Docs Editor Template Spaces

Owner: Platform Docs / Feature.

用途：记录 `/docs/editor` 文档模板编辑器的空间、权限和 QC 官方模板归属。修改模板空间、空间权限、QC 官方模板同步或 Work/Docs 共用权限组件时，必须同步更新本文件。

## 空间模型

Docs Editor 使用和 Work Tasks 一致的业务空间入口，但不复用 Work 的业务表：

| 空间 | 目标 | 创建方式 | 自然权限 |
|---|---|---|---|
| 个人 | `targetType=personal`, `targetId=userId` | 用户进入编辑器时自动确保 | 本人 `manager` |
| 公共 | `targetType=company`, `targetId=companyId` | 只取一个集团公司记录作为公共模板空间锚点 | 所有可进入编辑器的用户 `viewer`；管理员和显式授权可提升 |
| 部门 | `targetType=department`, `targetId=departmentId` | 按组织部门列出和确保 | `Department.managerPositionId` 对应岗位的在职人员为 `manager`，部门其他人员 `viewer` |

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

`docs.editor.access` 只控制能否进入模板编辑器。进入后具体能看到、编辑、删除或管理哪个个人/公共/部门空间，由 Docs Editor 空间权限计算。公共模板空间对所有进入编辑器的用户可见，但编辑、删除和管理仍必须通过显式授权或 Docs Editor admin 获得。

## UI 和 API 边界

- Work Tasks 和 Docs Editor 复用 `packages/platform/ui/SpacePermissionsPanel.tsx` 与 `packages/platform/permissions.ts` 的业务空间角色工具。
- Docs Editor 通过 `/api/modules/docs/editor/spaces/[spaceId]/permissions` 读写空间授权。
- 用户选择候选走 Docs Editor 自己的 `reference-options` API 和 FK registration，不能直接复用 Work 的 FK key。
- Docs Editor 顶部 `scope` 先选择个人/公共/部门空间类型；页面内 `文档模板` / `权限管理` 作为 toolbar micro segmented 视图切换，只有当前空间 `manager` 才显示权限管理。

## 模板正文存储

`DocumentTemplate` 表只承载模板元数据、空间归属、状态、来源标识和正文文件引用。模板正文（`document.json` / `field-model.json`）只保存在运行时文件系统中，DB 不再保留内联正文或内容 hash。

模板正文持久化在运行态 workspace，并按空间归属分目录。DB 当前引用指向正在读取的那一版正文：

```txt
$WORKSPACE_CONFIG_DIR/data/docs-editor/templates/
  department/{departmentId}-{departmentCodeOrSlug}/template-{templateId}-{sourceOrTitle}/
    draft/document.json
    draft/field-model.json
    versions/{yymmdd_vN}/document.json
    versions/{yymmdd_vN}/field-model.json
  personal/{userId}-{usernameOrSlug}/template-{templateId}-{title}/...
  company/{companyId}-{companySlug}/template-{templateId}-{title}/...
```

对应 DB 字段为 `documentContentRef` / `fieldModelContentRef`。读取详情只信 DB ref，不再从模板 ID 推导正文路径。草稿保存覆盖 `draft/`；发布态模板保存、QC 官方同步和 HR 官方同步写入新的 `versions/{yymmdd_vN}/`，其中日期按 Asia/Shanghai 生成。迁移旧的平铺目录使用：

```bash
npm run docs-editor:content:rehome -- --dry-run
npm run docs-editor:content:rehome
```

部署和备份时，除 SQLite DB 外，还必须同步 `$WORKSPACE_CONFIG_DIR/data/docs-editor/templates`。服务器端不能用本地 `data/docs-editor/templates` 覆盖；应在服务器自己的 `REMOTE_WORKSPACE_CONFIG_DIR` 上先 dry-run，再正式执行迁移脚本。第一阶段迁移只复制并更新 DB ref，旧平铺目录保留为回滚参考。

## QC 官方模板

QC 官方模板属于真实部门空间，不再作为虚拟空间或虚拟模板 ID 暴露。

- 部门解析优先使用 `Department.code = FUN701`，找不到时回退到 `Department.name = 质量控制部`。
- `generated/production/qc/template-snapshots/products/*.json` 是 Production QC 生成的同步源快照，不是 Docs Editor 模板正文目录，也不是前端直接选择的模板空间。
- Docs Editor 服务进入空间列表时会确保质量控制部空间，并把 QC 快照 upsert 成真实 `DocumentTemplate`；正文同样写入 `$WORKSPACE_CONFIG_DIR/data/docs-editor/templates`，DB 只保留文件引用。
- QC 和 HR 官方模板都必须同时维护 `document.json` 与 `field-model.json`，不能只迁移或同步其中一个。
- 官方模板使用 `sourceKind=production.qc.official` 和 `sourceProductKey` 标识同一产品模板，重复同步更新同一真实模板。
- 复制官方模板时，副本清空 `sourceKind/sourceProductKey`，避免用户副本参与官方同步。

Production QC 批次和检验记录仍由 `production.qc` 负责；模板浏览、编辑、复制、发布和授权归 `/docs/editor`。
