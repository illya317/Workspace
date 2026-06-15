#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const root = path.resolve(import.meta.dirname, "../..");
const configRoot = path.join(root, "config/pharma-ops");
const mdRoot = path.join(configRoot, "source_docs/schema/md_canonical");
const outDir = path.join(configRoot, "source_docs/docs/coverage/audit");
const reportJson = path.join(outDir, "workspace_template_source_audit_report.json");
const reportMd = path.join(outDir, "workspace_template_source_audit_report.md");

const stageOrder = ["intermediate", "packaging", "finished"];
const stageLabels = { intermediate: "中间体", packaging: "待包装品", finished: "成品" };
const allowedFinishedBorrow = new Set(["性状", "水分", "含量"]);

function rec(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function str(value, fallback = "") {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function normalizeTitle(value) {
  return str(value)
    .replace(/[|：:]/g, " ")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\s+/g, "")
    .replace(/[（）()，,。.;；]/g, "")
    .replace(/水分/g, "水分")
    .trim();
}

function cleanHeadingTitle(value) {
  return str(value)
    .replace(/\|.*$/, "")
    .replace(/检验日期.*$/, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function readYaml(file) {
  return parseYaml(await fs.readFile(file, "utf8"), { uniqueKeys: false });
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function listFiles(dir, suffix) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(suffix)).map((entry) => path.join(dir, entry.name)).sort();
}

function parseMd(mdText) {
  const stages = [];
  let stage = null;
  let test = null;
  const headingLine = /^(#{2,4})\s+(.+)$/;
  const testHeading = /^(\d+\.\d+)\s*(?:\|\s*)?(.+)$/;
  const childHeading = /^(\d+\.\d+\.\d+(?:\.\d+)*)\s+(.+)$/;
  for (const line of mdText.split(/\r?\n/)) {
    const heading = line.match(headingLine);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      if (level === 2 && /^[一二三]、/.test(text)) {
        stage = { title: text, tests: [] };
        stages.push(stage);
        test = null;
        continue;
      }
      const top = text.match(testHeading);
      if (stage && level === 3 && top) {
        test = { section: top[1], title: cleanHeadingTitle(top[2]), children: [] };
        stage.tests.push(test);
        continue;
      }
      const child = text.match(childHeading);
      if (stage && test && level === 4 && child) {
        test.children.push({ section: child[1], title: cleanHeadingTitle(child[2]), source: "heading" });
      }
      continue;
    }
    if (!test) continue;
    for (const match of line.matchAll(/(?:^|[\s|])(\d+\.\d+\.\d+(?:\.\d+)*)\s+([\u4e00-\u9fffA-Za-z][^|{<\n]{0,28})/g)) {
      const title = cleanHeadingTitle(match[2]);
      if (title && !test.children.some((child) => child.section === match[1])) {
        test.children.push({ section: match[1], title, source: "inline" });
      }
    }
  }
  return stages;
}

function numericGaps(sections) {
  const groups = new Map();
  for (const section of sections) {
    const parts = section.split(".");
    const parent = parts.slice(0, -1).join(".");
    const leaf = Number(parts.at(-1));
    if (Number.isFinite(leaf)) {
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(leaf);
    }
  }
  const gaps = [];
  for (const [parent, nums] of groups.entries()) {
    const uniq = [...new Set(nums)].sort((a, b) => a - b);
    for (let index = 1; index < uniq.length; index += 1) {
      if (uniq[index] !== uniq[index - 1] + 1) gaps.push(`${parent}.${uniq[index - 1]}→${uniq[index]}`);
    }
    if (uniq[0] && uniq[0] > 1) gaps.push(`${parent}.1 missing before ${parent}.${uniq[0]}`);
  }
  return gaps;
}

function keyValid(key) {
  const clean = path.posix.normalize(key.replace(/\\/g, "/").replace(/\.json$/, ""));
  if (!clean || clean.startsWith("../") || clean === ".." || path.isAbsolute(clean)) throw new Error(`Invalid key: ${key}`);
  return clean;
}

async function loadTemplate(id, params = {}, seen = new Set()) {
  const clean = keyValid(id);
  if (seen.has(clean)) return [];
  seen.add(clean);
  const data = rec(await readJson(path.join(configRoot, "table_layouts/templates", `${clean}.json`)));
  const merged = { ...rec(data.params), ...params };
  const entries = [...arr(data.includes), ...arr(data.blocks)].sort((a, b) => Number(rec(a).module_order ?? rec(a).moduleOrder ?? 0) - Number(rec(b).module_order ?? rec(b).moduleOrder ?? 0) || Number(rec(a).order ?? 0) - Number(rec(b).order ?? 0));
  const blocks = [];
  for (const entry of entries) {
    const item = rec(entry);
    if (str(item.type) !== "include" && !item.template_id) {
      blocks.push(mapBlock(item, merged));
      continue;
    }
    const variantKeys = [str(item.variant_param), ...arr(item.variant_param_aliases).map((alias) => str(alias))].filter(Boolean);
    const variantValue = variantKeys.map((key) => str(merged[key])).find(Boolean) || (variantKeys.length ? str(item.default_variant) : "");
    const variant = rec(rec(item.variants)[variantValue]);
    if (variant.skip === true) continue;
    const childId = str(variant.template_id || item.template_id);
    if (childId) blocks.push(...await loadTemplate(childId, { ...merged, ...rec(item.params), ...rec(variant.params) }, new Set(seen)));
  }
  return blocks.filter(Boolean);
}

function substitute(value, params) {
  if (typeof value === "string") return value.replace(/\{\{\s*([\w.-]+)\s*\}|\{\s*([\w.-]+)\s*\}/g, (match, a, b) => {
    const param = params[a || b];
    return param === undefined || typeof param === "object" ? match : String(param);
  });
  if (Array.isArray(value)) return value.map((item) => substitute(item, params));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substitute(item, params)]));
  return value;
}

function mapPart(part, params) {
  const data = rec(substitute(part, params));
  return {
    type: str(data.type, "text"),
    text: str(data.text),
    field: str(data.field),
    fieldKey: str(data.field_key || data.fieldKey || data.key),
    sectionRef: str(data.section_ref || data.sectionRef),
    sectionSuffix: str(data.section_suffix || data.sectionSuffix),
  };
}

function mapCell(cell, params) {
  const data = rec(substitute(cell, params));
  return { rawText: str(data.raw_text || data.rawText || data.text), parts: arr(data.parts).map((part) => mapPart(part, params)) };
}

function mapBlock(block, params) {
  const overrideKeys = ["section_suffix", "section_slot", "section_role", "section_ref", "section_anchor", "conclusion_name", "unit", "order", "module_order"];
  const raw = substitute({ ...rec(block), ...Object.fromEntries(overrideKeys.flatMap((key) => params[key] !== undefined ? [[key, params[key]]] : [])) }, params);
  const custom = mapCustomBlock(raw, params);
  if (custom) return custom;
  return {
    type: str(raw.type, "table"),
    title: str(raw.title || raw.text),
    text: str(raw.text || raw.fixed_text),
    sectionSuffix: str(raw.section_suffix || raw.sectionSuffix || raw.section_no || raw.sectionNo),
    sectionSlot: str(raw.section_slot || raw.sectionSlot),
    sectionRole: str(raw.section_role || raw.sectionRole),
    sectionRef: str(raw.section_ref || raw.sectionRef),
    sectionAnchor: raw.section_anchor === true || raw.sectionAnchor === true,
    rows: arr(raw.rows).map((row) => arr(rec(row).cells).map((cell) => mapCell(cell, params))),
    parts: arr(raw.parts).map((part) => mapPart(part, params)),
  };
}

function mapCustomBlock(raw, params) {
  const type = str(raw.type);
  if (type === "structured_operation_method" || type === "related_substances_operation_method") {
    const scope = raw.params_path ? { ...params, ...rec(params[str(raw.params_path)]) } : params;
    const profile = str(scope.profile, str(raw.profile));
    const segments = arr(rec(raw.profile_segments)[profile]);
    const text = segments.map((segment) => {
      const item = rec(segment);
      const value = item.source ? str(scope[str(item.source)]) : str(item.template).replace(/\{([\w.-]+)\}/g, (match, key) => str(scope[key], match));
      return value ? `${str(item.label)}：${value}` : "";
    }).filter(Boolean).join(" ");
    return text ? { type: "paragraph", parts: [{ type: "text", text }], order: Number(raw.order) || undefined } : null;
  }
  if (type === "related_substances_peak_area_calculation") {
    const systemRows = arr(params[str(raw.system_rows_param)]);
    const peakRows = arr(params[str(raw.peak_rows_param)]);
    const resultRows = arr(params[str(raw.result_rows_param)]);
    return { type: "table", title: str(raw.label), rows: [
      ...systemRows.map((row) => [{ parts: [{ type: "text", text: str(rec(row).text) }] }, { parts: [{ type: "field", field: str(rec(row).field) }] }]),
      ...peakRows.map((row) => [{ parts: [{ type: "text", text: str(rec(row).item) }] }, { parts: [{ type: "field", field: str(rec(row).field) }] }]),
      ...resultRows.map((row) => [{ parts: [{ type: "text", text: str(rec(row).label) }] }, { parts: arr(rec(row).parts).map((item) => mapPart(item, params)) }]),
    ], order: Number(raw.order) || undefined };
  }
  if (type === "related_substances_weighing_table") {
    return { type: "table", title: str(raw.label), rows: arr(params[str(raw.rows_param)]).map((row, index) => [{ parts: [{ type: "text", text: str(rec(row).name) }] }, { parts: [{ type: "field", field: str(rec(row).field || `称样${index + 1}-毛重`) }] }]), order: Number(raw.order) || undefined };
  }
  return null;
}

function joinSectionSuffix(base, suffix) {
  if (!base) return suffix || "";
  if (!suffix || suffix === "auto") return base;
  return `${base}.${suffix}`;
}

function numberBlocks(blocks, sequence) {
  let nextTopLevel = 1;
  const aliases = {};
  return blocks.map((block) => {
    let displaySection;
    if (block.sectionRef) {
      const nested = joinSectionSuffix(aliases[block.sectionRef], block.sectionSuffix);
      displaySection = nested ? `${sequence}.${nested}` : undefined;
      if (nested && block.sectionRole && (block.sectionAnchor || block.sectionSlot)) aliases[block.sectionRole] = nested;
    } else if (block.sectionSlot || block.sectionSuffix === "auto" || block.sectionAnchor) {
      const alias = String(nextTopLevel++);
      if (block.sectionRole) aliases[block.sectionRole] = alias;
      displaySection = `${sequence}.${alias}`;
    } else if (/^\d+(?:\.\d+)*$/.test(block.sectionSuffix)) {
      displaySection = `${sequence}.${block.sectionSuffix}`;
      nextTopLevel = Math.max(nextTopLevel, Number(block.sectionSuffix.split(".")[0]) + 1);
      if (block.sectionRole) aliases[block.sectionRole] = block.sectionSuffix;
    }
    return { ...block, displaySection };
  });
}

function blockTitle(block) {
  const fallback = {
    environment_table: "实验环境",
    equipment_table: "仪器、设备",
    materials_table: "试验材料",
    reference_standard_table: "标准品",
    standard_text: "标准规定",
    abnormal_handling: "实验结果异常处理",
    cleanup_checklist: "清场",
    conclusion: "结论",
    attachment_upload: "原始数据",
    microbiology_cleanroom_exit: "清场",
    title: "操作方法",
  };
  return block.title || fallback[block.type] || "";
}

function resolveAssignment(key, assignments, seen = new Set()) {
  const own = rec(assignments[key]);
  if (!Object.keys(own).length || seen.has(key)) return {};
  seen.add(key);
  const reused = own.reuse_from ? resolveAssignment(str(own.reuse_from), assignments, seen) : {};
  return {
    ...reused,
    ...own,
    template_id: str(own.template_id, str(reused.template_id)),
    params: { ...rec(reused.params), ...rec(own.params) },
  };
}

function collectParts(blocks) {
  const parts = [];
  const visitPart = (part) => parts.push(part);
  for (const block of blocks) {
    for (const part of arr(block.parts)) visitPart(part);
    for (const row of arr(block.rows)) for (const cell of row) for (const part of arr(cell.parts)) visitPart(part);
  }
  return parts;
}

function flattenFields(methodName, definition, group = methodName) {
  const fields = [];
  for (const item of arr(definition)) {
    const field = rec(item);
    const repeat = rec(field.repeat);
    if (Array.isArray(repeat.fields)) {
      const count = Number(repeat.count) || 1;
      for (let index = 1; index <= count; index += 1) {
        const expanded = repeat.fields.map((child) => {
          const data = rec(child);
          return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === "string" ? value.replaceAll("{序号}", String(index)) : value]));
        });
        fields.push(...flattenFields(methodName, expanded, group));
      }
      continue;
    }
    const name = str(field.name);
    if (name) fields.push({ name, group, attr: str(field.attr), formula: str(field.formula), rule: str(field.rule), defaultValue: str(field.default ?? field.value) });
  }
  return fields;
}

