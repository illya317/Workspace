/**
 * 二段 env 加载器：根目录 .env 指定 WORKSPACE_CONFIG_DIR，
 * 再从此目录加载 .env 覆盖到 process.env。
 *
 * 用法：在 next.config.ts / prisma.config.ts / 独立脚本顶部调用 loadWorkspaceEnv()。
 */
import dotenv from "dotenv";
import os from "os";
import path from "path";

function expandTilde(input: string): string {
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

export function loadWorkspaceEnv(): void {
  // 1. 加载根目录 .env（获取 WORKSPACE_CONFIG_DIR）
  //    Next.js/Prisma 通常已自动加载，但 tsx 独立脚本需要显式加载
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });

  const workspaceDir = process.env.WORKSPACE_CONFIG_DIR;
  if (!workspaceDir) return;

  // 2. 从设定文件夹加载实际配置，覆盖根目录同名变量
  const workspaceEnvPath = path.resolve(expandTilde(workspaceDir), ".env");
  dotenv.config({ path: workspaceEnvPath, override: true });
}
