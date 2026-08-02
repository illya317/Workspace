# Workspace CI/CD

## 责任边界

```text
Mac formal repository -> GitHub required CI -> one linux/amd64 OCI image
                    -> GHCR digest + release.json
                    -> CNB api_trigger -> CNB Registry same digest
                    -> migration/backup/cutover/health/receipt/rollback
```

- Mac `/Users/koito/Project/workspace/workspace` 是正式代码真源，只负责复核、提交和 push。
- `workspace-dev` 只做远端调试，不保存 provider push 凭据。
- GitHub 是唯一源码平台、CI 与应用构建平台。
- CNB 是中国侧 Registry、CD、回滚与审计平台，不执行应用源码 CI 或构建。
- 生产服务器不连接或 checkout GitHub，不现场安装依赖、不编译、不构建镜像。

## GitHub required CI

`.github/workflows/ci.yml` 的质量线为：

1. `CI / changed`：base/head 影响检查。
2. `CI / node`：Node tests。
3. `CI / type`：完整 project-reference typecheck。
4. `CI / PostgreSQL`：migration、约束与真实 PostgreSQL integration。
5. `CI / build once`：只编译一次 Next standalone，并组装 portable runtime artifact。
6. `CI / E2E exact build`：下载并启动第 5 步的 exact build，不允许重建。
7. `CI / required`：聚合以上结果；任一非 success 即失败。

PR/Fork 只运行质量线，不获得 package write 或 CNB trigger 权限。只有受保护 `main` push 才运行 `Image / publish exact digest`。

## 唯一应用镜像

`Image / publish exact digest` 下载 `CI / build once` 的 portable runtime，使用 `ops/image.Dockerfile` 包装为唯一的 `linux/amd64` 应用镜像。Dockerfile 不运行 `npm ci`、Next build 或任何测试。

镜像推送到：

```text
ghcr.io/<owner>/<repository>:sha-<full-sha>
```

部署不能使用该 tag；tag 只便于检索。批准身份必须是：

```text
ghcr.io/<owner>/<repository>@sha256:<digest>
```

GitHub 随后生成 `release.json`，至少绑定：

- commit SHA 与 Git tree；
- repository content digest；
- `linux/amd64` GHCR image ref/digest；
- standalone artifact/manifest digest；
- migration head 与 migration-set digest；
- GitHub Run ID、attempt、`CI / required=success` 与 build timestamp；
- `releaseDigest` 自校验摘要。

动态 `release.json` 以一个只含该文件的 OCI metadata artifact 发布。它不是第二个应用 build，也不能替代应用镜像；`RELEASE_MANIFEST_URL` 始终带 metadata artifact digest。

## GitHub -> CNB

GitHub 只保存最小权限 `CNB_TRIGGER_TOKEN`。仓库变量：

- `CNB_REPOSITORY`：默认 `illya317/Workspace`；
- `CNB_RELEASE_EVENT`：迁移期设为 `api_trigger_rehearsal`，演练通过后才改为 `api_trigger_deploy`。

调用 CNB OpenAPI 时传递：

```text
SOURCE_SHA
SOURCE_TREE
IMAGE_REF
IMAGE_DIGEST
RELEASE_MANIFEST_URL
GITHUB_RUN_ID
```

CNB checkout 只承载受保护的部署控制代码，不是应用源码；应用身份只能来自 GitHub `release.json`。缺字段、SHA/tree/digest 格式错误、`releaseDigest` 不一致或 manifest 参数漂移全部 fail closed。

## CNB Registry 镜像

`ops/cnb-image-release.sh prepare`：

1. 按 digest 拉取 OCI metadata artifact 并读取 `release.json`。
2. 按 digest 拉取唯一 GHCR 应用镜像。
3. 运行 `ops/deploy-image.sh verify` 校验 release/SHA/tree/digest/platform。
4. 将同一 image manifest 推送到 `${CNB_DOCKER_REGISTRY}/${CNB_REPO_SLUG_LOWERCASE}:sha-${SOURCE_SHA}`。
5. 校验 push 返回的 CNB digest 必须逐字等于 GHCR digest，并按 digest 回拉验证。

CNB 禁止运行：

- `npm ci`、lint、typecheck、Node/PostgreSQL/E2E；
- Next build；
- 第二次 Docker application build；
- 可变 tag 部署。

## 演练门禁

首次生产启用前必须成功运行 `api_trigger_rehearsal`：

1. GHCR digest 拉取；
2. CNB Registry 同 digest 镜像；
3. disposable PostgreSQL migration；
4. exact image 非生产启动；
5. health 与 `/api/settings/version.imageDigest` 复验；
6. 容器停止与上一 digest 启动路径演练。

`PRODUCTION_IMAGE_DEPLOY_ENABLED` 缺失或不为 `1` 时，`ops/deploy-image.sh production` 必须拒绝。演练证据确认后才允许在 CNB 私有环境启用并把 GitHub 的 `CNB_RELEASE_EVENT` 切为 `api_trigger_deploy`。

## 生产部署

CNB 私有环境保存 GHCR read-only robot、生产 SSH/数据库和 CNB Registry 凭据。凭据不得进入仓库、日志、patch、截图或命令参数输出。

生产只消费 `${CNB_IMAGE_REF}@${IMAGE_DIGEST}`，顺序为：

1. 获取部署锁；
2. 拉取并复验 `linux/amd64` digest；
3. PostgreSQL `pg_dump`、`pg_restore --list` 与 checksum；
4. 使用镜像内已冻结 Prisma schema/migrations 执行 migration；
5. 启动隔离 candidate 并检查 health；
6. 切换正式容器；失败则恢复上一容器/既有运行态；
7. 检查公网 health 与 version 的 `imageDigest`；
8. 原子写入 `deployed-image.json`，保存 current/previous digest 与 source identity；
9. 清除临时 Registry 登录材料。

生产路径不能 checkout 源码、安装应用依赖或构建。

## 回滚

`.cnb/tag_deploy.yml` 的 production 环境要求 owner/master 权限和人工审批。`ops/rollback-image.sh` 只读取 `deployed-image.json.previous.imageDigest`，拒绝任意可变 tag；它复用同一部署入口和安全门禁。数据库 migration 只允许向前兼容，应用回滚不会自动执行 down migration。

## Agent 闭环

Agent 在每次 CI/CD 任务中必须：

1. 开工查询 Mac、GitHub、CNB 与远端健康基线。
2. push 前运行受影响快速检查。
3. push 后跟踪 exact SHA 的 GitHub required lanes 与 image job。
4. 记录 GHCR digest、release manifest digest、CNB Build ID 与 Registry mirror digest。
5. 若进入部署，持续跟踪 migration/backup/cutover/health/receipt/rollback 阶段。
6. 交付前重新读取 GitHub/CNB 状态，并只读验证生产 health 与线上 digest。

Agent 不能要求用户去 GitHub/CNB 查询后再转述。

## 旧控制面的收口

`ops/publish.sh`、CNB injection、Application Ready/Controller Ready、blocker ledger、retry fence 和跨渠道 build adapter 属于旧 artifact/PM2 发布控制面。新 GitHub/CNB 流程不得调用它们。它们只在镜像非生产演练与生产切换完成前保留为兼容/回滚依据；删除必须在以下证据齐备后进行：

- 至少一次 CNB rehearsal 成功；
- 一次受控 production image cutover 成功；
- 一次 previous-digest rollback drill 成功；
- 新 `deployed-image.json` 与旧生产回执完成归档。

未满足这些条件前直接删除旧生产恢复代码会降低可恢复性，因此禁止把“代码行减少”置于可回滚性之前。
