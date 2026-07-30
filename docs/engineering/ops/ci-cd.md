# CI/CD 与测试分级

本文是 Workspace 合并和生产发布的执行真源。默认范围只来自 Git base/head 的提交内容及其依赖闭包；风险标签、文件数量、行数和二进制大小可以作为诊断信息，但不得自动增加门禁。

## 质量边界

- pre-commit 先把 index 写成临时 Git tree/commit，只对 exact staged content 跑 changed lint、domain 和 migration。
- pre-push 不重复执行源码门禁；GitHub 从可信 remote base/head 解析 changed files，再通过 deploy graph、package ownership 和 impact map 加入反向依赖。
- 条件 job 只有在依赖闭包需要时才运行；`CI / required` 同时校验应成功和应跳过的 job。
- 启用分支保护后，受保护 `main` 的精确 `CI / required`（GitHub Actions App）仍是 GitHub 合并门禁，但不参与生产发布判定。
- 生产先执行一次 `validate`：从当前生产 deployed source 到 candidate 的 base/head 选择源码检查，加入依赖闭包并构建目标 artifact。validation receipt 绑定 base/source/tree，artifact manifest 绑定 digest。后续 `deploy` 只消费这组 immutable evidence，不重新检查源码或构建。

## 受影响范围

| 变更 | 选择规则 | 默认证据 |
|---|---|---|
| 普通业务 package | owner package / deploy unit，加 contributor graph 的反向消费者 | changed lint、受影响 Node、affected type、owner unit build；登记为 server/write 时加 PostgreSQL，登记 suite 时加目标 E2E |
| Core、Platform、schema、共享构建输入 | deploy graph 的全部消费者 | 全部受治理 unit 的受影响 Node/type/build 与已登记 E2E；这是依赖闭包，不是风险升级 |
| 文档 | 提交的文档路径 | dependency-free 文档一致性；`docs/generated/**` 只补生成文档一致性 |
| 展示资源 | 对应业务 owner | owner build；不因文件数量或大小自动增加源码门禁 |
| 无法证明 base/head 或 owner | 不猜测范围 | 分类失败，先修正远端证据或 ownership mapping |

用户显式请求 `force_full` 时可以运行全量诊断；它不属于默认协作或发布流程。

## 流水线

```text
classify
├── static       changed lint / submitted migration policy / submitted generated-doc consistency
├── node         changed owner 与依赖消费者的 Node tests
├── type         deploy graph affected scopes
├── PostgreSQL   changed server/write/schema paths
└── build        deploy graph affected units
      └── E2E    impact map selected specs

所有预期结果 -> CI / required

production: prepare -> validate(local or CNB, once) -> immutable artifact -> deploy(CNB or direct, no source gates)
```

同一 event + 稳定 ref（或同一 PR）的连续 push/触发会取消旧 CI，只保留最新 SHA 的运行。候选过程固定复用 `codex/staging-main`、`codex/candidate-main` 和同一个 bot PR，因此第二次 push 会更新同一 ref/PR 并取消旧候选 CI。不同 PR、main push 与手工任务不会互相取消。已经进入生产 backup/migration/switch 临界区的部署不使用这组可取消 concurrency；服务器互斥锁保证一次只有一个部署。

普通 build cache 只加速输入。release artifact cache 则是 validate 的正式输出：目录按目标和 source tree 不可变保存 artifact、manifest 与 validation receipt；restore 必须同时复验 validation base、source SHA、tree SHA 和 artifact digest。任何一项不匹配都必须重新 validate，不能在 deploy 中补跑或重建。

Build lane 会用同一 changed-files evidence 生成 `.ci/deploy-unit-build-plan.json`。没有 E2E 且不发布整站 artifact 时，`deploy:affected:build` 只构建 owner unit；Finance 私有变化不会重建其他 L1。Core、Platform、schema、lockfile、deploy protocol 或未知代码路径会选择全部 12 个 unit。需要当前 E2E 或过渡期整站发布时仍构建 canonical monolith，避免在生产 Gateway 尚未启用前伪装成 fleet E2E。

