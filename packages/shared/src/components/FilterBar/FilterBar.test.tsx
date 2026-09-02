/**
 * FilterBar + primitives smoke render (jsdom + antd4).
 * antd4 responsive codepaths gọi window.matchMedia — jsdom thiếu → stub.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DateRange, DateTimeRange } from './DateRange';
import { FilterBar } from './FilterBar';
import { MultiSelect } from './MultiSelect';
import { TextSearch } from './TextSearch';

beforeAll(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  }
});

afterEach(cleanup);

describe('FilterBar layout (grid 2×4 + Reset/Search)', () => {
  it('render grid 4 cột + nút Reset + Search; onSearch/onReset fire', () => {
    const onSearch = vi.fn();
    const onReset = vi.fn();
    render(
      <FilterBar onSearch={onSearch} onReset={onReset}>
        {/* 8 fields mô phỏng D1 — chiếm đủ 2 hàng × 4 cột */}
        <div>f1</div>
        <div>f2</div>
        <div>f3</div>
        <div>f4</div>
        <div>f5</div>
        <div>f6</div>
        <div>f7</div>
        <div>f8</div>
      </FilterBar>,
    );
    const bar = screen.getByTestId('filter-bar');
    const grid = bar.firstElementChild as HTMLElement;
    expect(grid.style.display).toBe('grid');
    expect(grid.style.gridTemplateColumns).toBe('repeat(4, 1fr)');
    expect(grid.childElementCount).toBe(8);

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe('FilterBar primitives (controlled smoke)', () => {
  it('TextSearch: gõ → onChange(string)', () => {
    const onChange = vi.fn();
    render(<TextSearch value="" onChange={onChange} placeholder="Số đơn hàng" />);
    fireEvent.change(screen.getByPlaceholderText('Số đơn hàng'), {
      target: { value: 'ORD-1' },
    });
    expect(onChange).toHaveBeenCalledWith('ORD-1');
  });

  it('MultiSelect: controlled value render + options từ props (không wire API)', () => {
    render(
      <MultiSelect
        value={['30201']}
        onChange={() => undefined}
        options={[
          { label: 'Kho 30201', value: '30201' },
          { label: 'Kho 30202', value: '30202' },
        ]}
      />,
    );
    const select = screen.getByRole('combobox');
    expect(select).not.toBeNull();
    // selected value hiện dưới dạng selection item
    expect(screen.getAllByText('Kho 30201').length).toBeGreaterThan(0);
  });

  it('DateRange: value=null render không crash; render có value với moment parse', () => {
    const onChange = vi.fn();
    const { rerender } = render(<DateRange value={null} onChange={onChange} />);
    expect(screen.getAllByRole('textbox').length).toBe(2); // from + to input
    rerender(
      <DateRange value={{ from: '2026-08-01', to: '2026-08-31' }} onChange={onChange} />,
    );
    expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('2026-08-01');
  });

  it('DateTimeRange: render showTime placeholder không crash', () => {
    render(<DateTimeRange value={null} onChange={() => undefined} />);
    expect(screen.getAllByRole('textbox').length).toBe(2);
  });
});
