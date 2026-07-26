#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { requireDatabaseUrl } from "../lib/database-url.js";
import { normalizeSourceText, parseProductMasterSources, productIdentityKey, resolveCostAlias, stableCode } from "./product-master-source.mjs";

const execute = process.argv.includes("--execute");
const value = (key, fallback = null) => process.argv.find((argument) => argument.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const inputDir = value("input-dir");
const companyCode = value("company-code");
const aliasFile = value("alias-file");
if (!inputDir) throw new Error("缺少 --input-dir=<absolute-directory>");
if (!companyCode) throw new Error("缺少 --company-code=<code>");
if (!aliasFile) throw new Error("缺少 --alias-file=<absolute-file>");
if (!path.isAbsolute(inputDir) || !path.isAbsolute(aliasFile)) throw new Error("input-dir 与 alias-file 必须是绝对路径");
if (!fs.existsSync(inputDir)) throw new Error(`输入目录不存在：${inputDir}`);

const source = parseProductMasterSources(inputDir);
const aliases = JSON.parse(fs.readFileSync(aliasFile, "utf8"));
const { PrismaClient } = await import("../../generated/prisma/client.ts");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: requireDatabaseUrl(), application_name: "workspace-product-master-import" }) });

function sourceKey(name, specification) {
  return `${normalizeSourceText(name).toLowerCase()}|${normalizeSourceText(specification).toLowerCase()}`;
}

