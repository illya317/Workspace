# CI/CD 与测试分级

本文是 Workspace 合并和生产发布的执行真源。目标不是每次提交都跑全量，而是让风险判断可复现、未知变更默认从严，并让静态 gate、Node、PostgreSQL、build 与浏览器 E2E 各自给出独立证据。

## 质量边界

- 分类器读取完整 base..head diff，不读取提交信息，也不把代码里的“纯文案”当成可证明的文案变更。
- 条件 job 只有在分类器明确允许时才能跳过；`CI / required` 会同时校验应成功和应跳过的 job。
- 分类器、CI runner、Playwright runner、影响映射、公开 contract 或测试删除本身都按 C3 处理。
- 启用分支保护后，受保护 `main` 的精确 `CI / required`（GitHub Actions App）仍是 GitHub 合并门禁，但不参与生产发布判定。
- 正式生产门禁是当前 Git tree 的本地 `npm run check:ci` 凭证。CNB 从该 source parent 在 Linux 构建一次 canonical standalone，服务器不重建正式源码。快速迭代期的唯一例外是受治理 SSH hotfix：服务器在限额的 digest-pinned Node 24 Linux 容器中构建上传的 exact Git source。

## 风险等级

| 等级 | 可证明范围 | 必需证据 |
|---|---|---|
| C0 文档 | 根目录约定文档、`docs/**/*.md(x)`、文本说明、模块内约定文档和 GitHub 模板；不包含 `.ts/.tsx` 中的文案 | migration marker 检查、文档一致性和聚合门禁；不跑 Node test、type、PostgreSQL、build、E2E，不生产运行包 |
| C1 展示补丁 | 仅业务模块 `packages/<module>/ui/**` 下的 CSS、字体、图像等展示资源；不得涉及 Core、Platform、`app/`、`public/` 或代码 | changed static/lint、全部 Node、quick type；ready PR/main 候选补 production build；不跑 PostgreSQL 或 E2E |
| C2 已覆盖改动 | 受信任影响映射中有明确只读或写入覆盖的标准单模块改动 | static/changed lint、全部 Node、full type、build；server/write 加 PostgreSQL；存在映射 suite 时运行目标 E2E |
| C3 全量 | 高风险、跨模块、未知、未覆盖或超过规模阈值的变更 | full static/lint、全部 Node、full type、PostgreSQL、build、全部已注册 Playwright |

以下任一条件会升级到 C3：

- Prisma schema/migration、认证、RBAC、共享 Core/Platform、CI/CD、测试 runner 或影响映射变化；
- API/公开 contract 的新增、删除、重命名或形状变化，或者删除/移出测试；
- 任意未映射模块路径，或可能写入但没有明确 `write`/`read-only` 归属的 UI、API、server 路径；
- 同时影响至少两个业务模块；
- 非测试、非生成源码超过 20 个文件，或非生成 diff 超过 500 行；
- 单个展示资源 blob 超过 2 MiB、展示资源 blob 总变化超过 5 MiB，或展示资源超过 20 个文件；文本和二进制都计入；
- 任意非展示二进制文件变化；这类产物无法用行数证明影响范围，直接全量；
- base/head、生产基线或远端证据不能被严格证明；
- 人工 `force_full`，用于指定 SHA 的完整 CI 诊断。

阈值只负责升级，不负责降级。一行 migration 仍是 C3；大量生成文件不会单独把普通变更误判成大改。

## 流水线

```text
classify
├── static       docs / lint / architecture / contracts / migration policy
├── node         packages / scripts / app / ops 的 Node 测试
├── type         C1 quick；C2/C3 full
├── PostgreSQL   C2 server/write 或 C3：migration / seed / integration
└── build        C2/C3，以及 ready/main C1：standalone tgz + manifest + SHA-256
      └── E2E    C2 映射 suite 或 C3：下载并启动同一个 tgz

所有预期结果 -> CI / required

formal: local full CI receipt -> CNB release injection -> Linux build -> artifact validation -> production
hotfix: local fast gates -> exact Git bundle -> verified dependency/artifact cache -> server Node 24 container build -> same deployer -> production
```

