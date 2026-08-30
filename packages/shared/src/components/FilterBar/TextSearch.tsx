import { Input } from 'antd';

export interface TextSearchProps {
  /** Controlled value — bind tới useUrlState. */
  value: string;
  onChange: (value: string) => void;
  /** Gọi khi Enter / click icon search. */
  onSearch?: (value: string) => void;
  placeholder?: string;
}

/** TextSearch — wrapper quanh antd4 Input.Search, controlled hoàn toàn. */
export function TextSearch({ value, onChange, onSearch, placeholder }: TextSearchProps) {
  return (
    <Input.Search
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onSearch={onSearch}
      placeholder={placeholder}
      allowClear
    />
  );
}
