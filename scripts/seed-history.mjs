#!/usr/bin/env node
/**
 * seed-history — mô phỏng hoạt động ~1 năm (2026-01-01 → hôm nay) quy mô hệ
 * thống THẬT: hàng triệu đơn. Kiến trúc stream: sinh từng ngày → COPY-format
 * ra /tmp/seed-history/*.copy → Postgres COPY FROM STDIN (vài triệu rows/phút,
 * bộ nhớ O(1 ngày) — KHÔNG dùng INSERT per-row).
 *
 * Nạp thêm (KHÔNG xoá data seed chuẩn):
 *   fulfillment : orders, shop_assignment_history, cod_confirmations, d2c_orders,
 *                 installation_orders, delivery_orders, activity_log, notification_log
 *   batching    : batches, batch_items, shipment_plannings, bookings
 *
 * Deterministic (PRNG seed cố định). Mã ongoing (ORD/D2C/SO/TD/BATCH/planning)
 * tiếp từ max hiện có. users/KC, regions, printers, delivery_staff, service_employees
 * không đụng tới. Sau load: setval sequences + index phục vụ filter/dashboard.
 *
 * Chạy:   node scripts/seed-history.mjs           # ~2.5 triệu orders
 *         SCALE=0.2 node scripts/seed-history.mjs # ~500k orders
 */
