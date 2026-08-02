import assert from "node:assert/strict";
import test from "node:test";
import { defaultBusinessCodeConfig } from "@workspace/platform/business-code-config";
import { createBusinessCodeTemplate } from "@workspace/platform/business-code-management";
import { defaultBusinessCodeTemplateSettings } from "@workspace/platform/business-code-template";
import { systemConfigSchema } from "./schema";

function config() {
  return defaultBusinessCodeConfig({
    companyProjectCodePrefix: "EX",
    companyProjectSequenceWidth: 3,
    companyProjectSequenceStart: 1,
    companyProjectSequenceEnd: 99,
    departmentProjectSequenceWidth: 3,
    otherProjectSequenceStart: 101,
  });
}

test("accepts composable business-code rules", () => {
  assert.equal(systemConfigSchema.safeParse({ businessCodeConfig: config() }).success, true);
});

test("accepts custom templates with complete editable settings", () => {
  const businessCodeConfig = createBusinessCodeTemplate(config(), {
    name: "月度流水",
    settings: defaultBusinessCodeTemplateSettings("system.dateSequence"),
  });
  assert.equal(systemConfigSchema.safeParse({ businessCodeConfig }).success, true);
});

test("requires the complete registry-derived object assignment map", () => {
  const businessCodeConfig = config();
  const { "finance.asset": omitted, ...incompleteAssignments } = businessCodeConfig.management.templateByObject;
  void omitted;
  assert.equal(systemConfigSchema.safeParse({
    businessCodeConfig: {
      ...businessCodeConfig,
      management: {
        ...businessCodeConfig.management,
        templateByObject: incompleteAssignments,
      },
    },
  }).success, false);
});

test("rejects a template assigned to an incompatible registry object", () => {
  const businessCodeConfig = config();
  assert.equal(systemConfigSchema.safeParse({
    businessCodeConfig: {
      ...businessCodeConfig,
      management: {
        ...businessCodeConfig.management,
        templateByObject: {
          ...businessCodeConfig.management.templateByObject,
          "hr.employee": "system.financeAsset",
        },
      },
    },
  }).success, false);
});

test("rejects legacy custom-template family and base fields", () => {
  const businessCodeConfig = config();
  assert.equal(systemConfigSchema.safeParse({
    businessCodeConfig: {
      ...businessCodeConfig,
      management: {
        ...businessCodeConfig.management,
        templates: [{
          key: "custom.invalid",
          name: "错误模板",
          family: "organization",
          baseTemplateKey: "system.sequential",
          example: "FUN-001",
          settings: defaultBusinessCodeTemplateSettings("system.organization"),
        }],
      },
    },
  }).success, false);
});

test("rejects non-five-digit Finance asset sequences", () => {
  const businessCodeConfig = config();
  const parsed = systemConfigSchema.safeParse({
    businessCodeConfig: {
      ...businessCodeConfig,
      financeAsset: {
        ...businessCodeConfig.financeAsset,
        segments: businessCodeConfig.financeAsset.segments.map((segment) => (
          segment.kind === "sequence" ? { ...segment, length: 6 } : segment
        )),
      },
    },
  });
  assert.equal(parsed.success, false);
});

test("rejects unknown date format tokens", () => {
  const businessCodeConfig = config();
  const parsed = systemConfigSchema.safeParse({
    businessCodeConfig: {
      ...businessCodeConfig,
      customer: {
        segments: [
          { kind: "date", source: "createdAt", format: "yyyyMM" },
          { kind: "sequence", length: 5 },
        ],
        sequenceStart: 1,
      },
    },
  });
  assert.equal(parsed.success, false);
});
