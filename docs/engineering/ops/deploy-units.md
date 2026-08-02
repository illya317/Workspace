# Deploy Unit Source Graph

Workspace 的 deploy-unit graph 现在只描述源码 ownership、生成的 Next App 边界、路由/资源归属和编译闭包；它不是第二套发布系统。

## Source of truth

| Fact | Owner |
|---|---|
| L1、页面、API、resource | `packages/platform/module-registry.ts` |
| Core -> Platform -> domain 编译闭包 | 各 `tsconfig.json` project references |
| 变更路径与检查影响 | `scripts/testing/module-impact-map.json` |
| unit 分组、目标 app root、运行时边界 | `scripts/deploy/deploy-unit-spec.ts` |
| 完整派生拓扑 | `scripts/deploy/deploy-graph.ts` |

部署配置不得复制页面或 API 清单。resolver 会拒绝 owner 缺失或重叠、端口或 asset prefix 重复、无效 TypeScript 引用、目标 App 缺失以及跨 unit contributor 漂移。

## Generated Next apps

根 `app/`、module registry 与 deploy graph 是可编辑事实源；`apps/<unit>/` 是生成镜像，不允许手工维护第二份业务实现。事实源变化后使用：

```bash
npm run deploy:unit:app -- --unit finance --write
npm run deploy:unit:app -- --unit finance
npm run deploy:apps:check
```

这些命令只维护源码结构和检查输入，不构建或发布生产制品。

## Delivery boundary

正式发布始终是一个 monolith standalone 和一个 `linux/amd64` OCI 镜像。仓库不再包含：

- deploy-unit artifact builder 或 unit release job；
- blue/green unit activation client、Gateway generation 或 Profile/Fleet promotion；
- Ready/controller、unit receipt、SBOM/provenance promotion 和本地发布包装器；
- deploy-unit compiler cache 或独立生产回滚入口。

CNB required CI 仍可运行 deploy graph、生成 App 一致性和受影响 typecheck，因为它们是源码正确性检查。检查通过后，只有 `ops/build-standalone-artifact.sh` 打包那一次 Next build，`ops/cnb-release.sh` 把它包装为唯一应用镜像；部署和回滚只按该镜像 digest 进行。

## Runtime compatibility

部分应用代码仍保留 deploy-unit identity、硬导航和签名内部 RPC 的兼容语义，以保证历史生成 App 和单体运行时的源码契约不漂移。它们不代表独立部署通道仍然存在。生产的唯一真实版本身份是 CNB `release.json` 中批准的 image digest，线上状态必须通过 `/workspace/api/internal/health`、`/workspace/api/settings/version` 与 `deployed-image.json` 核对。

## Required checks

```bash
npm run deploy:apps:check
npm run deploy:graph:check
npm run typecheck:scope -- production
```

发布流程与缓存边界见 [`ci-cd.md`](./ci-cd.md)。
