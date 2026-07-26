# 私有工作区与新租户初始化

`WORKSPACE_CONFIG_DIR` 是单个租户的私有配置、文件运行态和数据发布输入根目录，不是源码仓库，也不要求初始化 Git 或配置远端。源码、租户私有文件和生产数据库分别管理；任何一方都不能代替另外两方的备份。

## 新租户

新客户优先直接生成一套最小、可校验的私有租户配置：

```bash
npm run workspace:provision -- \
  --root /absolute/path/to/.workspace \
  --tenant-key example-industries \
  --company-code EX01 \
  --company-name "Example Industries" \
  --app-name "Example Workspace" \
  --time-zone Etc/UTC
```

`workspace:provision` 会先建立目录，再生成单一主体公司、空业务导入、空 QC 产品和中性基础目录。它不会生成数据库连接、secret、品牌图片、人员花名册、财务期初数或其他业务台账，也不会覆盖已有 `config/tenant/profile.json`。生成的 HR、组织、编号和 Agent 最小默认值只用于让租户契约完整，正式开通前必须按客户核准资料复核。

只需要补齐或修复目录时，使用幂等目录初始化：

```bash
npm run workspace:init -- --root /absolute/path/to/.workspace
```

`workspace:init` 只创建标准目录，不覆盖现有文件，也不编造公司名称、组织、权限、财务映射、HR 选项、Agent 编制或业务数据。随后由租户开通过程提供：

1. `.env`，包括绝对 `WORKSPACE_CONFIG_DIR`、PostgreSQL 连接和应用 secret；
2. `config/tenant/profile.json` 及其声明的 `config/tenant/**`、`config/hr/**` 文件；
3. profile 声明的公司文档和 QC 快照目录；
4. 品牌与 Agent 公共图片；
5. 独立的私有运维 `.env`，其中保存服务器目标和部署连接信息；
6. 需要导入的业务源文件与数据发布清单。

配置完成后运行：

```bash
npm run workspace:check -- --ops-env /absolute/path/to/private/ops/.env
```

本地 `npm run dev` 会先运行同一工作区检查；缺少必需配置时服务不会启动，因此不会等到用户点击页面才暴露原始文件读取错误。生产部署同样在启动候选和公开切换前验证私有配置。可选能力在未配置时应返回受控的 unavailable 状态；必需租户配置始终 fail closed，不在 UI 请求过程中临时生成。

把系统交付给另一家客户时，必须创建新的 `WORKSPACE_CONFIG_DIR` 和独立数据库，不能复用现有租户私有目录。现有租户内部增加法人或经营公司才是在同一目录中更新 `companies.json` 及相关 Finance/Work 配置。

## 图片位置

```text
WORKSPACE_CONFIG_DIR/
└── assets/
    ├── brand/
    │   ├── company/logo.png
    │   ├── favicon.ico
    │   └── favicon.png
    ├── agent/avatar/00_main-transparent.webp
    └── user/avatar/                    # 用户上传时按需创建内容
```

品牌图片和主 Agent 头像属于租户必需输入，不会自动生成；初始化命令只创建目录。用户头像由上传功能写入。部署器把这些私有目录挂到运行版本，不把图片复制进 main、release 或构建产物。

## 目录生命周期

| 类型 | 目录 | 生命周期 |
|---|---|---|
| 人工租户输入 | `config/tenant`, `config/hr`, `config/docs`, `assets/brand`, `assets/agent` | 初始化只建目录；内容必须配置或迁移 |
| QC 私有定义 | `config/pharma-qc` | 源数据必须迁移；派生目录由显式生成命令重建，不在 UI 请求中生成 |
| 数据发布输入 | `data-release-manifests`, `data-release-sources` | 人工准备并长期保留 |
| 文件运行态 | `agent`, `library`, `template`, `data` | 初始化可建空目录；使用功能时继续创建子目录和文件 |
| 安装运行态 | `runtime`, `onlyoffice` | 安装或部署命令填充 |
| 可重建数据 | `cache`, `agent-source` | 使用时重建，可按保留策略清理 |
| 私有维护工具 | `tools/qc` | 随私有工作区迁移；只读配置，派生报告写入 `audit/qc-generation` |
| 私有证据 | `audit`, `backups` | 操作产生或人工归档，不得当缓存自动删除 |

根 `manifest.json` 不再使用。租户运行事实只来自 profile 及其引用；生产服务器目标只来自私有 ops `.env`；Agent 源码读取和 CNB proposal 仓库只来自各自的环境变量。租户部署 manifest 是部署时根据实际文件临时生成并做摘要校验的 receipt，不是人工维护的根配置文件。
