export function productSourceMappingAnalysisFixture(id: number, status: "linked" | "pending") {
  const linked = status === "linked";
  return {
    id,
    productId: linked ? 1 : null,
    productCode: linked ? "P01" : null,
    productName: linked ? "产品甲" : null,
    targetKind: linked ? "product" : "pending",
    targetLabel: linked ? "产品甲" : null,
    sourceSystem: "erp",
    sourceName: `来源产品 ${id}`,
    sourceSpecification: "10ml",
    status,
    sourceFile: "products.xlsx",
  };
}
