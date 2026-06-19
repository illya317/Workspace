import {
  checkHRAccess,
  checkHRDelete,
  checkHRWrite,
} from "@workspace/platform/server/auth";
import { createDomainCrudFacade } from "@workspace/platform/server/crud-factory";

export type {
  AccessChecker,
  CrudFactoryConfig,
  DomainCrudConfig as CrudConfig,
} from "@workspace/platform/server/crud-factory";

export const {
  handleCreate,
  handleDelete,
  handleUpdateField,
} = createDomainCrudFacade({
  accessCheck: checkHRAccess,
  writeCheck: checkHRWrite,
  deleteCheck: checkHRDelete,
});