async function main() {
  const company = await prisma.company.findUnique({ where: { code: companyCode }, select: { id: true, code: true } });
  if (!company) throw new Error(`公司编码不存在：${companyCode}`);
  const [shipmentRows, costRows, receiptBatches, receiptWorkPoints, receiptOutputs] = await Promise.all([
    prisma.financeShipment.findMany({ where: { productName: { not: null } }, select: { id: true, productName: true, spec: true, sourceFile: true, sourceSheet: true, sourceRow: true } }),
    prisma.financeCostStructureRow.findMany({ where: { productName: { not: null } }, select: { id: true, productName: true, sourceFile: true, sourceSheet: true, sourceRow: true } }),
    prisma.inventoryReceiptBatch.findMany({ select: { id: true, productName: true, specification: true } }),
    prisma.inventoryReceiptProductWorkPoint.findMany({ select: { id: true, productName: true } }),
    prisma.inventoryReceiptOutput.findMany({ include: { batch: { select: { productName: true, specification: true } } } }),
  ]);
  const skuByExactSource = new Map(source.skus.flatMap((sku) => [
    [sourceKey(sku.name, sku.specification), sku],
    ...sku.sources.map((item) => [sourceKey(item.name, item.rawSpecification), sku]),
  ]));
  const shipmentMatches = shipmentRows.map((row) => ({ row, sku: skuByExactSource.get(sourceKey(row.productName, row.spec)) ?? null }));
  const costGroups = [...new Map(costRows.map((row) => [normalizeSourceText(row.productName), row.productName])).values()].filter(Boolean);
  const costMatches = costGroups.map((name) => ({ name, ...resolveCostAlias(name, source.products, source.skus, aliases) }));
  const plan = {
    mode: execute ? "execute" : "dry-run",
    companyCode,
    sourceFiles: source.files,
    sourceRows: source.rowCount,
    products: source.products.length,
    skus: source.skus.length,
    shipmentRows: shipmentRows.length,
    shipmentMatched: shipmentMatches.filter((item) => item.sku).length,
    shipmentPending: shipmentMatches.filter((item) => !item.sku).length,
    shipmentPendingSources: [...new Map(shipmentMatches.filter((item) => !item.sku).map((item) => [sourceKey(item.row.productName, item.row.spec), { name: item.row.productName, spec: item.row.spec }])).values()],
    costAliases: costMatches.length,
    costAliasesMatched: costMatches.filter((item) => item.sku).length,
    costAliasesPending: costMatches.filter((item) => !item.sku).map((item) => ({ name: item.name, reason: item.reason })),
    receiptBatches: receiptBatches.length,
    receiptWorkPoints: receiptWorkPoints.length,
    receiptOutputs: receiptOutputs.length,
  };
  console.log(JSON.stringify(plan, null, 2));
  if (!execute) return;

  const counters = { products: 0, skus: 0, mappings: 0, shipmentsLinked: 0, costRowsLinked: 0, receiptBatchesLinked: 0, receiptWorkPointsLinked: 0, receiptOutputsLinked: 0, costReportsLinked: 0, pendingMappings: 0 };
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('workspace-product-master-import'))`;
    const productIds = new Map();
    for (const product of source.products) {
      const saved = await tx.product.upsert({ where: { identityKey: product.key }, create: { code: product.code, identityKey: product.key, name: product.name, dosageForm: product.dosageForm, strength: product.strength }, update: { name: product.name, dosageForm: product.dosageForm, strength: product.strength, status: "active", version: { increment: 1 } } });
      productIds.set(product.key, saved.id); counters.products += 1;
    }
    const skuIds = new Map();
    for (const sku of source.skus) {
      const productId = productIds.get(sku.product.key);
      const saved = await tx.inventoryItem.upsert({ where: { companyCode_code: { companyCode, code: sku.code } }, create: { companyCode, code: sku.code, name: sku.name, itemType: "finished_goods", productMasterId: productId, specification: sku.specification, baseUnit: sku.baseUnit, contentUnit: sku.contentUnit, unitsPerPackage: sku.unitsPerPackage, packagesPerCase: sku.packagesPerCase, sourceFile: sku.sources.at(-1)?.sourceFile, sourceSheet: sku.sources.at(-1)?.sourceSheet, sourceKey: sku.key }, update: { name: sku.name, productMasterId: productId, specification: sku.specification, baseUnit: sku.baseUnit, contentUnit: sku.contentUnit, unitsPerPackage: sku.unitsPerPackage, packagesPerCase: sku.packagesPerCase, status: "active", version: { increment: 1 } } });
      skuIds.set(sku.key, saved.id); counters.skus += 1;
      for (const item of sku.sources) {
        await tx.productSourceMapping.upsert({ where: { sourceSystem_sourceKey: { sourceSystem: "inventory.finished-goods-receipt", sourceKey: item.key } }, create: { productSkuId: saved.id, sourceSystem: "inventory.finished-goods-receipt", sourceKey: item.key, sourceName: item.name, sourceSpecification: item.rawSpecification, normalizedName: item.normalizedName, normalizedSpecification: item.normalizedSpecification, status: "confirmed", sourceFile: item.sourceFile, sourceSheet: item.sourceSheet, sourceRow: item.sourceRow }, update: { productSkuId: saved.id, status: "confirmed", sourceFile: item.sourceFile, sourceSheet: item.sourceSheet, sourceRow: item.sourceRow } });
        counters.mappings += 1;
      }
    }
    const productByName = new Map(source.products.map((product) => [normalizeSourceText(product.name), { ...product, id: productIds.get(product.key), fromFinishedGoods: true }]));
    const sourceNames = [...new Set([...receiptBatches.map((row) => row.productName), ...receiptWorkPoints.map((row) => row.productName)])];
    for (const sourceName of sourceNames) {
      const normalizedName = normalizeSourceText(sourceName);
      const aliasedName = aliases[normalizedName] ?? normalizedName;
      let product = productByName.get(normalizeSourceText(aliasedName));
      if (!product) {
        const strength = normalizeSourceText(receiptBatches.find((row) => row.productName === sourceName)?.specification) || null;
        const key = productIdentityKey(sourceName, strength);
        const saved = await tx.product.upsert({ where: { identityKey: key }, create: { code: stableCode("PRD", key, 8), identityKey: key, name: sourceName, dosageForm: sourceName.includes("胶囊") ? "胶囊剂" : sourceName.includes("片") ? "片剂" : null, strength }, update: { status: "active" } });
        product = { key, code: saved.code, name: saved.name, dosageForm: saved.dosageForm, strength: saved.strength, id: saved.id, fromFinishedGoods: false };
        productByName.set(normalizedName, product);
        productIds.set(key, saved.id);
        counters.products += 1;
      }
      const batchUpdate = await tx.inventoryReceiptBatch.updateMany({ where: { productName: sourceName }, data: { productId: product.id } });
      const workPointUpdate = await tx.inventoryReceiptProductWorkPoint.updateMany({ where: { productName: sourceName }, data: { productId: product.id } });
      counters.receiptBatchesLinked += batchUpdate.count;
      counters.receiptWorkPointsLinked += workPointUpdate.count;
      await tx.productSourceMapping.upsert({ where: { sourceSystem_sourceKey: { sourceSystem: "inventory.receipts", sourceKey: `product:${normalizedName}` } }, create: { productId: product.id, sourceSystem: "inventory.receipts", sourceKey: `product:${normalizedName}`, sourceName, normalizedName, status: "confirmed" }, update: { productId: product.id, status: "confirmed" } });
    }
    let runtimeSkus = await tx.inventoryItem.findMany({ where: { productMasterId: { in: [...productIds.values()] } } });
    for (const output of receiptOutputs) {
      const normalizedName = normalizeSourceText(output.batch.productName);
      const product = productByName.get(normalizeSourceText(aliases[normalizedName] ?? normalizedName));
      if (!product) continue;
      const unitsPerPackage = Number(output.unitsPerPackage);
      const candidates = runtimeSkus.filter((sku) => sku.productMasterId === product.id && Number(sku.unitsPerPackage) === unitsPerPackage);
      let sku = candidates.length === 1 ? candidates[0] : null;
      if (!sku && candidates.length === 0 && !product.fromFinishedGoods) {
        const unit = output.packagingNote.match(/(?:片|粒|袋|支)/)?.[0] ?? null;
        const specification = `${normalizeSourceText(output.batch.specification)}*${unitsPerPackage}${unit ?? "单位"}`;
        const key = `${product.key}|${normalizeSourceText(specification).toLowerCase()}|${normalizeSourceText(output.packageUnit).toLowerCase()}`;
        sku = await tx.inventoryItem.upsert({ where: { companyCode_code: { companyCode, code: stableCode("SKU", key) } }, create: { companyCode, code: stableCode("SKU", key), name: product.name, itemType: "finished_goods", productMasterId: product.id, specification, baseUnit: output.packageUnit, contentUnit: unit, unitsPerPackage, packagesPerCase: output.packagesPerCase, sourceFile: output.sourceFile, sourceSheet: output.sourceSheet, sourceKey: key }, update: { productMasterId: product.id, packagesPerCase: output.packagesPerCase, status: "active" } });
        runtimeSkus.push(sku); counters.skus += 1;
      }
      const key = `output:${normalizeSourceText(output.batch.productName)}|${normalizeSourceText(output.batch.specification)}|${normalizeSourceText(output.packagingNote)}`;
      if (sku) {
        await tx.inventoryReceiptOutput.update({ where: { id: output.id }, data: { productSkuId: sku.id } }); counters.receiptOutputsLinked += 1;
        await tx.productSourceMapping.upsert({ where: { sourceSystem_sourceKey: { sourceSystem: "inventory.receipts", sourceKey: key } }, create: { productSkuId: sku.id, sourceSystem: "inventory.receipts", sourceKey: key, sourceName: output.batch.productName, sourceSpecification: output.packagingNote, normalizedName, normalizedSpecification: normalizeSourceText(output.packagingNote), status: "confirmed", sourceFile: output.sourceFile, sourceSheet: output.sourceSheet, sourceRow: output.sourceRow }, update: { productSkuId: sku.id, status: "confirmed" } });
      } else {
        await tx.productSourceMapping.upsert({ where: { sourceSystem_sourceKey: { sourceSystem: "inventory.receipts", sourceKey: key } }, create: { productId: product.id, sourceSystem: "inventory.receipts", sourceKey: key, sourceName: output.batch.productName, sourceSpecification: output.packagingNote, normalizedName, normalizedSpecification: normalizeSourceText(output.packagingNote), status: "pending", sourceFile: output.sourceFile, sourceSheet: output.sourceSheet, sourceRow: output.sourceRow, sourceData: { reason: candidates.length > 1 ? "ambiguous_sku" : "sku_not_in_finished_goods_receipts" } }, update: {} }); counters.pendingMappings += 1;
      }
    }
    for (const match of shipmentMatches) {
      const key = `shipment:${sourceKey(match.row.productName, match.row.spec)}`;
      if (!match.sku) {
        await tx.productSourceMapping.upsert({ where: { sourceSystem_sourceKey: { sourceSystem: "finance.shipment", sourceKey: key } }, create: { sourceSystem: "finance.shipment", sourceKey: key, sourceName: match.row.productName, sourceSpecification: match.row.spec, normalizedName: normalizeSourceText(match.row.productName), normalizedSpecification: normalizeSourceText(match.row.spec), status: "pending", sourceFile: match.row.sourceFile, sourceSheet: match.row.sourceSheet, sourceRow: match.row.sourceRow }, update: {} });
        continue;
      }
      const productSkuId = skuIds.get(match.sku.key);
      await tx.financeShipment.update({ where: { id: match.row.id }, data: { productId: productSkuId } }); counters.shipmentsLinked += 1;
      await tx.productSourceMapping.upsert({ where: { sourceSystem_sourceKey: { sourceSystem: "finance.shipment", sourceKey: key } }, create: { productSkuId, sourceSystem: "finance.shipment", sourceKey: key, sourceName: match.row.productName, sourceSpecification: match.row.spec, normalizedName: normalizeSourceText(match.row.productName), normalizedSpecification: normalizeSourceText(match.row.spec), status: "confirmed", sourceFile: match.row.sourceFile, sourceSheet: match.row.sourceSheet, sourceRow: match.row.sourceRow }, update: { productSkuId, status: "confirmed" } });
    }
    for (const match of costMatches) {
      const key = `cost:${normalizeSourceText(match.name)}`;
      const productSkuId = match.sku ? skuIds.get(match.sku.key) : null;
      if (productSkuId) {
        const updated = await tx.financeCostStructureRow.updateMany({ where: { productName: match.name }, data: { productId: productSkuId } }); counters.costRowsLinked += updated.count;
        await tx.productSourceMapping.upsert({ where: { sourceSystem_sourceKey: { sourceSystem: "finance.cost-structure", sourceKey: key } }, create: { productSkuId, sourceSystem: "finance.cost-structure", sourceKey: key, sourceName: match.name, normalizedName: normalizeSourceText(match.name), status: "confirmed" }, update: { productSkuId, status: "confirmed" } });
      } else {
        await tx.productSourceMapping.upsert({ where: { sourceSystem_sourceKey: { sourceSystem: "finance.cost-structure", sourceKey: key } }, create: { productId: match.product ? productIds.get(match.product.key) : null, sourceSystem: "finance.cost-structure", sourceKey: key, sourceName: match.name, normalizedName: normalizeSourceText(match.name), status: "pending", sourceData: { reason: match.reason } }, update: {} }); counters.pendingMappings += 1;
      }
    }
    const linkedCosts = await tx.financeCostStructureRow.findMany({ where: { productId: { not: null }, receiptReportId: null }, select: { id: true, year: true, month: true, product: { select: { productMasterId: true } } } });
    for (const row of linkedCosts) {
      if (!row.month || !row.product?.productMasterId) continue;
      const reports = await tx.inventoryReceiptReport.findMany({ where: { year: row.year, month: row.month, batches: { some: { productId: row.product.productMasterId } } }, select: { id: true }, take: 2 });
      if (reports.length !== 1) continue;
      await tx.financeCostStructureRow.update({ where: { id: row.id }, data: { receiptReportId: reports[0].id } }); counters.costReportsLinked += 1;
    }
  }, { timeout: 120000 });
  console.log(JSON.stringify({ completed: true, ...counters }, null, 2));
}

main().finally(() => prisma.$disconnect());