同一 event + 稳定 ref（或同一 PR）的连续 push/触发会取消旧 CI，只保留最新 SHA 的运行。候选过程固定复用 `codex/staging-main`、`codex/candidate-main` 和同一个 bot PR，因此第二次 push 会更新同一 ref/PR 并取消旧候选 CI。不同 PR、main push 与手工任务不会互相取消。已经进入生产 backup/migration/switch 临界区的部署不使用这组可取消 concurrency；服务器互斥锁保证一次只有一个部署。

CI 缓存只加速输入：npm 下载缓存、quick type build info 和 `.next/cache`。CI job 之间不复用 `node_modules`，Playwright 浏览器不缓存。SSH hotfix 的服务器构建是例外：它把一次真实 `npm ci` 的结果按 build image digest、`package.json`、`package-lock.json`、`.node-version` 和可选 `.npmrc` 摘要缓存，并在后续构建中只读挂载；任何输入变化都会重新安装。standalone tgz 是带 manifest/digest 的发布 artifact，不是普通构建缓存。

## 测试内容与当前缺口

当前已注册浏览器证据包括：

- 匿名访问与登录页；
- 账户偏好保存、服务端读回、刷新后持久化和原值恢复；
- Finance 分析与总账读取；
- nightly 的 HR 花名册、Work 主入口/项目、Finance、Production QC、Inventory、Library、External、Administration 首屏 readiness；
- readiness 流程的 navigation/resource timing、慢资源、失败请求和 5xx，并对 ready 时长设置阻断阈值。

当前只有“账户设置”具备确定性的浏览器写入 → 服务端读回 → 刷新持久化闭环。Finance 是只读断言，其余模块主要是首屏 readiness/延迟证据；C3 的“全部 Playwright”也只表示运行全部**已注册**浏览器流程，不代表 HR、Work、Production 等所有保存路径已经有 E2E。未映射路径会 fail closed 到 C3，但静态、Node、PostgreSQL 与全量现有 E2E 不能替代尚未编写的业务保存用例；新增稳定写入测试并登记影响映射后，才可把相应路径降到目标 C2。

常用本地命令：

```bash
# 查看某个完整 diff 的判定
node scripts/ci/classify-risk.mjs \
  --base <40-char-base-sha> \
  --head <40-char-head-sha> \
  --diff-mode three-dot

# 本地静态 + Node + type + production build 全量诊断；不等同于远端 PostgreSQL/E2E lanes
npm run ci

# E2E 入口；必须提供已验证 standalone archive 或本地已验证 build
npm run test:e2e:critical
npm run test:e2e:nightly
npm run test:e2e:latency
```

## Migration 发布契约

每个新增的 `prisma/migrations/*/migration.sql`，第一条非空行必须且只能声明一次。migration 一旦进入 trusted base 就不可再改：

```sql
-- workspace:migration-mode=expand
-- workspace:migration-mode=maintenance
```

- `expand` 是“旧 writer 与新 schema 仍兼容”的声明，只适用于明确 allowlist 内的建新表、对既有表使用 `CREATE INDEX CONCURRENTLY` 的非唯一索引、nullable 列、安全非空默认和带顶层 `WHERE` 的受限数据更新等向前兼容变化。既有表普通/唯一索引、显式 transaction 内的 concurrent index、未知 statement/`ALTER`、权限收窄、trigger/rule/policy/constraint、`DO`/`CREATE OR REPLACE`、除 `DROP NOT NULL` 外的所有 `DROP` 都必须转为 `maintenance`。
- `maintenance` 是对停机迁移的显式授权，不是普通注释。迁移文件和部署策略路径受 CODEOWNER 审批；只有确认旧版本不能与该 migration 并存时才使用。
- PR/CI 只允许新增 migration，且目录名必须严格晚于 trusted base 的最大 migration；一旦进入受信任 base 就禁止修改、重命名或删除，避免生产不重跑、checksum 漂移或迟到回填。生产入口再检查 `last_deployed..candidate` 的累计差异，不能借由多个小提交绕过 maintenance 判断。
- 普通 `expand` 发布先生成 PostgreSQL/runtime 可恢复备份，再在线迁移。存在 pending `maintenance` 或服务器已有未完成维护 marker 时，部署先写维护意图，停止并确认 candidate、Workspace 与企业微信 writer，执行 `pm2 save`，然后在不受普通 retention 清理的 pinned 目录生成唯一 migration 前 `pg_dump`；marker 原子记录精确 backup path 与 SHA-256 后才运行 migration。
- maintenance migration 一旦开始，失败处理不会重启不兼容的旧 release。重试只要检测到 marker，就先无条件停止并确认 candidate、Workspace 与企业微信 writer、执行 `pm2 save`，随后才解析 marker 和复验其 pinned 原始备份；marker/备份缺失、损坏或 digest 不符都直接保持停机。只有新 release 完成健康、版本与证据提交后才清除 marker；下一次正常发布才清理已解除 pin 的恢复点。

