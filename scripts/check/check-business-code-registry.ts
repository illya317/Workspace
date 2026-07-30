import fs from "node:fs";
import path from "node:path";

import {
  BUSINESS_CODE_OBJECTS,
  BUSINESS_CODE_SYSTEM_TEMPLATES,
} from "../../packages/platform/business-code-registry";
import { defaultBusinessCodeConfig } from "../../packages/platform/business-code-config";
import {
  businessCodeTemplateCompatibleObjectKeys,
  createBusinessCodeTemplate,
} from "../../packages/platform/business-code-management";
import {
  businessCodeTemplateExample,
  parseBusinessCodeTemplateSettings,
} from "../../packages/platform/business-code-template";

const ROOT = process.cwd();
const GENERATED_DOC = path.join(ROOT, "docs/generated/business-code-registry.md");

function unique(values: readonly string[], label: string) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) throw new Error(`${label}存在重复项：${[...new Set(duplicates)].join("、")}`);
}

function validateRegistry() {
  unique(BUSINESS_CODE_OBJECTS.map((item) => item.key), "编码对象 registry");
  unique(BUSINESS_CODE_SYSTEM_TEMPLATES.map((item) => item.key), "编码模板 registry");
  const templates = new Map(BUSINESS_CODE_SYSTEM_TEMPLATES.map((template) => [template.key, template]));
  let reconstructionConfig = defaultBusinessCodeConfig({
    companyProjectCodePrefix: "PRJ",
    companyProjectSequenceWidth: 3,
    companyProjectSequenceStart: 1,
    companyProjectSequenceEnd: 999,
    departmentProjectSequenceWidth: 3,
    otherProjectSequenceStart: 1,
  });
  for (const template of BUSINESS_CODE_SYSTEM_TEMPLATES) {
    parseBusinessCodeTemplateSettings(template.settings);
    if (businessCodeTemplateExample(template.settings) !== template.example) {
      throw new Error(`${template.key} 的规则数据与登记样例不一致`);
    }
    if (businessCodeTemplateCompatibleObjectKeys(reconstructionConfig, template.settings).length === 0) {
      throw new Error(`${template.key} 不能适配任何已登记编码对象`);
    }
    reconstructionConfig = createBusinessCodeTemplate(reconstructionConfig, {
      name: `${template.label} gate 副本`,
      settings: template.settings,
    });
  }
  for (const definition of BUSINESS_CODE_OBJECTS) {
    const template = templates.get(definition.defaultTemplateKey);
    if (!template) {
      throw new Error(`${definition.key} 的默认模板不存在`);
    }
    for (const implementationPath of definition.implementationPaths) {
      if (!fs.existsSync(path.join(ROOT, implementationPath))) {
        throw new Error(`${definition.key} 的实现路径不存在：${implementationPath}`);
      }
    }
  }

  const settingsSource = fs.readFileSync(
    path.join(ROOT, "packages/settings/ui/admin/tabs/BusinessCodeConfigTab.tsx"),
    "utf8",
  );
  const applicationsSource = fs.readFileSync(
    path.join(ROOT, "packages/settings/ui/admin/tabs/BusinessCodeTemplateApplications.ts"),
    "utf8",
  );
  if (!/BUSINESS_CODE_OBJECTS\.filter\(/.test(applicationsSource)) {
    throw new Error("编码管理页面必须遍历 BUSINESS_CODE_OBJECTS registry");
  }
  if (`${settingsSource}\n${applicationsSource}`.includes("BUSINESS_CODE_RULE_OPTIONS")) {
    throw new Error("编码管理页面不得维护平行的编码对象选项列表");
  }
  if (!applicationsSource.includes('title: "关联编码对象"')
    || !applicationsSource.includes("createCategoryDirectItemSection({")
    || settingsSource.includes('key: "business-code-view"')) {
    throw new Error("编码对象关系必须以模板详情关联卡片呈现，不得保留独立编码视图");
  }
  if (!settingsSource.includes('presentation: "block"') || settingsSource.includes('presentation: "modal"')) {
    throw new Error("编码模板新增必须使用页面内 block，不得使用弹窗");
  }
  if (!settingsSource.includes("createCategoryItemDetailBody({")
    || !settingsSource.includes('label: "编码模板"')
    || !settingsSource.includes('desktop: { ratio: [1, 2] }')) {
    throw new Error("编码模板维护必须使用 Platform 分类/直属子项/详情工作台");
  }
  if (settingsSource.includes("createPageActionsSection(")) {
    throw new Error("编码管理不得使用底部动作堆，保存和编辑动作必须进入 FormSurface 根动作区");
  }
  if (!settingsSource.includes('action: "save"') || !settingsSource.includes('action: "edit"')) {
    throw new Error("编码管理保存和编辑必须声明为 FormSurface 根动作");
  }
  if (!settingsSource.includes("deleteBusinessCodeTemplate")
    || !settingsSource.includes("updateBusinessCodeTemplate")) {
    throw new Error("编码模板页面必须提供自定义模板编辑和删除能力");
  }
  if (!settingsSource.includes('action: "copy"') || !settingsSource.includes("复制为自定义模板")) {
    throw new Error("系统编码模板必须只读并可复制为自定义模板");
  }

  const editorSource = fs.readFileSync(
    path.join(ROOT, "packages/settings/ui/admin/tabs/BusinessCodeTemplateEditor.ts"),
    "utf8",
  );
  for (const forbidden of ["基础结构", "organizationFields", "positionFields", "projectFields", "baseTemplateKey"]) {
    if (editorSource.includes(forbidden)) throw new Error(`统一模板编辑器不得包含专用结构分支：${forbidden}`);
  }
  if (!editorSource.includes('title: "规则分支"')
    || !editorSource.includes('title: "适用条件"')
    || !editorSource.includes('title: "编码组成"')
    || !editorSource.includes('title: "流水作用域"')
    || !editorSource.includes('label: "完整示例"')) {
    throw new Error("统一模板编辑器必须提供条件、组成部分、独立流水作用域和分支完整示例");
  }

  const apiSchemaSource = fs.readFileSync(
    path.join(ROOT, "app/api/settings/admin/system-config/schema.ts"),
    "utf8",
  );
  if (!apiSchemaSource.includes("z.enum(businessCodeObjectKeys)")) {
    throw new Error("编码配置 API schema 必须从 BUSINESS_CODE_OBJECTS 派生对象键");
  }

  const objectKeyPattern = /objectKey:\s*["']([^"']+)["']/g;
  const scanRoots = ["packages", "app", "scripts"];
  const registeredKeys = new Set(BUSINESS_CODE_OBJECTS.map((item) => item.key));
  for (const root of scanRoots) {
    walk(path.join(ROOT, root), (file) => {
      if (!/\.(?:ts|tsx|mjs)$/.test(file) || /(?:test|spec)\.[^.]+$/.test(file)) return;
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(objectKeyPattern)) {
        if (!registeredKeys.has(match[1] as never)) {
          throw new Error(`发现未登记的编码对象 ${match[1]}：${path.relative(ROOT, file)}`);
        }
      }
    });
  }
}

