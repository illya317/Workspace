# Library — 资料库（文件系统 + 元数据索引）

## 状态：资料文档浏览、元数据管理、扫描同步、版本记录和自动生成接口保留；尽调问卷运行功能已移除。

## 架构演进

从纯文件浏览器升级为两层架构：

1. **文件系统层**：资料库目录（`LIBRARY_ROOT`）保留文件本体，不进入主代码仓库。
2. **元数据索引层**：DB 用 `LibraryDocument` 保存资料身份与可检索元数据，用 `LibraryDocumentVersion` 保存逐版文件名、路径、大小和校验事实；目录、业务分类和标签分别进入规范表。

## 目录结构

```
app/(modules)/library/
  page.tsx                    # 薄路由壳：鉴权并挂载 package UI
  ARCHITECTURE.md             # 本文件

packages/library/ui/
  LibraryClient.tsx           # 客户端入口：挂载 DocumentsTab
  components/DocumentsTab.tsx # 资料筛选、目录选择、资料表和详情编辑
  components/LibraryDetailModal.tsx
  hooks/                      # useLibraryDocuments, useLibraryFilters, useLibraryDirectories

app/api/modules/library/basic-info/
  [...path]/route.ts          # 文件下载 API（保留，增加 documentId 权限校验）
  documents/route.ts          # GET /api/modules/library/basic-info/documents（Phase 2）
  scan/route.ts               # POST /api/modules/library/basic-info/scan（Phase 2）
  documents/[id]/route.ts     # GET / PATCH（Phase 2）
  documents/[id]/versions/route.ts  # GET 版本列表 / POST multipart 上传新版本
  documents/[id]/versions/[versionId]/download/route.ts # GET 指定历史版本
  generated-sources/route.ts            # GET 已启用生成来源列表（Phase 6）
  generated-sources/[key]/generate/route.ts # POST 执行生成并入库（Phase 6）

packages/library/server/
  config.ts                   # 配置 + 路径安全 + readDirectory + buildTree（保留）
  scan.ts                     # 幂等扫描：文件系统 → LibraryDocument / Version（Phase 2）
  metadata.ts                 # 元数据 CRUD（Phase 2）
  classification.ts           # 目录和业务分类规范化
  permissions.ts              # 保密等级过滤 + 权限校验（Phase 2）
  versions.ts                 # 版本管理（Phase 2）
  version-storage.ts          # 隐藏托管版本区的不可变文件写入和旧版本固化
  generators/                 # 文档生成器（Phase 6）
    types.ts                    # GeneratorOutput / GeneratorFn 类型
    registry.ts                 # 生成器注册表
    bp-html.ts                  # BP HTML 生成器
    finance-report.ts           # 财务报表 Markdown 生成器
    generated-document.ts       # 统一入库：写文件 → upsert LibraryDocument → 创建 Version

prisma/models/library.prisma  # 文档、版本、目录、分类、标签、尽调和生成来源
```

## 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `LIBRARY_ROOT` | 文件根目录（绝对路径）；生产固定在 `WORKSPACE_CONFIG_DIR/library`，随运行态一起备份 | 无（不配置则不显示任何文件） |
| `LIBRARY_LABEL` | 页面标题和面包屑根节点名称 | `资料库` |
| `LIBRARY_UPLOAD_MAX_BYTES` | 单次版本上传最大字节数 | `104857600`（100 MiB） |

生产首次收敛旧资料库时，通过部署变量 `LIBRARY_SYNC_SOURCE=<本地权威资料目录>` 把源文件同步到持久化根目录；随后部署迁移逐版校验 size/hash、写入 `.versions` 并更新引用。源文件缺失、冲突或 active 版本不可读都会在 PM2 切换前终止发布。

## 数据模型

### LibraryDocument（资料库文档元数据）

