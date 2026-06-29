import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { createPageBody, createSectionSection, PageSurface } from "@workspace/core/ui";

export default createProtectedModulePage({
  route: "/finance/tax",
  title: "税务管理",
  backHref: "/finance",
  render: () => (
    <PageSurface kind="standard" body={createPageBody([
      createSectionSection("tax", { title: "税务管理", subtitle: "销项/进项、税负分析、发票管理、纳税申报辅助", sections: [
        { kind: "data", key: "empty", surface: { kind: "records", records: [], empty: "税务管理模块开发中..." } },
      ] }),
    ])} />
  ),
});