分模块生产运行使用 deploy graph 的独立 Next standalone unit、blue/green 端口和版本化 Gateway generation。`candidate` unit 只能进入 shadow；graph 明确标记为 `active` 的 unit 在既有 control-plane receipt 与 artifact 要求完全一致、inactive slot 的 health/version 通过后，允许通过唯一发布入口公开切换。当前 12 个代码侧 unit 全部为 `active`，均可正式发布；maturity 是激活资格，不代表生产 Gateway 已经存在对应 override，线上事实必须读取 `current` generation/receipt。单 unit 激活只替换该 unit 的 Gateway state；Profile 先 prepare 全部目标 unit，再基于精确 release set、SLO/DR observation 和一次 Gateway generation 原子提交。Full 在 monolith 版本检查通过后生成 `activeUnits=[]`、无独立 routes 的不可变 Gateway generation 并原子切换 Nginx，撤销此前所有单 unit/Profile 公网 override。部署事件保持兼容的 schema v2，并显式记录 `succeeded`、`failed` 或 `cancelled`；失败和取消同样写服务器 Bot 事件、完整尝试耗时与历史。

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
- 生产 migration inventory 只允许精确的 `00000000000000_sanitized_baseline` 使用 Prisma `migrate resolve --applied` 形成 `applied_steps_count=0` 的基线回执；所有普通 migration 仍必须至少执行一个步骤，零步骤回执会 fail closed。
- 普通 `expand` 发布先生成 PostgreSQL/runtime 可恢复备份，再在线迁移。存在 pending `maintenance` 或服务器已有未完成维护 marker 时，部署先写维护意图，停止并确认 candidate、Workspace 与企业微信 writer，执行 `pm2 save`，然后在不受普通 retention 清理的 pinned 目录生成唯一 migration 前 `pg_dump`；marker 原子记录精确 backup path 与 SHA-256 后才运行 migration。
- migration 与代码部署不执行 data-release gate。私有数据使用 `ops/publish.sh data upload|verify|status --id <id>` 独立上传和复验，release metadata、control-plane receipt 与 unit artifact 均不绑定数据批次。
- maintenance migration 一旦开始，失败处理不会重启不兼容的旧 release。重试只要检测到 marker，就先无条件停止并确认 candidate、Workspace 与企业微信 writer、执行 `pm2 save`，随后才解析 marker 和复验其 pinned 原始备份；marker/备份缺失、损坏或 digest 不符都直接保持停机。只有新 release 完成健康、版本与证据提交后才清除 marker；下一次正常发布才清理已解除 pin 的恢复点。

## 从提交到发布

