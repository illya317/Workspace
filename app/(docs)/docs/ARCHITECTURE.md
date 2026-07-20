# Docs - 文档中心

## 定位

文档中心包含静态制度/规范页面和模板编辑器。静态页面只负责阅读入口；模板编辑器是带空间、流程和导出的业务能力。

## 目录

```text
app/(docs)/docs/
  page.tsx                         # L1 首页，ModuleHome 展示子模块卡片
  company/page.tsx                 # 公司管理文档占位页
  expense/page.tsx                 # 报销规范文档占位页
  editor/page.tsx                  # 模板编辑器入口
  editor/templates/[templateId]/   # 模板深链入口

app/api/modules/docs/editor/
  route.ts                         # 模板列表、详情、创建和保存
  templates/[templateId]/*         # 模板更新、删除、发布、归档、复制
  submissions/*                    # 模板流程提交、审批、驳回、撤回、评论
  spaces/[spaceId]/permissions     # 空间授权表

packages/platform/server/docs-editor/
  service.ts                       # 模板读写服务
  permissions.ts                   # 模板空间权限和自然角色
  approvals.ts                     # 模板流程 adapter
  space-permissions.ts             # 空间授权服务

packages/platform/ui/docs/
  DocsClient.tsx
  editor/*                         # 模板编辑器 UI
```

## 权限

| 资源 | 状态 | 支持 action | 说明 |
|---|---|---|---|
| `docs` | docs | `entry`, `read`, `grant` | 文档中心 L1 入口 |
| `docs.company` | docs | `entry`, `read`, `grant` | 公司管理文档页面 |
| `docs.expense` | docs | `entry`, `read`, `grant` | 报销规范文档页面 |
| `docs.editor` | business | `entry`, `read`, `create`, `update`, `delete`, `archive`, `revise`, `submit`, `reverse`, `approve`, `reject`, `export`, `grant` | 模板编辑器 root resource |

`docs.editor` 同时通过 `spaceRegistrations` 声明模板空间能力。它的 root resource 只表示模板编辑器入口和业务归属；直接授权时只开放 `entry`。具体部门、委员会和公司模板空间的业务动作落到派生资源：

| 空间归属 | 模板空间资源 |
|---|---|
| 部门 | `space.department.templates` |
| 运营委员会 | `space.committee.templates` |
| 公司 | `space.company.templates` |

具体空间实例由 `scopeId` 表达，例如 `space.department.templates + scopeId=department:123`。空间授权可以派生 `docs.editor.entry`，让用户进入模板编辑器；不能反向派生 `docs.editor.update/delete/approve` 等 root 业务动作。

## API Contract

`/api/modules/docs/editor/**` 的 API contract 绑定 `docs.editor`，但运行时是 `serviceDelegated`：

- 创建、保存、删除、归档、复制和导出由 docs-editor service 根据模板所属空间检查 `space.*.templates` 和 `scopeId`。
- 发布按 `approve` 处理；评论附着在审批处理上，也归入 `approve`。
- `withdraw` 和 `cancel` 路由语义统一归入 `reverse`。
- 空间权限表读取和写入要求 `grant`，并由空间授权服务收窄到当前空间。

静态文档页面没有独立业务 API，不开放 `create/update/delete/import/export` 等动作。

## UI Action Placement

模板新增入口在左侧模板列表/空间选择区域，因为它创建的是当前空间下的新模板。保存、发布、导出、删除和归档属于当前模板详情动作，放在编辑器详情工具栏。流程提交、审批、驳回、撤回和评论属于流程面板动作，不放在列表新增入口旁。

前端动作图标约定：

- `create`：模板列表 command 和内联创建表单使用 `add`。
- `update`：模板详情保存草稿使用 `save`。
- `approve`：直接发布和流程同意使用 `approve`。
- `reject`：流程驳回使用 `x`。
- `reverse`：流程撤回使用 `withdraw`。
- `revise`：处理人修改使用 `revise`。
- `archive` / `delete` / `export`：分别使用 `archive`、`delete-bin`、`download`。
- `submit`：提交保存审核、提交发布审核、提交新建审核使用 `send`。

后续如果模板列表出现单条快捷编辑、复制或删除，入口应贴近具体模板 item；新增空间或新增模板仍放在对应列表/空间工具栏。

移动端采用纸面编辑的能力门槛，而不是压缩桌面 Ribbon：竖屏只允许完成空间和模板选择，进入模板详情后明确提示横屏；横屏时收起模板列表，以“文字 / 段落 / 插入 / 表格”四组按需切换编辑工具，并保留 A4 纸面横向浏览。桌面端继续显示完整 Ribbon。
