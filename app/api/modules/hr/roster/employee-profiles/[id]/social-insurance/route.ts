import {
  EmployeeSocialInsuranceCommandSchema,
  EmploymentAgreementEmployeeParamsSchema,
  executeEmployeeSocialInsuranceCommand,
  listEmployeeSocialInsurancePeriods,
} from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const GET = createCommandRoute({
  paramsSchema: EmploymentAgreementEmployeeParamsSchema,
  paramsError: "员工ID无效",
  buildCommand: ({ params }) => okCommand({ employeeId: params.id }),
  action: ({ employeeId }) => listEmployeeSocialInsurancePeriods(employeeId),
});

export const POST = createCommandRoute({
  paramsSchema: EmploymentAgreementEmployeeParamsSchema,
  paramsError: "员工ID无效",
  bodySchema: EmployeeSocialInsuranceCommandSchema,
  bodyError: "社会保险办理内容无效",
  buildCommand: ({ params, body, user }) => okCommand({ employeeId: params.id, command: body, userId: user.userId }),
  action: executeEmployeeSocialInsuranceCommand,
});