- `id`: DB 内部关系主键，不对用户承诺稳定格式
- `documentUid`: 不可变 UUID；文件改名、移动、内容更新都不得改变
- `docId`: 系统生成、只读的业务编号（`LIB-年份-UID片段`），用于人工沟通和搜索
- `stableKey`: 当前来源定位键；扫描资料仍由 `rootKey + relativePath` 派生，但它不是资料身份
- `tags`: `LibraryTag` 话题字典与 `LibraryDocumentTag` 多对多关联；一个文档可关联多个标签，同一标签不可重复关联
- `rootKey`: 多根目录支持，默认 `default`
- `relativePath`: 相对于 root 的路径（改名/移动后会更新）
- `fileName`, `extension`, `mimeType`, `fileSizeBytes`, `fileMtime`
- `checksumSha256`: 文件内容校验和，只用于变更检测、完整性验证和重复提示，不用于确定资料身份
- `categoryCode` / `categoryName`: 扫描时从目录解析的来源快照，如 `03` / `财务`
- `categoryId`: 指向 `LibraryCategory` 的正式业务分类；`categorySource` 记录 folder/manual/rule 来源
- `currentDirectoryId`: 指向当前物理目录 `LibraryDirectory`
- `currentVersionId`: 指向当前有效文件版本；列表所需文件名和大小以当前版本为准
- `subcategoryPath`: 子分类路径
- `title`, `summary`: 人工维护标题和简介
- `confidentialityLevel`: 0..4，默认 2
- `status`: `active` | `missing` | `archived` | `draft`
- `origin`: `scanned` | `uploaded` | `generated` | `manual`
- `generatorKey`: 预留自动生成接口
- `ownerUserId`, `asOfDate`, `reviewStatus`, `reviewedAt`, `reviewedBy`: 维护责任、资料截止日和复核事实
- `versionLabel`, `gitRepo`, `gitCommit`, `gitPath`: 版本追踪（可选 Git 层）
- 标准审计字段：`editedBy`, `editedAt`, `version`, `createdAt`, `updatedAt`

### LibraryDocumentVersion（版本历史）

每个版本具有不可变 `versionUid`，并在单个资料内以 `versionNo` 递增。版本保存文件名、存储定位、入库路径快照、扩展名、MIME、字节大小、源文件修改时间、校验和、变更备注和创建人。元数据编辑和归档不增加文件版本号。

扫描、生成和人工上传都会先把每个新版本写入 `.versions/<documentUid>/<versionUid>/<fileName>` 隐藏托管区，再在同一业务事务中推进 `currentVersionId`。版本文件不会覆盖，数据库写入失败时会清理对应的未提交托管文件；运行时不存在从源目录补做历史快照的分支。

`LibraryDocument.relativePath` 保留为逻辑目录/分类定位；实际下载只依据 `LibraryDocumentVersion.storagePath`。按相对路径定位资料的 API 也必须先解析到资料的 `currentVersion`，不会直接读取源目录文件。

### LibraryDirectory（扫描目录）

以 `rootKey + relativePath` 唯一记录当前物理文件夹。目录回答“文件现在在哪里”，不承担业务身份或业务分类。

### LibraryCategory（业务分类）

使用不可变 `categoryUid`、可选父分类、编码、名称和完整路径形成治理后的分类树。扫描得到的目录分类可作为默认值，人工分类可以独立调整。

### LibraryTag / LibraryDocumentTag（话题标签）

`LibraryTag` 保存可复用的标准话题；关联表以 `documentId + tagId` 复合唯一。该约束只阻止同一文档重复关联同一标签，不限制一个文档关联多个标签，也不限制一个标签被多个文档复用。

### LibraryGeneratedSource（生成来源配置）

Phase 6 自动生成接口配置表。每个来源定义：
- `key`: 生成器标识，如 `bp-html`、`finance-report`
- `name`: 展示名称
- `outputCategory`: 默认输出分类
- `defaultConfidentialityLevel`: 默认保密等级
- `enabled`: 是否启用

生成流程：前端选来源 → 填标题/简介/保密等级 → POST `/api/modules/library/basic-info/generated-sources/:key/generate` → 调注册表中的 `GeneratorFn` → `upsertGeneratedDocument` 写文件到 `LIBRARY_ROOT/generated/` → upsert `LibraryDocument`（`stableKey = generated:${key}:${slug}-${hash}`）→ 内容变化时创建 `LibraryDocumentVersion`。

同标题重复生成时，若输出内容不变（生成器幂等），则 checksum 不变，不会创建新版本。

## 权限设计

| 资源 key | 说明 | 主要动作 |
|---------|------|---------|
| `library` | 资料库 L1 容器入口 | `entry`, `read`, `update`, `grant` |
| `library.basicInfo` | 基本资料 L2，资料内容访问与保密等级 ≤2 的材料 | `entry`, `read`, `update`, `archive`, `import`, `export`, `configure`, `grant` |

- 保密等级过滤在 service 层执行，API 必须过滤，不只是页面隐藏。
- `library` 只代表资料库模块入口；真实资料内容访问必须具备 `library.basicInfo`。
- 默认用户（有 `library.basicInfo` 资源）最高可看 `confidentialityLevel <= 2`。
- `confidentialityLevel >= 3` 的旧独立 capability 已退场；当前仅 root admin 可查看，后续如要恢复应重新设计审批/授权语义。
- 若问题命中更高等级资料，显示"存在更高等级候选，需要权限/审批"，但不默认选择。

前端动作图标约定：

