import type { VisualizationNetworkSpec } from "../../VisualizationSurfaceTypes";
import { createDiagramNetworkGraphOptions } from "./VisualizationNetworkDiagram";

export interface VisualizationNetworkImageOptions {
  /** 离屏画布的像素密度倍数，默认 3。 */
  pixelRatio?: number;
  /** 离屏画布 CSS 宽度，默认 2400。 */
  width?: number;
  /** 离屏画布 CSS 高度，默认取 max(960, visual.height ?? 760)。 */
  height?: number;
}

const EXPORT_WIDTH = 2400;
const EXPORT_MIN_HEIGHT = 960;

export async function renderVisualizationNetworkImage(
  visual: VisualizationNetworkSpec,
  options: VisualizationNetworkImageOptions = {},
): Promise<Blob> {
  if (visual.presentation === "map") throw new Error("地图式关系图暂不支持导出");
  if (visual.nodes.length === 0) throw new Error(visual.emptyText ?? "暂无关系数据");

  const pixelRatio = Math.max(1, options.pixelRatio ?? 3);
  const { Graph } = await import("@antv/g6");
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "0";
  host.style.top = "0";
  host.style.width = `${options.width ?? EXPORT_WIDTH}px`;
  host.style.height = `${options.height ?? Math.max(EXPORT_MIN_HEIGHT, visual.height ?? 760)}px`;
  host.style.pointerEvents = "none";
  host.style.visibility = "hidden";
  document.body.appendChild(host);

  const graph = new Graph({
    ...createDiagramNetworkGraphOptions(visual, host),
    devicePixelRatio: pixelRatio,
    behaviors: [],
  });
  try {
    await graph.render();
    const layers = [...host.querySelectorAll("canvas")].filter((canvas) => (
      canvas.width > 0 && canvas.height > 0
    ));
    if (layers.length === 0) throw new Error("关系图导出画布不可用");
    const width = Math.max(...layers.map((canvas) => canvas.width));
    const height = Math.max(...layers.map((canvas) => canvas.height));
    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const context = output.getContext("2d");
    if (!context) throw new Error("浏览器无法创建导出画布");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    for (const layer of layers) context.drawImage(layer, 0, 0, width, height);
    return await canvasToPng(output);
  } finally {
    graph.destroy();
    host.remove();
  }
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("关系图导出失败"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}
