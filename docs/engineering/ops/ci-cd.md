# CI/CD 与测试分级

本文是 Workspace 合并和生产发布的执行真源。目标不是每次提交都跑全量，而是让风险判断可复现、未知变更默认从严，并让静态 gate、Node、PostgreSQL、build 与浏览器 E2E 各自给出独立证据。

## 质量边界

- 分类器读取完整 base..head diff，不读取提交信息，也不把代码里的“纯文案”当成可证明的文案变更。
- 条件 job 只有在分类器明确允许时才能跳过；`CI / required` 会同时校验应成功和应跳过的 job。
- 分类器、CI runner、Playwright runner、影响映射、公开 contract 或测试删除本身都按 C3 处理。
- 启用分支保护后，受保护 `main` 的精确 `CI / required`（GitHub Actions App）仍是 GitHub 合并门禁，但不参与生产发布判定。
- 生产门禁在本地对当前 Git tree 实际执行目标对应的 production build 和 Playwright E2E：Full 构建 canonical monolith 并运行全部已注册 E2E；单 unit 使用 deploy graph 的完整 compiler closure 构建独立 artifact，并只运行该 unit contract 声明的 E2E。两者都要求干净 committed release worktree、共享静态/Node/PostgreSQL 证据和目标绑定回执。门禁不读取 GitHub 状态，也不把缓存当作旧的“通过结果”。CNB 从该 source parent 在 Linux 重建相同目标制品；服务器不从源码重建。

## 风险等级

| 等级 | 可证明范围 | 必需证据 |
|---|---|---|
| C0 文档 | 根目录约定文档、`docs/**/*.md(x)`、文本说明、模块内约定文档和 GitHub 模板；不包含 `.ts/.tsx` 中的文案，也不包含 `docs/generated/**` | dependency-free migration marker 与架构文档一致性、聚合门禁；不安装依赖，不跑 Node test、type、PostgreSQL、build、E2E，不生产运行包 |
| C1 展示补丁 | 仅业务模块 `packages/<module>/ui/**` 下的 CSS、字体、图像等展示资源；不得涉及 Core、Platform、`app/`、`public/` 或代码 | PR 只做分类与聚合，main 发布候选才补 production build；不跑 static、Node、type、PostgreSQL 或 E2E。影响映射明确降到 C1 的代码仍跑 static、全部 Node 和 affected type，但普通 PR 不跑 build |
| C2 已覆盖改动 | 受信任影响映射中有明确只读或写入覆盖的标准单模块改动 | static/changed lint、全部 Node、affected type 和 build；server/write 加 PostgreSQL；存在映射 suite 时运行目标 E2E |
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
├── static       C0 无依赖 docs/migration policy；代码变更跑 lint / architecture / contracts
├── node         packages / scripts / app / ops 的 Node 测试
├── type         展示资源 C1 跳过；映射代码 C1/C2 affected；仅 C3/显式全量 full
├── PostgreSQL   C2 server/write 或 C3：migration / seed / integration
└── build        无 E2E/整站发布时按 deploy graph 构建受影响 unit；其余过渡车道构建 canonical monolith tgz
      └── E2E    C2 映射 suite 或 C3：下载并启动同一个 canonical tgz

所有预期结果 -> CI / required

