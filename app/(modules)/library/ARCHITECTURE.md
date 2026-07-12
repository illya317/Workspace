# Library — 资料库（文件系统 + 元数据索引）

## 状态：资料文档浏览、元数据管理、扫描同步、版本记录和自动生成接口保留；尽调问卷运行功能已移除。

## 架构演进

从纯文件浏览器升级为两层架构：

1. **只读来源层**：`LIBRARY_SOURCE_ROOT` 只用于扫描发现，不写 `.versions`、manifest 或派生物。
2. **运行态文件层**：`LIBRARY_ROOT` 位于 `WORKSPACE_CONFIG_DIR/library`，保存不可变版本、manifest 与派生物，不进入主代码仓库。
3. **元数据索引层**：DB 用 `LibraryDocument` 保存资料身份与可检索元数据，用 `LibraryDocumentVersion` 保存逐版文件名、路径、大小和校验事实；页面目录只认 `LibraryDirectory` 的完整逻辑层级，业务分类和标签分别进入规范表。

## 目录结构

```
app/(modules)/library/
  page.tsx                    # 薄路由壳：鉴权并挂载 package UI
  basic-info/documents/[id]/page.tsx # 独立资料阅读页薄壳：左侧信息，右侧 PDF 预览
  ARCHITECTURE.md             # 本文件

packages/library/ui/
  LibraryClient.tsx           # 客户端入口：挂载 DocumentsTab
  components/DocumentsTab.tsx # 资料筛选、目录选择、Toolbar 上传和资料表；行点击进入独立阅读页
  components/library-upload-modal.ts # 首版上传表单：文件、逻辑文件夹、标签和待复核元数据
  components/LibraryDocumentReader.tsx # 资料信息编辑与自适应文档预览分栏
  hooks/useLibraryDocuments.ts         # 版本列表、所选版本 PDF 加载与对象 URL 生命周期
  hooks/                      # useLibraryDocuments, useLibraryFilters, useLibraryDirectories

app/api/modules/library/basic-info/
  [...path]/route.ts          # 文件下载 API（保留，增加 documentId 权限校验）
  documents/route.ts          # GET 资料列表 / POST 首版上传并启动处理链
  scan/route.ts               # POST /api/modules/library/basic-info/scan（Phase 2）
  documents/[id]/route.ts     # GET / PATCH（Phase 2）
  documents/[id]/delete/route.ts # POST configure 权限下永久删除资料与受管运行态文件
  documents/[id]/preview/route.ts # GET 当前不可变版本的已验证 PDF 预览产物
  documents/[id]/versions/[versionId]/preview/route.ts # GET 指定历史版本的已验证 PDF 预览产物
  documents/[id]/review/route.ts  # POST 人工确认待复核资料入库
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
  uploads.ts                  # 首版上传、Markdown/PDF 处理编排和 Review 确认
  version-storage.ts          # 隐藏托管版本区的不可变文件写入和旧版本固化
  deletion.ts                 # 永久删除的引用保护、运行态文件暂存/恢复与 DB 删除
  generators/                 # 文档生成器（Phase 6）
    types.ts                    # GeneratorOutput / GeneratorFn 类型
    registry.ts                 # 生成器注册表
    bp-html.ts                  # BP HTML 生成器
    finance-report.ts           # 财务报表 Markdown 生成器
    generated-document.ts       # 统一入库：写文件 → upsert LibraryDocument → 创建 Version

prisma/models/library.prisma  # 文档、版本、目录、分类、标签、尽调和生成来源
prisma/models/library-processing.prisma # 处理任务、派生物、chunk、索引代次和导出任务
prisma/models/library-governance.prisma # 标签候选、实体提及和检索/RAG 金标集
```

## 一条龙处理契约（Pipeline v1）

处理以不可变 `LibraryDocumentVersion.versionUid + checksumSha256` 为输入事实。`LibraryProcessingJob.idempotencyKey` 由版本 UID、输入 checksum、任务 kind 和 pipeline version 共同计算；同一输入重复提交只复用任务或增加受控 attempt，不创建另一套资料身份。

任务状态只允许 `queued -> running -> succeeded|warning|failed|cancelled`。可重试错误限于临时解析/OCR、Agent 不可用、索引和导出失败；源文件缺失、checksum 不符、格式不支持、taxonomy 或 locator 违规必须先修复输入/规则，禁止盲目重试。新 pipeline/tool/model 版本通过新 idempotency key 重建，旧派生物可保留但不得继续作为 active index。

