import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  AGENT_MODEL_IMAGE_MAX_EDGE_PX,
  agentModelImageByteBudget,
  agentModelImageMaxEdge,
  createAgentModelImage,
} from "./model-image";

test("model image budgets share one MiB across uploaded images", () => {
  assert.equal(agentModelImageByteBudget(1), 512 * 1024);
  assert.equal(agentModelImageByteBudget(2), 512 * 1024);
  assert.equal(agentModelImageByteBudget(4), 256 * 1024);
  assert.equal(agentModelImageMaxEdge(1), 2_000);
  assert.equal(agentModelImageMaxEdge(2), 2_000);
  assert.equal(agentModelImageMaxEdge(4), 1_414);
});

test("large screenshots remain lossless while shrinking to the model edge", async () => {
  const original = await sharp({
    create: {
      width: 4_000,
      height: 1_600,
      channels: 4,
      background: { r: 248, g: 250, b: 252, alpha: 1 },
    },
  }).composite([{
    input: Buffer.from(`<svg width="4000" height="1600">
      <rect x="120" y="120" width="3760" height="1360" fill="#ffffff" stroke="#111827" stroke-width="8"/>
      <text x="240" y="420" font-size="180" fill="#111827">关账管理制度 2026-07-13</text>
      <text x="240" y="760" font-size="130" fill="#2563eb">金额 123,456.78 元</text>
    </svg>`),
  }]).png().toBuffer();

  const result = await createAgentModelImage(original, "image/png", 512 * 1024);

  assert.equal(result.mimeType, "image/png");
  assert.equal(result.optimized, true);
  assert.ok(Math.max(result.width, result.height) <= AGENT_MODEL_IMAGE_MAX_EDGE_PX);
  assert.ok(result.buffer.length <= 512 * 1024);
});

test("dense photo-like content follows the JPEG byte ladder", async () => {
  const width = 1_600;
  const height = 1_000;
  const pixels = pseudoRandomRgb(width * height * 3);
  const original = await sharp(pixels, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();

  const result = await createAgentModelImage(original, "image/png", 128 * 1024);

  assert.equal(result.mimeType, "image/jpeg");
  assert.equal(result.optimized, true);
  assert.ok(result.buffer.length <= 128 * 1024);
  assert.ok(result.width > 0 && result.height > 0);
});

test("invalid and over-pixel inputs are rejected before model delivery", async () => {
  await assert.rejects(
    createAgentModelImage(Buffer.from("not-an-image"), "image/png", 512 * 1024),
    /无法解码/,
  );

  const overPixel = await sharp({
    create: {
      width: 6_000,
      height: 5_000,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  }).png().toBuffer();
  await assert.rejects(
    createAgentModelImage(overPixel, "image/png", 512 * 1024),
    /2500 万像素/,
  );
});

function pseudoRandomRgb(size: number) {
  const buffer = Buffer.allocUnsafe(size);
  let state = 0x12345678;
  for (let index = 0; index < size; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    buffer[index] = state & 0xff;
  }
  return buffer;
}
