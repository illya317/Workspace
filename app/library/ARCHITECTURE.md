# Library — 资料库（文件系统 + 元数据索引 + 尽调材料选择/存档）

## 状态：Phase 1-6 完成（Schema、权限、扫描服务、元数据 API、页面重构、尽调问卷、存档闭环、自动生成接口）

## 架构演进

从纯文件浏览器升级为三层架构：

1. **文件系统层**：资料库目录（`LIBRARY_ROOT`）保留文件本体，不进入主代码仓库。
2. **元数据索引层**：DB 记录 `LibraryDocument` + `LibraryDocumentVersion`，含路径、大小、校验和、分类、保密等级、版本。
3. **尽调业务层**：`DueDiligenceRequest` / `DueDiligenceQuestion` / `DueDiligenceMaterialSelection` 支持问卷拆分、材料推荐、用户确认、存档闭环。

## 目录结构

```
app/library/
  page.tsx                    # 服务端组件：加载元数据列表，渲染 AppShell + LibraryClient
  LibraryClient.tsx           # 客户端组件：筛选 + 分类树 + 资料表 + 分页
  types.ts                    # 领域类型：LibraryDocumentItem, LibraryFilters, CategoryGroup
  ARCHITECTURE.md             # 本文件
  hooks/                      # useLibraryDocuments, useLibraryFilters, useLibraryCategories
  components/                 # LibrarySidebar, LibraryTable, LibraryDetailModal
  due-diligence/              # 尽调问卷组件（Phase 4，以 Tab 嵌入 LibraryClient）
    components/                 # DueDiligencePanel, DueDiligenceDetail
    hooks/                      # useDueDiligence

app/api/library/
  [...path]/route.ts          # 文件下载 API（保留，增加 documentId 权限校验）
  documents/route.ts          # GET /api/library/documents（Phase 2）
  scan/route.ts               # POST /api/library/scan（Phase 2）
  documents/[id]/route.ts     # GET / PATCH（Phase 2）
  documents/[id]/versions/route.ts  # GET（Phase 2）
  due-diligence/route.ts      # POST / GET（Phase 4）
  due-diligence/[id]/route.ts # GET / PATCH / DELETE（Phase 4）
  due-diligence/[id]/split/route.ts # POST 拆分问卷（Phase 4）
  due-diligence/[id]/match/route.ts # POST 运行材料匹配（Phase 4）
  due-diligence/[id]/questions/route.ts # GET 问题列表（Phase 4）
  due-diligence/[id]/questions/[questionId]/materials/route.ts # GET / PATCH（Phase 4）
  due-diligence/[id]/archive/route.ts # POST（Phase 5）
  generated-sources/route.ts            # GET 已启用生成来源列表（Phase 6）
  generated-sources/[key]/generate/route.ts # POST 执行生成并入库（Phase 6）

server/services/library/
  config.ts                   # 配置 + 路径安全 + readDirectory + buildTree（保留）
  scan.ts                     # 幂等扫描：文件系统 → LibraryDocument / Version（Phase 2）
  metadata.ts                 # 元数据 CRUD（Phase 2）
  permissions.ts              # 保密等级过滤 + 权限校验（Phase 2）
  versions.ts                 # 版本管理（Phase 2）
  due-diligence.ts            # 尽调 Request/Question/MaterialSelection CRUD（Phase 4）
  matching.ts                 # 规则匹配推荐（Phase 4）
  archive.ts                  # 归档校验与状态转换（Phase 5）
  generators/                 # 文档生成器（Phase 6）
    types.ts                    # GeneratorOutput / GeneratorFn 类型
    registry.ts                 # 生成器注册表
    bp-html.ts                  # BP HTML 生成器
    finance-report.ts           # 财务报表 Markdown 生成器
    generated-document.ts       # 统一入库：写文件 → upsert LibraryDocument → 创建 Version

prisma/models/library.prisma  # LibraryDocument, LibraryDocumentVersion, DueDiligenceParty,
                              # DueDiligenceRequest, DueDiligenceQuestion,
                              # DueDiligenceMaterialSelection, LibraryGeneratedSource
```

