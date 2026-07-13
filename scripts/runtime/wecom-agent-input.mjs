const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function detectWecomImageMimeType(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer.length > 3) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  throw new Error("企业微信图片仅支持 PNG、JPG、WEBP 或 GIF");
}

function defaultFileName(mimeType, index) {
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  return `wecom-image-${index + 1}.${extension}`;
}

async function downloadImage(client, image, index) {
  if (!image?.url) throw new Error("企业微信图片缺少下载地址");
  const downloaded = await client.downloadFile(image.url, image.aeskey);
  const buffer = Buffer.from(downloaded.buffer);
  if (buffer.length <= 0) throw new Error("企业微信图片为空");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("单张图片不能超过 5MB");
  const mimeType = detectWecomImageMimeType(buffer);
  return {
    fileName: downloaded.filename || defaultFileName(mimeType, index),
    mimeType,
    base64: buffer.toString("base64"),
  };
}

export async function readWecomAgentInput(client, frame) {
  const body = frame.body ?? {};
  const textParts = [];
  const imageParts = [];

  if (body.msgtype === "text") textParts.push(body.text?.content || "");
  if (body.msgtype === "voice") textParts.push(body.voice?.content || "");
  if (body.msgtype === "image") imageParts.push(body.image);
  if (body.msgtype === "mixed") {
    for (const item of body.mixed?.msg_item ?? []) {
      if (item?.msgtype === "text") textParts.push(item.text?.content || "");
      if (item?.msgtype === "image") {
        imageParts.push(item.image);
        textParts.push(`[图片${imageParts.length}]`);
      }
    }
  }

  if (imageParts.length > MAX_IMAGES) throw new Error(`一次最多发送 ${MAX_IMAGES} 张图片`);
  const images = await Promise.all(imageParts.map((image, index) => downloadImage(client, image, index)));
  return {
    message: textParts.map((value) => String(value).trim()).filter(Boolean).join("\n"),
    images,
  };
}
