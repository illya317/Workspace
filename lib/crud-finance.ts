// 财务模块通用 CRUD 模板：基于 factory 的包装
export { createCrudHandlers, type CrudFactoryConfig, type AccessChecker } from "./crud-factory";

import { createCrudHandlers } from "./crud-factory";
import { checkFinanceAccess } from "./auth";
import type { CrudFactoryConfig } from "./crud-factory";

export type FinanceCrudConfig = Omit<CrudFactoryConfig, "accessCheck">;

function wrap(config: FinanceCrudConfig) {
  return createCrudHandlers({ ...config, accessCheck: checkFinanceAccess });
}

export function handleUpdateField(
  request: Request,
  params: Promise<{ id: string }>,
  config: FinanceCrudConfig
) {
  return wrap(config).handleUpdateField(request, params);
}

export function handleDelete(
  request: Request,
  params: Promise<{ id: string }>,
  config: FinanceCrudConfig
) {
  return wrap(config).handleDelete(request, params);
}

export function handleCreate(
  request: Request,
  config: FinanceCrudConfig,
   
  buildData?: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null
) {
  return wrap(config).handleCreate(request, buildData);
}
