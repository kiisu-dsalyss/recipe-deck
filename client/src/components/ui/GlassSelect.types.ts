export interface GlassSelectItem {
  value: string;
  label: string;
  danger?: boolean;
}

export interface GlassSelectGroup {
  /** Omit or empty for a flat list with no heading. */
  label?: string;
  items: GlassSelectItem[];
}

export interface GlassSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  groups: GlassSelectGroup[];
  disabled?: boolean;
  /** Shown when value is empty. */
  emptyLabel?: string;
  includeEmpty?: boolean;
  /** `grow` fills remaining row width (recipe picker). Default `fill` is 100%. */
  layout?: "fill" | "grow";
  /** Text field + same glass menu (editor stem). */
  editable?: boolean;
  placeholder?: string;
  title?: string;
}
