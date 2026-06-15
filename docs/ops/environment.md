# Environment Variables

## Files

| File | Purpose | Commit? |
|------|---------|---------|
| `.env.example` | Variable catalog + documentation. Serves as the source of truth for what env vars the app expects. | **Yes** |
| `.env` | Local secrets (real values). Never commit. | **No** (gitignored) |
| `.env.production` | Production secrets if managed locally. Prefer platform env vars instead. | **No** (gitignored) |

## Rules

1. **Every env var read by code must be listed in `.env.example`** — even optional ones. Comment them out with a description if they are not required for basic operation.
2. **`.env` is never committed.** The pre-commit hook (`scripts/check-env.js`) blocks any attempt to stage it.
3. **Run `npm run env:check` before committing** to verify local `.env` is healthy. This is also enforced by the pre-commit hook.
4. **Production secrets belong in the deployment platform** (not in the repo).

## Required Variables

### `NEXTAUTH_SECRET`

Used by NextAuth for JWT cookie signing. **Build fails without it.**

Generate:
```bash
openssl rand -base64 32
```

### `DATABASE_URL`

Prisma database connection string.

Local default:
```
DATABASE_URL="file:./data/dev.db"
```

## Optional Variables

### `NEXT_PUBLIC_APP_NAME`

Public-facing app name used in page `<title>` and UI headers.

Default fallback: `"工作台"`

### `NEXT_PUBLIC_COMPANY_NAME`

Public-facing company name used in logos and alt text.

Default fallback: `""` (empty)

### `WECHAT_CORP_ID`

Enterprise WeChat CorpID used for OAuth login.

### `WECHAT_AGENT_ID`

Enterprise WeChat self-built app AgentId used when constructing the OAuth URL.

### `WECHAT_SECRET`

Enterprise WeChat self-built app secret. Server-side only; never expose it to the browser.

### `WECHAT_REDIRECT_ORIGIN`

Optional absolute origin used to build the OAuth callback URL when the app is behind a reverse proxy.

Production example:
```
WECHAT_REDIRECT_ORIGIN=https://fh-bio.cn
```

### `PHARMA_OPS_ROOT`

Optional absolute path to the `pharma-ops` checkout. Workspace reads `config/products.yaml`,
`config/record_templates/*.yaml`, `config/methods/*.yaml`, and
`config/table_layouts/layout_mapping.json` from this directory during the QC migration.

If omitted, Workspace tries nearby deployment shapes such as `../pharma-ops`,
`../../pharma-ops`, and `../../../pharma-ops` relative to the current process cwd.

Production example:
```
PHARMA_OPS_ROOT=/home/ubuntu/pharma-ops
```

## Check Script

```bash
npm run env:check
```

Verifies:
- `.env.example` exists
- Key env vars are documented in `.env.example`
- `.env` is not staged for commit
- `NEXTAUTH_SECRET` in local `.env` is present and not a placeholder

## CI / Server

Configure `NEXTAUTH_SECRET` and `DATABASE_URL` directly in the deployment platform's environment variable settings. Do not copy `.env` files to servers.
