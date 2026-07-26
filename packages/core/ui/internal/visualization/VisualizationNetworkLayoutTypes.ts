import type {
  VisualizationNetworkEdgeSpec,
  VisualizationNetworkGroupSpec,
  VisualizationNetworkNodeSpec,
  VisualizationTone,
} from "../../VisualizationSurfaceTypes";

export type NetworkLayoutPoint = [number, number];

export type PositionedNetworkNodeData = {
  kind: "entity" | "anchor" | "annotation";
  orientation?: "horizontal" | "vertical";
  spec?: VisualizationNetworkNodeSpec;
  text?: string;
  annotationRole?: "group-title" | "ratio";
  tone?: VisualizationTone;
  width: number;
  height: number;
};

export type PositionedNetworkEdgeData = {
  spec?: VisualizationNetworkEdgeSpec;
  kind: "relation" | "bus" | "drop" | "member";
  controlPoints: NetworkLayoutPoint[];
};

export type PositionedNetworkData = {
  nodes: Array<{
    id: string;
    combo?: string | null;
    data: PositionedNetworkNodeData;
    style: { x: number; y: number };
  }>;
  combos: Array<{
    id: string;
    data: { spec: VisualizationNetworkGroupSpec };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    data: PositionedNetworkEdgeData;
  }>;
};
