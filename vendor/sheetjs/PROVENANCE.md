# SheetJS CE (xlsx) Vendored Artifact Provenance

Owner：Architecture / Operations。本文件记录仓库内置 SheetJS CE tarball 的来源、校验与许可依据；升级或替换该 artifact 时必须同步更新本文件、`scripts/check/check-sheetjs-vendor.mjs` 中的固定 SHA-256 与 `docs/engineering/reference/spreadsheet-dependencies.md`。

## Artifact

| 项 | 值 |
|---|---|
| 文件 | `vendor/sheetjs/xlsx-0.20.3.tgz` |
| 包名 / 版本 | `xlsx` / `0.20.3`（tarball 内 `package/package.json` 实测） |
| 上游 URL | `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`（SheetJS 官方 CDN，官方文档认定的权威分发渠道） |
| 获取日期 | 2026-08-05 |
| 获取方式 | `curl -fsSL -o xlsx-0.20.3.tgz <上游 URL>`，在 `workspace-dev` 上直接下载，未经 npm registry |
| SHA-256 | `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`（下载后实测，`shasum -a 256`） |
| 运行时依赖 | 无（tarball `package.json` 的 `dependencies` 为空，0.20.x 已内置全部依赖） |

## 许可依据

- tarball 内 `package/package.json` 声明 `"license": "Apache-2.0"`，并附带 Apache License 2.0 全文（`package/LICENSE`、`package/dist/LICENSE`）。
- Apache-2.0 允许以源码/二进制形式再分发；本仓库 vendoring 行为符合该许可。保留 tarball 原样（含 LICENSE）即满足署名与许可文本保留要求。

## 升级动机

- 旧依赖 `xlsx@^0.18.5` 来自 npm registry 旧线，受 prototype pollution（修复于 0.19.3）与 ReDoS（修复于 0.20.2）影响。
- npm registry 上的 `xlsx` 线停止于 0.18.5，SheetJS 官方文档明确 `cdn.sheetjs.com` 为权威分发渠道，并推荐 vendoring。
- 决策依据：`docs/engineering/finance-amount-explanation-platform-adr.md` 决策 5。

## 完整性校验

- `npm run check:sheetjs-vendor`（`scripts/check/check-sheetjs-vendor.mjs`）在每次 `check:changed` / `check:contracts` / CNB static policy 中执行：
  - 重新计算 tarball SHA-256 并断言等于本文件记录的固定值；
  - 断言根 `package.json` 的 `xlsx` 依赖精确指向 `file:vendor/sheetjs/xlsx-0.20.3.tgz`；
  - 断言 tarball 内 `package/package.json` 的 `version` 确为 `0.20.3`。
- 该校验失败即阻断，禁止以改动 artifact 或降级回 registry 版本的方式绕过。
