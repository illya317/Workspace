import {
  renderVisualizationNetworkImage,
  type VisualizationNetworkSpec,
} from "@workspace/core/ui";

const A3_LANDSCAPE_WIDTH = 1190.55;
const A3_LANDSCAPE_HEIGHT = 841.89;
const PAGE_MARGIN = 36;
const EXPORT_PIXEL_RATIO = 3;

export async function downloadOrganizationChartPdf(visual: VisualizationNetworkSpec) {
  const image = await renderVisualizationNetworkImage(visual, { pixelRatio: EXPORT_PIXEL_RATIO });
  const bitmap = await createImageBitmap(image);
  try {
    const width = bitmap.width;
    const graphHeight = bitmap.height;
    const headerHeight = Math.round(92 * EXPORT_PIXEL_RATIO);
    const graphCanvas = document.createElement("canvas");
    graphCanvas.width = width;
    graphCanvas.height = graphHeight;
    const graphContext = graphCanvas.getContext("2d");
    if (!graphContext) throw new Error("浏览器无法读取组织架构图画布");
    graphContext.fillStyle = "#ffffff";
    graphContext.fillRect(0, 0, width, graphHeight);
    graphContext.drawImage(bitmap, 0, 0);

    const bounds = graphContentBounds(graphContext, width, graphHeight, EXPORT_PIXEL_RATIO);
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = bounds.width;
    exportCanvas.height = bounds.height + headerHeight;

    const context = exportCanvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建 PDF 画布");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    drawHeader(context, EXPORT_PIXEL_RATIO, exportCanvas.width);
    context.drawImage(
      graphCanvas,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      headerHeight,
      bounds.width,
      bounds.height,
    );

    const jpeg = await canvasToJpeg(exportCanvas);
    const pdf = buildJpegPdf({ jpeg, width: exportCanvas.width, height: exportCanvas.height });
    downloadBlob(
      new Blob([pdf], { type: "application/pdf" }),
      `组织架构图-${exportDate()}.pdf`,
    );
  } finally {
    bitmap.close();
  }
}

export function buildJpegPdf(input: { jpeg: Uint8Array; width: number; height: number }) {
  if (input.jpeg.length === 0 || input.width <= 0 || input.height <= 0) {
    throw new Error("PDF 图片内容无效");
  }

  const availableWidth = A3_LANDSCAPE_WIDTH - PAGE_MARGIN * 2;
  const availableHeight = A3_LANDSCAPE_HEIGHT - PAGE_MARGIN * 2;
  const scale = Math.min(availableWidth / input.width, availableHeight / input.height);
  const imageWidth = input.width * scale;
  const imageHeight = input.height * scale;
  const imageX = (A3_LANDSCAPE_WIDTH - imageWidth) / 2;
  const imageY = (A3_LANDSCAPE_HEIGHT - imageHeight) / 2;
  const content = `q\n${decimal(imageWidth)} 0 0 ${decimal(imageHeight)} ${decimal(imageX)} ${decimal(imageY)} cm\n/Im0 Do\nQ\n`;
  const contentBytes = ascii(content);
  const chunks: Uint8Array[] = [];
  const offsets = [0];
  let length = 0;

  const push = (chunk: Uint8Array) => {
    chunks.push(chunk);
    length += chunk.length;
  };
  const object = (id: number, body: string) => {
    offsets[id] = length;
    push(ascii(`${id} 0 obj\n${body}\nendobj\n`));
  };

  push(ascii("%PDF-1.4\n"));
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A3_LANDSCAPE_WIDTH} ${A3_LANDSCAPE_HEIGHT}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  push(ascii(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${input.width} /Height ${input.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${input.jpeg.length} >>\nstream\n`));
  push(input.jpeg);
  push(ascii("\nendstream\nendobj\n"));
  object(5, `<< /Length ${contentBytes.length} >>\nstream\n${content}endstream`);

  const xrefOffset = length;
  const xref = [
    "xref",
    "0 6",
    "0000000000 65535 f ",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    "trailer",
    "<< /Size 6 /Root 1 0 R >>",
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");
  push(ascii(xref));
  return concatenate(chunks, length);
}

function drawHeader(
  context: CanvasRenderingContext2D,
  pixelRatio: number,
  width: number,
) {
  const left = 24 * pixelRatio;
  context.textBaseline = "top";
  context.fillStyle = "#172033";
  context.font = `600 ${24 * pixelRatio}px ui-serif, "Songti SC", serif`;
  context.fillText("组织架构图", left, 18 * pixelRatio);
  context.fillStyle = "#64748b";
  context.font = `${14 * pixelRatio}px ui-sans-serif, system-ui, sans-serif`;
  context.fillText(`导出日期：${exportDate()}`, left, 55 * pixelRatio);
  context.strokeStyle = "#e2e8f0";
  context.lineWidth = pixelRatio;
  context.beginPath();
  context.moveTo(left, 81 * pixelRatio);
  context.lineTo(width - left, 81 * pixelRatio);
  context.stroke();
}

function exportDate() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function graphContentBounds(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelRatio: number,
) {
  const pixels = context.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const index = (y * width + x) * 4;
      if (pixels[index] >= 245 && pixels[index + 1] >= 245 && pixels[index + 2] >= 245) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return { x: 0, y: 0, width, height };

  const padding = Math.round(28 * pixelRatio);
  let left = Math.max(0, minX - padding);
  let right = Math.min(width, maxX + padding);
  const top = Math.max(0, minY - padding);
  const bottom = Math.min(height, maxY + padding);
  const minimumWidth = Math.min(width, Math.round(780 * pixelRatio));
  if (right - left < minimumWidth) {
    const center = (left + right) / 2;
    left = Math.max(0, Math.round(center - minimumWidth / 2));
    right = Math.min(width, left + minimumWidth);
    left = Math.max(0, right - minimumWidth);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("组织架构图转换失败"));
        return;
      }
      void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, "image/jpeg", 0.96);
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function decimal(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function ascii(value: string) {
  return new TextEncoder().encode(value);
}

function concatenate(chunks: readonly Uint8Array[], length: number) {
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