1. 提交前先只 stage 本任务。pre-commit 把 index 转成临时 tree/commit，并在隔离 worktree 只运行 changed lint、domain 与 migration；不读取 unstaged/untracked，也不自动增加 TypeScript 或全量检查。
2. `ops/publish.sh push` 只更新 staging SHA 并交给受信任的 `Promote candidate` workflow；pre-push hook 不运行源码门禁。GitHub candidate PR 以 remote base/head 运行 affected dependency-closure CI。
3. 对命中 CODEOWNERS 的质量策略路径，由 repository owner 审批 bot-authored PR；这解决单 owner 对自己所开 PR 无法批准的问题，但不虚构“独立第二人”审查。旧批准会在后续 push 后失效；配置未要求通用批准数或 last-push 第二人批准。
4. PR/merge-group 按受保护 base 分类并由 `CI / required` 聚合。GitHub Actions 在无 E2E/整站发布请求时上传受影响 unit artifacts；需要 E2E 或整站 artifact 时上传 canonical monolith，并只在同一 CI run 内交给 E2E。这些 CI artifacts 不发布 prerelease，也不参与生产部署。
5. `publish.sh prepare` 是正式发布前唯一候选冻结入口。它快进专用 `release` worktree，校验私有 CNB YAML、租户运行配置与派生权限文档，只写入 source/tree 绑定的 candidate receipt；不在本机运行 compile、full type 或 E2E。
6. `publish.sh validate`（CNB）或 `publish.sh validate --local` 从生产 receipt 取 validation base，对 `base..candidate` 选择改动 owner 和依赖消费者，串行运行必要源码检查、构建目标 artifact，并缓存 schema v2 validation receipt。修复后 source/tree 改变，旧缓存自动失效。
7. Git 跟踪的 `ops/cnb-release.yml` 只定义可复用流水线形状；租户实际的 CNB env import、服务器目录和健康检查地址由 `WORKSPACE_CONFIG_DIR/config/tenant/cnb-release.yml` 管理。发布脚本读取并校验该租户文件；`cnb-release` 注入提交只能增加 `.cnb.yml` 与 `.cnb-release.json`，其唯一 parent 必须是 source SHA。
8. `publish.sh deploy` 或 `publish.sh deploy --direct` 必须恢复 validate 生成的同目标 artifact。cache miss、validation base/source/tree 不同或 digest 失败立即阻断；deploy 禁止运行 classifier、源码检查和 build。统一部署 adapter 仍复验 injection identity、manifest、artifact hash 与 migration set，全程不访问 GitHub。
9. 发布顺序以 CNB checkout 的 Git ancestry 与服务器 `deployed-release.json` 为准。candidate 必须是 bootstrap baseline 或已部署 source 的后代，同 source 是 no-op，回退或分叉直接阻断。

历史版本若曾把一次性 local injection commit 同时误写为 canonical source，唯一修复入口是给同一次 `validate` 与 `deploy` 显式传入 `--recover-local-receipt-base <SHA>`。入口只接受 `transport.kind=local`、source/canonical/injection 三者相同的旧损坏形态，并要求恢复基线是 candidate 的祖先、其完整 migration-set digest 与生产回执完全一致；这组证据写入 release metadata 并在部署锁内再次核对。成功后正常 schema-v3 回执写回真实 candidate source 与 `transport.kind=local`，该修复参数自动失效，不能成为长期旁路。
10. `publish.sh` 在专用 release worktree 维护跨失败重试的流程计时。validate 失败时回 main 修复并重新 prepare/validate；deploy 只统计生产预检、制品恢复、传输、migration、切换和健康结果。
11. 当前部署历史覆盖 Full、单 unit shadow/activate/rollback 和 Profile promotion：事件追加到生产 `.workspace/deployment-history/deployments.ndjson`，同时保留逐次 JSON 与 `latest.json`。Profile promotion 当前只记录目标范围与本次 promotion duration，没有接入 `publish.sh` 的跨重试 release-process timing；Profile rollback 当前只切回上一 Gateway generation，尚未写部署事件或历史，这是通知/审计缺口，不能描述成已经完整留痕。Operations 不运行定时分析，只在用户要求时按需查询。生产记录按相应事件保存可用的 CNB/source/artifact/Gateway 证据，不创建 GitHub Deployment。

生产基线不可读、不是候选祖先、migration 区间无法证明、manifest 或 artifact hash 不匹配时一律阻断。

## 生产发布

```bash
# 本地冻结候选并校验私有配置；不编译、不运行 E2E
OPS_ENV_FILE=/path/to/private/.env ops/publish.sh prepare

# 在 CNB 验证 base/head affected closure 并冻结制品；也可加 --local
OPS_ENV_FILE=/path/to/private/.env ops/publish.sh validate

# CNB 只消费已验证制品后执行 Full 生产发布
OPS_ENV_FILE=/path/to/private/.env ops/publish.sh deploy

# 本地验证后可直接进入同一部署 adapter，不触发 CNB
OPS_ENV_FILE=/path/to/private/.env ops/publish.sh deploy --direct

# active 单元公开部署并切换公网 Gateway
OPS_ENV_FILE=/path/to/private/.env ops/publish.sh deploy --deploy-unit external

# candidate/active 单元演练只进入 shadow
OPS_ENV_FILE=/path/to/private/.env ops/publish.sh deploy --shadow-unit finance
```

