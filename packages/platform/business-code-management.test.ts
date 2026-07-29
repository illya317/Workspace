import assert from "node:assert/strict";
import test from "node:test";

import { defaultBusinessCodeConfig } from "./business-code-config";
import {
  applyBusinessCodeObjectExample,
  businessCodeObjectExample,
  businessCodeTemplateOptions,
  createBusinessCodeTemplate,
  deleteBusinessCodeTemplate,
  selectBusinessCodeTemplate,
  updateBusinessCodeTemplate,
} from "./business-code-management";
import { defaultBusinessCodeTemplateSettings } from "./business-code-template";

const tenantDefaults = {
  companyProjectCodePrefix: "EX",
  companyProjectSequenceWidth: 3,
  companyProjectSequenceStart: 1,
  companyProjectSequenceEnd: 99,
  departmentProjectSequenceWidth: 3,
  otherProjectSequenceStart: 101,
};

test("all registered objects render through one example interface", () => {
  const config = defaultBusinessCodeConfig(tenantDefaults);
  assert.deepEqual({
    employee: businessCodeObjectExample(config, "hr.employee"),
    organization: businessCodeObjectExample(config, "hr.organization"),
    position: businessCodeObjectExample(config, "hr.position"),
    customer: businessCodeObjectExample(config, "external.customer"),
    supplier: businessCodeObjectExample(config, "external.supplier"),
    project: businessCodeObjectExample(config, "work.project"),
    asset: businessCodeObjectExample(config, "finance.asset"),
  }, {
    employee: "00001",
    organization: "ABC001",
    position: "GW-ABC101-01",
    customer: "CUS-00001",
    supplier: "SUP-00001",
    project: "EX-26-001",
    asset: "02-FA-ELECTRONIC-2026-00001",
  });
});

test("organization example parsing configures shape without fixing the business identifier", () => {
  const config = defaultBusinessCodeConfig(tenantDefaults);
  config.department.functionalPrefix = "CHM";
  const updated = applyBusinessCodeObjectExample(config, "hr.organization", "FUN-001");
  assert.equal(updated.department.identifierLength, 3);
  assert.equal(updated.department.identifierFormat, "uppercaseLetters");
  assert.equal(updated.department.separator, "-");
  assert.equal(updated.department.managementRootSuffix, "001");
  assert.equal(updated.department.functionalPrefix, "CHM");
});

test("one sequential template interface parses literals, dates and sequence width", () => {
  const config = defaultBusinessCodeConfig(tenantDefaults);
  const selected = selectBusinessCodeTemplate(config, "external.customer", "system.dateSequence");
  const updated = applyBusinessCodeObjectExample(selected, "external.customer", "KH-26JUL-0007");
  assert.equal(businessCodeObjectExample(updated, "external.customer"), "KH-26JUL-0007");
});

test("custom templates are created once and appear for every compatible object", () => {
  const config = defaultBusinessCodeConfig(tenantDefaults);
  const updated = createBusinessCodeTemplate(config, {
    name: "月度五位流水",
    baseTemplateKey: "system.dateSequence",
    settings: {
      kind: "sequential",
      rule: {
        segments: [
          { kind: "literal", value: "CODE-" },
          { kind: "date", source: "createdAt", format: "YYMM" },
          { kind: "literal", value: "-" },
          { kind: "sequence", length: 5 },
        ],
        sequenceStart: 1,
      },
    },
  });
  const template = updated.management.templates[0];
  assert.ok(template);
  assert.equal(template.baseTemplateKey, "system.dateSequence");
  assert.equal(template.example, "CODE-2607-00001");
  assert.equal(businessCodeTemplateOptions(updated, "hr.employee").some((item) => item.value === template.key), true);
  assert.equal(businessCodeTemplateOptions(updated, "finance.asset").some((item) => item.value === template.key), false);
});

test("editing a selected custom template reapplies its rule to compatible objects", () => {
  const config = defaultBusinessCodeConfig(tenantDefaults);
  const created = createBusinessCodeTemplate(config, {
    name: "员工流水",
    baseTemplateKey: "system.sequential",
    settings: defaultBusinessCodeTemplateSettings("system.sequential"),
  });
  const template = created.management.templates[0];
  assert.ok(template);
  const selected = selectBusinessCodeTemplate(created, "hr.employee", template.key);
  const updated = updateBusinessCodeTemplate(selected, {
    key: template.key,
    name: "员工六位流水",
    baseTemplateKey: template.baseTemplateKey,
    settings: {
      kind: "sequential",
      rule: { segments: [{ kind: "sequence", length: 6 }], sequenceStart: 1 },
    },
  });
  assert.equal(businessCodeObjectExample(updated, "hr.employee"), "000001");
  assert.equal(updated.management.templates[0]?.name, "员工六位流水");
});

test("custom templates can only be deleted after all code objects stop using them", () => {
  const config = defaultBusinessCodeConfig(tenantDefaults);
  const created = createBusinessCodeTemplate(config, {
    name: "员工流水",
    baseTemplateKey: "system.sequential",
    settings: defaultBusinessCodeTemplateSettings("system.sequential"),
  });
  const template = created.management.templates[0];
  assert.ok(template);
  const selected = selectBusinessCodeTemplate(created, "hr.employee", template.key);
  assert.throws(() => deleteBusinessCodeTemplate(selected, template.key), /员工编码/);
  assert.equal(deleteBusinessCodeTemplate(created, template.key).management.templates.length, 0);
});