- `update`：资料详情弹窗内编辑元数据，进入编辑使用 `edit`，保存使用 `save`；标题、简介、标签和分类属于普通元数据，`documentUid/docId` 均为系统只读身份。
- `configure`：保密等级字段级配置，仍在资料详情弹窗内，不单独放全局设置按钮。
- `archive`：资料状态只能通过 Library lifecycle command 归档或恢复；元数据 PATCH 不接受 `status`，不得只靠 `update` 修改生命周期。
- `import`：扫描入库、生成文档和上传资料新版本都属于资料入库。上传只允许作用于 `active` 资料，文件形状先由 API Zod 校验，再由 domain validator 校验文件名、大小和版本备注，最后由 service 写文件和事务推进版本。生成文档默认使用生成来源配置的保密等级，手动调整保密等级还需要 `configure`。
- `export`：当前版本和指定历史版本下载都使用 `export`，并在 service 层重新校验资料状态和保密等级。

## 安全

- `safeResolve()` 使用 `path.resolve()` 规范化路径
- 验证解析后的绝对路径必须在 `LIBRARY_ROOT` 前缀内
- API 层双重校验：`safeResolve` + 二次 `startsWith` 检查
- 拒绝 `..` 路径穿越，返回 403 Forbidden
- 下载前以 `documentId + versionId`（历史版本）或 `currentVersionId`（当前版本）定位文件，先确认 `export`、`active` 状态和用户可访问的保密等级，再返回文件内容
- 版本列表和资料 DTO 不返回内部 `storagePath`；客户端只拿版本标识和文件事实，再通过下载 API 取文件
- 上传文件名禁止路径分隔符、控制字符和 `.` / `..`，存储路径由服务端 UUID 构造，客户端不能指定
- 新版本二进制先写临时文件，再以排他硬链接发布到唯一隐藏路径，绝不覆盖已有版本；随后在 DB 事务内创建版本并推进 `currentVersionId`，事务失败会清理本次新版本文件

## 数据库部署策略

本项目使用 SQLite，`prisma migrate deploy` 在空库上会因旧 migration（`20260530000000_add_budget_version_v1` 等）的表重定义操作失败——这些 migration 假设目标表已存在，但空库中没有。

**部署流程**：
- **开发/本地**：`npx prisma db push`（从 schema 直接同步到 DB）
- **生产/CloudBase**：首次部署后在容器内执行 `npx prisma db push`，或从已有数据库备份恢复
- **不使用 `prisma migrate deploy`**：当前 migration 历史存在断裂，修复需单独开任务处理旧 migration

**Seed 脚本**：
- 资料库生成来源：`npm run db:seed:library-generated`（插入 `bp-html`、`finance-report` 两条记录）

## 扫描服务（Phase 2）

**两阶段幂等扫描流程**：
1. 从 `LIBRARY_ROOT` 递归读取文件，收集所有 `stableKey`
2. **Phase A — 标记 missing**：先把本轮未命中的旧 `active` 记录标记为 `missing`
3. **Phase B — 处理文件**：
   - 路径未变 → 检查 mtime/size/checksum 变化，有变化则创建下一条 `LibraryDocumentVersion`
   - 同路径资料已由上传/生成/manual service 管理 → 扫描器跳过，不允许残留源文件把托管当前版本回滚
   - 全新路径 → 创建新的 `LibraryDocument` 身份和 V1；即使 checksum 相同也不自动合并
   - 外部移动/改名 → 旧路径标记 missing、新路径形成新资料；后续显式核对流程才能决定是否迁移身份
4. 跳过 `.DS_Store`、隐藏文件
5. 用目录首层解析 `categoryCode/categoryName`，例如 `03 财务`
6. checksum 只计算 ≤10MB 的文件，大文件留空避免扫描太慢

**身份规则**：
- 系统内明确执行的移动/改名才可以保留 `documentUid/docId`
- 外部文件系统出现新路径时不得仅凭 checksum 自动迁移身份
- checksum 相同只代表内容相同，不能证明主体、期间、用途和业务资料身份相同

## 页面重构方向（Phase 3）

- 左侧分类树：来自 DB `categoryCode/categoryName`，不再只靠文件夹树
- 右侧资料表：标题、分类、更新时间、版本、简介、大小、保密等级、状态
- 筛选：分类、保密等级、来源、文件类型、更新时间
- 详情弹窗：编辑简介、分类、保密等级、版本备注
- 当前下载走 `/api/modules/library/basic-info/documents/:id/download`，历史下载走 `/documents/:id/versions/:versionId/download`；后端按版本 `storagePath` 返回文件流，权限和路径校验都在服务端完成，前端不拼接文件路径

## 未来扩展方向

1. **远程适配器**：将 `readDirectory` / `readFile` 抽象为接口，实现 S3/OSS adapter
2. **预览**：图片/PDF 内嵌预览而非直接下载
3. **多根目录**：`getLibraryRoots()` 已支持逗号分隔的多路径，前端可加根目录切换
4. **生成器扩展**：接入真实业务数据（如财务科目余额、项目信息）替代 mock 内容
