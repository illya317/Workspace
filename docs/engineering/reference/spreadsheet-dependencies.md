# Spreadsheet Third-Party Dependencies

Owner: Architecture / Operations.

用途：记录仓库电子表格（workbook）处理能力的外部依赖、锁定版本、许可、获取来源与使用边界。修改本类依赖时，必须同步更新本文件、`package.json`、`package-lock.json` 与 `vendor/sheetjs/PROVENANCE.md`。

## 锁定依赖

| 包 | 版本 | 许可 | 用途 | 边界 |
|---|---:|---|---|---|
| `xlsx`（SheetJS CE） | `0.20.3` | Apache-2.0 | workbook 解析与生成（导入解析、报表/底稿导出、预览） | 全仓统一通过包名 `xlsx` 引用；禁止业务侧引入第二个电子表格引擎 |

## 获取与固定方式

- 不使用 npm registry 的 `xlsx` 线（registry 停在 0.18.5，且 0.18.5 受 prototype pollution 与 ReDoS 影响）；官方权威分发渠道是 SheetJS CDN。
- 官方 tarball vendored 在 `vendor/sheetjs/xlsx-0.20.3.tgz`，`package.json` 以 `file:vendor/sheetjs/xlsx-0.20.3.tgz` 精确引用，无版本区间。
- 来源、获取日期、SHA-256 与许可依据记录在 `vendor/sheetjs/PROVENANCE.md`；`npm run check:sheetjs-vendor` 在 `check:contracts` / `check:changed` 与 CNB static policy 中重算 SHA-256 并断言等于固定值，同时锁定 tarball 内包版本与 `package.json` 引用。
- 决策依据：`docs/engineering/finance-amount-explanation-platform-adr.md` 决策 5。

## 维护规则

- 升级或替换 artifact 时，同一提交内更新 tarball、PROVENANCE.md、`scripts/check/check-sheetjs-vendor.mjs` 的固定 SHA-256/版本与本文件；不得把依赖改回 registry 区间写法。
- 0.20.x 的 ESM 构建（`xlsx.mjs`）不自动绑定 Node `fs`；使用 `readFile`/`writeFile` 等文件级 API 的脚本必须按官方文档显式 `XLSX.set_fs(fs)`。buffer 级 `read`/`write` 不受影响。
- `hyperformula`（公式重算候选引擎）的锁定与许可边界见 `docs-editor-dependencies.md` 与 Platform formula adapter；SheetJS 只负责解析/生成，不承担公式重算权威。
- 不使用 GitHub snapshot 同步流获取 SheetJS；CNB 是唯一 source/release 权威。
