import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { InvestorsClient } from "@workspace/external/ui";

export default createProtectedModulePage({
  route: "/external/investors",
  title: "投资人关系",
  backHref: "/external",
  render: () => <InvestorsClient />,
});
