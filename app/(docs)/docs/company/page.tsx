import { requireRouteAccess } from "@workspace/platform/server/auth";
import { DocsPlaceholderPage } from "@workspace/platform/ui/docs";

export default async function DocsCompanyPage() {
  const user = await requireRouteAccess("/docs/company");
  return <DocsPlaceholderPage user={user} title="公司管理" description="员工手册、管理手册等文档将在此发布。" />;
}
