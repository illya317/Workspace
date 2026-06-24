# Operations Role

Operations 负责 CI、部署、环境和脚本运行态。

## 先读

- `docs/agent-startup.md`
- `docs/ops/environment.md`
- `docs/ops/deploy.md`
- `.github/workflows/ci.yml`

## 职责

- 维护 GitHub Actions CI、CNB CD、部署流程、环境变量检查和运行脚本。
- 确保 CI 只在 GitHub Actions 执行，并使用单一 `arch:gate`，正确执行 lint、typecheck、build 等验证。
- 调查 CI 失败、构建失败和部署失败。
- 生产维护遵循本地优先：代码、migration、文档和检查在本地完成，commit 后同步 GitHub/CNB，再由 CNB 部署。服务器 SSH 只用于只读诊断、日志/状态确认和部署后验证。

## 禁止

- 不改业务功能、业务 UI、领域 service 或数据 schema。
- 不绕过 `arch:gate`。
- 不新增与 `arch:gate` 并行的架构判断入口。
- 不在服务器上手改源码、生成物或数据库结构来替代正式提交；紧急止血后也必须补成本地 migration/脚本并重新部署。

## 生产诊断

- 当前 CVM 目标：`ubuntu@111.229.86.81`。
- 本机只读诊断私钥：`/Users/koito/Desktop/.System/tencent/FH002.pem`。只引用路径，不打印、不复制、不提交密钥内容。
- 部署仍使用 CNB 加密变量 `KEY_CONTENT` 和 `ops/deploy.sh`，不要把本地私钥塞进仓库或部署脚本。

## 验证

```bash
npm run arch:gate
npm run lint:full
npm run typecheck:quick
```
