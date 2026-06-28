import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { ContractsClient } from "@workspace/administration/ui";

export default createProtectedModulePage({
  route: "/administration/contracts",
  title: "合同台账",
  backHref: "/administration",
  render: ({ user }) => <ContractsClient user={user} hideShell />,
});
