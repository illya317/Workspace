import fs from "node:fs/promises";
import path from "node:path";

const workspaceRoot = path.resolve(process.cwd(), "..");
const qcRoot = path.join(workspaceRoot, ".workspace/config/pharma-qc");
const itemsRoot = path.join(qcRoot, "items");
const sectionsRoot = path.join(workspaceRoot, ".workspace/pdf/sections");
const pdfIndexPath = path.join(sectionsRoot, "index.json");

const stageLabels = {
  intermediate: "中间体",
  packaging: "待包装品",
  finished: "成品",
};

const criticalKeys = new Set([
  "content",
  "content_uniformity",
  "dissolution",
  "related_substances",
  "acid_release",
  "acid_resistance",
  "weight_variation",
  "fill_variation",
]);

const criticalNamePattern = /含量|溶出|释放|有关物质|酸中释放|耐酸力|重量差异|质量差异|装量差异/;
const importantSectionPattern = /操作方法|称重|称样|测定|计算|检查法|对照|供试|数据记录|吸光度|溶出|释放|重量|质量|装量|含量/;

function str(value, fallback = "") {
  return value === undefined || value === null ? fallback : String(value);
}

function normalize(value) {
  return str(value)
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "")
    .replace(/待包品/g, "待包装品");
}

function stageLabel(stageKey) {
  return stageLabels[stageKey] ?? stageKey;
}

function isPrefixSection(section, sequence) {
  return section === sequence || section.startsWith(`${sequence}.`);
}

function sectionsOverlap(section, candidates) {
  return candidates.some((candidate) => (
    section === candidate
    || section.startsWith(`${candidate}.`)
    || candidate.startsWith(`${section}.`)
  ));
}

function sortBySectionAndPage(a, b) {
  const bySection = a.section.localeCompare(b.section, "zh-Hans-CN", { numeric: true });
  if (bySection) return bySection;
  return (a.page ?? 0) - (b.page ?? 0);
}

function isCriticalItem(test) {
  return criticalKeys.has(test.key) || criticalNamePattern.test(test.name);
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function loadItems() {
  const files = (await fs.readdir(itemsRoot)).filter((file) => file.endsWith(".json")).sort();
  const items = [];
  for (const fileName of files) {
    const data = await readJson(path.join(itemsRoot, fileName));
    const test = data.test ?? data;
    items.push({
      fileName,
      path: path.join(itemsRoot, fileName),
      key: str(test.key),
      name: str(test.name),
      sequence: str(test.sequence),
      product: str(test.source?.product),
      product_key: str(test.source?.product_key),
      stage_key: str(test.source?.stage),
      copied_from: test.copied_from ?? null,
      copy_from_packaging: test.copy_from_packaging === true,
      packaging_reference_phrases: Array.isArray(test.packaging_reference_phrases) ? test.packaging_reference_phrases : [],
      sections: Array.isArray(test.sections) ? test.sections.map((section) => ({
        sequence: str(section.sequence),
        title: str(section.title),
        text: str(section.text),
      })) : [],
      text: str(test.text),
      layout_block_count: Array.isArray(test.layout_blocks) ? test.layout_blocks.length : 0,
      method_group_count: Array.isArray(test.method_groups) ? test.method_groups.length : 0,
    });
  }
  return items;
}

function sectionNumbersFromText(value) {
  const matches = str(value).match(/\b2\.\d+(?:\.\d+){0,5}\b/g) ?? [];
  return matches.filter((match) => (
    !/\.\d{3,}$/.test(match)
    && !/\.0$/.test(match)
  ));
}

function reviewSectionsForItem(item, copiedSource = null) {
  const embeddedSections = (source) => source.sections
    .filter((section) => importantSectionPattern.test(section.title))
    .flatMap((section) => sectionNumbersFromText(section.text));
  const specificSections = [
    ...item.sections
      .filter((section) => importantSectionPattern.test(section.title))
      .map((section) => section.sequence),
    ...embeddedSections(item),
    ...item.packaging_reference_phrases.flatMap(sectionNumbersFromText),
    ...(copiedSource ? [
      ...copiedSource.sections
        .filter((section) => importantSectionPattern.test(section.title))
        .map((section) => section.sequence),
      ...embeddedSections(copiedSource),
      ...copiedSource.packaging_reference_phrases.flatMap(sectionNumbersFromText),
    ] : []),
  ].filter(Boolean);
  const concrete = specificSections.filter((section) => (section.match(/\./g) ?? []).length >= 2);
  const fallback = concrete.length ? [] : [item.sequence, copiedSource?.sequence].filter(Boolean);
  return [...new Set([...concrete, ...fallback])]
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }));
}