- `--deploy-unit <unitId>` 只接受 deploy graph 中的 `active` 单元，把 `activate` 目标写入受 source/tree 约束的 release metadata，再动态生成本次 CNB injection；入口等待 CNB terminal success 与服务器 Gateway active state 同 SHA/tree 后才报告成功并写模块上线通知。`--shadow-unit <unitId>` 接受 candidate/active 单元，只等待同 SHA/tree 的 `shadow-ready` receipt，不切公网 Gateway，也不写“已上线”通知。私有 CNB 模板始终保持空目标，避免上一次模块残留污染下次发布。
- Library/OCR、Qwen embedding 和 ONLYOFFICE provisioning 采用 source/config digest marker。marker 命中后仍运行轻量版本/文件/健康检查；检查失败、脚本或配置变化时自动回退到完整安装，Qwen 的完整 CPU semantic smoke 仍由首次安装或输入变化触发。
- `config/tenant/profile.json`、其声明的配置文件和受管目录由 `publish.sh deploy` 自动同步；根 `manifest.json` 已退出契约。`--print-command` 只生成 CNB request，不改服务器租户配置。服务器切换前后均按部署时根据实际文件生成的 tenant-config manifest 复验，历史版本保存在 `.workspace.backups/tenant-config/`。
- CNB artifact 进入统一部署器后，必须通过 manifest/digest/migration 校验、互斥锁、PostgreSQL/runtime 备份、不可变 release 目录、PM2 切换、健康检查和回滚。`deployed-release.json` 绑定同一个 runtime/canonical source。
- 已执行 migration 和已写入业务数据不会被后续代码部署自动回退；有持久化变化时，后续 source 必须保持兼容或提供明确的向前修正。

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
gh run list --repo example-owner/example-repo --workflow CI --commit "$bootstrap_sha"
```

确认该精确 SHA 的 `CI / required` 成功后应用并复核保护：

```bash
node scripts/ci/configure-branch-protection.mjs --repo example-owner/example-repo
node scripts/ci/configure-branch-protection.mjs --repo example-owner/example-repo --apply
```

脚本绑定远端当前 main、精确成功 check 和 `github-actions` App，并配置 strict/up-to-date、管理员 enforcement、线性历史、conversation resolution、禁止 force push/delete、无 PR bypass。通用 `required_approving_review_count` 为 0，`require_last_push_approval` 为 false；质量策略路径由 CODEOWNERS 要求 repository-owner 审批 bot-authored PR，不能描述成独立第二人批准。

## 现有生产的一次性接管

当前旧生产没有 `deployed-release.json`，首次受治理发布必须显式提供一次性 receipt，不能伪造历史记录：

```bash
ops/publish.sh deploy \
  --bootstrap-production-base 0a5485a68fbba0298bfe5c2ebdb456f4b140c359 \
  --bootstrap-legacy-cnb-commit 515f986adae2a4bfe9c8ba3901d91765fb9549a7 \
  --bootstrap-legacy-release-id 20260715164825-515f986a \
  --bootstrap-legacy-cnb-build-sn cnb-8gh-1jtif23er \
  --bootstrap-legacy-runtime-version local-1784105165477 \
  --bootstrap-legacy-build-id local-1784105165133
