# Workspace CI/CD

## 唯一链路

```text
Mac/remote debug -> Mac commit -> CNB source repository
                                  -> required CI + one Next build
                                  -> one linux/amd64 OCI image
                                  -> CNB Registry immutable digest
                                  -> rehearsal
                                  -> backup/migration/cutover/health/receipt
```

- CNB 是唯一源码、CI、应用构建、Registry、CD、回滚和审计平台。
- Mac 只复核、提交并推送源码，不中转制品、不连接生产部署。
- `workspace-dev` 只做调试，不保存 provider push 凭据。
- 生产服务器不 checkout 源码、不运行 `npm ci`、不测试、不编译、不构建镜像。
- 第二源码/构建 provider、外部 Registry mirror、provider adapter 和本地发布控制面均不存在。
- 本地工作区是否有未提交改动与部署无关；CNB 只 checkout 已推送 commit，Pipeline 首步验证工作区干净且 HEAD 等于本次 push SHA（PR 则等于 CNB 预合并 SHA）。
- CI/CD 逻辑必须是版本化、可重复的长期合同；禁止按日期、Build ID 或某次事故临时分支执行，也禁止重新引入一次性 receipt/DAG 控制面。

## CNB required CI

`.cnb.yml` 为 `main` 的 PR 和 push 使用同一个 `ops/cnb-ci.sh` interface：

1. Pipeline 首先拒绝不匹配本次事件 SHA 或含 tracked/untracked 变化的 checkout；此检查只针对 CNB 临时工作区，不读取 Mac 或调试服务器工作区。
2. `ops/cnb-ci-cache.Dockerfile` 只随 `.node-version`、package manifests 或 Dockerfile 变化而重建；镜像内一次性安装 Node 依赖和 Chromium。
3. Pipeline 把 `/opt/workspace-deps/node_modules` 软链到 checkout；`ops/cnb-ci.sh` 不运行 `npm ci`、不复制依赖、不下载浏览器。
4. setup 先生成一次 Prisma Client 并准备 PostgreSQL，结果也写成独立状态；即使数据库准备失败，源码类 lane 仍继续执行。
5. CNB 原生并行 jobs 同轮运行四个 static bucket、四个 Node test bucket、完整 type、唯一 Next build+standalone 和 PostgreSQL；随后对 exact standalone 运行 E2E。每个 job 写独立状态，最终 summary 一次列出所有失败 lane。
6. `STANDALONE_SKIP_NEXT_BUILD=1` 把该 exact build 打包为 `workspace-standalone.tgz`，不重新编译。
7. PostgreSQL lane 使用 disposable `*_ci` 数据库执行数据 gate、migration、seed 和 integration。
8. Playwright 始终尝试启动 exact archive；build 失败导致 archive 不存在时，E2E 记录为同轮独立失败，最终与其余错误一起汇总。

PR 到此结束，不导入生产环境、不构建镜像、不部署。

## 唯一应用镜像

只有受保护 `main push` 在 required CI 成功后运行 `ops/cnb-release.sh build`：

1. 校验 checkout `HEAD == CNB_COMMIT`，取得 Git tree 与 content digest。
2. 解包已经通过 E2E 的 standalone。
3. `ops/image.Dockerfile` 只复制 runtime 与 release evidence；禁止依赖安装、测试或 Next build。
4. 只执行一次 `docker buildx build --platform linux/amd64 --push`，并以同一已授权 CNB Registry 仓库的 `:buildcache-main` tag 读写 BuildKit cache；不创建额外 cache 仓库。
5. 镜像写入 `${CNB_DOCKER_REGISTRY}/${CNB_REPO_SLUG_LOWERCASE}:sha-<full-sha>`。
6. tag 只用于检索；演练和生产必须使用 `${IMAGE_REF}@${IMAGE_DIGEST}`。

`release.json` 至少绑定：

- Git commit SHA、Git tree 与 repository content digest；
- standalone artifact/manifest digest；
- migration head 与 migration-set digest；
- CNB Build ID、event、build timestamp；
- `linux/amd64` CNB Registry image ref/digest；
- `releaseDigest` 自校验摘要。

## 演练与生产

同一 `main push` Pipeline 内依次运行：

```text
cnb-release.sh verify
  -> cnb-release.sh rehearsal
  -> cnb-release.sh production
```

`verify` 按 digest 拉取镜像，校验 release/SHA/tree/digest/platform。

`rehearsal` 使用 disposable PostgreSQL 和租户 fixture：执行 migration，启动 exact image，检查 `/workspace/api/internal/health` 与 `/workspace/api/settings/version.imageDigest`，停止后再启动同一 digest 证明回滚启动路径。任何一步失败都不会进入生产 stage。

`production` 必须同时满足：

