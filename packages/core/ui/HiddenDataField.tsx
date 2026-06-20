export interface HiddenDataFieldProps {
  fieldKey: string;
  value?: string | number | readonly string[] | null;
}

export default function HiddenDataField({ fieldKey, value }: HiddenDataFieldProps) {
  return <input type="hidden" data-field-key={fieldKey} value={value ?? ""} readOnly />;
}
