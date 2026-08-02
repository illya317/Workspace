import assert from "node:assert/strict";
import test from "node:test";

import type { ContractRow, EmployeeProfile } from "@workspace/hr/types";
import { persistEmployeeAgreements } from "./EmployeeAgreementPersistence";

function agreement(overrides: Partial<ContractRow> = {}): ContractRow {
  return {
    id: "agreement-001",
    agreementUid: "agreement-001",
    employmentId: 10,
    employeeId: "E001",
    employeeName: "测试员工",
    company: "测试公司",
    isPrimary: true,
    isInsuredHere: false,
    insuranceStatus: "正常参保",
    legalRelation: "劳动关系",
    contractType: "劳动合同",
    employmentForm: "全日制",
    firstContractStartDate: "2026-01-01",
    firstContractEndDate: null,
    secondContractStartDate: null,
    secondContractEndDate: null,
    thirdContractStartDate: null,
    thirdContractEndDate: null,
    permanentContractDate: null,
    expiryDate: null,
    confidentialityDate: null,
    nonCompeteDate: null,
    endDate: null,
    recordState: "confirmed",
    temporalState: "current",
    version: 1,
    source: "normalized",
    migrationState: "normalized",
    missingFields: [],
    currentRevisionUid: "revision-001",
    terms: [{
      termUid: "term-001",
      sequence: 1,
      termKind: "initial",
      effectiveFrom: "2026-01-01",
      effectiveThrough: null,
      recordState: "confirmed",
      temporalState: "current",
      changeKind: "initial",
      reason: null,
    }],
    revisions: [],
    attachments: [],
    ...overrides,
  };
}

function profile(contract: ContractRow | ContractRow[]): EmployeeProfile {
  return {
    asOfDate: "2026-07-29",
    employee: { id: 7 },
    contracts: Array.isArray(contract) ? contract : [contract],
  } as EmployeeProfile;
}

test("exact agreement save creates no command", async () => {
  const current = agreement();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("exact save must not call fetch");
  }) as typeof fetch;
  try {
    await persistEmployeeAgreements(profile(current), [{ ...current }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("content correction carries the aggregate version and transport idempotency only", async () => {
  const current = agreement();
  const draft = { ...current, company: "新公司" };
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Response.json({ agreements: [{ ...draft, version: 2 }] });
  }) as typeof fetch;
  try {
    await persistEmployeeAgreements(profile(current), [draft]);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    kind: "correct-existing",
    patch: { company: "新公司" },
    reason: "从员工档案修正合同资料",
    agreementUid: "agreement-001",
    expectedVersion: 1,
  });
  assert.equal(new Headers(calls[0].init?.headers).has("Idempotency-Key"), true);
});

test("removing a persisted card ends its current term", async () => {
  const current = agreement();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Response.json({ agreements: [{ ...current, version: 2, endDate: "2026-07-29" }] });
  }) as typeof fetch;
  try {
    await persistEmployeeAgreements(profile(current), []);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    kind: "end",
    termUid: "term-001",
    effectiveThrough: "2026-07-29",
    reason: "从员工档案结束合同",
    agreementUid: "agreement-001",
    expectedVersion: 1,
  });
});

test("multiple new agreements keep their returned anchors distinct", async () => {
  const firstDraft = agreement({
    id: "",
    agreementUid: null,
    version: null,
    company: "甲公司",
    isPrimary: false,
    isNew: true,
    terms: [],
  });
  const secondDraft = agreement({
    id: "",
    agreementUid: null,
    version: null,
    company: "乙公司",
    isPrimary: false,
    isNew: true,
    secondContractStartDate: "2027-01-01",
    terms: [],
  });
  const firstCreated = agreement({ id: "agreement-a", agreementUid: "agreement-a", company: "甲公司", isPrimary: false });
  const secondCreated = agreement({ id: "agreement-b", agreementUid: "agreement-b", company: "乙公司", isPrimary: false });
  const calls: Array<{ init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    calls.push({ init });
    if (calls.length === 1) return Response.json({ agreements: [firstCreated] });
    if (calls.length === 2) return Response.json({ agreements: [firstCreated, secondCreated] });
    return Response.json({ agreements: [
      firstCreated,
      {
        ...secondCreated,
        version: 2,
        terms: [
          ...secondCreated.terms,
          { ...secondCreated.terms[0]!, termUid: "term-b-2", sequence: 2, termKind: "renewal", effectiveFrom: "2027-01-01" },
        ],
      },
    ] });
  }) as typeof fetch;
  try {
    await persistEmployeeAgreements(profile([]), [firstDraft, secondDraft]);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls.length, 3);
  assert.deepEqual(JSON.parse(String(calls[2].init?.body)), {
    kind: "renew",
    effectiveFrom: "2027-01-01",
    effectiveThrough: null,
    termKind: "renewal",
    agreementUid: "agreement-b",
    expectedVersion: 1,
  });
});

test("blank new agreement placeholders are filtered before any command is sent", async () => {
  const validDraft = agreement({ id: "", agreementUid: null, version: null, isNew: true, terms: [] });
  const blankPlaceholder = agreement({
    id: "",
    agreementUid: null,
    version: null,
    isNew: true,
    company: "",
    insuranceStatus: null,
    legalRelation: "",
    contractType: "",
    employmentForm: "",
    firstContractStartDate: null,
    firstContractEndDate: null,
    secondContractStartDate: null,
    secondContractEndDate: null,
    thirdContractStartDate: null,
    thirdContractEndDate: null,
    permanentContractDate: null,
    confidentialityDate: null,
    nonCompeteDate: null,
    isPrimary: false,
    isInsuredHere: false,
    terms: [],
  });
  const created = agreement();
  const calls: Array<{ init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    calls.push({ init });
    return Response.json({ agreements: [created] });
  }) as typeof fetch;
  try {
    await persistEmployeeAgreements(profile([]), [validDraft, blankPlaceholder]);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(String(calls[0].init?.body)).kind, "create");
});

test("creating a primary agreement refreshes versions before editing an existing agreement", async () => {
  const existing = agreement();
  const existingAfterPrimaryChange = agreement({ version: 2, isPrimary: false });
  const existingDraft = agreement({ company: "修正后的公司", isPrimary: false });
  const newPrimaryDraft = agreement({
    id: "",
    agreementUid: null,
    version: null,
    company: "新主合同公司",
    isPrimary: true,
    isNew: true,
    terms: [],
  });
  const created = agreement({
    id: "agreement-new",
    agreementUid: "agreement-new",
    company: "新主合同公司",
    isPrimary: true,
  });
  const calls: Array<{ init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    calls.push({ init });
    if (calls.length === 1) return Response.json({ agreements: [created, existingAfterPrimaryChange] });
    return Response.json({ agreements: [created, { ...existingDraft, version: 3 }] });
  }) as typeof fetch;
  try {
    await persistEmployeeAgreements(profile(existing), [newPrimaryDraft, existingDraft]);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
    kind: "correct-existing",
    patch: { company: "修正后的公司" },
    reason: "从员工档案修正合同资料",
    agreementUid: "agreement-001",
    expectedVersion: 2,
  });
});
