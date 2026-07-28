# Deploy Unit Graph

Workspace 的 TypeScript project references 是编译图，不是部署图。部署图由 `scripts/deploy/deploy-unit-spec.ts` 与 `scripts/deploy/deploy-graph.ts` 共同形成：前者只保存无法推导的运行时分组，后者消费现有事实源并生成可验证的完整拓扑。

## Source of truth

| Fact | Owner |
|---|---|
| L1、页面、API、resource | `packages/platform/module-registry.ts` |
| Core -> Platform -> domain 编译闭包 | 各 `tsconfig.json` project references |
| 变更路径与 E2E 选择 | `scripts/testing/module-impact-map.json` |
| deploy unit 分组、目标 app root、进程、端口、asset prefix、冻结状态 | `scripts/deploy/deploy-unit-spec.ts` |
| migration、resource seed、data release 的唯一 owner | Workspace control-plane job |

部署配置不得复制页面或 API 清单。resolver 会从 registry 推导这些字段，并在以下情况 fail closed：

- registry 或 impact module 没有且只有一个 deploy unit owner；
- 两个 unit 的页面、API 或 asset prefix 重叠；
- 端口或 asset prefix 重复；
- TypeScript 引用指向不存在的工程；
- candidate/active unit 的 app root 不存在；
- candidate/active unit 尚未分配内存和数据库连接池预算；
- candidate/active unit 仍直接 bundle 另一个 deploy unit 的 package contributor；
- blue/green 任一内部端口与其他 unit 冲突。

## Current state

当前 12 个目标运行单元的源码级跨 unit contributor 为 0，且代码侧成熟度全部为 `active`，因此每个 unit 都可以走正式公开激活协议。这份图和 12 份 standalone build 只证明构建边界与公开激活资格，不证明生产 Gateway 当前已经为任一 unit 建立独立路由；线上事实必须读取生产 `current` Gateway generation 与对应 active-state receipt。成熟度语义仍然是：

- `planned`：只有目标拓扑，不能构建独立 artifact；
- `candidate`：已有独立 app、容量预算且 contributor 清零，可以 shadow build/start，但不进入 Gateway；
- `active`：除 candidate 条件外，代码侧允许走公开激活协议；实际进入 Gateway route-map 仍必须由生产部署生成完整 active state 并原子提交 generation。

目标运行单元包括：

- Workspace Shell：root、login、portal、settings、auth、system；
- 9 个 domain L1：Finance、External、Inventory、Production、HR、Library、Capital Securities、Work、Administration；
- Docs platform L1；
- Assistant/Integrations headless runtime：API-only Next standalone 加同制品 WeCom sidecar。

Capital Securities、Work、Administration 已在相邻任务明确停更、交接 owned diff 后作为最终波次完成，不再标记为冻结。Core 与 Platform 是所有 unit 的共享编译输入；它们不是可部署运行时。Portal、Settings、Auth 和 System 壳由可独立部署的 `workspace-shell` 承担，所以“剩余 Core”不是隐含单体，而是明确的 Shell runtime。

源码 contributor 清零不代表运行时依赖消失。deploy graph 还显式记录 `required` / `optional` 的 Gateway HTTP 或签名内部 RPC：例如 Workspace Shell 的账户通知/首选项目和 Finance 的经营分析权限都通过签名内部 RPC 依赖 Work，Work 的绩效和经营分析分别进入 HR/Finance，Assistant 对 Finance/HR/Library/Work 的领域工具是可降级依赖。部署 Profile 必须包含全部 required closure；optional 能力缺失会显示为降级状态，不能被误报成完整部署。

每个 unit 的 typecheck scope 和候选 E2E suites 由编译图及 impact rules 推导；未命中的变更始终 fail closed。所有 active unit 均已分配内存与数据库连接池；planned 单元可以保留未分配值，active 禁止。蓝绿期间按两份实例预算，不能用单实例连接数估算总数据库容量。

