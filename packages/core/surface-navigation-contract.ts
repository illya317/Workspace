export interface SurfaceNavigationTabSpec {
  key: string;
  label: string;
  compactLabel?: string;
  children?: SurfaceNavigationTabSpec[];
}
