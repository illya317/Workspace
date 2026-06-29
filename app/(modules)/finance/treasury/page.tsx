import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { createPageBody, createSectionSection, PageSurface } from "@workspace/core/ui";

export default createProtectedModulePage({
  route: "/finance/treasury",
  title: "司库管理",
  backHref: "/finance",
  render: () => (
    <PageSurface kind="standard" body={createPageBody([
      createSectionSection("treasury", { title: "司库管理", subtitle: "银行账户、资金日报、收付款计划、现金流预测、授信管理", sections: [
        { kind: "data", key: "empty", surface: { kind: "records", records: [], empty: "司库管理模块开发中..." } },
      ] }),
    ])} />
  ),
});