应用部署必须使用 `CONTROL_PLANE_POLICY=require-existing`：只消费与 artifact 完全匹配的 lifecycle receipt，缺失或漂移时直接失败。单 unit 发布不得安装或切换中央租户配置，只复用 receipt 已提交的配置；私有租户配置有变更时，先运行中央 lifecycle 或 Full 发布提交新 receipt，再发布应用 unit。中央 lifecycle job 使用 `refresh`；当前过渡期整站发布使用默认 `auto`，已有匹配 receipt 时同样跳过所有全局 mutation。

Full 与 unit 可以渐进共存：deploy graph 中 `active` 表示该 unit 已获准独立部署，不表示生产必须已经存在它的 state。Gateway 只为已有且校验通过的 active state 生成独立路由；尚未部署的 active unit 继续由 legacy Full fallback 承担。显式 rollout 的目标 state 缺失、损坏或身份不一致时仍必须 fail closed。

中央 lifecycle 的显式入口是 `ops/deploy-control-plane.sh`。它复用同一套锁、备份、maintenance fencing 和 receipt 实现，但不安装 Library/Assistant/OnlyOffice runtime，不启动应用 unit，不切换 `current`，也不发送应用发布通知。当前仍消费完整 standalone artifact；专用 control-plane artifact 仍是后续瘦身项，不能把 requirements manifest 误称为可部署 artifact。

## Generated Next apps

根 `app/`、module registry 与 deploy graph 是路由 ownership 的事实源；`apps/<unit>/` 是生成的独立 Next App 镜像，不允许手工维护第二份 route/config。registry、根 App route、编译闭包或 navigation ownership 变化后，必须重生成受影响 unit，并提交生成器删除的旧 wrapper 与更新后的 config：

```bash
# 写入受影响 unit 的生成镜像；不带 --write 时只核对该 unit
npm run deploy:unit:app -- --unit finance --write
npm run deploy:unit:app -- --unit finance

# 核对仓库中全部现存生成 App；逐字比较并拒绝 stale wrapper
npm run deploy:apps:check
```

`next-env.d.ts` 与 `.next/` 属于忽略的 Next 运行产物；其余生成 wrapper、`next.config.ts`、`instrumentation.ts` 和 `tsconfig.json` 受版本控制。`deploy:apps:check` 在缺失时会补出忽略的 `next-env.d.ts`，然后校验所有现存生成 App；它不替代 deploy graph、typecheck 或 production build。

## Unit release protocol

每个 Web unit 使用两个固定、只监听 loopback 的生产槽位。3200–3211 是 blue，3300–3311 是 green；本地开发仍只使用全机唯一 3000。`scripts/deploy/render-deploy-unit-contract.ts` 从 deploy graph 派生单元 contract，build/deploy shell 不维护第二份路由或 package 清单。

独立制品通过 `ops/build-deploy-unit-artifact.sh` 构建，必须满足：

- source SHA/tree 是当前提交或精确 CNB injection 的父提交；
- production artifact 在 Linux 构建，并先走对应 `typecheck:scope`；
- 每个独立 Next app 也有 `app-<unit>` 受治理 scope；unit builder 必须先完成图中全部 package/App scopes，生成的 Next config 才关闭 Next 内部那次对 project references 支持不完整的重复类型检查；
- Next `buildId` 与 `deploymentId` 相同，artifact、manifest、contract 和 graph digest 精确绑定；
- artifact 声明所需 migration、resource manifest、data-release set 和 lifecycle tool-set digest；
- 冻结、planned、容量/SLO 未分配或仍有 contributor 的 unit 直接失败。
- builder 为每个 unit 生成 CycloneDX SBOM；Profile/Fleet 晋级还要求 Ed25519 provenance，把 artifact、manifest、SBOM、source、graph 和 builder identity 绑定到受信公钥。

正式单 unit 发布必须先运行 `OPS_ENV_FILE=/path/to/private/.env ops/publish.sh prepare --deploy-unit <unit>`；shadow 使用同 unit 的 `--shadow-unit` prepare。该入口与 Full 一样只接受干净 committed release worktree，并保留共享 static/Node/data、一次性 PostgreSQL migration/seed 证据；编译范围由 deploy graph 的 package + `app-<unit>` closure 派生，production build 使用 `.cache/next-units/<unit>`，浏览器只运行 unit contract 声明的 suite，并直接启动刚生成的目标 artifact。成功回执位于 `.cache/release-check/units/<unit>.json`，绑定 source、tree、unit、contract、graph、artifact 与嵌套 unit-CI 证据；Full、不同 unit 和 target 不得交叉复用。随后 `deploy --deploy-unit <unit>` 或 `deploy --shadow-unit <unit>` 只消费相同目标的回执。

