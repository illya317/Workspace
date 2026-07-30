import { isValidCompanyName, validateContractOption } from "./field-validation";
import type { EmploymentAgreementContent } from "./domain/employment-agreement-validation";

export async function validateEmploymentAgreementContentReferences(content: EmploymentAgreementContent) {
  if (!(await isValidCompanyName(content.company))) return { message: "公司不存在" };
  for (const field of ["insuranceStatus", "legalRelation", "contractType", "employmentForm"] as const) {
    if (!validateContractOption(field, content[field])) return { message: `${field} 不在允许范围内` };
  }
  return null;
}
