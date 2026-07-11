import {
  checkHRRead,
  checkHRDelete,
  checkHRUpdate,
} from "@workspace/platform/server/auth";
import { createDomainCrudFacade } from "@workspace/platform/server/crud-factory";

export type {
  AccessChecker,
  CrudCreateCommand,
  CrudDeleteCommand,
  CrudFactoryConfig,
  CrudUpdateFieldCommand,
  DomainCrudConfig as CrudConfig,
} from "@workspace/platform/server/crud-factory";

export const {
  executeCreate,
  executeDelete,
  executeUpdateField,
} = createDomainCrudFacade({
  accessCheck: checkHRRead,
  writeCheck: checkHRUpdate,
  deleteCheck: checkHRDelete,
});