function candidatesForItem(item, pdfEntries, reviewSections = reviewSectionsForItem(item)) {
  const product = normalize(item.product);
  const stage = normalize(stageLabel(item.stage_key));
  return pdfEntries
    .filter((entry) => normalize(entry.product) === product)
    .filter((entry) => normalize(entry.stage) === stage)
    .filter((entry) => sectionsOverlap(str(entry.section), reviewSections))
    .filter((entry) => importantSectionPattern.test(str(entry.title)) || isCriticalItem(item))
    .sort(sortBySectionAndPage)
    .map((entry) => ({
      section: entry.section,
      title: entry.title,
      page: entry.page,
      source_pdf: entry.source_pdf,
      images: entry.images ?? [],
    }));
}

function fallbackCandidatesForItem(item, pdfEntries, reviewSections = reviewSectionsForItem(item)) {
  const product = normalize(item.product);
  const stage = normalize(stageLabel(item.stage_key));
  return pdfEntries
    .filter((entry) => normalize(entry.product) === product)
    .filter((entry) => normalize(entry.stage) !== stage)
    .filter((entry) => sectionsOverlap(str(entry.section), reviewSections))
    .filter((entry) => importantSectionPattern.test(str(entry.title)) || isCriticalItem(item))
    .sort(sortBySectionAndPage)
    .slice(0, 20)
    .map((entry) => ({
      stage: entry.stage ?? entry.stage_label ?? "",
      section: entry.section,
      title: entry.title,
      page: entry.page,
      source_pdf: entry.source_pdf,
      images: entry.images ?? [],
    }));
}

function entrySummary(entry, includeStage = false) {
  return {
    ...(includeStage ? { stage: entry.stage } : {}),
    section: entry.section,
    title: entry.title,
    page: entry.page,
    source_pdf: entry.source_pdf,
    images: entry.images ?? [],
  };
}

function contextSectionsForItem(item, pdfEntries, directSections, reviewSections = reviewSectionsForItem(item)) {
  const product = normalize(item.product);
  const stage = normalize(stageLabel(item.stage_key));
  const directKeys = new Set(directSections.map((entry) => `${entry.source_pdf}|${entry.section}|${entry.page}`));
  const sameProductStage = pdfEntries
    .filter((entry) => normalize(entry.product) === product)
    .filter((entry) => normalize(entry.stage) === stage);

  if (directSections.length) {
    const directPdfs = new Set(directSections.map((entry) => entry.source_pdf).filter(Boolean));
    const pages = new Set(directSections.map((entry) => Number(entry.page)).filter(Number.isFinite));
    return sameProductStage
      .filter((entry) => !directKeys.has(`${entry.source_pdf}|${entry.section}|${entry.page}`))
      .filter((entry) => !directPdfs.size || directPdfs.has(entry.source_pdf))
      .filter((entry) => {
        const page = Number(entry.page);
        if (!Number.isFinite(page)) return false;
        return pages.has(page - 1) || pages.has(page) || pages.has(page + 1);
      })
      .sort(sortBySectionAndPage)
      .slice(0, 16)
      .map((entry) => entrySummary(entry));
  }

  return sameProductStage
    .filter((entry) => sectionsOverlap(str(entry.section), reviewSections))
    .filter((entry) => importantSectionPattern.test(str(entry.title)) || isCriticalItem(item))
    .sort(sortBySectionAndPage)
    .slice(0, 16)
    .map((entry) => entrySummary(entry));
}

function copiedSourceCandidate(item, itemByProductStageKey) {
  if (!item.copied_from) return null;
  const sourceKey = `${item.product_key}/packaging/${item.copied_from.key}`;
  return itemByProductStageKey.get(sourceKey) ?? null;
}