production Full: local monolith build + full E2E -> CNB release injection -> Linux build -> artifact validation -> production
production unit: local graph-scoped build + unit E2E -> target-bound receipt -> CNB release injection -> Linux build -> artifact validation -> production
```

同一 event + 稳定 ref（或同一 PR）的连续 push/触发会取消旧 CI，只保留最新 SHA 的运行。候选过程固定复用 `codex/staging-main`、`codex/candidate-main` 和同一个 bot PR，因此第二次 push 会更新同一 ref/PR 并取消旧候选 CI。不同 PR、main push 与手工任务不会互相取消。已经进入生产 backup/migration/switch 临界区的部署不使用这组可取消 concurrency；服务器互斥锁保证一次只有一个部署。

缓存只加速输入：npm 下载、project-reference 的 `.cache/types` + `.cache/tsbuild`、Full 的 `.next/cache`、按 unit 隔离的 `.cache/next-units/<unit>` 和 Playwright 浏览器。发布前本地缓存不按 source hash 主动失效，默认保留最多 7 天并受 12 GiB 总量上限约束；超限时优先删除最旧文件。缓存不能替代当次 build/E2E 执行，也不能缓存“通过结论”。Full 回执固定写入 `.cache/release-check/local-release-gate.json`，单 unit 回执固定写入 `.cache/release-check/units/<unit>.json`；不同 scope 即使 source/tree 相同也不能交叉复用。PostgreSQL lane 运行时，schema/migration contract 由它唯一负责，static 不再重复；standalone tgz 是带 manifest/digest 的发布 artifact，不是普通构建缓存。

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

1. pre-commit 只检查 staged/changed 范围，不隐式运行全库 TypeScript；日常 changed/refactor/quick/push 同样不自动运行 TypeScript。普通局部改动不另跑类型检查；需要诊断时，单模块显式使用 `npm run typecheck:scope -- <package>`，多直接工程使用 `typecheck:quick`，CI/发布才使用 `typecheck:full`。hook 和 `npm run check:ci` 可执行入口都会先按 `.node-version` 自动选择 Node，并把一般运行时临时目录固定到工作区 `.cache/runtime-tmp`。TypeScript 检查通过受锁 runner 加载编译器，不启动 `tsx` CLI IPC server。显式设置 `PRE_COMMIT_FULL=1` 会运行全量并为 staged tree 写入发布可复用通过记录。
2. Git 跟踪的 `ops/publish.sh push`（桌面私有目录只保留加载 `.env` 的薄 wrapper）以 `origin/main..HEAD` 运行自适应本地 gate，把 staging SHA 交给受信任的 `Promote candidate` workflow；workflow 创建或更新同一个 bot-authored candidate PR，并在精确 SHA 上显式触发 CI，不直推 `main` 或 CNB。
3. 对命中 CODEOWNERS 的质量策略路径，由 repository owner 审批 bot-authored PR；这解决单 owner 对自己所开 PR 无法批准的问题，但不虚构“独立第二人”审查。旧批准会在后续 push 后失效；配置未要求通用批准数或 last-push 第二人批准。
4. PR/merge-group 按受保护 base 分类并由 `CI / required` 聚合。GitHub Actions 在无 E2E/整站发布请求时上传受影响 unit artifacts；需要 E2E 或整站 artifact 时上传 canonical monolith，并只在同一 CI run 内交给 E2E。这些 CI artifacts 不发布 prerelease，也不参与生产部署。
5. `publish.sh prepare` 是正式发布前唯一的本地诊断入口。它先快进专用 `release` worktree，立即校验私有 CNB YAML 与租户运行配置，并要求候选是干净 committed tree。无目标参数时执行 Full：collect-all `check:ci`、monolith production standalone、一次性 PostgreSQL migration/seed 和全量 E2E，生成 schema-v2 Full 回执。`prepare --deploy-unit <unit>` 或 `prepare --shadow-unit <unit>` 执行单 unit：共享 release static/Node/data 证据、deploy graph 声明的全部 package 与 `app-<unit>` 类型 scope、隔离 `.cache/next-units/<unit>` 的独立 production artifact、一次性 PostgreSQL migration/seed，以及该 unit contract 声明的浏览器 suite，生成 schema-v3 unit 回执。相同 source/tree/scope 的有效回执可直接复用；scope、unit、contract、graph 或 artifact digest 不匹配时 fail closed。该命令不连接 CNB 或生产。
6. `publish.sh deploy` 是 Full/单 unit 的唯一生产 operator 入口；Profile/Fleet 只经受信内部入口运行。它不再快进候选，而是校验并冻结使用现有的干净 release HEAD；即使 `prepare` 后 main 又有提交，本次 deploy 仍只消费已 prepare 候选的精确回执。Full deploy 只接受 Full 回执，`deploy --deploy-unit <unit>` / `deploy --shadow-unit <unit>` 只接受相同 unit 的回执；回执缺失、过期、目标不匹配或 release HEAD 被人工移动时立即退出并要求重新执行对应 prepare。廉价私有配置校验、回执验证、计时和 CNB 子流程均从冻结 release tree 执行，避免两步之间的 main 脚本串入发布协议。deploy 不运行 production build、typecheck、Node test 或 E2E，CNB 不承担代码诊断。
7. Git 跟踪的 `ops/cnb-release.yml` 只定义可复用流水线形状；租户实际的 CNB env import、服务器目录和健康检查地址由 `WORKSPACE_CONFIG_DIR/config/tenant/cnb-release.yml` 管理。发布脚本读取并校验该租户文件；`cnb-release` 注入提交只能增加 `.cnb.yml` 与 `.cnb-release.json`，其唯一 parent 必须是 source SHA。
8. CNB 在 injection checkout 中恢复或安装依赖，并按 release metadata 构建 Full canonical standalone 或单 unit artifact。packager 绑定 parent source SHA/tree、目标、BUILD_ID、contract/graph，生成 manifest/tgz；统一部署器在上传前校验 manifest、artifact hash、migration set 和注入身份，全程不访问 GitHub。
9. 发布顺序以 CNB checkout 的 Git ancestry 与服务器 `deployed-release.json` 为准。candidate 必须是 bootstrap baseline 或已部署 source 的后代，同 source 是 no-op，回退或分叉直接阻断。
10. `publish.sh` 在专用 release worktree 维护跨失败重试的流程计时会话。单次部署尝试从 prepare 回执和本地廉价 preflight 通过后开始，经过只读生产预检、CNB 构建、传输和切换，直到成功、失败或取消；三种结果都会写服务器 Bot 事件和部署历史。完整 CI/E2E 属于 `prepare`，不计入 deploy 尝试，也不能因部署重试而重复执行。
11. 当前部署历史覆盖 Full、单 unit shadow/activate/rollback 和 Profile promotion：事件追加到生产 `.workspace/deployment-history/deployments.ndjson`，同时保留逐次 JSON 与 `latest.json`。Profile promotion 当前只记录目标范围与本次 promotion duration，没有接入 `publish.sh` 的跨重试 release-process timing；Profile rollback 当前只切回上一 Gateway generation，尚未写部署事件或历史，这是通知/审计缺口，不能描述成已经完整留痕。Operations 不运行定时分析，只在用户要求时按需查询。生产记录按相应事件保存可用的 CNB/source/artifact/Gateway 证据，不创建 GitHub Deployment。

生产基线不可读、不是候选祖先、migration 区间无法证明、manifest 或 artifact hash 不匹配时一律阻断。

## 生产发布

```bash
# 本地一次性发现全部 CI/编译/E2E 问题并写入当前 tree 回执；不连接 CNB/生产
OPS_ENV_FILE=/path/to/private/.env ops/publish.sh prepare

