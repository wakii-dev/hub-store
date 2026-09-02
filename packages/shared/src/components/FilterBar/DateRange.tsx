/**
 * DateRange + DateTimeRange — wrappers quanh antd4 DatePicker.RangePicker.
 *
 * antd4 dùng moment (KHÔNG phải dayjs). Controlled value ở biên là
 * STRING (URL-friendly cho useUrlState): { from, to } theo `format`
 * tương ứng — convert moment chỉ diễn ra nội bộ wrapper.
 */
import { DatePicker } from 'antd';
import moment, { type Moment } from 'moment';

export interface DateRangeValue {
  from: string;
  to: string;
}

export interface DateRangeProps {
  /** null = chưa chọn / đã clear. */
  value: DateRangeValue | null;
  onChange: (value: DateRangeValue | null) => void;
  placeholder?: [string, string];
}

const DATE_FORMAT = 'YYYY-MM-DD';
const DATETIME_FORMAT = 'YYYY-MM-DD HH:mm';

interface RangeControlProps extends DateRangeProps {
  format: string;
  showTime?: boolean;
}

function RangeControl({ value, onChange, format, showTime, placeholder }: RangeControlProps) {
  const momentValue: [Moment, Moment] | null =
    value && value.from && value.to
      ? [moment(value.from, format), moment(value.to, format)]
      : null;
  return (
    <DatePicker.RangePicker
      style={{ width: '100%' }}
      value={momentValue}
      format={format}
      showTime={showTime ? { format: 'HH:mm' } : undefined}
      placeholder={placeholder}
      onChange={(_, dateStrings) => {
        const [from, to] = dateStrings;
        onChange(from && to ? { from, to } : null);
      }}
    />
  );
}

/** DateRange — chọn ngày (D1: "Thời gian tạo đơn"). */
export function DateRange(props: DateRangeProps) {
  return <RangeControl {...props} format={DATE_FORMAT} />;
}

/** DateTimeRange — chọn ngày + giờ (D1: "Thời gian dự kiến giao", "TG KH mong muốn"). */
export function DateTimeRange(props: DateRangeProps) {
  return <RangeControl {...props} format={DATETIME_FORMAT} showTime />;
}
