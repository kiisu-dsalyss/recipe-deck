export interface HfTokenFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when the field loses focus (e.g. persist token without an extra Save click). */
  onBlur?: () => void;
  placeholder?: string;
  id?: string;
}
