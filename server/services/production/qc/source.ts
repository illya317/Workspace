import "server-only";
import path from "path";
import { access } from "fs/promises";

export async function resolvePharmaOpsRoot() {
  const cwd = process.cwd();
  const candidates = [
    process.env.PHARMA_OPS_ROOT,
    path.resolve(cwd, "..", "pharma-ops"),
    path.resolve(cwd, "..", "..", "pharma-ops"),
    path.resolve(cwd, "..", "..", "..", "pharma-ops"),
  ].filter(Boolean) as string[];

  for (const root of candidates) {
    const configRoot = path.join(root, "config");
    try {
      await access(configRoot);
      return { root, configRoot, available: true };
    } catch {
      // Try the next known deployment shape.
    }
  }

  const root = candidates[0] ?? path.resolve(cwd, "..", "pharma-ops");
  return {
    root,
    configRoot: path.join(root, "config"),
    available: false,
    message: "未找到 pharma-ops/config，请设置 PHARMA_OPS_ROOT。",
  };
}