function mdRows(entries) {
  const lines = [
    "# QC Screenshot Review Index",
    "",
    "This report maps generated QC item JSON files to DOCX-derived section screenshots for manual layout review. It is an audit aid only; it does not prove layout fidelity.",
    "",
    "PNG screenshots are clues. If a table is split, cropped, visually discontinuous, or mixed with page headers/footers, review the adjacent/context screenshots below plus the source PDF, canonical MD, and DOCX context before changing layout blocks.",
    "",
    "## Summary",
    "",
    `- Generated at: ${new Date().toISOString()}`,
    `- Items: ${entries.length}`,
    `- Critical items: ${entries.filter((entry) => entry.critical).length}`,
    `- Critical items without direct screenshots: ${entries.filter((entry) => entry.critical && entry.screenshot_sections.length === 0).length}`,
    `- Critical items without direct screenshots but with copied-source screenshots: ${entries.filter((entry) => entry.critical && entry.screenshot_sections.length === 0 && entry.copied_source_screenshot_sections.length > 0).length}`,
    `- Critical items without direct screenshots but with same-product fallback screenshots: ${entries.filter((entry) => entry.critical && entry.screenshot_sections.length === 0 && entry.fallback_same_product_sections.length > 0).length}`,
    `- Finished copied items: ${entries.filter((entry) => entry.copy_from_packaging).length}`,
    "",
    "## Critical Items Without Direct Screenshot Candidates",
    "",
  ];

  const missingCritical = entries.filter((entry) => entry.critical && entry.screenshot_sections.length === 0);
  if (!missingCritical.length) {
    lines.push("- none", "");
  } else {
    for (const entry of missingCritical) {
      lines.push(`- ${entry.product} / ${entry.stage_label} / ${entry.sequence} ${entry.name} (${entry.key}) -> ${entry.item_file}; reason=${entry.missing_direct_screenshot_reason}`);
    }
    lines.push("");
  }

  lines.push("## Item Review Queue", "");
  for (const entry of entries.filter((item) => item.critical || item.screenshot_sections.length)) {
    lines.push(`### ${entry.product} / ${entry.stage_label} / ${entry.sequence} ${entry.name}`);
    lines.push(`- item: \`${entry.item_file}\``);
    lines.push(`- key: \`${entry.key}\``);
    lines.push(`- review_sections: ${entry.review_sections.join(", ")}`);
    lines.push(`- product_stage_pdf_images: ${entry.product_stage_pdf_image_count}`);
    lines.push(`- copied_from: ${entry.copied_from ? `packaging/${entry.copied_from.sequence} ${entry.copied_from.name}` : ""}`);
    if (entry.packaging_reference_phrases.length) {
      for (const phrase of entry.packaging_reference_phrases) lines.push(`- packaging_ref: ${phrase}`);
    }
    if (entry.copied_source_item) {
      lines.push(`- copied_source_item: \`${entry.copied_source_item.item_file}\``);
    }
    if (!entry.screenshot_sections.length) {
      lines.push(`- direct_screenshots: none (${entry.missing_direct_screenshot_reason})`);
    } else {
      for (const section of entry.screenshot_sections) {
        lines.push(`- screenshot section: ${section.section} ${section.title} (p${section.page})`);
        for (const image of section.images) lines.push(`  - ${image}`);
      }
    }
    if (entry.context_sections.length) {
      lines.push("- context_sections:");
      for (const section of entry.context_sections) {
        lines.push(`  - ${section.section} ${section.title} (p${section.page})`);
        for (const image of section.images) lines.push(`    - ${image}`);
      }
    }
    if (entry.copied_source_screenshot_sections.length) {
      lines.push("- copied_source_screenshots:");
      for (const section of entry.copied_source_screenshot_sections) {
        lines.push(`  - ${section.section} ${section.title} (p${section.page})`);
        for (const image of section.images) lines.push(`    - ${image}`);
      }
    }
    if (entry.copied_source_context_sections.length) {
      lines.push("- copied_source_context_sections:");
      for (const section of entry.copied_source_context_sections) {
        lines.push(`  - ${section.section} ${section.title} (p${section.page})`);
        for (const image of section.images) lines.push(`    - ${image}`);
      }
    }
    if (!entry.screenshot_sections.length && entry.fallback_same_product_sections.length) {
      lines.push("- fallback_same_product_sections:");
      for (const section of entry.fallback_same_product_sections) {
        lines.push(`  - ${section.stage} / ${section.section} ${section.title} (p${section.page})`);
        for (const image of section.images) lines.push(`    - ${image}`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const [items, pdfEntries] = await Promise.all([
    loadItems(),
    readJson(pdfIndexPath),
  ]);
  const pdfStageCounts = new Map();
  const pdfStageImageCounts = new Map();
  for (const entry of pdfEntries) {
    const key = `${normalize(entry.product)}/${normalize(entry.stage)}`;
    pdfStageCounts.set(key, (pdfStageCounts.get(key) ?? 0) + 1);
    pdfStageImageCounts.set(key, (pdfStageImageCounts.get(key) ?? 0) + (entry.images?.length ?? 0));
  }
  const itemByProductStageKey = new Map(items.map((item) => [`${item.product_key}/${item.stage_key}/${item.key}`, item]));
  const entries = items.map((item) => {
    const copiedSource = copiedSourceCandidate(item, itemByProductStageKey);
    const reviewSections = reviewSectionsForItem(item, copiedSource);
    const screenshotSections = candidatesForItem(item, pdfEntries, reviewSections);
    const copiedSourceReviewSections = copiedSource ? reviewSectionsForItem(copiedSource) : [];
    const copiedSourceSections = copiedSource ? candidatesForItem(copiedSource, pdfEntries, copiedSourceReviewSections) : [];
    const contextSections = contextSectionsForItem(item, pdfEntries, screenshotSections, reviewSections);
    const copiedSourceContextSections = copiedSource
      ? contextSectionsForItem(copiedSource, pdfEntries, copiedSourceSections, copiedSourceReviewSections)
      : [];
    const productStageKey = `${normalize(item.product)}/${normalize(stageLabel(item.stage_key))}`;
    const productStagePdfCount = pdfStageCounts.get(productStageKey) ?? 0;
    const productStageImageCount = pdfStageImageCounts.get(productStageKey) ?? 0;
    return {
      product: item.product,
      product_key: item.product_key,
      stage_key: item.stage_key,
      stage_label: stageLabel(item.stage_key),
      sequence: item.sequence,
      key: item.key,
      name: item.name,
      critical: isCriticalItem(item),
      item_file: item.fileName,
      item_path: item.path,
      layout_block_count: item.layout_block_count,
      method_group_count: item.method_group_count,
      review_sections: reviewSections,
      copy_from_packaging: item.copy_from_packaging,
      copied_from: item.copied_from,
      copied_source_item: copiedSource ? {
        item_file: copiedSource.fileName,
        sequence: copiedSource.sequence,
        key: copiedSource.key,
        name: copiedSource.name,
      } : null,
      product_stage_pdf_section_count: productStagePdfCount,
      product_stage_pdf_image_count: productStageImageCount,
      missing_direct_screenshot_reason: screenshotSections.length ? "" : (
        productStagePdfCount === 0
          ? "no_pdf_sections_for_product_stage"
          : "no_matching_section_prefix_for_item_sequence"
      ),
      packaging_reference_phrases: item.packaging_reference_phrases,
      screenshot_sections: screenshotSections,
      context_sections: contextSections,
      copied_source_screenshot_sections: copiedSourceSections,
      copied_source_context_sections: copiedSourceContextSections,
      fallback_same_product_sections: screenshotSections.length ? [] : fallbackCandidatesForItem(item, pdfEntries, reviewSections),
      screenshot_image_count: screenshotSections.reduce((sum, section) => sum + section.images.length, 0),
      context_image_count: contextSections.reduce((sum, section) => sum + section.images.length, 0),
    };
  });

  const summary = {
    generated_at: new Date().toISOString(),
    items: entries.length,
    critical_items: entries.filter((entry) => entry.critical).length,
    critical_without_direct_screenshots: entries.filter((entry) => entry.critical && entry.screenshot_sections.length === 0).length,
    critical_without_direct_but_with_copied_source_screenshots: entries.filter((entry) => (
      entry.critical && entry.screenshot_sections.length === 0 && entry.copied_source_screenshot_sections.length > 0
    )).length,
    critical_without_direct_but_with_fallback_same_product_screenshots: entries.filter((entry) => (
      entry.critical && entry.screenshot_sections.length === 0 && entry.fallback_same_product_sections.length > 0
    )).length,
    copied_finished_items: entries.filter((entry) => entry.copy_from_packaging).length,
    screenshot_sections_root: sectionsRoot,
  };

  const jsonOut = path.join(qcRoot, "screenshot_review_index.json");
  const mdOut = path.join(qcRoot, "screenshot_review_index.md");
  await fs.writeFile(jsonOut, `${JSON.stringify({ summary, entries }, null, 2)}\n`, "utf8");
  await fs.writeFile(mdOut, mdRows(entries), "utf8");

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${jsonOut}`);
  console.log(`Wrote ${mdOut}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
