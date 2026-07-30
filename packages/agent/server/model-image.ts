import type { Metadata } from "sharp";

export const AGENT_MODEL_IMAGE_MAX_EDGE_PX = 2_000;
export const AGENT_MODEL_IMAGE_TOTAL_BYTE_BUDGET = 1024 * 1024;
export const AGENT_MODEL_IMAGE_MAX_BYTE_BUDGET = 512 * 1024;
export const AGENT_MODEL_IMAGE_TOTAL_PIXEL_BUDGET = 8_000_000;
export const AGENT_MODEL_IMAGE_MAX_INPUT_PIXELS = 25_000_000;

const JPEG_QUALITY_STEPS = [80, 60, 40, 20] as const;
const FALLBACK_EDGES_PX = [2_000, 1_000, 768, 512, 384, 256] as const;
const PNG_RESCALE_FLOOR_PX = 1_000;

export type AgentModelImageDerivative = {
  buffer: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  optimized: boolean;
};

export function agentModelImageByteBudget(imageCount: number) {
  const count = Math.max(1, Math.floor(imageCount));
  return Math.min(
    AGENT_MODEL_IMAGE_MAX_BYTE_BUDGET,
    Math.floor(AGENT_MODEL_IMAGE_TOTAL_BYTE_BUDGET / count),
  );
}

export function agentModelImageMaxEdge(imageCount: number) {
  const count = Math.max(1, Math.floor(imageCount));
  return Math.min(
    AGENT_MODEL_IMAGE_MAX_EDGE_PX,
    Math.floor(Math.sqrt(AGENT_MODEL_IMAGE_TOTAL_PIXEL_BUDGET / count)),
  );
}

export async function createAgentModelImage(
  buffer: Buffer,
  mimeType: AgentModelImageDerivative["mimeType"],
  byteBudget: number,
  maxEdge = AGENT_MODEL_IMAGE_MAX_EDGE_PX,
): Promise<AgentModelImageDerivative> {
  const metadata = await readSafeMetadata(buffer);
  const originalWidth = requiredDimension(metadata.width);
  const originalHeight = requiredDimension(metadata.height);
  const oriented = orientedDimensions(originalWidth, originalHeight, metadata.orientation);
  const longestEdge = Math.max(oriented.width, oriented.height);
  const animated = isAnimatedImage(mimeType, metadata);

  if (buffer.length <= byteBudget && longestEdge <= maxEdge && !needsOrientation(metadata)) {
    return derivative(buffer, mimeType, oriented.width, oriented.height, originalWidth, originalHeight, false);
  }
  if (animated || mimeType === "image/gif") {
    throw new Error("动画图片超过模型输入预算，请缩小尺寸或转换为静态 PNG/JPG 后重试");
  }

  const edges = candidateEdges(longestEdge, maxEdge);
  const preserveLossless = mimeType === "image/png" || metadata.hasAlpha === true;
  if (preserveLossless) {
    for (const edge of edges.filter((value) => value >= Math.min(PNG_RESCALE_FLOOR_PX, edges[0]))) {
      const candidate = await encodePng(buffer, edge);
      if (candidate.buffer.length <= byteBudget) {
        return derivative(
          candidate.buffer,
          "image/png",
          candidate.width,
          candidate.height,
          originalWidth,
          originalHeight,
          true,
        );
      }
    }
  }

  for (const edge of edges) {
    for (const quality of JPEG_QUALITY_STEPS) {
      const candidate = await encodeJpeg(buffer, edge, quality, preserveLossless);
      if (candidate.buffer.length <= byteBudget) {
        return derivative(
          candidate.buffer,
          "image/jpeg",
          candidate.width,
          candidate.height,
          originalWidth,
          originalHeight,
          true,
        );
      }
    }
  }

  throw new Error(`图片无法压缩到模型输入预算（${Math.round(byteBudget / 1024)}KB）`);
}

async function readSafeMetadata(buffer: Buffer) {
  try {
    const sharp = await loadSharp();
    const metadata = await sharp(buffer, {
      failOn: "warning",
      limitInputPixels: AGENT_MODEL_IMAGE_MAX_INPUT_PIXELS,
    }).metadata();
    const width = requiredDimension(metadata.width);
    const height = requiredDimension(metadata.height);
    if (width * height > AGENT_MODEL_IMAGE_MAX_INPUT_PIXELS) throw new Error("pixel-limit");
    return metadata;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/pixel limit|pixel-limit|exceeds.*pixels/i.test(message)) {
      throw new Error("图片像素过大，最大支持 2500 万像素");
    }
    throw new Error("图片无法解码或文件已损坏");
  }
}

function requiredDimension(value: number | undefined) {
  if (!Number.isInteger(value) || !value || value <= 0) throw new Error("图片缺少有效尺寸");
  return value;
}

function needsOrientation(metadata: Metadata) {
  return typeof metadata.orientation === "number" && metadata.orientation > 1;
}

function orientedDimensions(width: number, height: number, orientation: number | undefined) {
  return orientation && orientation >= 5 && orientation <= 8
    ? { width: height, height: width }
    : { width, height };
}

function isAnimatedImage(mimeType: AgentModelImageDerivative["mimeType"], metadata: Metadata) {
  return (mimeType === "image/gif" || mimeType === "image/webp") && (metadata.pages ?? 1) > 1;
}

function candidateEdges(longestEdge: number, maxEdge: number) {
  const first = Math.min(longestEdge, maxEdge);
  return [...new Set([first, ...FALLBACK_EDGES_PX.filter((edge) => edge < first)])];
}

async function imagePipeline(buffer: Buffer, edge: number) {
  const sharp = await loadSharp();
  return sharp(buffer, {
    failOn: "warning",
    limitInputPixels: AGENT_MODEL_IMAGE_MAX_INPUT_PIXELS,
  })
    .autoOrient()
    .resize({
      width: edge,
      height: edge,
      fit: "inside",
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
      fastShrinkOnLoad: false,
    })
    .toColourspace("srgb");
}

async function encodePng(buffer: Buffer, edge: number) {
  const pipeline = await imagePipeline(buffer, edge);
  const encoded = await pipeline
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer({ resolveWithObject: true });
  return {
    buffer: encoded.data,
    width: encoded.info.width,
    height: encoded.info.height,
  };
}

async function encodeJpeg(buffer: Buffer, edge: number, quality: number, textLike: boolean) {
  const pipeline = await imagePipeline(buffer, edge);
  const encoded = await pipeline
    .flatten({ background: "#ffffff" })
    .jpeg({
      quality,
      mozjpeg: true,
      chromaSubsampling: textLike ? "4:4:4" : "4:2:0",
    })
    .toBuffer({ resolveWithObject: true });
  return {
    buffer: encoded.data,
    width: encoded.info.width,
    height: encoded.info.height,
  };
}

async function loadSharp() {
  return (await import("sharp")).default;
}

function derivative(
  buffer: Buffer,
  mimeType: AgentModelImageDerivative["mimeType"],
  width: number,
  height: number,
  originalWidth: number,
  originalHeight: number,
  optimized: boolean,
): AgentModelImageDerivative {
  return { buffer, mimeType, width, height, originalWidth, originalHeight, optimized };
}
