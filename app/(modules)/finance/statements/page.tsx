import { requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { StatementsClient } from "@workspace/finance/ui";

export default async function FinanceStatementsPage() {
  const user = await requireRouteAccess("/finance/statements");

  return renderAppShellPage({
    title: "财务报表",
    backHref: "/finance",
    user,
    children: <StatementsClient />,
  });
}
