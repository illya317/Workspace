export type ProductMasterView = "product" | "skus" | "mappings";

export type ProductMasterCreateKind = "product" | "sku";

export function resolveProductMasterCreateKind(
  view: ProductMasterView,
  hasSelectedProduct: boolean,
): ProductMasterCreateKind | null {
  if (view === "product") return "product";
  if (view === "skus" && hasSelectedProduct) return "sku";
  return null;
}