## 从提交到发布

1. pre-commit 继续只检查 staged/changed 范围；hook 会先按 `.node-version` 自动选择 Node，并把一般运行时临时目录固定到工作区 `.cache/runtime-tmp`。TypeScript 检查通过 `node --import tsx` 加载，不启动 `tsx` CLI IPC server。显式设置 `PRE_COMMIT_FULL=1` 会运行全量并为 staged tree 写入发布可复用凭证。
2. Git 跟踪的 `ops/publish.sh push`（桌面私有目录只保留加载 `.env` 的薄 wrapper）以 `origin/main..HEAD` 运行自适应本地 gate，把 staging SHA 交给受信任的 `Promote candidate` workflow；workflow 创建或更新同一个 bot-authored candidate PR，并在精确 SHA 上显式触发 CI，不直推 `main` 或 CNB。
3. 对命中 CODEOWNERS 的质量策略路径，由 repository owner 审批 bot-authored PR；这解决单 owner 对自己所开 PR 无法批准的问题，但不虚构“独立第二人”审查。旧批准会在后续 push 后失效；配置未要求通用批准数或 last-push 第二人批准。
4. PR/merge-group 按受保护 base 分类并由 `CI / required` 聚合。GitHub Actions 的 standalone artifact 只在同一 CI run 内交给 E2E，不发布 prerelease，也不参与部署。
5. 只有显式 `publish.sh deploy --full` 才进入正式 CNB 发布。它要求本地在干净的 `main` 上运行；入口会自动选择仓库 Node 主版本并使用工作区内的运行时临时目录。普通发布先只读生产 schema-v3 receipt 和恢复 marker，以 canonical source 检查 candidate lineage，并对 `last_deployed..candidate` 执行累计 migration policy；这些检查必须早于本地 full CI 和 CNB trigger。当前 tree 没有有效凭证时只运行一次 `npm run check:ci`，已有同 runtime/tree 凭证时直接复用；随后生成绑定 source SHA/tree、本地全量凭证与可选 bootstrap receipt 的 `.cnb-release.json`。发布脚本不读取 GitHub。
6. Git 跟踪的 `ops/cnb-release.yml` 是 CNB CD 配置真源；私有目录只保留逐字一致副本和 `.env`。`cnb-release` 注入提交只能增加 `.cnb.yml` 与 `.cnb-release.json`，其唯一 parent 必须是 source SHA。
7. CNB 在 injection checkout 中安装依赖并构建 standalone。packager 绑定 parent source SHA/tree 和 BUILD_ID，生成 manifest/tgz；`deploy.sh` 在上传前校验 manifest、artifact hash、migration set 和注入身份，全程不访问 GitHub。
8. 发布顺序以 CNB checkout 的 Git ancestry 与服务器 `deployed-release.json` 为准。没有活跃 hotfix 时，candidate 必须是 bootstrap baseline 或已部署 source 的后代，同 source 是 no-op，回退或分叉直接阻断。有活跃 hotfix 时，正式 CNB 以最后的 canonical source 排序，并始终真实覆盖 hotfix artifact。
9. `publish.sh` 记录 CNB trigger SN、轮询 CNB 终态，并通过 SSH 等待服务器记录、health 与 `/workspace/api/settings/version` 精确等于目标 SHA。正式部署计时从 CNB release trigger 前开始，到生产版本和健康检查确认后结束；成功时输出开始、结束和总秒数，本地 preflight/full CI 不计入服务器部署耗时。生产记录保存 CNB repository/injection SHA 和 artifact SHA-256，不创建 GitHub Deployment。

生产基线不可读、不是候选祖先、migration 区间无法证明、manifest 或 artifact hash 不匹配时一律阻断。

## 受治理 SSH hotfix

```bash
OPS_ENV_FILE=/path/to/private/.env ops/publish.sh deploy
```

