# 私有数据发布

数据发布与应用部署完全解耦：源代码只保留通用导入器、已注册 handler 和校验协议；批次清单、文件名、业务断言、源文件与上传回执全部位于租户的 `WORKSPACE_CONFIG_DIR`，不进入 Git、main 或 release 源码。部署不检查、不上传、不绑定、也不执行数据批次。

## 私有目录

```text
WORKSPACE_CONFIG_DIR/
├── data-release-manifests/<release-id>.json
├── data-release-sources/<release-id>/<stagedPath>
└── data-release-uploads/                 # 服务器端受控上传区
    └── <release-id>/
        ├── current.json
        └── <payloadDigest>/
            ├── manifest.json
            ├── sources/**
            ├── data-release-transfer.mjs
            └── upload-receipt.json
```

源文件默认长期保留，暂不自动删除。服务器允许同一批次保留多个不可变摘要版本；`current.json` 只指向最近一次通过逐文件复验的版本。清理必须另走人工审计流程，部署脚本不得顺手删除源文件。

## 何时上传

文件准备完成后即可通过独立数据命令上传到生产受控区；上传不执行数据库写入，也不触发代码部署。正式应用数据前必须再次运行 `verify`，再进入独立的数据变更、备份、执行和验收流程。代码部署前只检查代码、schema、租户运行配置和 E2E，不代办数据上传。

```bash
# 提前上传；agent 会完成本地校验、上传、远端复验和回执写入
OPS_ENV_FILE=/path/to/private/.env \
  ops/upload-data-release.sh upload --id <release-id>

# 查看或再次复验已上传版本
OPS_ENV_FILE=/path/to/private/.env \
  ops/upload-data-release.sh status --id <release-id>
OPS_ENV_FILE=/path/to/private/.env \
  ops/upload-data-release.sh verify --id <release-id>

# 代码部署由 CNB 镜像链自动执行，不接受数据批次参数
```

## 执行边界

- 私有历史清单 `schemaVersion: 1` 可以上传归档和校验，但不能由新部署器执行。
- 可执行清单必须使用 `schemaVersion: 2`，并选择源码中显式注册的通用 handler；清单不能提供脚本路径、shell 命令或任意 SQL 写操作。
- Monolith artifact 组装必须从 standalone 根目录真实加载生产数据 handler 的完整模块图；缺少直接或间接运行依赖时在 Artifact Ready 前失败，不能等生产 dry-run 或 apply 才逐个补包。`finance-june-close-cutover-v1` 同时以制品内入口加载 smoke 和私有 payload dry-run 验收；源码 worktree 以 `.git`、正式制品以 `.server-entry` 识别代码边界，私有审批配置必须位于该边界之外。
- 数据 handler 复用领域 service 时不得通过 `@workspace/platform/server/api` 引入 Next route runtime；纯结果使用 `@workspace/platform/service-result`，需要标准 HTTP `Response` 的计算服务使用 Node/Web 标准实现。Next standalone 的 traced 子集不是数据脚本的通用依赖仓库。
- 数据库结果断言可以放在私有清单中，但只允许单条 `SELECT`/CTE，执行器在事务中验证断言后才写生产回执。
- 新业务类型若没有合适 handler，应先把可复用导入能力作为源码变更开发和评审；业务参数与台账仍只写私有清单。
- handler 必须在 `ops/data-release-reference-contracts.mjs` 声明导入字段如何解析已有主数据；正式事实使用 FK，来源 code/name 仅允许与 FK 并存。完整规则见 [导入主数据引用治理](../import-reference-governance.md)。
- `finance-june-close-cutover-v1` 是 2026 年 6 月历史切点的受控编排器：只接受一个已上传并冻结的私有 payload，复用资产、资金、存货和关账服务；payload 只能携带原值/累计切点、本金/利率/日期、收发数量/来源价格、盘点数量和稳定引用，不得携带折旧、利息、日数、出库成本或关账结论作为待写事实。执行前只允许按 payload 的三家公司补齐 2026 年科目、6 月期间和对应 630 余额的 `companyId`，任何既有冲突直接停止；资产批次、资金输入和已完成的 27/27 关账均按冻结来源校验后重放，不得在失败重试时改写既有会计基础。
- 上传成功不等于已应用。只有独立数据变更流程完成备份、handler、结果断言和生产回执后，才算完成数据发布；不得借代码部署顺带执行。

## Prisma 放置规则

- `prisma/schema.prisma`：模型、关系、索引、约束所需的结构声明；不得放租户公司、人员、产品或权限实例。
- `prisma/migrations/`：从当前公开结构基线开始的 schema-only 增量；不得写业务 `INSERT`、纠错 `UPDATE`、业务名称或台账摘要。
- `prisma/seed-data/`：只允许跨租户、可公开、可重复生成的产品级参考目录；租户主数据和初始化数据不属于 seed。
- 租户配置：放 `WORKSPACE_CONFIG_DIR/config/**`，由租户配置清单单独同步。
- 业务源文件和一次性数据：放上述私有数据发布目录，只由独立数据命令管理。

## 生产 apply

应用镜像 CD 不提供数据批次 apply 入口，也不得借部署顺带写业务数据。仓库只保留通用 handler、离线校验和不可变上传/复验；生产 apply 需要独立的 digest-bound 数据变更流程，至少具备人工审批、固定 payload、当前线上 image digest、数据库备份、事务执行、结果断言和回执。禁止从开发 worktree 直连生产库，也禁止手工执行镜像内的 `apply-data-release.mjs`。