- `CNB_EVENT=push`、`CNB_BRANCH=main`、`CNB_COMMIT=SOURCE_SHA`；
- 受保护的 main push Pipeline 在演练通过后固定注入 `PRODUCTION_IMAGE_DEPLOY_ENABLED=1`；
- 受保护 Pipeline 版本化保存非敏感的生产根目录与回环健康地址，私有 env 只保存服务器、SSH 和生产凭据；
- 生产服务器拉取私有镜像时，使用 CNB 为当前构建节点自动注入且已经完成镜像校验的 Registry 临时认证；只转交目标 Registry 的单个 auth 条目，Pipeline 结束后平台销毁 token，服务器无论成败都删除临时 Docker config；不需要长期 Registry token；
- 私有 CNB env import 只提供 SSH 和生产数据库/运行配置位置；目标路径与 health 是受版本管理的非敏感 Pipeline 配置，Registry 认证由 CNB 临时注入而不进入私有 env；
- 生产镜像 ref/digest 与 `release.json` 完全一致。

生产顺序固定为：

1. 获取排他部署锁；
2. 按 digest 拉取并复验 `linux/amd64` 镜像；
3. 生成并验证 custom-format PostgreSQL backup 与 checksum；
4. 使用镜像内冻结的 Prisma schema/migrations 执行 `migrate deploy`；
5. 启动隔离 candidate 并检查 health；
6. 切换正式容器，失败时恢复上一容器或首次切换前的旧 PM2 进程；
7. 验证公网 health 与线上 `imageDigest`；
8. 原子写入 `deployed-image.json`，记录 current/previous digest 与 source identity；
9. 清除临时 Registry 登录材料。

旧组合 `.env` 仅用于首次过渡：部署脚本在服务器本地生成权限为 `0600` 的 `runtime.env` 和 `control-plane.env`。runtime 文件排除 migration/backup 凭据；control 文件只保留数据库控制项。凭据不进入仓库、日志、patch 或命令输出。

## 回滚

`.cnb/tag_deploy.yml` 的 production 环境只允许 owner/master 并要求审批。`ops/rollback-image.sh` 只读取 `deployed-image.json.previous.imageDigest` 和对应 release manifest，再复用同一部署入口。它拒绝任意可变 tag；数据库 migration 只允许向前兼容，应用回滚不自动执行 down migration。

## 删除边界

正式源码不再包含：

- 第二 provider workflow、外部 Registry、provider trigger token 或 provider 间 mirror；
- `ops/publish.sh`、本地 push/promotion/deploy 包装器；
- Ready/controller、blocker ledger、retry fence、Profile/Fleet、单 unit 发布器；
- 本地 CI receipt、production bootstrap receipt、跨 job result adapter；
- deploy-unit graph、生成 App、独立 unit 编译/导航/控制面；
- 生产源码 checkout、现场依赖安装或现场构建。

保留的最小 CI/CD 代码只有 `.cnb.yml`、`.cnb/tag_deploy.yml`、`ops/cnb-ci-cache.Dockerfile`、`ops/cnb-ci.sh`、`ops/cnb-release.sh`、`ops/build-standalone-artifact.sh`、`ops/image.Dockerfile`、`ops/image-release-manifest.mjs`、`ops/deploy-image.sh` 和 `ops/rollback-image.sh`。

缓存镜像与缓存卷禁止包含 `.env`、密钥、生产数据库连接和租户配置。工具链、`node_modules` 与 Chromium 由 CNB 版本镜像跨节点复用，其版本只由 `.node-version`、`package-lock.json` 和缓存 Dockerfile 决定；`package.json` 仅作为构建输入，改脚本而 lockfile 未变时不重建依赖镜像。main 受 Pipeline 锁串行保护，使用 read-write 节点卷即时保留 `.next/cache`、`.cache/eslint`、`.cache/types` 和 `.cache/tsbuild`，即时保留 Next、ESLint 与 TypeScript 增量状态，即使后续部署失败也不丢弃已完成的检查缓存；ESLint 使用 content strategy，不依赖干净 checkout 每次改变的文件时闳戳；TypeScript 另以实际受管源码、JSON/Prisma 输入、lockfile/Node 版本和检查入口的 Git blob 集合作为内容键，相同输入可直接复用已成功结果，任一相关输入变更都会产生新键并重跑；PR 只读 main 缓存；应用镜像使用 Registry BuildKit cache。CNB Volume 不是跨节点保证，缓存未命中只影响耗时，不改变 required CI、制品身份或部署结果。

## Agent 闭环

Agent 每次发布必须：

1. 开工查询 Mac、CNB 和远端 health/version 基线。
2. push 前运行受影响快速检查。
3. push 后跟踪 exact SHA 的 CNB Build ID、required CI、image digest、rehearsal 与 production stages。
4. 构建后核对 SHA、tree、content、artifact、release 和 image digest。
5. 部署后核对公网 health、线上 image digest 与 `deployed-image.json`。
6. 交付前重新刷新 CNB 与线上状态；不能要求用户代查。