## 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `LIBRARY_ROOT` | 文件根目录（绝对路径） | 无（不配置则不显示任何文件） |
| `LIBRARY_LABEL` | 页面标题和面包屑根节点名称 | `资料库` |

## 数据模型

### LibraryDocument（资料库文档元数据）

- `stableKey`: rootKey + relativePath，扫描时派生，唯一标识（改名后会更新）
- `docId`: 用户可维护的业务编号（扫描时自动生成 `DOC-YYYYMMDD-XXXX`），唯一，改名后不变
- `tags`: 通过 `LibraryDocumentTag` 关联表实现的多标签，支持精确筛选
- `rootKey`: 多根目录支持，默认 `default`
- `relativePath`: 相对于 root 的路径（改名/移动后会更新）
- `fileName`, `extension`, `mimeType`, `fileSizeBytes`, `fileMtime`
- `checksumSha256`: 文件内容校验和，用于改名/移动自动关联
- `categoryCode` / `categoryName`: 目录首层解析，如 `03` / `财务`
- `subcategoryPath`: 子分类路径
- `title`, `summary`: 人工维护标题和简介
- `confidentialityLevel`: 0..4，默认 2
- `status`: `active` | `missing` | `archived` | `draft`
- `origin`: `scanned` | `uploaded` | `generated` | `manual`
- `generatorKey`: 预留自动生成接口
- `versionLabel`, `gitRepo`, `gitCommit`, `gitPath`: 版本追踪（可选 Git 层）
- 标准审计字段：`editedBy`, `editedAt`, `version`, `createdAt`, `updatedAt`

### LibraryDocumentVersion（版本历史）

扫描检测到 mtime/size/checksum 变化时自动创建版本记录，保留历史路径、大小、校验和、Git commit、变更备注。

### LibraryDocumentTag（文档标签）

关联表：`documentId + tag` 复合唯一键。支持多标签精确筛选、标签云统计。删除文档时级联清标签。

### DueDiligenceParty / Request / Question / MaterialSelection

尽调业务闭环：
- **Party**: 尽调参与方（投资人、律所等），含 NDA 状态
- **Request**: 一次尽调请求/问卷，含默认保密等级
- **Question**: 问卷拆分为问题列表，含回答草稿、状态
- **MaterialSelection**: 问题与文档的推荐关联，含匹配分数、推荐理由、用户确认状态
  - **一致性约束**：`documentVersionId` 与 `documentId` 的对应关系由 service 层校验保证。Prisma 不支持 nullable 字段参与复合 FK，因此 DB 层不强制 version 必须属于同一 document。归档/确认操作前，service 必须验证 `documentVersion.documentId == selection.documentId`。

### LibraryGeneratedSource（生成来源配置）

Phase 6 自动生成接口配置表。每个来源定义：
- `key`: 生成器标识，如 `bp-html`、`finance-report`
- `name`: 展示名称
- `outputCategory`: 默认输出分类
- `defaultConfidentialityLevel`: 默认保密等级
- `enabled`: 是否启用

生成流程：前端选来源 → 填标题/简介/保密等级 → POST `/api/library/generated-sources/:key/generate` → 调注册表中的 `GeneratorFn` → `upsertGeneratedDocument` 写文件到 `LIBRARY_ROOT/generated/` → upsert `LibraryDocument`（`stableKey = generated:${key}:${slug}-${hash}`）→ 内容变化时创建 `LibraryDocumentVersion`。

同标题重复生成时，若输出内容不变（生成器幂等），则 checksum 不变，不会创建新版本。

## 权限设计

| 资源 key | 说明 | maxRole |
|---------|------|---------|
| `library` | 资料库入口，查看保密等级 ≤2 的材料 | write |
| `library.write` | 编辑元数据、上传、扫描触发 | write |
| `library.secret` | 查看保密等级 3 的材料 | access |
| `library.top_secret` | 查看保密等级 4 的材料 | access |

