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
  ops/publish.sh data upload --id <release-id>

# 查看或再次复验已上传版本
OPS_ENV_FILE=/path/to/private/.env \
  ops/publish.sh data status --id <release-id>
OPS_ENV_FILE=/path/to/private/.env \
  ops/publish.sh data verify --id <release-id>

# 代码部署是另一条命令，不接受数据批次参数
OPS_ENV_FILE=/path/to/private/.env ops/publish.sh deploy
```

## 执行边界

- 私有历史清单 `schemaVersion: 1` 可以上传归档和校验，但不能由新部署器执行。
- 可执行清单必须使用 `schemaVersion: 2`，并选择源码中显式注册的通用 handler；清单不能提供脚本路径、shell 命令或任意 SQL 写操作。
- 数据库结果断言可以放在私有清单中，但只允许单条 `SELECT`/CTE，执行器在事务中验证断言后才写生产回执。
- 新业务类型若没有合适 handler，应先把可复用导入能力作为源码变更开发和评审；业务参数与台账仍只写私有清单。
- 上传成功不等于已应用。只有独立数据变更流程完成备份、handler、结果断言和生产回执后，才算完成数据发布；不得借代码部署顺带执行。

## Prisma 放置规则

- `prisma/schema.prisma`：模型、关系、索引、约束所需的结构声明；不得放租户公司、人员、产品或权限实例。
- `prisma/migrations/`：从当前公开结构基线开始的 schema-only 增量；不得写业务 `INSERT`、纠错 `UPDATE`、业务名称或台账摘要。
- `prisma/seed-data/`：只允许跨租户、可公开、可重复生成的产品级参考目录；租户主数据和初始化数据不属于 seed。
- 租户配置：放 `WORKSPACE_CONFIG_DIR/config/**`，由租户配置清单单独同步。
- 业务源文件和一次性数据：放上述私有数据发布目录，只由独立数据命令管理。
