import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { FinanceImportClient } from "@workspace/finance/ui";

export default createProtectedModulePage({
  route: "/finance/import",
  title: "数据导入",
  backHref: "/finance",
  render: ({ user }) => <FinanceImportClient user={user} />,
});
