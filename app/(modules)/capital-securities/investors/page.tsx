import { createProtectedModulePage } from "@workspace/platform/server/protected-page";
import { InvestorsClient } from "@workspace/capital-securities/ui";

export default createProtectedModulePage({
  route: "/capital-securities/investors",
  title: "投资人关系",
  backHref: "/capital-securities",
  render: () => <InvestorsClient />,
});
