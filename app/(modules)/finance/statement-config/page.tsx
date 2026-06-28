import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { StatementConfigClient } from "@workspace/finance/ui";

export default createProtectedModulePage({
  route: "/finance/statement-config",
  title: "报表配置",
  backHref: "/finance",
  render: ({ user }) => <StatementConfigClient user={user} />,
});
