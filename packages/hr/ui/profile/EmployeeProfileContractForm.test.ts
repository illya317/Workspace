import assert from "node:assert/strict";
import test from "node:test";

import type { ContractRow } from "@workspace/hr/types";
import {
  agreementHistoryRows,
  agreementTermMissingFields,
  agreementTermRowCommandKind,
  agreementTermRowReady,
  agreementTermsForCommand,
  applyAgreement,
  applyAgreementTerm,
  nextAgreementPeriodNo,
  termKindForCommand,
  type AgreementDraft,
} from "./EmployeeProfileContractModel";

const fixedTerm: ContractRow["terms"][number] = {
  termUid: "term-fixed-0001",
  storageSequence: 1,
  sequence: 1,
  termKind: "initial",
  effectiveFrom: "2009-06-10",
  effectiveThrough: null,
  recordState: "confirmed",
  temporalState: "past",
  changeKind: "legacy",
  reason: null,
};

const indefiniteTerm: ContractRow["terms"][number] = {
  termUid: "term-indefinite-0002",
  storageSequence: 4,
  sequence: 2,
  termKind: "permanent",
  effectiveFrom: "2017-12-28",
  effectiveThrough: null,
  recordState: "confirmed",
  temporalState: "current",
  changeKind: "legacy",
  reason: null,
};

const agreement = {
  agreementUid: "agreement-0001",
  employmentId: 7,
  migrationState: "baseline-incomplete",
  company: "丰华制药",
  legalRelation: "劳动关系",
  contractType: "劳动合同",
  employmentForm: "全日制",
  terms: [fixedTerm, indefiniteTerm],
  missingFields: [
    { path: "terms.1.effectiveThrough", label: "第 1 期到期日期", required: false },
  ],
} as ContractRow;

const draft: AgreementDraft = {
  kind: "correct",
  agreementUid: "",
  employmentId: 7,
  termUid: "",
  effectiveFrom: "2026-07-28",
  effectiveThrough: null,
  durationKind: "fixed",
  company: null,
  legalRelation: null,
  contractType: null,
  employmentForm: null,
  reason: null,
};

test("baseline incompleteness chooses a default supplement but never overrides explicit correction", () => {
  assert.equal(applyAgreement({ ...draft, kind: "create" }, agreement).kind, "supplement-term");
  const correction = applyAgreement(draft, agreement);
  assert.equal(correction.kind, "correct");
  assert.equal(correction.termUid, indefiniteTerm.termUid);
  assert.equal(correction.durationKind, "indefinite");
});

test("missing-field matching uses raw storage sequence while UI uses stable business sequence", () => {
  assert.deepEqual([...agreementTermMissingFields(agreement, fixedTerm)], ["effectiveThrough"]);
  assert.deepEqual([...agreementTermMissingFields(agreement, indefiniteTerm)], []);
  assert.deepEqual(
    agreementTermsForCommand(agreement, "supplement-term").map((term) => term.termUid),
    [fixedTerm.termUid],
  );
  assert.deepEqual(
    agreementTermsForCommand(agreement, "correct").map((term) => term.termUid),
    [fixedTerm.termUid, indefiniteTerm.termUid],
  );
});

test("term hydration and persistence mapping keep duration separate from period stage", () => {
  const hydrated = applyAgreementTerm(draft, indefiniteTerm);
  assert.equal(hydrated.durationKind, "indefinite");
  assert.equal(hydrated.effectiveThrough, null);
  assert.equal(termKindForCommand("replace", "fixed"), "initial");
  assert.equal(termKindForCommand("renew", "fixed"), "renewal");
  assert.equal(termKindForCommand("correct", "fixed", indefiniteTerm), "renewal");
  assert.equal(termKindForCommand("correct", "indefinite", fixedTerm), "permanent");
});

test("row editing derives supplement versus correction without an action selector", () => {
  const supplemented = {
    ...applyAgreementTerm(draft, fixedTerm),
    effectiveThrough: "2014-06-09",
    reason: "补充原始合同到期日期",
  };
  assert.equal(agreementTermRowCommandKind(agreement, fixedTerm, supplemented), "supplement-term");
  assert.equal(agreementTermRowReady(agreement, fixedTerm, supplemented), true);

  const corrected = {
    ...supplemented,
    effectiveFrom: "2009-06-11",
  };
  assert.equal(agreementTermRowCommandKind(agreement, fixedTerm, corrected), "correct");
  assert.equal(agreementTermRowReady(agreement, fixedTerm, corrected), true);
});

test("period numbering remains an agreement fact and reserves existing ordinals", () => {
  assert.equal(nextAgreementPeriodNo(agreement), 3);
});

test("the in-agreement history table keeps term and content revision records", () => {
  const row = {
    ...agreement,
    revisions: [{
      revisionUid: "revision-0001",
      revisionNo: 1,
      recordState: "confirmed",
      changeKind: "baseline-import",
      content: {
        company: "丰华制药",
        insuranceStatus: null,
        legalRelation: "劳动关系",
        contractType: "劳动合同",
        employmentForm: "全日制",
        confidentialityDate: null,
        nonCompeteDate: null,
      },
      supersedesRevisionUid: null,
      reason: null,
      createdAt: "2026-06-22T00:00:00.000Z",
    }],
  } as ContractRow;
  assert.deepEqual(
    agreementHistoryRows(row).map((history) => [history.recordType, history.record]),
    [
      ["term", "第 1 期 · 固定期限"],
      ["term", "第 2 期 · 无固定期限"],
      ["revision", "初始资料 · 版本 1"],
    ],
  );
  assert.deepEqual(
    agreementHistoryRows(row).map((history) => history.state),
    ["资料待补充", "当前", "历史"],
  );
});
