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
DATABASE_URL="file:./prisma/dev.db"
```

## Optional Variables

### `NEXT_PUBLIC_APP_NAME`

Public-facing app name used in page `<title>` and UI headers.

Default fallback: `"工作台"`

### `NEXT_PUBLIC_COMPANY_NAME`

Public-facing company name used in logos and alt text.

Default fallback: `""` (empty)

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