```

入口会验证旧 CNB anchor、release 目录、`current`、Workspace/可选 WeCom PM2 身份、运行版本、BUILD_ID，以及生产 migration 的名称和 checksum 集合。锁内在首次 mutation 前写入 bootstrap marker，并只允许同一 receipt/candidate 续跑。正式记录成功写入后 marker 才会清除；若客户端在正式记录写入后断线，使用普通 `ops/publish.sh deploy` 对账同一 SHA，不要再次传 bootstrap 参数。

CNB 和生产服务器不保存 GitHub token，也不读取 GitHub API、Actions artifact 或 release asset。它们只消费 CNB injection checkout，并在迁移和切换前确认 `deployed-release.json` 没有被并发修改。

## 速度策略、预算与观察

发布提速来自把 source validation/build 与 production deploy 解耦。validate 成功后，CNB deploy 或 direct deploy 都只复验并消费 immutable artifact；服务器不重建。只有 base、source、tree、目标或 digest 变化才需要重新 validate。

历史观测中，一次成功 CNB build 总耗时约 `405.55 s`（约 `6 分 46 秒`）；这是单次历史样本，不是中位数、p95 或当前 SLA。旧 GitHub 串行链路曾观测约 5 分 28 秒。拆分后的预算仍是 C0 约 1 分钟、局部补丁约 2 分钟获得主要反馈、C3 wall time 约 4–5 分钟；CNB 先以低于历史样本为优化方向，达到稳定 p50/p95 前不宣称 3–5 分钟已经实现。

### Stage 1 Builder、缓存与计时契约

- CNB release 使用 `ops/cnb-builder.Dockerfile` 预装 Node 24、ripgrep、PostgreSQL server/client 与 Linux 构建/传输工具；Node 基础镜像按 digest 固定，`.node-version` 与 Dockerfile 同时作为 Builder 版本输入。流水线开始时由 `ops/verify-cnb-builder.sh` 复验 Node 主版本和工具集合，不在每次发布热路径执行 `apt-get`。
- validate 只有在 affected plan 选择 PostgreSQL 或 monolith E2E 时才启动 Builder 内的一次性 cluster；未选中的 lane 不运行。部署 action 只恢复 receipt/artifact，不启动数据库测试环境。
- 仓库模板和 `WORKSPACE_CONFIG_DIR/config/tenant/cnb-release.yml` 都必须通过 `node ops/validate-cnb-release-config.mjs <path>`。校验器只允许一个 `deploy-prod` pipeline 和五个有序、精确命令的 stage，其中 `release-gate` 必须位于依赖安装之后、目标构建之前；要求 npm、Next 和成对的 TypeScript declaration/build-info copy-on-write cache，拒绝额外 pipeline/stage、变体 volume、`node_modules`、standalone tgz 或冷安装工具阶段。
- `server-prod.yaml` 只能由 `deploy-to-server` stage 导入。pipeline、Builder 验证、`npm ci` 和 Next build 均不得接触 SSH key、生产服务器地址或其他部署 secret；构建仅使用固定的非生产 Prisma generation 环境。
- 本地检查缓存不做 source hash 失效：`.next/cache`、`.cache/types`、`.cache/tsbuild`、Playwright 浏览器目录均直接复用；每次入口清理超过 7 天的文件，并在总量超过 12 GiB 时从最旧文件开始回收。缓存完全缺失时仍能完成真实 build/E2E。生产在线状态、artifact digest、版本和健康检查属于实时事实，不能用缓存跳过。
- CNB stage、standalone 组装和服务器部署把无敏感参数的 NDJSON 事件写入 `.cache/release-timing/<source-sha>.ndjson`，日志使用稳定前缀 `WORKSPACE_RELEASE_TIMING`。本地细分阶段在成功、失败或取消时都保留原退出码；远程部署另在租户私有目录保留本次 release 的 `migration.provision`、`candidate.warmup`、`public.cutover` 三段记录，成功后必须同时匹配当前 release、`deploy.remote` scope 和这三个有序 stage 才汇入同一份本地 NDJSON。记录仅包含 release、scope、stage、状态、时间、duration 和退出码；不保存命令、参数或环境。
- `node ops/release-timing.mjs validate --input <file>` 校验记录；`summary` 生成单次 release 摘要。至少收集 10 个生产样本并区分 cold/warm 后，才为下一阶段确定 p50、p95 与 cache-hit 预算。

持续观察各 job 时长、排队时间、缓存命中、Playwright retry/flaky、被取消旧运行、CNB 状态、部署回滚和模块写入覆盖。只有新证据有明确 owner 时，才可以删除旧检查或扩大 C2 快车道。