派生物、chunk、索引和导出都引用稳定 UID：`artifactUid`、`chunkUid`、`indexUid`、`exportUid`。原件不建成派生物，也不被压缩/OCR 结果覆盖。chunk 必须保存 `locatorJson`，至少包含页码、幻灯片、工作表/单元格、章节或时间戳之一。

### Agent / Kimi 边界

- 标签候选、内容增强、查询改写、RAG 证据整合统一复用 Platform Workspace Agent provider；部署默认 `AGENT_MODEL_PROVIDER=auto`，配置 Kimi key 时选择 Kimi。
- Library 只保存 `providerKey=workspace-agent`、实际 `modelKey` 和 `promptVersion` 作为生成事实，不读取或保存 Kimi 密钥，也不自行判断供应商。
- OCR、文件转换、checksum、locator 校验、权限过滤、任务状态、索引切换和导出均为确定性服务，不交给模型。
- Kimi 只能写 `LibraryTagCandidate`；正式 `LibraryTag` / `LibraryDocumentTag` 必须经过 taxonomy 匹配与人工批准。人物、组织、项目、地点和时间写 `LibraryEntityMention`，不能混入主题标签。
- 企业微信私聊只有在 Library 工具返回不可变 `documentUid + versionUid` 选择且当前用户具备 `export` 时才生成资料包；45 MiB 以内通过机器人文件消息发送，超限或上传失败时返回30分钟、绑定请求用户的受控下载链接。文件流和浏览器下载都会再次校验导出任务 owner、当前权限与密级；群聊不得生成或发送业务资料包。

### Taxonomy v1

正式词表事实源为 `prisma/seed-data/library-taxonomy.v1.json`。v1 只保留 `theme`、`doctype`、`event` 三个 tag 维度；文件格式、OCR 状态、密级和实体使用独立字段。推荐每份资料 4-10 个正式 tag，硬上限 15。任何词表外候选保持 pending，只有人工批准并更新 taxonomy 版本后才能成为正式 tag。

### 金标与 Gate 0

Pilot 固定 30 个版本，金标问题目标 50-100 条。每个 approved case 必须保存问题、期望行为（回答或拒答）、可选期望答案以及一个或多个逐字证据；证据绑定不可变版本并使用 locator。模型生成的问题只能是 draft，必须人工审核后才进入检索/RAG 验收。

## 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `LIBRARY_SOURCE_ROOT` | 只读扫描来源；本地可指向 `input/资料库`，生产固定为 `WORKSPACE_CONFIG_DIR/library/originals` | 无（未配置则禁止扫描） |
| `LIBRARY_ROOT` | 可写运行态根（绝对路径）；生产固定在 `WORKSPACE_CONFIG_DIR/library`，随运行态一起备份 | 无（不配置则不显示任何文件） |
| `LIBRARY_LABEL` | 页面标题和面包屑根节点名称 | `资料库` |
| `LIBRARY_UPLOAD_MAX_BYTES` | 单次版本上传最大字节数 | `104857600`（100 MiB） |

生产首次收敛旧资料库时，通过部署变量 `LIBRARY_SYNC_SOURCE=<本地权威资料目录>` 把源文件同步到 `LIBRARY_ROOT/originals`；扫描器只读该目录，逐版校验 size/hash、写入 `.versions` 并更新引用。源文件缺失、冲突或 active 版本不可读都会在 PM2 切换前终止发布。

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
- `currentDirectoryId`: 指向权威逻辑目录 `LibraryDirectory`；这是资料当前归属事实
- `directoryPath`: 当前逻辑目录路径快照，用于路径筛选与重命名级联；必须与 `currentDirectoryId.relativePath` 一致，不从源文件路径反推
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

`LibraryDocument.relativePath` 保留来源/入库路径事实，用户当前选择的逻辑位置由 `directoryPath + currentDirectoryId` 表达；实际下载只依据 `LibraryDocumentVersion.storagePath`。按相对路径定位资料的 API 也必须先解析到资料的 `currentVersion`，不会直接读取源目录文件。

### LibraryDirectory（逻辑文件夹）

