# CNB 运营维护笔记

> 记录 CNB 仓库、同步、部署相关的配置要点和踩坑。

## 仓库地址

| 平台 | 地址 |
|------|------|
| GitHub | `https://github.com/illya317/Workspace.git` |
| CNB    | `https://cnb.cool/illya317/Workspace.git` |

CNB 正确的 git 地址**没有 `/u/` 前缀**。

```text
✅ https://cnb.cool/illya317/Workspace.git
❌ https://cnb.cool/u/illya317/Workspace.git   ← 会报 Invalid Credentials
❌ https://cnb.cool/illya317/workspace.git      ← 会报 Repository Not Found（大小写）
```

## Git 认证

- **用户名**：固定为 `cnb`
- **密码**：CNB 的 git token（不是登录密码，也不是 CNB API 的 OAuth token）
- 当前 token 名称：`FH`

已配置全局 credential helper 为 `store`，凭据保存在 `~/.git-credentials`：

```bash
git config --global credential.helper store
```

配置后可以直接：

```bash
git push origin main   # GitHub
git push cnb main      # CNB
```

> 注意：`cnb git-credential` 返回的 token 只能调 CNB OpenAPI，**不能用于 git push**。

## GitHub 代理

这台机器访问 GitHub 需要走本地代理 `7897`：

```bash
HTTPS_PROXY=http://127.0.0.1:7897 git push origin main
```

CNB 不需要代理。

## 镜像与自动部署

- `.cnb.yml` 中的触发器已从 `api_trigger` 改为 `api_trigger_manual`。
- 因此 CNB 从 GitHub 同步代码后**不会自动部署**。
- 如需自动同步，需在 CNB 网页后台把 GitHub 仓库设为镜像源。

## 手动部署

需要部署时，手动触发 CNB pipeline：

```bash
cnb build start-build --repo illya317/Workspace --event api_trigger_manual
```

## 常见失败原因

| 现象 | 原因 |
|------|------|
| `Repository Not Found` | git 地址大小写错误或用了 `/u/` 前缀 |
| `Invalid Credentials` | 用了 API token 而不是 git token；或 token 没有 `write_repository` 权限 |
| GitHub push SSL 错误 | 没走 `7897` 代理 |
| dev server 500 / Prisma `Cannot read properties of undefined (reading 'indexOf')` | 源码已恢复但运行态（`.workspace`、`.env`、数据库）未恢复，需跑完整 sync 或手动恢复 |