function methodFields(methodName, methodIndex) {
  const current = rec(methodIndex[methodName] || methodIndex[methodName.split("-")[0]]);
  const base = rec(methodIndex[str(current.extends)]);
  const fromDef = (name, def) => Object.entries(rec(def)).filter(([key]) => !["extends", "extra", "render_as"].includes(key)).flatMap(([group, value]) => flattenFields(name, value, group));
  return [...fromDef(str(current.extends), base), ...fromDef(methodName, current), ...flattenFields(methodName, current.extra, "扩展")];
}

function formulaRefs(expr, fields) {
  const refs = new Set();
  for (const field of [...fields].sort((a, b) => b.name.length - a.name.length)) {
    if (field.name && expr.includes(field.name)) refs.add(field.name);
  }
  return [...refs];
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const [templateFiles, methodFiles] = await Promise.all([
    listFiles(path.join(configRoot, "record_templates"), ".yaml"),
    listFiles(path.join(configRoot, "methods"), ".yaml"),
  ]);
  const layoutAssignments = rec((await readJson(path.join(configRoot, "table_layouts/layout_mapping.json"))).assignments);
  const methods = {};
  for (const file of methodFiles) {
    Object.assign(methods, rec((await readYaml(file)).methods));
  }
  const products = [];
  for (const file of templateFiles) {
    const productId = path.basename(file, ".yaml");
    const yaml = rec(await readYaml(file));
    const productName = str(yaml["产品名称"], productId);
    const mdFile = path.join(mdRoot, `${productName}.md`);
    const md = parseMd(await fs.readFile(mdFile, "utf8"));
    const stages = [];
    for (const [stageIndex, stageKey] of stageOrder.entries()) {
      const yamlStage = rec(rec(yaml["阶段"])[stageKey]);
      const mdStage = md[stageIndex] || { tests: [] };
      const yamlTests = arr(yamlStage["检测项"]);
      const tests = [];
      for (const yamlTest of yamlTests) {
        const sequence = str(yamlTest["序号"]);
        const name = str(yamlTest["名称"]);
        const englishName = str(yamlTest["英文名"]);
        const methodName = str(yamlTest["方法"]);
        const mdTest = mdStage.tests.find((item) => item.section === sequence);
        const assignment = resolveAssignment(`products/${productId}/${stageKey}/${englishName}`, layoutAssignments);
        const templateId = str(assignment.template_id);
        const params = rec(assignment.params);
        const blocks = templateId ? await loadTemplate(templateId, params).catch(() => []) : [];
        const numbered = numberBlocks(blocks, sequence);
        const rendered = numbered.filter((block) => block.displaySection).map((block) => ({ section: block.displaySection, title: blockTitle(block), type: block.type }));
        const layoutBlob = JSON.stringify(blocks);
        const parts = collectParts(blocks);
        const partFields = new Set(parts.flatMap((part) => [part.field, part.fieldKey].filter(Boolean)));
        const fieldPresent = (fieldName) => partFields.has(fieldName) || layoutBlob.includes(`"field":"${fieldName}"`) || layoutBlob.includes(`"fieldKey":"${fieldName}"`);
        const fields = methodFields(methodName, methods);
        const calculated = fields.filter((field) => field.attr === "calculated" && (field.formula || field.rule));
        const missingFormulaDom = [];
        const missingFormulaInputs = [];
        for (const field of calculated) {
          if (!fieldPresent(field.name)) missingFormulaDom.push(field.name);
          for (const ref of formulaRefs(field.formula || field.rule, fields).filter((ref) => ref !== field.name)) {
            const refField = fields.find((candidate) => candidate.name === ref);
            if (!fieldPresent(ref) && refField?.attr !== "calculated" && !(refField?.attr === "prefilled" && refField.defaultValue)) {
              missingFormulaInputs.push(`${field.name} <= ${ref}`);
            }
          }
        }
        const expectedChildren = arr(mdTest?.children).filter((child) => child.section.startsWith(`${sequence}.`));
        const renderedBySection = new Map(rendered.map((item) => [item.section, item]));
        const missingHeadings = expectedChildren
          .filter((child) => !renderedBySection.has(child.section))
          .filter(() => !(stageKey === "finished" && allowedFinishedBorrow.has(name)))
          .map((child) => `${child.section} ${child.title} (${child.source})`);
        tests.push({
          sequence,
          name,
          methodName,
          templateId,
          mdTitle: mdTest?.title || "",
          titleMismatch: mdTest && normalizeTitle(mdTest.title) && normalizeTitle(name) !== normalizeTitle(mdTest.title),
          sourceHeadingGaps: numericGaps(expectedChildren.map((child) => child.section)),
          renderedHeadingGaps: numericGaps(rendered.map((item) => item.section)),
          missingHeadings,
          missingFormulaDom,
          missingFormulaInputs: [...new Set(missingFormulaInputs)],
        });
      }
      const yamlSeq = yamlTests.map((test) => str(rec(test)["序号"]));
      const mdSeq = mdStage.tests.map((test) => test.section);
      stages.push({
        key: stageKey,
        label: stageLabels[stageKey],
        missingYamlTests: mdStage.tests.filter((test) => !yamlSeq.includes(test.section)).map((test) => `${test.section} ${test.title}`),
        extraYamlTests: yamlTests.filter((test) => !mdSeq.includes(str(rec(test)["序号"]))).map((test) => `${str(rec(test)["序号"])} ${str(rec(test)["名称"])}`),
        tests,
      });
    }
    products.push({ productId, productName, stages });
  }
  const issueCount = products.flatMap((product) => product.stages.flatMap((stage) => [
    ...stage.missingYamlTests,
    ...stage.extraYamlTests,
    ...stage.tests.flatMap((test) => [
      ...(test.titleMismatch ? ["titleMismatch"] : []),
      ...test.sourceHeadingGaps,
      ...test.renderedHeadingGaps,
      ...test.missingHeadings,
      ...test.missingFormulaDom,
      ...test.missingFormulaInputs,
    ]),
  ])).length;
  const report = { generatedAt: new Date().toISOString(), productCount: products.length, issueCount, products };
  await fs.writeFile(reportJson, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(reportMd, markdown(report));
  console.log(`Audited ${products.length} products, ${issueCount} issue signals.`);
  console.log(path.relative(root, reportMd));
}

function markdown(report) {
  const lines = [
    "# Workspace QC 模板-真源 MD 审计报告",
    "",
    `生成时间：${report.generatedAt}`,
    `产品数：${report.productCount}`,
    `问题信号数：${report.issueCount}`,
    "",
  ];
  for (const product of report.products) {
    lines.push(`## ${product.productName} (${product.productId})`, "");
    for (const stage of product.stages) {
      lines.push(`### ${stage.label}`);
      if (stage.missingYamlTests.length) lines.push(`- MD 有但 YAML 缺检测项：${stage.missingYamlTests.join("；")}`);
      if (stage.extraYamlTests.length) lines.push(`- YAML 有但 MD 缺检测项：${stage.extraYamlTests.join("；")}`);
      for (const test of stage.tests) {
        const issues = [];
        if (test.titleMismatch) issues.push(`标题差异：YAML=${test.name} / MD=${test.mdTitle}`);
        if (test.sourceHeadingGaps.length) issues.push(`MD 子标题不连续：${test.sourceHeadingGaps.join("，")}`);
        if (test.renderedHeadingGaps.length) issues.push(`JSON 渲染标题不连续：${test.renderedHeadingGaps.join("，")}`);
        if (test.missingHeadings.length) issues.push(`JSON 缺 MD 标题：${test.missingHeadings.join("；")}`);
        if (test.missingFormulaDom.length) issues.push(`计算字段未见 JSON 回填：${test.missingFormulaDom.join("，")}`);
        if (test.missingFormulaInputs.length) issues.push(`公式引用输入未见 JSON 字段：${test.missingFormulaInputs.join("，")}`);
        if (issues.length) lines.push(`- ${test.sequence} ${test.name} [${test.templateId || "no-template"}]：${issues.join("；")}`);
      }
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
