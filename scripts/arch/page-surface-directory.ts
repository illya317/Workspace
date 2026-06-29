import { readFileSync } from "node:fs";

const PAGE_SURFACE_FILE = "packages/core/ui/PageSurface.tsx";

function rendererSource(source: string, name: string) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) return null;
  const bodyStart = source.indexOf("{", start);
  if (bodyStart < 0) return null;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return source.slice(start);
}

export function checkPageSurfaceDirectoryRenderer() {
  const source = readFileSync(PAGE_SURFACE_FILE, "utf8");
  const directoryRenderer = rendererSource(source, "renderDirectorySurface");
  const directorySectionRenderer = rendererSource(source, "renderDirectorySection");
  const directoryBodyRenderer = rendererSource(source, "renderDirectoryBody");
  const loginRenderer = rendererSource(source, "renderLoginBody");
  const failures: string[] = [];

  if (!directoryRenderer || !directorySectionRenderer || !directoryBodyRenderer) {
    failures.push("PageSurface must keep a dedicated renderDirectorySurface renderer.");
  } else {
    if (!directoryRenderer.includes('className="mx-auto max-w-7xl px-4 py-10"')) {
      failures.push("Directory renderer must preserve the historical py-10 module directory spacing.");
    }
    if (
      !directoryBodyRenderer.includes('body.surface.kind !== "moduleGrid"')
      || !directoryBodyRenderer.includes("justify-center")
      || !directoryBodyRenderer.includes("<ModuleCard")
    ) {
      failures.push("Directory renderer must render moduleGrid through its sealed centered directory layout.");
    }
    if (/\brenderCompleteBody\b|\brenderSectionStack\b|\bDatabasePageFrame\b|\bBlockSurface\b|\bPageContent\b/.test(directoryRenderer + directorySectionRenderer + directoryBodyRenderer)) {
      failures.push("Directory renderer must not use standard page, section, BlockSurface, or PageContent renderers.");
    }
  }

  if (!loginRenderer) {
    failures.push("PageSurface must keep a dedicated renderLoginBody renderer.");
  } else {
    if (!loginRenderer.includes("findLoginContent") || !loginRenderer.includes("place-items-center")) {
      failures.push("Login renderer must use its sealed centered content layout.");
    }
    if (/\brenderCompleteBody\b|\brenderSectionStack\b|\bDatabasePageFrame\b|\bBlockSurface\b|\bPageContent\b/.test(loginRenderer)) {
      failures.push("Login renderer must not use standard page, section, BlockSurface, or PageContent renderers.");
    }
  }

  if (failures.length) {
    console.error("PageSurface sealed special renderer regression:");
    for (const failure of failures) console.error(`- ${failure}`);
    return false;
  }

  return true;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  process.exit(checkPageSurfaceDirectoryRenderer() ? 0 : 1);
}
