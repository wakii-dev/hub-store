import { Select } from 'antd';

/** Option shape cho MultiSelect — URL-friendly (value là string). */
export interface FilterOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface MultiSelectProps {
  /** Controlled value — bind tới useUrlState (serialized comma-joined). */
  value: string[];
  onChange: (value: string[]) => void;
  /** Options truyền qua props — KHÔNG wire API data ở shared. */
  options: FilterOption[];
  placeholder?: string;
}

/** MultiSelect — wrapper quanh antd4 Select mode="multiple", controlled. */
export function MultiSelect({ value, onChange, options, placeholder }: MultiSelectProps) {
  return (
    <Select
      mode="multiple"
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      allowClear
      style={{ width: '100%' }}
    />
  );
}
