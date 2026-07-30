import { authorize } from "@workspace/platform/server/auth";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";

import { callBusinessDocumentIntelligence } from "./business-document-intelligence-client";
import {
  buildInvestmentDocumentSearchCommand,
  buildInvestmentDocumentUploadCommand,
} from "./domain/investment-enterprise-validation";

const RESOURCE_KEY = "capitalSecurities.investments";

export async function uploadInvestmentEnterpriseDocument(command: {
  userId: number;
  profileId: unknown;
  documentCategory: unknown;
  title: unknown;
  notes: unknown;
  file: File;
}) {
  if (!(await authorize({ user: command.userId, resourceKey: RESOURCE_KEY, action: "import" }))) return serviceError("没有资料导入权限", 403);
  const validated = await buildInvestmentDocumentUploadCommand(command);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  const { profileId, file, ...metadata } = validated.data;
  const profile = await prisma.investmentEnterpriseProfile.findUnique({
    where: { id: profileId },
    include: { company: true },
  });
  if (!profile) return serviceError("投资企业档案不存在", 404);
  const link = await prisma.investmentEnterpriseDocumentLink.create({
    data: {
      profileId: profile.id,
      documentCategory: metadata.documentCategory,
      title: metadata.title,
      notes: metadata.notes,
      uploadStatus: "processing",
      linkedBy: command.userId,
    },
  });
  try {
    const contentBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const response = await callBusinessDocumentIntelligence({
      operation: "upload",
      requesterId: command.userId,
      resourceKey: RESOURCE_KEY,
      companyCode: profile.company.code,
      documentCategory: metadata.documentCategory,
      title: metadata.title,
      notes: metadata.notes,
      file: { fileName: file.name, mimeType: file.type || null, contentBase64 },
    });
    if (response.operation !== "upload") throw new Error("资料库返回了错误的操作结果");
    await prisma.investmentEnterpriseDocumentLink.update({
      where: { id: link.id },
      data: { libraryDocumentUid: response.document.documentUid, uploadStatus: "linked", linkedAt: new Date(), failureReason: null },
    });
    return serviceOk({ success: true, document: response.document });
  } catch (error) {
    const message = error instanceof Error ? error.message : "资料处理失败";
    await prisma.investmentEnterpriseDocumentLink.update({
      where: { id: link.id },
      data: { uploadStatus: "failed", failureReason: message.slice(0, 500) },
    });
    return serviceError(message, 409);
  }
}

export async function searchInvestmentEnterpriseDocuments(command: {
  userId: number;
  profileId: unknown;
  query: unknown;
  limit: unknown;
}) {
  if (!(await authorize({ user: command.userId, resourceKey: RESOURCE_KEY, action: "read" }))) return serviceError("无权限", 403);
  const validated = await buildInvestmentDocumentSearchCommand(command);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  const links = await prisma.investmentEnterpriseDocumentLink.findMany({
    where: { profileId: validated.data.profileId, uploadStatus: "linked", libraryDocumentUid: { not: null } },
    select: { libraryDocumentUid: true },
  });
  const documentUids = links.flatMap((link) => link.libraryDocumentUid ? [link.libraryDocumentUid] : []);
  if (!documentUids.length) return serviceOk({ mode: "unavailable", modelKey: null, message: "该企业尚无已处理资料", results: [] });
  try {
    const response = await callBusinessDocumentIntelligence({
      operation: "search",
      requesterId: command.userId,
      resourceKey: RESOURCE_KEY,
      documentUids,
      query: validated.data.query,
      limit: validated.data.limit,
    });
    return response.operation === "search" ? serviceOk(response) : serviceError("资料库返回了错误的检索结果", 502);
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "语义检索失败", 409);
  }
}
