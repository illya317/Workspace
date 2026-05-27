// 库存模块通用 CRUD 模板：基于 factory 的包装
export { createCrudHandlers, type CrudFactoryConfig, type AccessChecker } from "./crud-factory";

import { createCrudHandlers } from "./crud-factory";
import { checkInventoryAccess } from "./auth";
import type { CrudFactoryConfig } from "./crud-factory";

export type InventoryCrudConfig = Omit<CrudFactoryConfig, "accessCheck">;

function wrap(config: InventoryCrudConfig) {
  return createCrudHandlers({ ...config, accessCheck: checkInventoryAccess });
}

export function handleUpdateField(
  request: Request,
  params: Promise<{ id: string }>,
  config: InventoryCrudConfig
) {
  return wrap(config).handleUpdateField(request, params);
}

export function handleDelete(
  request: Request,
  params: Promise<{ id: string }>,
  config: InventoryCrudConfig
) {
  return wrap(config).handleDelete(request, params);
}

export function handleCreate(
  request: Request,
  config: InventoryCrudConfig,
   
  buildData?: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null
) {
  return wrap(config).handleCreate(request, buildData);
}
