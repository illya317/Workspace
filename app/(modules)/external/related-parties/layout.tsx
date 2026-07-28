import { requireRouteAccess } from "@workspace/platform/server/auth";

export default async function RelatedPartiesLayout({ children }: { children: React.ReactNode }) {
  await requireRouteAccess("/external/related-parties");
  return children;
}