- `deploy` 默认是 hotfix，`publish.sh hotfix` 仅保留为显式别名。该路径不经 GitHub 或 CNB，但也不手改生产 `current`。入口要求干净工作区的已提交 HEAD，HEAD 必须是当前运行 source 的后代，上传内容是带当前运行 source prerequisite 的 exact Git bundle。只有用户明确使用 `publish.sh deploy --full` 才进入 CNB。
- 当前 `HOTFIX_SCOPE_POLICY=off`，C0–C3 都会分类和记录，但不按范围拦截。`restricted` 和 `HOTFIX_ALLOWED_RISK_CLASSES` 是长期预留开关，目前不开启。默认仍强制 `check:blockers`、该区间 migration policy 和 quick typecheck。
- 服务器只在 `$REMOTE_DIR/.hotfix-builds` 下建临时 detached worktree，用 Node 24 Linux 容器限制 CPU/内存并把镜像解析到 registry digest。依赖缓存只接受完成 marker，对同一 cache key 加锁并原子生成，构建时只读挂载；worktree 在构建后立即移除。相同 source SHA 的 cutover 重试只有在重新核对 bundle source/tree、固定路径、build image digest、BUILD_ID、manifest 与 artifact SHA-256 后才复用受管产物。
- Library/OCR、Qwen embedding 和 ONLYOFFICE provisioning 采用 source/config digest marker。marker 命中后仍运行轻量版本/文件/健康检查；检查失败、脚本或配置变化时自动回退到完整安装，Qwen 的完整 CPU semantic smoke 仍由首次安装或输入变化触发。
- artifact 后续复用正式部署器的 manifest/digest/migration 校验、互斥锁、PostgreSQL/runtime 备份、不可变 release 目录、PM2 切换、健康检查和回滚。`deployed-release.json` 区分当前 `runtime source` 与最后 `canonical source`。
- 后续正式 CNB 始终权威：它以 canonical source 做 ancestry 判定，不要求包含 hotfix，且即使 source 相同也会重新部署 canonical artifact 并将 transport 改回 `cnb`。
- 这种覆盖只能替换代码/artifact。已执行 migration 和已写入业务数据不会被下一次正式部署自动回退；有持久化变化时，正式 source 必须吸收兼容契约或给出明确的向前修正。

## 分支保护初始化

截至 2026-07-16，独立 bootstrap `4f675923a5e672f718ad75bcc0a84cbd374883da` 已完成精确 SHA 全量 CI，GitHub `main` 已启用并回读确认保护：strict `CI / required` 绑定 GitHub Actions App，管理员同样受限，要求 CODEOWNERS、线性历史和 conversation resolution，禁止 force push/delete。后续功能只能通过受保护候选 PR 合入，不能再使用未保护 main 的 bootstrap 推送方式。

以下步骤保留为首次启用或灾难恢复时的 bootstrap 记录；本仓库本次初始化已经完成，不应重复执行：

1. 记录当前未保护 `origin/main` 的完整 SHA，并从它创建隔离 worktree。
2. 从最终 review 通过的纯 CI/CD 提交应用完整 workflow 及其所有运行依赖，但明确排除 `prisma/migrations/**`；staged diff 不得包含 `app/`、`packages/`、`prisma/migrations/` 或其他业务变更。
3. 在隔离 worktree 运行本地完整 CI 验证，提交后以精确 lease 做一次受控快进 push；绝不先把 migration 推到未保护 main。
4. 等待这个精确 bootstrap SHA 的 `CI / required` 成功。若失败，先把远端 `main` 精确恢复到原 bootstrap base，再从同一 base 制作修正版；禁止在失败的未保护 main 上继续追加修复提交：

   ```bash
   failed_sha="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
   git push origin --force-with-lease="refs/heads/main:$failed_sha" "$bootstrap_base:refs/heads/main"
   test "$(git ls-remote origin refs/heads/main | awk '{print $1}')" = "$bootstrap_base"
   ```

5. 先 dry-run，再 apply 并 read-back 远端保护；随后把现有功能提交 rebase/replay 到受保护 main，通过稳定 bot candidate PR 合并。

示例（`<ci-cd-commit>` 是本任务最终纯 CI/CD 提交）：

