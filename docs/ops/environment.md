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

## Local Runtime State

Local files that are useful for one workstation but should not be committed live under
`WORKSPACE_CONFIG_DIR`. Runtime data should stay outside the repo root; do not symlink `data/`
back into the project because Next.js/Turbopack traces project-root symlinks during production
builds.

| Repo path | Local source of truth |
|-----------|-----------------------|
| `.env` | `$WORKSPACE_CONFIG_DIR/.env` |
| Database | `$WORKSPACE_CONFIG_DIR/data/dev.db` via `DATABASE_URL` |
| QC batch store | `$WORKSPACE_CONFIG_DIR/data/qc-batches.json` via `WORKSPACE_CONFIG_DIR` |
| QC feedback store | `$WORKSPACE_CONFIG_DIR/data/qc-template-feedback.json` via `WORKSPACE_CONFIG_DIR` |
| `public/company` | `$WORKSPACE_CONFIG_DIR/assets/brand/company` |
| `public/assets/agent/avatar` | `$WORKSPACE_CONFIG_DIR/assets/agent/avatar` |

These paths are excluded by deployment sync. A new machine should restore or create
`WORKSPACE_CONFIG_DIR`, configure `.env` to point at it, and avoid creating a project-root
`data` symlink.

Run the runtime package check before deploying or after restoring a new machine:

```bash
npm run workspace:check
```

The check validates the external `.workspace` directory, confirms `DATABASE_URL` is an absolute
SQLite path pointing at `data/dev.db`, verifies the database contains WeCom-linked users for the
production target, and compares `ops/server.env.sh` with `ops/deploy-targets.json` so a stale local
deploy target is caught before code is synced.

The production deploy script syncs this runtime/config directory separately from source code, with
server data treated as the source of truth. `LOCAL_WORKSPACE_CONFIG_DIR` defaults to
`$WORKSPACE_CONFIG_DIR`, then `$HOME/.workspace`, and is rsynced to `REMOTE_WORKSPACE_CONFIG_DIR`,
which defaults to a sibling `.workspace` directory next to `REMOTE_DIR`; `data/` is excluded from
that upload. During deploy, the remote `.env` is normalized so `DATABASE_URL` and
`WORKSPACE_CONFIG_DIR` point at the remote runtime directory. The script then backs up local
`data/` to `LOCAL_WORKSPACE_BACKUP_DIR` and pulls `REMOTE_WORKSPACE_CONFIG_DIR/data/` back down to
local, so production data is preserved on the server and mirrored locally after each deploy.

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

### `WORKSPACE_ERP_SSO_URL`

Optional ERPNext SSO bridge URL. Workspace redirects logged-in users here from
`/api/auth/erp-sso` with a short-lived signed token when they click the ERP portal card.

Default:
```
WORKSPACE_ERP_SSO_URL=/erp/api/method/my_erp.api.workspace_sso.login
```

Use the browser-facing URL or reverse-proxy path, not the server-only Docker address. The Workspace
`User.erpnextUserId` or `User.erpnextUsername` field must point to an enabled ERP `User.name`;
otherwise the SSO route returns `ERPNEXT_USER_NOT_BOUND`.

### `WORKSPACE_ERP_REDIRECT_TO`

Optional ERP path to open after SSO succeeds.

Default:
```
WORKSPACE_ERP_REDIRECT_TO=/erp/desk
```

Use `/erp/desk` when ERP is reverse-proxied below `/erp`; use `/desk` only when accessing the Frappe
container directly without that prefix.

### `WORKSPACE_ERP_SSO_SECRET`

Server-side secret used to sign the short-lived ERP SSO token. It must match the ERP site config
`workspace_sso_secret`.

Generate:
```bash
openssl rand -base64 32
```

### `WORKSPACE_ERP_SSO_ISSUER` / `WORKSPACE_ERP_SSO_AUDIENCE`

Optional token claim values. Defaults are:
```
WORKSPACE_ERP_SSO_ISSUER=workspace
WORKSPACE_ERP_SSO_AUDIENCE=erp
```

### `WORKSPACE_QC_CONFIG_ROOT`

Optional absolute path to a Workspace QC config snapshot. By default Workspace reads the
committed snapshot at `config/pharma-ops`, which contains the copied YAML/JSON config from
`pharma-ops/config`.

Set this only when temporarily testing another config snapshot:

```bash
WORKSPACE_QC_CONFIG_ROOT=/home/ubuntu/workspace/config/pharma-ops
```

### `PHARMA_OPS_ROOT`

Optional absolute path to the `pharma-ops` checkout. This is now a fallback for the QC migration:
Workspace first tries `WORKSPACE_QC_CONFIG_ROOT`, then the committed snapshot at
`config/pharma-ops`, and only then external `pharma-ops` directories. When used, Workspace reads
`config/products.yaml`, `config/record_templates/*.yaml`, `config/methods/*.yaml`, and
`config/table_layouts/*.json` from this directory.

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

Current production uses SSH deploys to a CVM host. The source of truth for production secrets is the
remote runtime directory, typically `$REMOTE_WORKSPACE_CONFIG_DIR/.env`; deploy scripts symlink that
file into the repo and normalize `DATABASE_URL` / `WORKSPACE_CONFIG_DIR` to server paths before the
remote build starts.

For managed platforms or containers, prefer native platform env vars instead of copying `.env`
files. In other words:

- CVM + PM2 + SSH deploy: keep `.env` in the remote `.workspace` runtime directory.
- Managed CI/CD or container platforms: inject `NEXTAUTH_SECRET`, `DATABASE_URL`, and related
  secrets through the platform settings.