服务器先把 release 启动在非活动槽，通过 unit health/version，再写 `shadow-ready` receipt。`activate` 会生成新的 Gateway generation；这一代同时包含完整 deploy graph、route-map、全部 active unit state 和 Nginx include。`current` generation symlink 是多 unit 路由提交点，切换顺序固定为：

1. 校验 artifact 与当前 tenant/control-plane floor；
2. 启动 inactive slot 并验证 health/version；
3. 写 immutable receipt，生成 proposed unit state；
4. 生成并校验完整 Gateway generation；
5. 原子替换 Gateway symlink，执行 `nginx -t` 和 reload；
6. reload 成功后停止旧槽。失败则恢复上一 symlink/site 并清理未提交进程。

Full 发布是独立的收敛动作：monolith 版本检查通过并原子切换 `current` release 后，部署器生成仅含 fallback、`activeUnits=[]` 且无独立 routes 的不可变 Gateway generation，再原子切换 Nginx。Full 成功因此会撤销此前所有单 unit/Profile 公网 override；后续独立发布必须重新显式建立 active state，不能沿用旧 generation。

`rollback` 从 current generation 读取 `previous` release，先重启旧槽、复验 control-plane compatibility，再生成一代反向 state 并切 Gateway；不重跑 migration，也不重建 artifact。当前兼容策略是 exact lifecycle floor，安全但偏保守：任何 global lifecycle digest 变化都可能阻断旧 artifact 回滚，未来只有引入版本化 expand/contract compatibility receipt 后才可放宽。

生产 client `ops/deploy-unit.sh deploy` 只接受 `DEPLOY_UNIT_TRUSTED_BUILD=1`，这个标志只能由正式 CNB unit release job 提供。本地 shell 不能把未受信 artifact 直传生产。所有 active unit 都可以按 receipt 做正式单元 activate/rollback；多单元 Profile 仍必须满足签名 RPC 依赖闭包后原子晋级。

### Signed internal RPC identity

签名内部 RPC 不复用 `NEXTAUTH_SECRET`，也不把 caller 私钥写进共享 `.workspace/.env`。服务器部署器在持有 deploy lock 时调用 `ops/internal-unit-identity.mjs`：每个 unit 首次部署会先写入不含私钥的 pending 登记，再在 `$REMOTE_DIR/.workspace/internal-unit-identities/private/<unit>.pem` 原子创建一把持久 Ed25519 私钥，并把对应公钥合并到 `$REMOTE_DIR/.workspace/internal-unit-identities/trusted-public-keys.json`；进程在两步间中断时，下次部署只会依据匹配的 pending 公钥恢复，无法证明来源的 orphan 私钥仍 fail closed。目录权限固定为 `0700`，私钥和注册表固定为 `0600`；注册表协议是 `schemaVersion: 1`、`kind: workspace-internal-trusted-public-keys` 和按 unit ID 索引的 PEM `keys`。每个接收 unit 另有独立 `replay/<unit>` 目录，以原子排他文件消费 `caller + audience + keyId + requestId`，过期 claim 在启动和运行期间清理。

每次启动 Next 主进程和 Assistant sidecar 时，`apply-deploy-unit.sh` 都明确覆盖并注入以下运行态身份，不能从共享 `.env` 推断 caller：

- `WORKSPACE_DEPLOY_UNIT_ID`：当前 deploy unit；
- `WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE`：仅当前 unit 的私钥路径；
- `WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE`：同机可信公钥注册表路径。
- `WORKSPACE_INTERNAL_REPLAY_DIRECTORY`：当前接收 unit 的持久 replay ledger。