```bash
git fetch origin main
bootstrap_base="$(git rev-parse origin/main)"
bootstrap_dir="$(mktemp -d)/workspace-ci-bootstrap"
git worktree add --detach "$bootstrap_dir" "$bootstrap_base"
git diff --binary "<ci-cd-commit>^" "<ci-cd-commit>" -- . ':(exclude)prisma/migrations/**' > /tmp/workspace-ci-bootstrap.patch
git -C "$bootstrap_dir" apply --index /tmp/workspace-ci-bootstrap.patch
test -z "$(git -C "$bootstrap_dir" diff --cached --name-only -- app packages prisma/migrations)"
git -C "$bootstrap_dir" commit -m "ci: bootstrap adaptive quality gates"
npm --prefix "$bootstrap_dir" ci --no-audit --fund=false
npm --prefix "$bootstrap_dir" run check:ci
npm --prefix "$bootstrap_dir" run test:node
bootstrap_sha="$(git -C "$bootstrap_dir" rev-parse HEAD)"
git -C "$bootstrap_dir" push origin --force-with-lease="refs/heads/main:$bootstrap_base" HEAD:refs/heads/main
gh run list --repo illya317/Workspace --workflow CI --commit "$bootstrap_sha"
```

确认该精确 SHA 的 `CI / required` 成功后应用并复核保护：

```bash
node scripts/ci/configure-branch-protection.mjs --repo illya317/Workspace
node scripts/ci/configure-branch-protection.mjs --repo illya317/Workspace --apply
```

脚本绑定远端当前 main、精确成功 check 和 `github-actions` App，并配置 strict/up-to-date、管理员 enforcement、线性历史、conversation resolution、禁止 force push/delete、无 PR bypass。通用 `required_approving_review_count` 为 0，`require_last_push_approval` 为 false；质量策略路径由 CODEOWNERS 要求 repository-owner 审批 bot-authored PR，不能描述成独立第二人批准。

## 现有生产的一次性接管

当前旧生产没有 `deployed-release.json`，首次受治理发布必须显式提供一次性 receipt，不能伪造历史记录：

```bash
ops/publish.sh deploy --full \
  --bootstrap-production-base 0a5485a68fbba0298bfe5c2ebdb456f4b140c359 \
  --bootstrap-legacy-cnb-commit 515f986adae2a4bfe9c8ba3901d91765fb9549a7 \
  --bootstrap-legacy-release-id 20260715164825-515f986a \
  --bootstrap-legacy-cnb-build-sn cnb-8gh-1jtif23er \
  --bootstrap-legacy-runtime-version local-1784105165477 \
  --bootstrap-legacy-build-id local-1784105165133
```

入口会验证旧 CNB anchor、release 目录、`current`、Workspace/可选 WeCom PM2 身份、运行版本、BUILD_ID，以及生产 migration 的名称和 checksum 集合。锁内在首次 mutation 前写入 bootstrap marker，并只允许同一 receipt/candidate 续跑。正式记录成功写入后 marker 才会清除；若客户端在正式记录写入后断线，使用普通 `ops/publish.sh deploy --full` 对账同一 SHA，不要再次传 bootstrap 参数。

CNB 和生产服务器不保存 GitHub token，也不读取 GitHub API、Actions artifact 或 release asset。它们只消费 CNB injection checkout，并在迁移和切换前确认 `deployed-release.json` 没有被并发修改。

## 速度策略、预算与观察

发布提速来自删除 GitHub promotion/remote CI/artifact 等待，并按 exact tree 复用本地全量凭证。CNB 仍必须在 Linux 重新执行一次 standalone 构建；这不是第二轮全量 CI，服务器也不重建。

历史观测中，一次成功 CNB build 总耗时约 `405.55 s`（约 `6 分 46 秒`）；这是单次历史样本，不是中位数、p95 或当前 SLA。旧 GitHub 串行链路曾观测约 5 分 28 秒。拆分后的预算仍是 C0 约 1 分钟、局部补丁约 2 分钟获得主要反馈、C3 wall time 约 4–5 分钟；CNB 先以低于历史样本为优化方向，达到稳定 p50/p95 前不宣称 3–5 分钟已经实现。

持续观察各 job 时长、排队时间、缓存命中、Playwright retry/flaky、被取消旧运行、CNB 状态、部署回滚和模块写入覆盖。只有新证据有明确 owner 时，才可以删除旧检查或扩大 C2 快车道。