以 `rootKey + relativePath` 唯一记录资料当前逻辑位置，每一级祖先都必须是持久化行；页面树、存在性校验、上传、移动、新建和重命名只读取该表，不再从 `LibraryDocument.directoryPath` 或扫描源临时合成节点。扫描只在资料首次进入系统时把源目录映射为初始逻辑目录，并确保整条祖先链存在；源目录之后不再拥有页面层级。具备 `configure` 权限的用户可在页面 Toolbar 新建文件夹，并从树节点重命名或删除空文件夹；重命名级联更新子目录和所含资料，删除只允许没有子目录且没有资料引用的叶节点。人工选择的位置标记为 `categorySource=manual`，后续扫描只刷新文件事实，不覆盖用户归档位置。页面编辑只暴露一个由 `LibraryDirectory` 生成的“文件夹”下拉框；旧 `categoryCode/categoryName` 仅由一级逻辑文件夹派生，供兼容检索/导出使用。

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
- 检索在召回前按 `library.basicInfo:read` 和 `confidentialityLevel` 过滤；RAG 不允许先检索高密级正文再在回答阶段删减。
- 导出任务创建时需要 `export`，并固化逐个 `versionUid`；worker 执行和下载时再次校验 requester、版本与密级。Kimi 不参与权限和文件选择。
- 多文件导出按 `LibraryDirectory.relativePath` 的完整逻辑目录层级组织 ZIP，文件保持版本原文件名；同一目录确有同名文件时仅追加常规序号避免覆盖。导出包名固定为 `资料库.zip`，不暴露运行态 UID。

前端动作图标约定：

- `update`：资料详情弹窗内编辑元数据，进入编辑使用 `edit`，保存使用 `save`；标题、简介、标签和分类属于普通元数据，`documentUid/docId` 均为系统只读身份。
- `configure`：保密等级字段级配置，仍在资料详情弹窗内，不单独放全局设置按钮。
- `archive`：资料状态只能通过 Library lifecycle command 归档或恢复；元数据 PATCH 不接受 `status`，不得只靠 `update` 修改生命周期。
- `delete`：永久删除与归档分离，仅 `configure` 可执行；有评测证据引用时拒绝。删除前把 `.versions/<documentUid>`、`artifacts/<documentUid>` 和生成资料自有的 `generated/...` 文件暂存到运行态回收区，数据库失败则恢复，成功后清理；扫描源永不删除。
- `import`：扫描入库、生成文档、首版上传、确认入库和上传资料新版本都属于资料入库。首版上传先选择文件夹并填写标签/待复核元数据，service 创建待确认的 `LibraryDocument + V1`，随后自动调用 Markdown 提取和 PDF 优化处理；用户进入独立资料页调整信息并显式“确认入库”。已有资料的新版本上传仍只允许作用于 `active` 资料。文件形状先由 API Zod 校验，再由 domain validator 校验，最后由 service 写文件和事务推进版本。
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
1. 从 `LIBRARY_SOURCE_ROOT` 递归读取文件，并为每个 eligible 文件计算完整 SHA256；大文件不得跳过
2. **Phase A — 标记 missing**：先把本轮未命中的旧 `active` 记录标记为 `missing`
3. **Phase B — 处理文件**：
   - 路径未变 → 检查 mtime/size/checksum 变化，有变化则创建下一条 `LibraryDocumentVersion`
   - 同路径资料已由上传/生成/manual service 管理 → 扫描器跳过，不允许残留源文件把托管当前版本回滚
   - 全新路径 → 创建新的 `LibraryDocument` 身份和 V1；即使 checksum 相同也不自动合并
   - 外部移动/改名 → 旧路径标记 missing、新路径形成新资料；后续显式核对流程才能决定是否迁移身份
4. 跳过 `.DS_Store`、隐藏文件
5. 首次扫描用源目录建立完整 `LibraryDirectory` 祖先链，并把资料关联到叶节点；仅在初始映射时从一级目录解析 `categoryCode/categoryName`，例如 `03 财务`
6. 每次扫描在 `LIBRARY_ROOT/.manifests/scans` 原子写入 manifest；读取/stat/hash/复制失败必须逐文件记录，不能静默跳过
7. 相同 checksum 只生成 duplicate warning，不自动合并；只有内容 checksum 改变才创建新版本，单纯 mtime 变化不增加版本

**身份规则**：
- 系统内明确执行的移动/改名才可以保留 `documentUid/docId`
- 外部文件系统出现新路径时不得仅凭 checksum 自动迁移身份
- checksum 相同只代表内容相同，不能证明主体、期间、用途和业务资料身份相同

