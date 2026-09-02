/**
 * Parse file nhập đơn (SF-13, plan T6): .csv tự parse (quoted fields + ""
 * escape), .xlsx/.xls qua XLSX.read sheet đầu (header:1). Kết quả giữ VỊ TRÍ
 * 1-based của từng dòng: dòng parse-fail vẫn có placeholder trong `rows`
 * (ok=false) để preview/index không trôi khi gửi gRPC validate.
 */
import * as XLSX from 'xlsx';
import type { Product } from '@hub-store/shared';
import type { ImportErrorDto } from '@hub-store/shared';

export const TEMPLATE_HEADERS = [
  'customerName',
  'customerPhone',
  'customerAddress',
  'items',
  'quantity',
  'codAmount',
  'shopHint',
] as const;

export type TemplateHeader = (typeof TEMPLATE_HEADERS)[number];

/** 1 dòng file: giá trị thô + sản phẩm đã parse. ok=false → chỉ giữ vị trí. */
export interface RawRow {
  ok: boolean;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  items: Product[];
  quantity: number;
  codAmount: number;
  shopHint: string;
}

export interface ParseOrdersResult {
  rows: RawRow[];
  errors: ImportErrorDto[];
}

export function templateCsv(): string {
  return TEMPLATE_HEADERS.join(',') + '\r\n';
}

function errorRow(row: number, column: string, message: string): ImportErrorDto {
  return { row, column, message };
}

function emptyRow(): RawRow {
  return {
    ok: false,
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    items: [],
    quantity: 0,
    codAmount: 0,
    shopHint: '',
  };
}

/** 1 dòng CSV → mảng field (hỗ trợ quoted field, "" = escape dấu "). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++; // "" → literal "
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

/** items cell "SKU1:Sản A:2;SKU2:Sản B:1" → Product[]; sai format → null. */
function parseItemsCell(raw: string): Product[] | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null; // items rỗng → server validate bắt (rule §4)
  const products: Product[] = [];
  for (const part of trimmed.split(';')) {
    const idx1 = part.indexOf(':');
    const idx2 = idx1 === -1 ? -1 : part.indexOf(':', idx1 + 1);
    if (idx1 === -1 || idx2 === -1) return null;
    const code = part.slice(0, idx1).trim();
    const name = part.slice(idx1 + 1, idx2).trim();
    const qtyRaw = part.slice(idx2 + 1).trim();
    const quantity = Number(qtyRaw);
    if (code === '' || name === '' || !Number.isInteger(quantity) || quantity <= 0) return null;
    products.push({ productCode: code, productName: name, quantity });
  }
  return products;
}

/** Giá trị ô về chuỗi thô (xlsx raw:false đã cho string; number → String). */
function cellToString(v: unknown): string {
  if (v === undefined || v === null) return '';
  return typeof v === 'string' ? v : String(v);
}

/**
 * Parse file import theo filename extension. Header map theo tên cột
 * TEMPLATE_HEADERS (thứ tự bất kỳ); tên cột lạ → lỗi row 0. Dòng thiếu/ thừa
 * cột → lỗi dòng đó, giữ placeholder vị trí. items/quantity parse tại BFF,
 * rule nghiệp vụ còn lại do gRPC validateImportOrders (plan T5).
 */
export function parseOrdersFile(filename: string, buffer: Buffer): ParseOrdersResult {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  let matrix: unknown[][];
  if (ext === 'csv') {
    matrix = buffer
      .toString('utf8')
      // Excel-saved CSV có UTF-8 BOM — không strip thì header đầu thành
      // "\uFEFFcustomerName" → mọi cột báo "Cột không hợp lệ" row 0.
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((l, i, arr) => !(l === '' && i === arr.length - 1))
      .map(parseCsvLine);
  } else if (ext === 'xlsx' || ext === 'xls') {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    // header:1 → mảng mảng; raw:false → số về string; defval:'' ô trống.
    matrix = XLSX.utils.sheet_to_json(sheet ?? {}, { header: 1, raw: false, defval: '' });
  } else {
    return {
      rows: [],
      errors: [errorRow(0, 'file', 'Định dạng file không hỗ trợ (chỉ .csv, .xlsx, .xls).')],
    };
  }

  const errors: ImportErrorDto[] = [];
  if (matrix.length === 0) {
    return { rows: [], errors: [errorRow(0, 'file', 'File rỗng — thiếu dòng header.')] };
  }

  // Header row: map tên cột → index. Tên lạ → lỗi {row:0}; thiếu cột bắt buộc → lỗi.
  const headerCells = (matrix[0] ?? []).map(cellToString);
  const colIndex = new Map<TemplateHeader, number>();
  headerCells.forEach((name, idx) => {
    if ((TEMPLATE_HEADERS as readonly string[]).includes(name)) {
      colIndex.set(name as TemplateHeader, idx);
    } else {
      errors.push(errorRow(0, name, 'Cột không hợp lệ'));
    }
  });
  for (const h of TEMPLATE_HEADERS) {
    if (!colIndex.has(h)) {
      errors.push(errorRow(0, h, 'Cột không hợp lệ'));
    }
  }
  if (colIndex.size < TEMPLATE_HEADERS.length) {
    // Header sai cấu trúc — không thể map dòng dữ liệu đáng tin.
    return { rows: [], errors };
  }

  const rows: RawRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const cells = (matrix[r] ?? []).map(cellToString);
    const rowNumber = r; // 1-based, không tính header (matrix[0] là header)
    if (cells.length !== headerCells.length) {
      errors.push(errorRow(rowNumber, TEMPLATE_HEADERS[0], 'Số cột không khớp template.'));
      rows.push(emptyRow()); // placeholder — giữ vị trí 1-based
      continue;
    }
    const row = emptyRow();
    let rowOk = true;
    const get = (h: TemplateHeader): string => cells[colIndex.get(h) ?? 0];
    row.customerName = get('customerName').trim();
    row.customerPhone = get('customerPhone').trim();
    row.customerAddress = get('customerAddress').trim();
    row.shopHint = get('shopHint').trim();
    const quantity = Number(get('quantity').trim());
    const codAmount = Number(get('codAmount').trim());
    if (get('quantity').trim() === '' || !Number.isInteger(quantity) || quantity < 0) {
      errors.push(errorRow(rowNumber, 'quantity', 'Số lượng không hợp lệ.'));
      rowOk = false;
    } else {
      row.quantity = quantity;
    }
    if (get('codAmount').trim() === '' || !Number.isFinite(codAmount) || codAmount < 0) {
      errors.push(errorRow(rowNumber, 'codAmount', 'COD không hợp lệ.'));
      rowOk = false;
    } else {
      row.codAmount = codAmount;
    }
    const items = parseItemsCell(get('items'));
    if (items === null) {
      errors.push(
        errorRow(rowNumber, 'items', 'Sản phẩm không hợp lệ (định dạng SKU:Tên:Số lượng;...).'),
      );
      rowOk = false;
    } else {
      row.items = items;
    }
    row.ok = rowOk;
    rows.push(row);
  }
  return { rows, errors };
}
