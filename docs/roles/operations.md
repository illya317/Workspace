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
- 生产维护遵循本地优先：代码、migration、文档和检查在本地完成。生产发布由当前 Git tree 的本地 `check:ci` 凭证和 CNB Linux standalone 构建完成。GitHub PR/CI 是协作入口，不是生产发布依赖。

## 禁止

- 不改业务功能、业务 UI、领域 service 或数据 schema。
- 不绕过 `check:blockers` / `arch:gate`。
- 不新增与 `check:blockers` 并行的架构判断入口。
- 不把 `check:hygiene` 放回 PR CI 主阻断链路。
- 不在服务器 `current` 上手改源码、生成物或数据库结构，也不通过 SSH 建立旁路发布入口。

## 生产诊断

- 生产服务器地址、SSH 密钥路径和部署目标在桌面私有 ops `.env` 中维护，不进入公共仓库。
- 本机只读诊断时使用私有 ops `.env` 中的 `KEY`，只引用路径，不打印、不复制、不提交密钥内容。
- 正式部署使用 CNB 加密变量 `KEY_CONTENT`，并复用源码中的 `ops/deploy.sh`；不要把私钥内容塞进仓库或命令行。

## 生产发布

- 唯一入口是 `OPS_ENV_FILE=/path/to/private/.env ops/publish.sh deploy`；它要求干净、已提交的 `main`，为当前 tree 生成或复用本地 `check:ci` 凭证，再触发 CNB。
- CNB 构建 canonical Linux standalone，并把已验证的 artifact 交给统一部署器完成 migration、不可变 release 目录、原子切换、健康检查和失败回滚；服务器不从源码重建生产 artifact。
- `deployed-release.json` 只记录 CNB runtime/canonical source、artifact 与 deployment 证据。候选必须是当前部署 source 的后代；同 source 为 no-op，回退或分叉直接阻断。

## 验证

```bash
npm run check:push
npm run check:ci
```

日常候选优先用自适应 `check:push`；CI/CD、schema、认证/RBAC、共享边界、未知覆盖或明确全量收口使用 `check:ci`。远端是否允许合并仍由 `CI / required` 决定。`ops/publish.sh deploy` 是唯一生产发布入口，会取得当前 tree 的本地全量 CI 凭证并触发 CNB 发布。
