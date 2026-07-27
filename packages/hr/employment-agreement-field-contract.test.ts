import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPLOYMENT_AGREEMENT_REQUIRED_FIELDS,
  employmentAgreementFieldLabel,
  employmentAgreementFieldRequired,
  employmentAgreementMissingFieldLabel,
  type EmploymentAgreementCommandKind,
} from "./employment-agreement-field-contract";
import { EmploymentAgreementCommandSchema } from "./server/agreement-schemas";

const validCommands = {
  create: { kind: "create", employmentId: 7, effectiveFrom: "2026-08-01", content: {} },
  renew: { kind: "renew", agreementUid: "agreement-001", expectedVersion: 1, effectiveFrom: "2026-08-01" },
  end: { kind: "end", agreementUid: "agreement-001", expectedVersion: 1, termUid: "term-00000001", effectiveThrough: "2026-08-01", reason: "合同到期" },
  correct: { kind: "correct", agreementUid: "agreement-001", expectedVersion: 1, termUid: "term-00000001", effectiveFrom: "2026-08-01", reason: "补正历史资料" },
  "supplement-missing": { kind: "supplement-missing", agreementUid: "agreement-001", expectedVersion: 1, patch: { legalRelation: "劳动关系" }, reason: "补充历史资料" },
  "correct-existing": { kind: "correct-existing", agreementUid: "agreement-001", expectedVersion: 1, patch: { company: "测试公司" }, reason: "修正历史资料" },
  "set-primary": { kind: "set-primary", agreementUid: "agreement-001", expectedVersion: 1 },
  "cancel-future": { kind: "cancel-future", agreementUid: "agreement-001", expectedVersion: 1, termUid: "term-00000001", reason: "取消未生效期限" },
} as const satisfies Record<EmploymentAgreementCommandKind, Record<string, unknown>>;

test("field contract is the executable required-field source for every command schema", () => {
  for (const [kind, command] of Object.entries(validCommands) as Array<[
    EmploymentAgreementCommandKind,
    Record<string, unknown>,
  ]>) {
    assert.equal(EmploymentAgreementCommandSchema.safeParse(command).success, true, `${kind} valid command`);
    for (const field of EMPLOYMENT_AGREEMENT_REQUIRED_FIELDS[kind]) {
      const missing = { ...command };
      delete missing[field];
      assert.equal(
        EmploymentAgreementCommandSchema.safeParse(missing).success,
        false,
        `${kind}.${field} must be rejected when absent`,
      );
    }
  }
});

test("unstarred contract content fields stay optional even when data quality reports them", () => {
  for (const kind of Object.keys(validCommands) as EmploymentAgreementCommandKind[]) {
    for (const field of ["company", "legalRelation", "contractType", "employmentForm"] as const) {
      assert.equal(employmentAgreementFieldRequired(kind, field), false, `${kind}.${field}`);
    }
  }
  assert.equal(employmentAgreementFieldRequired("renew", "reason"), false);
  assert.equal(employmentAgreementFieldRequired("end", "reason"), true);
  assert.equal(employmentAgreementMissingFieldLabel("content.legalRelation"), "法律关系");
  assert.equal(employmentAgreementMissingFieldLabel("terms.2.effectiveFrom"), "第 2 期开始日期");
  assert.equal(employmentAgreementFieldLabel("renew", "effectiveThrough"), "到期日期");
  assert.equal(employmentAgreementFieldLabel("end", "effectiveThrough"), "结束日期");
  assert.equal(employmentAgreementFieldLabel("end", "termUid"), "合同期限");
  assert.equal(employmentAgreementFieldLabel("supplement-missing", "reason"), "补充说明");
  assert.equal(employmentAgreementFieldLabel("correct-existing", "reason"), "修正说明");
});