签名内部 RPC 的请求 origin 按 `WORKSPACE_INTERNAL_ORIGIN`、生产 `WORKSPACE_PUBLIC_ORIGIN`、本地 loopback 的顺序解析。生产默认必须经过当前受管 Gateway，才能把已激活 unit 的 API 前缀路由给真实 owner；deploy-unit 进程也会把现有 `WORKSPACE_PUBLIC_ORIGIN` 注入为默认内部 origin。不能把裸 `http://127.0.0.1` 当作生产 Gateway：启用 Host-based Nginx vhost 时它可能在签名请求到达 Workspace 前被默认站点直接拒绝。

重复部署复用原私钥，不产生身份漂移。部署器每次校验注册表与全部私钥是同一完整集合且逐项匹配；只要已有任意私钥，注册表缺失、缺项、多项或密钥不匹配都会 fail closed。恢复必须从同一恢复点还原完整 `internal-unit-identities` 目录，不能靠部署当前 unit 静默重建。当前协议不提供隐式轮换，正式轮换必须另做带双公钥过渡、依赖方观测和回收旧钥的运维流程。

Ed25519 在应用层提供 caller provenance、防误路由和防请求篡改，不自动把同一 Unix UID 下的进程变成互不信任的安全域。当前共享 PM2 用户可以读取统一私钥目录，因此不能宣称“某个 unit 被攻陷后仍无法冒充另一个 unit”。这一限制不再阻断正式单元发布或满足依赖闭包的 Profile promotion，但它是明确的剩余安全边界；后续运维仍应实现独立 OS identity/容器、单钥挂载和可验证的进程/密钥 owner 证据，并在完成隔离时显式轮换共享 UID 阶段生成的全部私钥。

协议 v2 不兼容旧 artifact 的共享 HMAC。参与 `signed-internal-rpc` 的 unit 可以按正式 receipt 直接 `activate` 或 rollback；多单元 Profile promotion 必须包含签名依赖图的完整双向闭包并一次切换 Gateway，Profile rollback 则用 promotion receipt 整代回退。上传 graph 的 canonical SHA-256 必须同时匹配受摘要保护的 Profile 和 promotion，不能用缺边旧图绕过闭包判断。当前 guard 对后续 v2 内升级也保持同样的保守闭包，直到部署 contract 能证明协议代际兼容。monolith 开发态仍可使用 legacy HMAC，但 deploy-unit receiver 不接受降级。

```bash
# 查看某一 unit 的派生 contract
npm run deploy:unit:contract -- --unit finance

# CNB Linux build job 内构建候选 artifact
npm run deploy:unit:build -- finance

# CNB deploy stage 内可选择 shadow 演练或对任一 active unit 正式切流
DEPLOY_UNIT_TRUSTED_BUILD=1 npm run deploy:unit -- finance shadow

# 多单元联合发布通过下方 Profile prepare/promote/rollback 保持依赖闭包
```

## Navigation and assets

Workspace Shell 是默认 zone，不设置 `assetPrefix`。每个非默认 Next zone 使用唯一的 `/workspace-static/<unit>` 前缀。跨 zone 导航必须执行 hard navigation，不能把普通 `next/link` 的软导航语义带过边界。Gateway 必须同时路由页面、API 和每个 zone 的 asset prefix。

Root layout、root redirect、Portal 与 module-disabled 页面由 impact map 的 `shell` scope 显式拥有；它们不再作为“没有匹配到任何模块”的隐式全仓变更处理。

构建器会从完整 deploy graph 生成只包含 unit ID 与页面前缀的公开 navigation manifest，并连同 `NEXT_PUBLIC_DEPLOY_UNIT_ID` 注入每个独立 Next artifact。Core routing primitive 不维护业务模块表：同 unit 使用 Next 客户端导航，不同 unit 或无法分类的目标通过 `/workspace` Gateway hard navigation。当前单体没有 deploy-unit identity，因此迁移窗口内继续保持原有软导航；headless Assistant 不声明页面路由。

## Check