function walk(directory: string, visit: (file: string) => void) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target, visit);
    else if (entry.isFile()) visit(target);
  }
}

function generatedMarkdown() {
  const lines = [
    "# 业务编码对象与系统模板",
    "",
    "> 此文件由 `npm run business-code:docs` 从 canonical registry 生成，请勿手工编辑。",
    "",
    "## 编码对象",
    "",
    "| 对象键 | 名称 | Owner | 后端适配 | 默认模板 | 实现入口 |",
    "|---|---|---|---|---|---|",
    ...BUSINESS_CODE_OBJECTS.map((item) => (
      `| \`${item.key}\` | ${item.label} | ${item.ownerModule} | ${item.adapter} | \`${item.defaultTemplateKey}\` | ${item.implementationPaths.map((value) => `\`${value}\``).join("<br>")} |`
    )),
    "",
    "## 系统模板",
    "",
    "| 模板键 | 名称 | 规则分支 | 示例 | 说明 |",
    "|---|---|---:|---|---|",
    ...BUSINESS_CODE_SYSTEM_TEMPLATES.map((template) => (
      `| \`${template.key}\` | ${template.label} | ${template.settings.rules.length} | \`${template.example}\` | ${template.description} |`
    )),
    "",
  ];
  return lines.join("\n");
}

function run() {
  validateRegistry();
  const expected = generatedMarkdown();
  if (process.argv.includes("--write")) {
    fs.mkdirSync(path.dirname(GENERATED_DOC), { recursive: true });
    fs.writeFileSync(GENERATED_DOC, expected);
    console.log(`Business-code registry documentation written (${BUSINESS_CODE_OBJECTS.length} objects).`);
    return;
  }
  const actual = fs.existsSync(GENERATED_DOC) ? fs.readFileSync(GENERATED_DOC, "utf8") : "";
  if (actual !== expected) {
    console.error("Business-code registry documentation is stale. Run npm run business-code:docs.");
    process.exitCode = 1;
    return;
  }
  console.log(`Business-code registry gate passed (${BUSINESS_CODE_OBJECTS.length} objects, ${BUSINESS_CODE_SYSTEM_TEMPLATES.length} system templates).`);
}

run();