## 当前资料页面

- 页面 Toolbar：`+` 新建文件夹；“上传文件”打开首版上传表单并启动处理链
- 左侧文件夹树：来自 `LibraryDirectory` 与实际可见资料；新建空文件夹从页面 Toolbar 进入标准 CreateSurface，重命名在当前树节点内联完成，不再打开第二套弹窗
- 右侧资料表：标题、简介、标签和更新时间；筛选包含关键词、状态、密级与文件夹
- 独立资料阅读页：左侧展示/编辑简介、标签和保密等级；存在多个不可变版本时可选择版本，右侧预览和下载同步切换到所选版本
- 当前下载走 `/api/modules/library/basic-info/documents/:id/download`，历史下载走 `/documents/:id/versions/:versionId/download`；后端按版本 `storagePath` 返回文件流，权限和路径校验都在服务端完成，前端不拼接文件路径

## 未来扩展方向

1. **远程适配器**：将 `readDirectory` / `readFile` 抽象为接口，实现 S3/OSS adapter
2. **预览**：图片/PDF 内嵌预览而非直接下载
3. **多根目录**：`getLibraryRoots()` 已支持逗号分隔的多路径，前端可加根目录切换
4. **生成器扩展**：接入真实业务数据（如财务科目余额、项目信息）替代 mock 内容

## 当前检索、预览与资料包能力

- `GET /api/modules/library/basic-info/search?query=...` 在召回前执行 `library.basicInfo:read` 和密级过滤；SQLite 先在可见、active、具备当前版本的资料上根据 metadata/tag 与正文命中存在性做粗相关排序并统计真实匹配总数，再只 hydrate 前 100 个候选。自然问句通过 `Intl.Segmenter`、中文相邻单字/双字 fallback、停用词和完整 Latin/编号候选生成确定性 terms；每个版本只读取有限候选及最多 1800 字符的逐字 match window，按原问句、term、heading/section 相关性排序后取前三条 evidence，返回 locator、窗口位置以及不可变 `documentUid/versionUid` selection。禁止把无界 chunk 正文读入 Node 后再过滤权限或截断。
- 独立资料阅读页左侧承载可折叠的资料信息和不可变版本选择，右侧通过 Core `DocumentSurface kind="viewer"` 按当前视口剩余空间自适应承载阅读器；工具栏提供返回列表和侧栏展开/收起，下载跟随所选版本。当前 PDF 使用受控对象 URL；未来 ONLYOFFICE 由 Library/Platform 适配页负责配置签名、源文件权限与保存回调，Core 不感知具体文档提供方。
- Workspace Agent 注册 `library.searchDocuments`，复用现有 Agent provider/Kimi 生成带证据回答；工具的完整 `data` 保留 resource-set presentation、打开/下载和 selection 资料包能力，另给模型提供最多 24000 字符的 lean `modelContext`。该投影只包含 query、候选/省略数量、正式资料身份、不可变版本、locator 和逐字 evidence window，并优先高相关证据；pending tag/metadata candidate 可参与召回，但不得进入模型上下文充当正式事实。不让模型决定权限或文件路径，也不依赖 Orchestrator 对完整 UI data 的尾部硬截断。
- `POST /api/modules/library/basic-info/exports` 接收最多 100 个不可变版本选择，按分类生成 UTF-8 ZIP、`manifest.json` 和 `SHA256SUMS`；下载时再次校验 requester、export 权限与密级。
- 首版上传会自动调用现有处理服务：所有受支持格式生成供检索/RAG 使用的 Markdown、locator-rich layout JSON 和正文 chunks；PDF 另外进入 `v2-compressed`，生成唯一的尺寸优化 `preview-pdf`。压缩候选通过 qpdf、页数、视觉 RMS 和至少 10% 节省后发布。原始不可变版本始终保留，不被 Markdown 或预览产物覆盖/删除。DOC/DOCX、XLS/XLSX、PPT/PPTX 等 Office 文件保留原格式，未来由 ONLYOFFICE 适配器查看。
- 上传步骤中的标签由用户选择/填写并在最终 Review 中确认。模型自动打标仍必须写 `LibraryTagCandidate` 并经过 taxonomy 与人工批准；在真实 provider-backed classifier 接入前，不伪装成自动标签能力。
- 当前 `.eddx` 没有开源转换器，记录为 `unsupported_type`，需使用亿图导出 PDF 后作为新版本入库。
