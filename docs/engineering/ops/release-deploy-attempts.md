# Deploy attempts and blocker ledger

每次生产 deploy 无论成功、失败或取消，都必须写 run-scoped attempt。它与 [Release CI attempt receipts](./release-ci-attempts.md) 分工明确：CI attempt 记录 Application Ready 之前的 lane；deploy attempt 记录生产 deploy 入口、现场失败和 retry fence。deploy 不得用“再试一次”代替 blocker 分类。

## 私有存储与证据

所有文件位于 Git 忽略的目录：

```text
.cache/release-deploy-attempts/
  admissions/<attempt-id>.json
  attempts/<attempt-id>.json
  classifications/<fingerprint>/<decision-id>.json
  resolutions/<fingerprint>/<resolution-id>.json
  gate-evidence/<fingerprint>/<resolution-id>.json
  <attempt-id>.log
```

日志创建时权限为 `0600`，采集完成后收紧为只读 `0400`；Deploy Preflight 的逐检查日志保持 `0600`。JSON receipt 使用 exclusive-create、内容 digest 和只读 mode，不允许覆盖或原地补字段。receipt 只保存 log path/digest、稳定 command ID、source/controller identity、target/mode、时间和结果；不得保存环境变量、请求头、token、secret-bearing command line 或日志正文。

`publish.sh deploy` 从入口聚合预检开始就生成 admission id。入口检查失败时，所有独立失败与 blocked 依赖同轮写入 immutable admission receipt；真实失败生成稳定 fingerprint，必须分类，blocked 只证明本次请求被既有前置条件拒绝，不制造新的 blocker。通过 retry fence 后进入生产执行器的成功、失败或取消继续写普通 deploy attempt。因此“入口拒绝”和“生产尝试失败”都有独立日志，且不会把 retry fence 自身的正确拒绝递归变成新故障。

retry fence 通过时还会签发绑定 exact target/mode/source/controller 与完整 ledger digest 的 immutable Retry Fence Ready。`publish-cnb.sh --direct` 必须在零写入 preflight 中重新运行 `assert-clear` 并复验该 receipt；没有 receipt、identity 不符或 admission 后 ledger 变化都会在 mutation barrier 前阻断。因此下层 internal CLI 不能仅靠齐全环境变量绕过分类围栏。

生产 deploy 日志必须足以回答：当前阶段、阶段耗时、最慢阶段、failed/blocked 清单、是否越过 mutation barrier、是否执行 rollback、最终 health/version/content/deployment identity。敏感输出不能依赖事后清理；调用命令本身不得打印 secrets。

## Failure fingerprint 与强制分类

失败 attempt 从稳定 command digest、错误类别、exit code 和规范化日志摘要计算 fingerprint。下一次 deploy 前，fingerprint 必须且只能处于以下分类之一：

- `candidate-specific`：只由该 exact content/config/target 候选触发。相同 content 直接重试被禁止；必须形成新候选。若相同 fingerprint 跨 content 候选出现，说明分类错误或存在长期缺陷，升级为 P1。
- `systemic`：发布平台、部署工具、权限、环境合同、manifest/BUILD_ID、tenant config、runtime 或其他会影响未来候选的长期缺陷。没有完整 resolution 时禁止任何候选重试。

未分类 blocker 退出 `43`。分类只允许从 `candidate-specific` 升级为 `systemic`，不能把长期问题降级来放行重试。

## Systemic resolution

systemic blocker 只有同时具备以下四项证据才算关闭：

1. full Git `fixingCommit`，且当前 Application Ready source 或 Controller Ready controller 覆盖该 commit；
2. `fixingCommit` 中真实 tracked 的复现/回归 fixture，不能只给计划、日志或未提交文件；
3. 明确 gate owner：应用/artifact/runtime 合同进入 `application-ready`，deploy-control/锁/远端工具合同进入 `controller-ready`；
4. 对应 gate receipt 的路径、digest 和 mode 证据；resolution 创建时把已验证的真实 Application/Controller Ready 冻结到 gitignored immutable gate-evidence snapshot。每次 retry 都重新校验 snapshot receipt digest、Ready schema/status、内部 digest（如适用）以及 gate commit 确实覆盖 fixing commit，任意普通 JSON 文件不能冒充 gate receipt，证据损坏也不能继续。

仅在生产脚本里临时加文件、chmod、修改 manifest 或延长等待时间，不构成 resolution。关闭后再次出现相同 fingerprint，或 candidate-specific fingerprint 跨候选复发，retry fence 与 patrol 都必须以 P1/退出码 `42` 阻断。

## Retry fence 与 patrol

正式 deploy 入口必须在生成新的 Deploy Preflight Ready 之前执行 retry fence。它检查 exact target/mode/source/controller，并拒绝：

- unclassified failure；
- 同一 candidate-specific content 的重试；
- unresolved systemic failure；
- 当前 Application/Controller gate 尚未包含 fixing commit；
- fixture 或 gate receipt 证据损坏；
- 已解决或误分类 blocker 复发。

只读查看和巡检入口：

```bash
node ops/release/attempts/deploy-blocker.mjs status \
  --root .cache/release-deploy-attempts

node ops/release/attempts/patrol.mjs \
  --ci-root .cache/release-attempts \
  --deploy-root .cache/release-deploy-attempts
```

Ops 应定期运行合并 patrol，同时观察 CI 与 deploy 历史。`0` 表示没有未关闭/复发 blocker；`42` 表示 P1 recurrence；其他非零表示未分类、未解决或证据损坏。Patrol 只读，不修改 receipt，也不自动重试部署。

## 与 Deploy Preflight Ready 的关系

blocker ledger 决定“是否允许尝试下一次 deploy”；Deploy Preflight Ready 证明“这一次 exact candidate/controller/deploy input/production snapshot 的所有锁前检查是否已一次报全并通过”。顺序固定为：

```text
retry fence clear
  -> zero-write aggregate preflight
  -> immutable Deploy Preflight Ready
  -> shared lock + semantic recheck
  -> mutation barrier
```

二者都必须接入正式 `publish.sh deploy` 路径才能算完成。仅有 contract module、CLI 或单元测试，尚不能证明生产入口已执行 retry fence、签发并复验 Deploy Preflight Ready；这部分必须由 publish/deploy contract fixture 和端到端 dry fixture 验收。

## 小改实验回执

发布改造合并并成功建立生产 baseline 后，连续 2 次、必要时第 3 次小改部署的每份 attempt 都应额外关联：Application/Controller/Deploy Preflight Ready digest、task reused/pending 数、compiler-cache hit/miss reason、artifact/rehearsal 时间、锁等待、mutation/cutover 和最终 acceptance。实验必须没有手工现场修复、没有 deploy 中途逐错失败、没有重复长期 blocker；否则从修复后的新 baseline 重新计算连续成功次数。
