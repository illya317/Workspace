import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AgentInputImage } from "./runtime/contracts";
import {
  agentModelImageByteBudget,
  agentModelImageMaxEdge,
  createAgentModelImage,
  type AgentModelImageDerivative,
} from "./model-image";

const MAX_IMAGE_ATTACHMENTS = 4;
const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

export async function storeAgentSessionImagesAt(
  agentDataRoot: string,
  sessionStorageKey: string,
  files: File[],
): Promise<AgentInputImage[]> {
  if (files.length > MAX_IMAGE_ATTACHMENTS) {
    throw new Error(`一次最多上传 ${MAX_IMAGE_ATTACHMENTS} 张图片`);
  }

  const byteBudget = agentModelImageByteBudget(files.length);
  const maxEdge = agentModelImageMaxEdge(files.length);
  const pending = [] as Array<{
    file: File;
    buffer: Buffer;
    extension: string;
    model: AgentModelImageDerivative;
  }>;
  for (const file of files) {
    const extension = IMAGE_TYPES.get(file.type);
    if (!extension) throw new Error("仅支持 PNG、JPG、WEBP 或 GIF 图片");
    if (file.size <= 0) throw new Error("图片文件为空");
    if (file.size > MAX_IMAGE_ATTACHMENT_BYTES) throw new Error("单张图片不能超过 5MB");

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasExpectedImageSignature(buffer, file.type)) {
      throw new Error("图片内容与文件类型不匹配");
    }
    const model = await createAgentModelImage(
      buffer,
      file.type as AgentModelImageDerivative["mimeType"],
      byteBudget,
      maxEdge,
    );
    pending.push({ file, buffer, extension, model });
  }

  const now = Date.now();
  const images: AgentInputImage[] = [];
  for (const { file, buffer, extension, model } of pending) {
    const id = `img_${randomUUID().replace(/-/g, "")}`;
    const fileName = `${id}-${safeAssetBaseName(file.name)}.${extension}`;
    const storageKey = path.posix.join(sessionStorageKey, "assets", fileName);
    const fullPath = path.join(agentDataRoot, storageKey);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);

    images.push({
      id,
      fileName: file.name || `image-${now}.${extension}`,
      mimeType: file.type,
      size: file.size,
      storageKey,
      dataUrl: `data:${model.mimeType};base64,${model.buffer.toString("base64")}`,
      model: {
        mimeType: model.mimeType,
        size: model.buffer.length,
        width: model.width,
        height: model.height,
        originalWidth: model.originalWidth,
        originalHeight: model.originalHeight,
        optimized: model.optimized,
      },
    });
  }
  return images;
}

function safeAssetBaseName(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "image";
}

function hasExpectedImageSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer.length > 3;
  if (mimeType === "image/gif") return ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
  if (mimeType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}
