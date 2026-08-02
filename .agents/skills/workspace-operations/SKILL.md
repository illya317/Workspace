---
name: workspace-operations
description: Operate Workspace CI, immutable OCI builds, CNB image delivery, environment validation, deployment safety, and runtime diagnostics.
---

# Operations Role

Operations 负责 CI、构建、镜像交付、环境和运行态。

## 角色确认

- 开工前确认根 `AGENTS.md` 的环境与 Role Gate，声明 `主角色: Operations`。
- 在 Mac 正式仓库、远端开发和生产之间先选定环境；不得把一个环境的命令套到另一个环境。
- 业务功能、schema、架构契约和历史清债分别交给对应角色。

## 先读

- `docs/engineering/project-overview.md`
- 涉及文档同步时读 `docs/OWNERS.md`
- `docs/engineering/checks.md`
- `docs/engineering/ops/ci-cd.md`
- `.cnb.yml` 与 `.cnb/tag_deploy.yml`
- 私有部署目标和凭据说明位于桌面私有 ops，不进入仓库

## 唯一发布链

```text
Mac push CNB -> required CI -> one Next standalone build
             -> one linux/amd64 image -> CNB Registry digest
             -> rehearsal -> lock/backup/migration/cutover/health/receipt
```

- CNB 是唯一源码平台、CI、应用构建、Registry 和 CD 平台。
- PR 只运行 required CI；受保护 `main` 在同一 checkout 中复用该构建，发布一个 `linux/amd64` OCI 镜像与 `release.json`。
- `ops/cnb-ci.sh` 负责依赖、检查、唯一 Next build、PostgreSQL 和 exact-build E2E；`ops/cnb-release.sh` 只包装该 standalone、发布一次镜像并把同一 digest 交给演练和生产。
- 生产只按 CNB Registry digest 拉取；禁止可变 tag、源码 checkout、现场安装和现场构建。
- Mac 只提交源码，不中转制品、不部署生产；远端开发 checkout 不保存 provider push 凭据。

## 职责

- 维护 CNB 的 static、Node、type、PostgreSQL、build-once、exact-build E2E 和 required 聚合。
- 维护 CNB Registry 镜像、`release.json` 和同 digest 演练/生产校验。
- 维护部署锁、备份、migration、候选健康、原子切换、线上 digest 回执和 previous-digest 回滚。
- 区分 PR CI 与真实部署检查；租户私有配置、生产数据库和部署凭据不进入 PR CI。
- 维护 CI、检查、构建、运行和部署文档，使其与 `package.json`、workflow 和脚本一致。
- 保持生成 App/deploy graph 作为源码所有权和编译闭包契约；它们不构成第二套生产构建或单元发布控制面。

## Agent 闭环

- 开工查询 Mac、CNB 和远端健康基线。
- push 前运行受影响快速检查。
- push 后跟踪 exact SHA 的 CNB required CI、Build ID、Registry digest、演练、部署阶段、健康和线上 digest。
- 交付前重新刷新 provider 和线上状态；不能让用户代查。

## 禁止

- 不修改业务功能、业务 UI、领域 service 或数据 schema。
- 不绕过 `check:blockers` / `arch:gate`。
- 不把真实租户配置、生产数据或生产凭据放进普通 CI。
- 不恢复 `ops/publish.sh`、Ready/controller、blocker ledger、retry fence、Profile/Fleet 或重复的本地 CI/CD 控制面。
- 不在服务器运行源码构建，也不在 `current` 上手改源码、生成物或数据库结构。

## 验证

- 普通合并以 base/head 的 `CI / required` 为权威。
- 构建后核对 source SHA、tree、content digest、artifact digest、CNB image digest 与 release digest。
- 部署后核对 health、version `imageDigest`、CNB Registry digest 和 `deployed-image.json`。
- 回滚只消费回执中的 previous digest，不执行 down migration。
