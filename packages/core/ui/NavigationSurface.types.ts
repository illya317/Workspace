export interface NavigationSurfaceSelectorOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface NavigationSurfaceSelectorSpec {
  value: string;
  options: NavigationSurfaceSelectorOption[];
  onChange: (value: string) => void;
  label?: string;
  visibleCount?: number;
}