- 保密等级过滤在 service 层执行，API 必须过滤，不只是页面隐藏。
- 默认用户（有 `library` 资源）最高可看 `confidentialityLevel <= 2`。
- 若问题命中更高等级资料，显示"存在更高等级候选，需要权限/审批"，但不默认选择。

## 安全

- `safeResolve()` 使用 `path.resolve()` 规范化路径
- 验证解析后的绝对路径必须在 `LIBRARY_ROOT` 前缀内
- API 层双重校验：`safeResolve` + 二次 `startsWith` 检查
- 拒绝 `..` 路径穿越，返回 403 Forbidden
- 下载前增加 `documentId` 权限校验（Phase 2）：先查 DB 确认用户有权访问该保密等级，再返回文件内容

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
   - 路径未变 → 检查 mtime/size/checksum 变化，有变化则创建 `LibraryDocumentVersion`
   - 路径不存在但 checksum 匹配到 `missing` 记录 → **自动关联**（更新路径、创建版本记录 `changeNote: "路径变更（自动关联）"`），保留 `docId` 和标签
   - 全新文件 → 创建 `LibraryDocument`（自动生成 `docId: DOC-YYYYMMDD-XXXX`）
4. 跳过 `.DS_Store`、隐藏文件
5. 用目录首层解析 `categoryCode/categoryName`，例如 `03 财务`
6. checksum 只计算 ≤10MB 的文件，大文件留空避免扫描太慢

**改名/移动自动关联原理**：
- 文件从 A 移到 B → 旧路径 A 在 Phase A 被标记 `missing` → 新路径 B 在 Phase B 扫描时 checksum 匹配到 A → 关联成功，`docId` 和标签保留
- 复制同内容文件 → 原路径仍在 Phase B 被识别为 `existing`，保持 `active`；新路径找不到 `missing` 记录，创建新文档

## 页面重构方向（Phase 3）

- 左侧分类树：来自 DB `categoryCode/categoryName`，不再只靠文件夹树
- 右侧资料表：标题、分类、更新时间、版本、简介、大小、保密等级、状态
- 筛选：分类、保密等级、来源、文件类型、更新时间
- 详情弹窗：编辑简介、分类、保密等级、版本备注
- 下载链接走 `/api/library/documents/:id/download`，后端按 `doc.id` 查 DB 取当前 `relativePath` 再返回文件流，权限和路径校验都在服务端完成，前端不再拼接路径

## 尽调流程（Phase 4-5）

1. 上传或粘贴尽调问卷 → 拆成问题列表
2. 每个问题显示推荐材料（规则匹配：分词/关键词/同义词字典）
3. 默认只推荐 `confidentialityLevel <= 2` 的材料；API 和 service 双重过滤
4. 用户可勾选/取消推荐材料，前端按问题逐个校验覆盖状态
5. **归档（Phase 5）**：
   - 校验 request 状态为 `approved`
   - service 层按用户 `maxConfidentialityLevel` 过滤 selected 材料，防止越权归档高保密文档
   - 校验每个问题至少有一份已选材料
   - 校验 `documentVersion.documentId === selection.documentId`
   - 更新 request 状态为 `provided`，写入 `archivedAt` / `archivedBy`
   - 返回归档快照（不含超限材料）
6. 问卷回复状态机：`draft` → `reviewing` → `approved` → `provided` / `cancelled`
7. 无材料时可"补充上传"，上传后自动进入 `LibraryDocument.status = draft`，再参与当前问题选择

## 未来扩展方向

1. **语义匹配**：规则匹配稳定后，可引入 agent 辅助解释推荐理由，但最终选择必须由用户确认并由 DB 存档
2. **远程适配器**：将 `readDirectory` / `readFile` 抽象为接口，实现 S3/OSS adapter
3. **预览**：图片/PDF 内嵌预览而非直接下载
4. **多根目录**：`getLibraryRoots()` 已支持逗号分隔的多路径，前端可加根目录切换
5. **生成器扩展**：接入真实业务数据（如财务科目余额、项目信息）替代 mock 内容
