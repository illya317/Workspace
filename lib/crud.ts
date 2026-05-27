// 通用 CRUD 模板：基于 factory 的 HR 模块包装
export { createCrudHandlers, type CrudFactoryConfig, type AccessChecker } from "./crud-factory";

import { createCrudHandlers } from "./crud-factory";
import { checkHRAccess } from "./auth";
import type { CrudFactoryConfig } from "./crud-factory";

export type CrudConfig = Omit<CrudFactoryConfig, "accessCheck">;

function wrap(config: CrudConfig) {
  return createCrudHandlers({ ...config, accessCheck: checkHRAccess });
}

export function handleUpdateField(
  request: Request,
  params: Promise<{ id: string }>,
  config: CrudConfig
) {
  return wrap(config).handleUpdateField(request, params);
}

export function handleDelete(
  request: Request,
  params: Promise<{ id: string }>,
  config: CrudConfig
) {
  return wrap(config).handleDelete(request, params);
}

export function handleCreate(
  request: Request,
  config: CrudConfig,
   
  buildData?: (body: any) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null
) {
  return wrap(config).handleCreate(request, buildData);
}