```bash
npm run deploy:graph:check
npm run deploy:graph:print

# CI/本地自动选择 L1 及其反向消费者；环境值来自可信 diff classifier
WORKSPACE_CHANGED_FILES_JSON='["packages/external/server/service.ts"]' npm run typecheck:affected

# 只生成受影响制品计划；加 --execute 的受治理入口由 CI 调用
WORKSPACE_CHANGED_FILES_JSON='["packages/finance/server/ledger.ts"]' npm run deploy:affected:plan
```

CI 的非 E2E、非整站发布候选不再默认构建单体：它先生成受影响计划，再通过 `deploy:affected:build` 顺序构建受影响 unit artifact。Finance 私有变化只选择 Finance；Core、Platform、schema、lockfile、部署协议或未知代码路径会 fail closed 到 12 个 unit。E2E 仍需当前 canonical monolith artifact 的过渡车道，直到生产 Gateway 切换完成。

## Deployment profiles and fleet operations

Stage 3 只提供有限 catalog，不接受任意组合：

- `full@1`：12 个 unit；
- `finance-focused@1`：Workspace Shell、Finance、HR、Work、Library、Docs、Assistant。

`npm run deploy:profile -- --profile finance-focused` 会解析精确 unit/module/runtime dependency、容量和 SLO contract。`deploy:profile:rollout` 再根据可信 changed-files 产生增量 rollout。普通 Gateway HTTP 依赖仍可增量切换；只要 rollout 触及签名 RPC 参与者，规划器会在构建/prepare 前扩展完整无向依赖闭包，所选 Profile 缺成员时立即要求改用完整 Profile，不能等到 promotion 才失败。服务器 promotion guard 会再次验证同一闭包。Profile release set 可以包含不同 source SHA 的既有与新 unit artifact，但所有成员必须使用同一 deploy graph/control-plane floor，并逐个通过受信 SBOM/签名验证。

Fleet 晋级顺序固定为：兼容 control-plane floor → 构建和签名目标 unit → 组装精确 Profile release set → 启动 inactive slots → 依赖探针 → 达到每 unit canary/SLO 与 DR evidence → 一次 Gateway generation 原子切换 → 保留上一 generation。`ops/promote-deploy-profile.sh` 只接受通过的 observation result 和精确 proposed state set；`ops/rollback-deploy-profile.sh` 根据不可变 promotion receipt 切回上一 generation，不重跑 migration。

`prepare` 只启动 rollout 目标的 inactive slot，把 proposed state 写入 rollout digest 隔离的远端目录，不切换 Gateway。远程 `promote` 会把 profile、release set、rollout、observation 和 deploy graph 五份精确输入按联合摘要隔离上传，在服务器锁内复验后一次提交 Gateway generation；`rollback` 同样持有 deploy lock，并拒绝 current generation 已变化的陈旧 receipt。

```bash
# 可信发布环境：准备 inactive slots，输出 prepared state root
DEPLOY_UNIT_TRUSTED_BUILD=1 npm run deploy:fleet:prepare -- \
  <profile.json> <release.json> <rollout.json> <artifact-root>

# 客户端上传五份精确证据，服务器原子晋级
DEPLOY_UNIT_TRUSTED_BUILD=1 npm run deploy:fleet:promote -- \
  <profile.json> <release.json> <rollout.json> <observation.json> \
  <deploy-graph.json> <remote-prepared-state-root>

# 运维显式回滚；陈旧 receipt 会被拒绝
DEPLOY_UNIT_TRUSTED_BUILD=1 npm run deploy:fleet:rollback -- <promotion.receipt.json>
```

每个 unit 的 contract 包含 availability、p95 latency、最大错误率、canary 观察窗口、RTO、RPO；Profile observation 还要求 control-plane receipt/tenant config 已复制、可恢复备份不超过 RPO、90 天内有 restore drill。`npm run deploy:fleet:status -- inspect ...` 检查 Gateway active set 是否与 Profile 精确收敛。

这些入口已经完成本地 contract、12-unit Gateway 原子切换和单 Finance failure-isolation/rollback drill；代码侧 12 个 unit 全部允许进入公开激活协议。是否已有生产独立路由不能从 maturity 推断，必须以生产 Gateway generation/receipt 为准。
