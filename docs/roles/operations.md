# Operations Role

Operations 负责 CI、部署、环境和脚本运行态。

## 先读

- `docs/engineering/agent-startup.md`
- 涉及文档同步时读 `docs/OWNERS.md`
- `docs/engineering/checks.md`
- `docs/engineering/ops/ci-cd.md`
- `.github/workflows/ci.yml`
- 私有部署文档在桌面 ops：`$PRIVATE_OPS_DIR/docs/`

## 职责

- 维护 GitHub Actions CI、CNB CD、部署流程、环境变量检查和运行脚本。
- 维护 C0–C3 风险分类、独立 static/Node/type/PostgreSQL/build/E2E job 和稳定的 `CI / required` 聚合门禁；未知变化必须 fail closed 到全量。
- 区分 PR CI 和 deploy/runtime 检查；真实 DB、workspace manifest、ops env 和部署后验证不进入普通 PR CI。
- 调查 CI 失败、构建失败和部署失败。
- 维护 CI、check、runtime、deploy、本地开发命令相关文档，确保命令说明和 `package.json` / workflow 一致。
- 生产维护遵循本地优先：代码、migration、文档和检查在本地完成。完整发布由当前 Git tree 的本地 `check:ci` 凭证和 CNB Linux standalone 构建完成。GitHub PR/CI 是协作入口，不是生产发布依赖。SSH 除诊断和验证外，唯一允许的写入是默认 `ops/publish.sh deploy` 受治理热修入口。

## 禁止

- 不改业务功能、业务 UI、领域 service 或数据 schema。
- 不绕过 `check:blockers` / `arch:gate`。
- 不新增与 `check:blockers` 并行的架构判断入口。
- 不把 `check:hygiene` 放回 PR CI 主阻断链路。
- 不在服务器 `current` 上手改源码、生成物或数据库结构。SSH 热修也必须是干净、已提交的精确 Git source，并经过统一发布器的不可变 release 目录和原子切换。

## 生产诊断

- 生产服务器地址、SSH 密钥路径和部署目标在桌面私有 ops `.env` 中维护，不进入公共仓库。
- 本机只读诊断时使用私有 ops `.env` 中的 `KEY`，只引用路径，不打印、不复制、不提交密钥内容。
- 正式部署使用 CNB 加密变量 `KEY_CONTENT`；受治理 SSH 热修从私有 ops `.env` 读取 `KEY` 或 `KEY_CONTENT`。都复用源码中的 `ops/deploy.sh`，不要把私钥内容塞进仓库或命令行。

## SSH 热修

- 默认入口是 `OPS_ENV_FILE=/path/to/private/.env ops/publish.sh deploy`；它不触发 GitHub 或 CNB。`ops/publish.sh hotfix` 保留为含义相同的显式别名。
- 当前 `HOTFIX_SCOPE_POLICY=off`，C0–C3 都只记录不按范围拦截；`restricted` 机制已预留，未经明确决定不得开启。范围放开不等于关闭 blockers、migration policy 或 typecheck。
- 入口只接受干净工作区的已提交 HEAD，且 HEAD 必须是当前运行 source 的后代。它上传 exact Git bundle，在服务器受管目录中用 digest-pinned Node 24 Linux 容器限额构建，然后进入正式部署器。
- `deployed-release.json` 同时记录当前运行 source 和上一个 canonical CNB source。之后任何合法的正式 CNB 发布都以 canonical source 排序并覆盖活跃热修，包括正式 source 没有吸收该热修的情况。
- 代码和 artifact 可以被正式发布覆盖；已执行的 migration 或已写入的业务数据不会自动回退。涉及持久化状态时，正式 source 必须吸收兼容契约或提供明确的向前修正。

## 验证

```bash
npm run check:push
npm run check:ci
```

日常候选优先用自适应 `check:push`；CI/CD、schema、认证/RBAC、共享边界、未知覆盖或明确全量收口使用 `check:ci`。远端是否允许合并仍由 `CI / required` 决定。`ops/publish.sh deploy` 默认执行受治理 SSH hotfix；只有用户明确指定 `ops/publish.sh deploy --full` 时，才取得当前 tree 的本地全量 CI 凭证并触发正式 CNB 发布。