import { readFileSync } from 'node:fs';
import { createWriteStream, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = '/tmp/seed-history';
const SCALE = Number(process.env.SCALE ?? 1);
const TARGET_ORDERS = 2_500_000; // năm
const TZ = '+07:00';

// ---------- PRNG deterministic ----------
let s = 0x20260905 >>> 0;
const rnd = () => {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;

// ---------- canonical seed data ----------
const seed = JSON.parse(readFileSync(path.join(ROOT, 'api/seed/canonical-seed.json'), 'utf8'));
const shopList = [...new Map(seed.orders.map((o) => [o.shopAssignment.shopCode, o.shopAssignment])).values()];
const shopByCode = new Map(shopList.map((s) => [s.shopCode, s]));
const staffByShop = new Map(seed.deliveryStaff.map((d) => [d.shopCode, d.staff_id ?? d.staffId ?? 'STAFF-001']));
const products = [
  { code: 'PRD-001', name: 'Modem WiFi 6 FPT' }, { code: 'PRD-002', name: 'Set-top box TV360' },
  { code: 'PRD-003', name: 'Camera IP FPT' }, { code: 'PRD-004', name: 'Smart Tivi 43"' },
  { code: 'PRD-005', name: 'Máy lọc không khí' },
];
const custNames = ['Nguyễn Văn Hùng', 'Trần Thị Mai', 'Lê Quốc Bảo', 'Phạm Thu Hà', 'Hoàng Minh Tuấn', 'Đỗ Thị Lan', 'Vũ Đức Thắng', 'Bùi Ngọc Ánh', 'Đặng Văn Hòa', 'Ngô Thanh Trúc', 'Phan Thị Mỹ Duyên', 'Lý Tuấn Kiệt'];
const streets = { 'Hà Nội': ['Xuân Thủy', 'Cầu Giấy', 'Hoàng Quốc Việt', 'Phạm Văn Đồng', 'Trần Duy Hưng', 'Tây Sơn', 'Giải Phóng'], 'TP. Hồ Chí Minh': ['Dương Bá Trạc', 'Cách Mạng Tháng Tám', 'Nguyễn Thị Minh Khai', 'Lý Chính Thắng', 'Bắc Hải', 'Lê Văn Sỹ'] };
const failReasons = [['KHACH_VANG', 'Khách không có nhà'], ['DIA_CHI_SAI', 'Địa chỉ sai/không tìm thấy'], ['KHACH_HUY', 'Khách hủy đơn trước giao']];
const d2cCarriers = ['ViettelPost', 'GHN', 'GHTK'];
const d2cShops = ['Shop Thời Trang ABC', 'Shop Mỹ Phẩm Luna', 'Shop Đồ Gia Dụng HomePro', 'Shop Giày Dép StepUp'];
const d2cCats = [['Thời trang', ['Áo khoác jean', 'Áo sơ mi', 'Váy hoa']], ['Mỹ phẩm', ['Kem dưỡng', 'Son môi']], ['Gia dụng', ['Nồi chiên không dầu', 'Bộ chảo chống dính']], ['Giày dép', ['Sneaker', 'Sandal nữ']]];
const techItems = [
  { code: 'SP-1001', name: 'Tivi Samsung 55"' }, { code: 'SP-1009', name: 'Loa Bose Soundbar' },
  { code: 'SP-1005', name: 'Máy giặt LG 9kg' }, { code: 'SP-1007', name: 'Điều hòa Daikin 12000BTU' },
];
const drivers = [['Vũ Văn Phong', '0956789006', '72F-678.90'], ['Trần Quốc Cường', '0912345678', '30K-123.45'], ['Lê Văn Tám', '0987654321', '51H-888.66'], ['Nguyễn Thành Lộc', '0908888111', '43B-552.19']];
const provinces = { R1: 'Hà Nội', R2: 'TP. Hồ Chí Minh' };
const actors = ['admin', 'manager', 'coordinator', 'warehouse'];

// ---------- timeline ----------
const TODAY = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00${TZ}`);
const START = new Date('2026-01-01T00:00:00+07:00');
const days = [];
for (let d = new Date(START); d < TODAY; d = new Date(d.getTime() + 86400000)) days.push(new Date(d));
const ymd = (d) => d.toISOString().slice(0, 10);
const at = (day, h, m = ri(0, 59)) => `${ymd(day)}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00${TZ}`;
const jsDate = (iso) => new Date(iso);

// volume/ngày chuẩn hóa để tổng năm ≈ TARGET_ORDERS
function rawVolume(day) {
  const dow = day.getDay();
  const monthIdx = (day.getFullYear() - 2026) * 12 + day.getMonth();
  let v = 0.6 + monthIdx * 0.1; // tăng trưởng: đầu năm ~0.6, cuối ~1.7 (hệ số)
  if (dow === 0 || dow === 6) v *= 0.55;
  if (day.getMonth() === 1 && day.getDate() >= 14 && day.getDate() <= 20) v *= 0.15; // Tết
  return v;
}
const totalRaw = days.reduce((a, d) => a + rawVolume(d), 0);
const UNIT = (TARGET_ORDERS * SCALE) / totalRaw;
function volume(day) { return Math.max(1, Math.round(rawVolume(day) * UNIT)); }

// ---------- psql + COPY ----------
const val = (sql) => execSync(`docker compose exec -T postgres psql -U hubstore -d fulfillment -tAc ${JSON.stringify(sql)}`, { cwd: ROOT }).toString().trim();
const valB = (sql) => execSync(`docker compose exec -T postgres psql -U hubstore -d batching -tAc ${JSON.stringify(sql)}`, { cwd: ROOT }).toString().trim();
const num = (sql, dflt) => { const v = Number(val(sql)); return Number.isFinite(v) && v > 0 ? v : dflt; };
const numB = (sql, dflt) => { const v = Number(valB(sql)); return Number.isFinite(v) && v > 0 ? v : dflt; };
const psqlIn = (db, sql, input) => execSync(`docker compose exec -T postgres psql -U hubstore -d ${db} -v ON_ERROR_STOP=1`, { input: sql, cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
// shell redirect stream file → psql, KHÔNG đọc file vào memory
const copyIn = (db, table, cols, file) => execSync(
  `docker compose exec -T postgres psql -U hubstore -d ${db} -v ON_ERROR_STOP=1 -c "COPY ${table} (${cols}) FROM STDIN" < '${file}'`,
  { cwd: ROOT, maxBuffer: 1024 * 1024 },
);

// COPY text-format escape
const T = (v) => v === null || v === undefined ? '\\N' : String(v).replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
const N = (v) => v === null || v === undefined ? '\\N' : String(v);
const B = (v) => v ? 't' : 'f';
const J = (v) => JSON.stringify(v); // .map(T) ở dòng COPY sẽ escape đúng 1 lần

mkdirSync(OUT, { recursive: true });
const ws = {};
const open = (key, file) => { ws[key] = createWriteStream(path.join(OUT, file), { highWaterMark: 1 << 24 }); return ws[key]; };
const files = {
  orders: open('orders', 'f-orders.copy'), hist: open('hist', 'f-hist.copy'), cod: open('cod', 'f-cod.copy'),
  d2c: open('d2c', 'f-d2c.copy'), inst: open('inst', 'f-inst.copy'), dlv: open('dlv', 'f-dlv.copy'),
  act: open('act', 'f-act.copy'), notif: open('notif', 'f-notif.copy'),
  batches: open('batches', 'b-batches.copy'), items: open('items', 'b-items.copy'),
  plans: open('plans', 'b-plans.copy'), bookings: open('bookings', 'b-bookings.copy'),
};
const W = (name, line) => ws[name].write(line + '\n');

// ongoing counters từ max hiện có
let ordN = num(`SELECT COALESCE(NULLIF(regexp_replace(max(fulfill_code),'\\D','','g'),'')::bigint, 3000) FROM orders`, 3000);
let rsaN = 7000000; // mã tham chiếu khách (order_code) — counter unique, KHÔNG random (join batch_items cần unique)
let d2cN = num(`SELECT COALESCE(NULLIF(regexp_replace(max(order_code),'\\D','','g'),'')::bigint, 2000) FROM d2c_orders`, 2000);
let soN = num(`SELECT COALESCE(NULLIF(regexp_replace(max(service_order_code),'\\D','','g'),'')::bigint, 0) FROM installation_orders`, 0);
let tdN = num(`SELECT COALESCE(NULLIF(regexp_replace(max(code),'\\D','','g'),'')::bigint, 0) FROM delivery_orders`, 0);
let batchN = numB(`SELECT COALESCE(NULLIF(regexp_replace(max(batch_code),'\\D','','g'),'')::bigint, 0) FROM batches`, 0);
let planN = numB(`SELECT COALESCE(max(id), 0) FROM shipment_plannings`, 0);
const techCodes = val(`SELECT COALESCE(string_agg(code, ','), 'KTV-001') FROM technicians`).split(',');
console.log(`[seed-history] counters: ORD>${ordN} D2C>${d2cN} SO>${soN} TD>${tdN} BATCH>${batchN} | UNIT=${UNIT.toFixed(1)} đơn/ngày hệ số`);

// ================= stream theo ngày =================
let stats = { orders: 0, batches: 0, items: 0, cod: 0, d2c: 0, inst: 0, dlv: 0, act: 0, hist: 0, plans: 0, bookings: 0, notif: 0 };
const t0 = Date.now();
const lastNotifs = [];

let dayIdx = 0;
for (const day of days) {
  const n = volume(day);
  const recentWindow = days.length - dayIdx <= 12; // notification chỉ lấy gần đây
  dayIdx++;
  const buf = [];
  for (let k = 0; k < n; k++) {
    const shop = pick(shopList);
    const fc = `ORD-${++ordN}`;
    const created = jsDate(at(day, ri(8, 17)));
    const ageDays = Math.round((TODAY - created) / 86400000);
    const province = pick(['Hà Nội', 'TP. Hồ Chí Minh']);
    const items = Array.from({ length: ri(1, 2) }, () => { const p = pick(products); return { quantity: ri(1, 3), productCode: p.code, productName: p.name }; });
    const o = {
      fc,
      oc: chance(0.7) ? `RSA-${++rsaN}` : null,
      statusCode: 2, batchStatus: 2, batchCode: null,
      shop: shop.shopCode,
      otFrom: at(day, 8), otTo: at(day, 12),
      dtFrom: at(day, 8), dtTo: at(day, 18),
      orderStatus: 1,
      items,
      cod: chance(0.65) ? ri(25, 800) * 10000 : 0,
      addr: `Số ${ri(1, 200)}, đường ${pick(streets[province])}, ${province}`,
      dist: +(1 + rnd() * 13).toFixed(1),
      cname: pick(custNames), cphone: `09${ri(10000000, 99999999)}`,
      debtSplit: chance(0.08),
      failReason: null, failNote: null, failedAt: null,
      created: created.toISOString(), qty: 0, note: null,
    };
    o.qty = o.items.reduce((a, i) => a + i.quantity, 0);

    if (ageDays > 3) {
      if (chance(0.05)) {
        const [reason, note] = pick(failReasons);
        o.failReason = reason; o.failNote = note; o.failedAt = at(day, 15);
        W('act', [pick(actors), 'order.failed', fc, J({ note, reason }), o.failedAt].map(T).join('\t'));
        stats.act++;
        if (recentWindow) lastNotifs.push({ type: 'order.failed', title: 'Giao thất bại', body: `Đơn ${fc} giao thất bại: ${note}.`, payload: { fulfillCode: fc, reason }, at: o.failedAt });
      } else if (chance(0.025)) {
        o.orderStatus = 2;
        W('act', [pick(['manager', 'coordinator']), 'order.rejected', fc, J({ reason: 'Khách hủy trước duyệt' }), o.created].map(T).join('\t'));
        stats.act++;
      } else if (o.cod > 0 && chance(0.35)) {
        o.codCollect = { collected: o.cod - (chance(0.08) ? 50000 : 0), by: pick(['coordinator', 'manager']), completedAt: at(day, 16) };
      }
    } else {
      if (ageDays <= 0 && chance(0.25)) o.orderStatus = 0;
      o.statusCode = ageDays <= 1 ? pick([0, 0, 1]) : pick([1, 2]);
      o.batchStatus = o.statusCode === 2 ? 2 : o.statusCode === 1 ? pick([0, 1, 1]) : 0;
      if (recentWindow) lastNotifs.push({ type: 'order.assigned', title: 'Đơn mới vào', body: `Đơn ${fc} đã được phân công.`, payload: { fulfillCode: fc, targetShop: { code: shop.shopCode, name: shop.shopName, address: shop.shopAddress } }, at: o.created });
    }
    buf.push(o);
    W('hist', [fc, o.created, 'ORDER_RECEIVED', 'Tiếp nhận đơn'].map(T).join('\t'));
    W('hist', [fc, at(day, ri(9, 18)), 'ASSIGN_SHOP_HUB', `Gán ${shop.shopName}`].map(T).join('\t'));
    stats.hist += 2;
    stats.orders++;
  }

  // batch hóa buffer theo shop (delivery = hôm sau)
  const byShop = new Map();
  for (const o of buf) {
    if (o.orderStatus !== 1 || o.batchStatus === 0) continue;
    if (!byShop.has(o.shop)) byShop.set(o.shop, []);
    byShop.get(o.shop).push(o);
  }
  const nextDay = new Date(day.getTime() + 86400000);
  for (const [shopCode, group] of byShop) {
    for (let i = 0; i < group.length; i += ri(40, 90)) { // batch thực tế ~40-90 stop
      const members = group.slice(i, i + 90);
      const bc = `BATCH-${String(++batchN).padStart(4, '0')}`;
      const staff = staffByShop.get(shopCode) ?? 'STAFF-001';
      const afternoon = chance(0.4);
      const dtFrom = at(nextDay, afternoon ? 14 : 8), dtTo = at(nextDay, afternoon ? 18 : 12);
      const recent = (TODAY - jsDate(dtFrom)) / 86400000 <= 2;
      const bStatus = recent ? (chance(0.5) ? 0 : 1) : 1;
      W('batches', [bc, shopCode, staff, dtFrom, dtTo, bStatus, dtFrom].map(T).join('\t'));
      stats.batches++;
      members.forEach((o, idx) => {
        o.batchCode = bc; o.batchStatus = bStatus === 0 ? 1 : 2;
        W('items', [bc, idx + 1, o.oc ?? o.fc, o.addr, o.dist, o.dtFrom, o.dtTo, o.orderStatus, 1, J(o.items), o.qty, o.cod].map(T).join('\t'));
        stats.items++;
      });
      if (bStatus === 1 && chance(0.5)) {
        const id = ++planN;
        const vtype = pick(['1T', '500kg', '3.5T']);
        const pcod = members.reduce((a, o) => a + o.cod, 0);
        W('plans', [id, bc, 1, `PLAN-${bc}`, vtype, vtype, J(chance(0.3) ? ['DOCUMENT'] : []), 'COMPLETED', pcod, pcod, ri(40, 300) * 1000, dtFrom, dtFrom].map(T).join('\t'));
        stats.plans++;
        if (chance(0.6)) {
          const drv = pick(drivers);
          W('bookings', [id, bc, `MOCK-5${String(id).padStart(6, '0')}`, drv[0], drv[1], drv[2], chance(0.15) ? 'CANCELLED' : 'COMPLETED', dtFrom, null, null, true].map(T).join('\t'));
          stats.bookings++;
        }
      }
    }
  }

  // orders ghi SAU batch hóa để batch_code điền đầy đủ; COD ghi kèm batch
  for (const o of buf) {
    const sh = shopByCode.get(o.shop);
    W('orders', [o.fc, o.oc, o.statusCode, o.batchStatus, o.batchCode, o.shop, sh.shopName, sh.shopAddress, o.otFrom, o.otTo, o.dtFrom, o.dtTo, o.orderStatus, J(o.items), o.cod, o.qty, B(o.debtSplit), o.addr, o.dist, o.note, o.cname, o.cphone, o.failReason, o.failNote, o.failedAt, o.created].map(T).join('\t'));
    if (o.codCollect) {
      W('cod', [o.fc, o.batchCode, o.shop, sh.shopName, o.cod, o.codCollect.collected, o.codCollect.by, o.codCollect.completedAt, o.codCollect.completedAt, 1].map(T).join('\t'));
      stats.cod++;
    }
  }

  // d2c + tech + delivery theo ngày
  const nd2 = Math.max(1, Math.round(n * 0.4));
  for (let k = 0; k < nd2; k++) {
    const oc = `D2C-${++d2cN}`;
    const [cat, types] = pick(d2cCats);
    const province = pick(['Hà Nội', 'TP. Hồ Chí Minh']);
    const ageDays = Math.round((TODAY - jsDate(at(day, 12))) / 86400000);
    const status = ageDays <= 1 ? pick(['pending', 'pending', 'exported']) : ageDays <= 3 ? pick(['exported', 'pushed']) : chance(0.03) ? 'cancelled' : 'pushed';
    const pushTime = ageDays <= 0 ? null : at(day, ri(9, 20));
    W('d2c', [oc, `INT-${880000 + d2cN}`, `${pick(['VTP', 'GHN', 'GHTK'])}${ri(10, 99)}D${d2cN}`, pick(d2cCarriers), pick(d2cShops), pick(custNames), pushTime, pushTime, pick(custNames), `09${ri(10000000, 99999999)}`, `Số ${ri(1, 300)}, đường ${pick(streets[province])}, ${province}`, pick(['Giao tiết kiệm', 'Giao nhanh', 'Giao hạn định']), cat, pick(types), B(chance(0.1)), chance(0.15) ? 'Khách thu tiền COD, tách 2 kỳ thanh toán.' : null, status, at(day, ri(7, 16))].map(T).join('\t'));
    stats.d2c++;
  }
  const ntech = Math.max(1, Math.round(n * 0.02));
  for (let k = 0; k < ntech; k++) {
    const region = pick(['R1', 'R2']);
    const province = provinces[region];
    const so = `SO-${String(++soN).padStart(4, '0')}`;
    const ageDays = Math.round((TODAY - jsDate(at(day, 12))) / 86400000);
    const status = ageDays <= 1 ? pick(['NEW', 'CONFIRMED', 'PROCESSING', 'SHIPPING'])
      : ageDays <= 3 ? pick(['SHIPPING', 'REDELIVERY', 'RESCHEDULED'])
      : chance(0.72) ? 'DELIVERED' : pick(['FAILED', 'RETURNED', 'CANCELLED']);
    const tdo = chance(0.7) ? `TD-${String(++tdN).padStart(4, '0')}` : null;
    const tech = pick(techCodes);
    const it = { ...pick(techItems), quantity: ri(1, 2) };
    const createdAt = at(day, ri(8, 16));
    const expected = at(new Date(day.getTime() + ri(1, 3) * 86400000), ri(8, 16));
    const timeline = [{ at: createdAt, note: `Tạo đơn lắp đặt ${so}`, actor: 'system', status: 'NEW' }];
    if (status !== 'NEW') timeline.push({ at: at(day, ri(9, 17)), note: `Gán kỹ thuật ${tech}`, actor: tech, status: 'PROCESSING' });
    if (['DELIVERED', 'FAILED'].includes(status)) timeline.push({ at: expected, note: status === 'DELIVERED' ? 'Lắp đặt hoàn tất' : 'Khách vắng nhà', actor: tech, status });
    W('inst', [so, tdo, tech, status, expected, J(timeline), ri(100, 400) * 1000, 0, J([it]), region, province, createdAt].map(T).join('\t'));
    stats.inst++;
    if (tdo) {
      const drv = pick(drivers);
      W('dlv', [tdo, status, drv[0], drv[1], pick(custNames), `09${ri(10000000, 99999999)}`, (21 + rnd() * 1.5).toFixed(6), (105.5 + rnd() * 1.2).toFixed(6), 'FPT Shop', '02473003000', '20.980000', '105.800000', ri(25, 80) * 1000, chance(0.2) ? ri(5, 20) * 1000 : 0, J([it]), region, province, ymd(nextDay), createdAt].map(T).join('\t'));
      stats.dlv++;
    }
  }

  // activity cơ bản: order.created 1/đơn (mẫu 1/10 để không phình), đối soát cuối tháng
  for (const o of buf) {
    if (chance(0.1)) { W('act', [pick(actors), 'order.created', o.fc, J({ shop: o.shop }), o.created].join('\t')); stats.act++; }
  }
  if (day.getDate() === 28) {
    const shop = pick(shopList);
    W('act', ['coordinator', 'cod.batch_confirmed', `${shop.shopCode}-${ymd(day).slice(0, 7)}`, J({ shopCode: shop.shopCode, month: ymd(day).slice(0, 7), note: 'Đối soát COD kỳ tháng' }), at(day, 17)].join('\t'));
    stats.act++;
  }
}

// notification: giới hạn 200 dòng mới nhất (trang 1 UI)
for (const n2 of lastNotifs.slice(-200)) {
  W('notif', [n2.type, n2.title, n2.body, J(n2.payload), randomUUIDSafe(), n2.at].map(T).join('\t'));
  stats.notif++;
}
function randomUUIDSafe() { return globalThis.crypto.randomUUID(); }

for (const w of Object.values(ws)) w.end();
await new Promise((res) => { let left = Object.values(ws).length; for (const w of Object.values(ws)) w.close(res); });
const genSec = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`[seed-history] sinh xong ${genSec}s:`, JSON.stringify(stats));

// ================= COPY load =================
const load0 = Date.now();
const SKIP_FULFILLMENT_COPY = process.env.SKIP_FULFILLMENT_COPY === '1';
if (!SKIP_FULFILLMENT_COPY) {
  copyIn('fulfillment', 'orders', 'fulfill_code, order_code, status_code, batch_status, batch_code, shop_code, shop_name, shop_address, original_time_from, original_time_to, delivery_time_from, delivery_time_to, order_status, items, cod_amount, total_quantity, is_debt_splitting_order, customer_address, distance, note, customer_name, customer_phone, fail_reason, fail_note, failed_at, created_time', `${OUT}/f-orders.copy`);
  copyIn('fulfillment', 'shop_assignment_history', 'fulfill_code, occurred_at, action, note', `${OUT}/f-hist.copy`);
  copyIn('fulfillment', 'cod_confirmations', 'fulfill_code, batch_code, shop_code, shop_name, expected_amount, collected_amount, collected_by, collected_at, completed_at, status', `${OUT}/f-cod.copy`);
  copyIn('fulfillment', 'd2c_orders', 'order_code, order_id_inter, delivery_id, carrier, shop, export_employee, export_time, push_time, receiver_name, receiver_phone, receiver_address, service_type, product_category, product_type, is_debt_splitting, note, status, created_at', `${OUT}/f-d2c.copy`);
  copyIn('fulfillment', 'installation_orders', 'service_order_code, delivery_order_code, technician_code, status, expected_time, timeline, service_fee, fee_adjust, items, region_code, province, created_at', `${OUT}/f-inst.copy`);
  copyIn('fulfillment', 'delivery_orders', 'code, status, driver_name, driver_phone, receiver_name, receiver_phone, receiver_lat, receiver_long, sender_name, sender_phone, sender_lat, sender_long, fee, tip, items, region_code, province, delivery_date, created_at', `${OUT}/f-dlv.copy`);
  copyIn('fulfillment', 'activity_log', 'actor, action, target, detail, created_at', `${OUT}/f-act.copy`);
  copyIn('fulfillment', 'notification_log', 'type, title, body, payload, dedupe_key, created_at', `${OUT}/f-notif.copy`);
} else {
  console.log('[seed-history] SKIP_FULFILLMENT_COPY=1 — bỏ qua COPY fulfillment (đã load)');
}
copyIn('batching', 'batches', 'batch_code, shop_code, shipper_id, delivery_time_from, delivery_time_to, status, created_at', `${OUT}/b-batches.copy`);
copyIn('batching', 'batch_items', 'batch_code, stop_order, order_code, customer_address, distance, from_delivery_time, to_delivery_time, order_status, order_type, items, total_quantity, cod_amount', `${OUT}/b-items.copy`);
copyIn('batching', 'shipment_plannings', 'id, batch_code, stop_order, order_code, vehicle_type, carrier_service_id, addon_services, status, cod_amount, total_bill, fee, created_at, updated_at', `${OUT}/b-plans.copy`);
copyIn('batching', 'bookings', 'planning_id, batch_code, carrier_booking_id, driver_name, driver_phone, license_plate, status, booked_at, cancelled_at, cancel_reason, is_mock', `${OUT}/b-bookings.copy`);

// sequences + index phục vụ filter/dashboard ở quy triệu rows
psqlIn('fulfillment', `
SELECT setval('orders_id_seq', (SELECT max(id) FROM orders));
SELECT setval('d2c_orders_id_seq', (SELECT max(id) FROM d2c_orders));
SELECT setval('installation_orders_id_seq', (SELECT max(id) FROM installation_orders));
SELECT setval('delivery_orders_id_seq', (SELECT max(id) FROM delivery_orders));
SELECT setval('cod_confirmations_id_seq', (SELECT max(id) FROM cod_confirmations));
SELECT setval('activity_log_id_seq', (SELECT max(id) FROM activity_log));
SELECT setval('notification_log_id_seq', (SELECT max(id) FROM notification_log));
CREATE INDEX IF NOT EXISTS idx_orders_created_time ON orders (created_time);
CREATE INDEX IF NOT EXISTS idx_orders_shop_status ON orders (shop_code, status_code);
CREATE INDEX IF NOT EXISTS idx_orders_batch_code ON orders (batch_code) WHERE batch_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_target ON activity_log (target);
CREATE INDEX IF NOT EXISTS idx_d2c_created ON d2c_orders (created_at);
CREATE INDEX IF NOT EXISTS idx_cod_completed ON cod_confirmations (completed_at);
`);
psqlIn('batching', `
SELECT setval('batches_code_seq', (SELECT COALESCE(NULLIF(regexp_replace(max(batch_code),'\\D','','g'),'')::bigint, 0) FROM batches));
SELECT setval('shipment_plannings_id_seq', (SELECT max(id) FROM shipment_plannings));
SELECT setval('bookings_id_seq', (SELECT max(id) FROM bookings));
CREATE INDEX IF NOT EXISTS idx_batches_created ON batches (created_at);
CREATE INDEX IF NOT EXISTS idx_batch_items_order ON batch_items (order_code);
`);
const loadSec = ((Date.now() - load0) / 1000).toFixed(1);
console.log(`[seed-history] COPY + index xong ${loadSec}s — DONE`);
console.log(`[seed-history] tổng orders năm nay: ${stats.orders.toLocaleString('vi-VN')} | batch ${stats.batches.toLocaleString('vi-VN')} | d2c ${stats.d2c.toLocaleString('vi-VN')} | COD ${stats.cod.toLocaleString('vi-VN')}`);
