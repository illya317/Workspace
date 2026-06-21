# Inventory Redirect Shell

`app/inventory/` is a legacy redirect shell only.

- `page.tsx` redirects to `/production`.
- The old unused inventory UI/hook implementation was deleted.
- If inventory is restored as a real feature, place the implementation in `packages/production` or a deliberately registered domain package, then keep this route as a thin shell.
- Do not add `components/`, `hooks/`, `lib/`, or client UI implementation under this route.