# 单 unit 使用 graph compiler closure、独立 build cache 和目标 E2E 写入隔离回执
OPS_ENV_FILE=/path/to/private/.env ops/publish.sh prepare --deploy-unit external

# 只消费已通过的 prepare 回执并执行生产发布
OPS_ENV_FILE=/path/to/private/.env ops/publish.sh deploy

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

发布提速来自删除 GitHub promotion/remote CI/artifact 等待、合并重复门禁，并复用本地编译与浏览器缓存。artifact cache 未命中时，CNB 仍必须在 Linux 构建一次本次目标（Full monolith 或独立 unit）；服务器不重建。

历史观测中，一次成功 CNB build 总耗时约 `405.55 s`（约 `6 分 46 秒`）；这是单次历史样本，不是中位数、p95 或当前 SLA。旧 GitHub 串行链路曾观测约 5 分 28 秒。拆分后的预算仍是 C0 约 1 分钟、局部补丁约 2 分钟获得主要反馈、C3 wall time 约 4–5 分钟；CNB 先以低于历史样本为优化方向，达到稳定 p50/p95 前不宣称 3–5 分钟已经实现。

### Stage 1 Builder、缓存与计时契约

- CNB release 使用 `ops/cnb-builder.Dockerfile` 预装 Node 24 与 Linux 构建/传输工具；Node 基础镜像按 digest 固定，`.node-version` 与 Dockerfile 同时作为 Builder 版本输入。流水线开始时由 `ops/verify-cnb-builder.sh` 复验 Node 主版本和工具集合，不在每次发布热路径执行 `apt-get`。
- 仓库模板和 `WORKSPACE_CONFIG_DIR/config/tenant/cnb-release.yml` 都必须通过 `node ops/validate-cnb-release-config.mjs <path>`。校验器只允许一个 `deploy-prod` pipeline 和四个有序、精确命令的 stage，要求 npm、Next 和成对的 TypeScript declaration/build-info copy-on-write cache，拒绝额外 pipeline/stage、变体 volume、`node_modules`、standalone tgz 或冷安装工具阶段。
- `server-prod.yaml` 只能由 `deploy-to-server` stage 导入。pipeline、Builder 验证、`npm ci` 和 Next build 均不得接触 SSH key、生产服务器地址或其他部署 secret；构建仅使用固定的非生产 Prisma generation 环境。
- 本地检查缓存不做 source hash 失效：`.next/cache`、`.cache/types`、`.cache/tsbuild`、Playwright 浏览器目录均直接复用；每次入口清理超过 7 天的文件，并在总量超过 12 GiB 时从最旧文件开始回收。缓存完全缺失时仍能完成真实 build/E2E。生产在线状态、artifact digest、版本和健康检查属于实时事实，不能用缓存跳过。
- CNB stage、standalone 组装和服务器部署把无敏感参数的 NDJSON 事件写入 `.cache/release-timing/<source-sha>.ndjson`，日志使用稳定前缀 `WORKSPACE_RELEASE_TIMING`。本地细分阶段在成功、失败或取消时都保留原退出码；远程部署另在租户私有目录保留本次 release 的 `migration.provision`、`candidate.warmup`、`public.cutover` 三段记录，成功后必须同时匹配当前 release、`deploy.remote` scope 和这三个有序 stage 才汇入同一份本地 NDJSON。记录仅包含 release、scope、stage、状态、时间、duration 和退出码；不保存命令、参数或环境。
- `node ops/release-timing.mjs validate --input <file>` 校验记录；`summary` 生成单次 release 摘要。至少收集 10 个生产样本并区分 cold/warm 后，才为下一阶段确定 p50、p95 与 cache-hit 预算。

持续观察各 job 时长、排队时间、缓存命中、Playwright retry/flaky、被取消旧运行、CNB 状态、部署回滚和模块写入覆盖。只有新证据有明确 owner 时，才可以删除旧检查或扩大 C2 快车道。
