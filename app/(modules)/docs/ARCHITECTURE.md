# Docs - 文档中心

## 定位

文档中心当前只有两个注册 L2：`docs.company` 是从租户配置加载员工手册、管理手册和权限 Action 手册的只读文档工作台，`docs.editor` 是带空间、流程和导出的模板业务能力。`/docs` 使用模块注册表生成首页；`DocsClient.tsx` 中仍保留的历史分类链接没有独立 route/resource/API contract，不构成已注册 L2。

## 目录

```text
app/(modules)/docs/
  page.tsx                         # L1 首页，ModuleHome 展示子模块卡片
  company/page.tsx                 # 公司文档页薄壳：鉴权、加载配置文档、挂 Docs 阅读工作台
  editor/page.tsx                  # 模板编辑器入口
  editor/templates/[templateId]/   # 模板深链入口

app/api/modules/docs/editor/
  route.ts                         # 模板列表、详情、创建和保存
  templates/[templateId]/*         # 模板更新、删除、发布、归档、复制
  submissions/*                    # 模板流程提交、审批、驳回、撤回、评论
  spaces/[spaceId]/permissions     # 空间授权表

packages/docs/server/
  company-documents.ts             # 公司文档页面模型、paper 目录/章节查询与 Docs 路径语义
  service.ts                       # 模板读写服务
  permissions.ts                   # 模板空间权限和自然角色
  approvals.ts                     # 模板流程 adapter
  space-permissions.ts             # 空间授权服务

packages/docs/ui/
  DocsClient.tsx                      # 未挂载到当前 /docs 首页的历史分类导航，不是 L2 事实源
  CompanyDocumentsClient.tsx       # 左侧文档目录、右侧纸面/Office 只读阅读区
  company-document-markdown.ts     # 权限 Action Markdown 到纸质版 EditorDocument 的适配
  editor/*                         # 模板编辑器 UI

packages/platform/server/
  company-documents.ts             # 租户文档元数据列表、按 key 内容读取与 ONLYOFFICE 短时源文件 adapter
  onlyoffice-viewer.ts             # 公司文档与资料库共同使用的 ONLYOFFICE 只读宿主

app/api/modules/docs/company/
  documents/[key]/office-viewer/   # 登录态、docs.company.read 保护的 Office 阅读宿主页
  documents/                       # 登录态、docs.company.read 保护的文档目录与 paper 按章节查询 API
  permission-actions/              # 登录态、docs.company.read 保护的结构化权限知识查询 API

app/api/integrations/onlyoffice/
  company-documents/[key]/         # ONLYOFFICE 使用短时 JWT 拉取租户原文件
```

## 权限

| 资源 | 状态 | 支持 action | 说明 |
|---|---|---|---|
| `docs` | docs | `entry`, `read`, `grant` | 文档中心 L1 入口 |
| `docs.company` | docs | `entry`, `read`, `grant` | 公司管理文档页面 |
| `docs.editor` | business | `entry`, `read`, `create`, `update`, `delete`, `archive`, `revise`, `submit`, `reverse`, `approve`, `reject`, `export`, `grant` | 模板编辑器 root resource |

`docs.editor` 同时通过 `spaceRegistrations` 声明模板空间能力。它的 root resource 只表示模板编辑器入口和业务归属；直接授权时只开放 `entry`。具体部门、委员会和公司模板空间的业务动作落到派生资源：

| 空间归属 | 模板空间资源 |
|---|---|
| 部门 | `space.department.templates` |
| 治理委员会 | `space.committee.templates` |
| 公司 | `space.company.templates` |

具体空间实例由 `scopeId` 表达，例如 `space.department.templates + scopeId=department:123`。空间授权可以派生 `docs.editor.entry`，让用户进入模板编辑器；不能反向派生 `docs.editor.update/delete/approve` 等 root 业务动作。

## API Contract

`/api/modules/docs/editor/**` 的 API contract 绑定 `docs.editor`，但运行时是 `serviceDelegated`：

- 创建、保存、删除、归档、复制和导出由 docs-editor service 根据模板所属空间检查 `space.*.templates` 和 `scopeId`。
- 发布按 `approve` 处理；评论附着在审批处理上，也归入 `approve`。
- `withdraw` 和 `cancel` 路由语义统一归入 `reverse`。
- 空间权限表读取和写入要求 `grant`，并由空间授权服务收窄到当前空间。

公司管理文档由 `WORKSPACE_CONFIG_DIR/config/tenant/profile.json` 的 `docs.companyDocuments` 登记。员工手册和管理手册原文件保存在配置目录，通过共享 ONLYOFFICE 宿主只读展示；权限 Action 手册由 `npm run docs:permission-actions` 同步，API Agent 使用手册由 `npm run docs:api-agent-guide` 同步，生产 Agent 目录和显式白名单产品指南由 `npm run docs:production-agent` 同步。所有 Agent-facing paper 都必须先给目录；`GET /api/modules/docs/company/documents` 默认只返回文档元数据，`GET .../documents/:key` 默认只返回章节 key/层级/摘要，只有 `section` 明确选择时才返回该节正文，`q` 只搜索章节摘要，避免整本手册占用模型上下文。API Agent 手册面向外部 API-Key Agent 和 Workspace 内置 Agent，说明 API Catalog、`workspace.api.discover/read/proposeMutation` 边界，并以 Work 个人/部门/项目空间的经营分析展示模板为完整写入示例；生成器会校验文中 Finance operational analytics BusinessAction 和 route 仍已注册，但实时路径、JSON Schema、数据源和可调用范围始终以当前空间的模板 contract、source discovery 与当前用户 API Catalog 为准。权限手册的纸质版 Markdown 与 `/api/modules/docs/company/permission-actions` 的机器查询结果同源于 Platform `permission-action-knowledge` module。`docs.company` 是登录用户的默认只读资源，只开放 `entry/read`；个人 API Key 仍代表其所属用户，不构成匿名公开。短时 Office 源文件路由是 internal token API，不接受浏览器会话直接访问。公司文档不开放 `create/update/delete/import/export` 等动作，工程、运维、schema、迁移和源码路径文档不得进入生产白名单。

Office 阅读沿用资料库运行时，部署环境必须配置与 DocumentServer 一致的 `ONLYOFFICE_JWT_SECRET`，并提供 `/workspace/onlyoffice/**` 反向代理；缺少任一项时纸质版仍可阅读，Office 文档预览不可用。

`docs.company` 页面使用标准 `BodySurface` split：左侧 `SelectorSurface` 选择文档，右侧使用 `DocumentSurface.viewer` 或 Platform `DocumentWorkspaceSurface` 阅读。同页切换只更新客户端状态，不触发整页导航；左栏可折叠，并在窄屏进入抽屉。

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
