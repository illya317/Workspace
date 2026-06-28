import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { LedgerClient } from "@workspace/finance/ui";

export default createProtectedModulePage({
  route: "/finance/ledger",
  title: "总账基础",
  backHref: "/finance",
  render: ({ user }) => (
    <LedgerClient
      canWrite={user.visibleWriteResourceKeys?.includes("finance.ledger") ?? false}
      user={user}
    />
  ),
});
