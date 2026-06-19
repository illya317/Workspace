// 通用 CRUD 模板：基于 factory 的 HR 模块包装
export { createCrudHandlers, type CrudFactoryConfig, type AccessChecker } from "./crud-factory";

import { createCrudHandlers } from "./crud-factory";
import { checkHRAccess, checkHRWrite, checkHRDelete } from "@/server/auth/domain";
import type { CrudFactoryConfig } from "./crud-factory";

export type CrudConfig = Omit<CrudFactoryConfig, "accessCheck" | "writeCheck" | "deleteCheck">;

function wrap(config: CrudConfig) {
  return createCrudHandlers(
    {
      ...config,
      accessCheck: checkHRAccess,
      writeCheck: checkHRWrite,
      deleteCheck: checkHRDelete,
    }
  );
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
  buildData?: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null
) {
  return wrap(config).handleCreate(request, buildData);
}
