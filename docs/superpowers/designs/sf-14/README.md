# SF-14 — Đối soát COD: 3 hướng thiết kế (FI-259)

**Màn:** Settlement `/settlement` (Manager-only, shell-local) · **Status:** DRAFT — chờ user chọn hướng
**Prototype:** HTML tự chứa (inline CSS/JS, không CDN), mở trực tiếp bằng trình duyệt.

## Nền tảng chung (cả 3 hướng)

- **Tokens:** mirror `packages/shared/src/theme/design-tokens.ts` (SF-6 direction B "Modern SaaS Airy") — primary #EB6E09 + gradient, text scale Untitled-UI, radius card 16 / control 8 / pill 999 / modal 20, shadow scale, Roboto, body 14.
- **Shell chrome:** sidebar 64px #101828 với nav item "Đối soát COD" đặt **CUỐI danh sách** (invariant `firstPathForRole`), header 60px.
- **Mock data dùng chung:** 6 cửa hàng, kỳ 01/09–30/09/2026, 554 đơn · kỳ vọng 208.100.000 ₫ · đã thu 205.350.000 ₫ · chênh lệch −2.750.000 ₫ (5 chờ thu, 4 lệch tiền, 3/6 shop có lệch). Mọi số đều tự khớp từng dòng (diff = pending-sum + mismatch-sum per shop).
- **Luồng đã thể hiện:** kỳ đối soát, 4 số tổng, bảng theo shop với trạng thái đủ/thiếu thu/lệch tiền, drill-down đơn lệch (PENDING + lệch số tiền), modal xác nhận thu (nhập số tiền thực thu, prefill kỳ vọng), Export CSV theo kỳ, dấu hiệu Manager-only.

## Hướng A — Classic ops table (`direction-a.html`)

FilterBar trên cùng (RangePicker + select shop + refresh | Export CSV), **summary strip 1 hàng 4 số** gọn, dưới là **bảng antd dày đặc** với expandable row (chevron) — drill-down là **sub-table** chuẩn antd, nút "Xác nhận thu" / "Xác nhận lại" từng dòng, modal xác nhận có footnote audit.

- **Ưu:** khớp 1-1 spec §6 ("Table per shop + expandable drill-down") và pattern màn sẵn (AreaListPage/D1Page FilterBar + antd Table); ít component mới nhất → FE effort thấp nhất, dễ nhất cho E2E selector; mật độ thông tin cao, quét được cả 6 shop trong 1 màn.
- **Nhược:** summary chỉ là strip mỏng — Manager phải "đọc số" thay vì "nhìn sức khỏe"; ít cảm giác hierarchy giữa tổng kỳ và từng shop; drill-down sub-table hơi nặng thị giác khi lệch nhiều cột.

## Hướng B — Summary-cards first (`direction-b.html`)

**4 KPI cards** (icon pastel + sparkline SVG hand-built + progress "đã thu/kỳ vọng" + delta), period chip + Export primary ngay header, **segmented filter theo trạng thái** (Tất cả/Thiếu thu/Lệch tiền/Đủ — filter JS thật), bảng với cột "Đã thu" có **progress bar inline**, drill-down là **order cards** trong expanded row.

- **Ưu:** đọc được tình hình thu hộ trong 3 giây (Manager use-case chính: "kỳ này có vấn đề không?"); segmented filter giúp tập trung đúng shop cần xử lý; progress bar per-shop thể hiện mức độ thiếu trực quan hơn cột số trần; vẫn giữ expandable pattern của spec nên không phá khung impl.
- **Nhược:** nhiều component mới hơn A (KPI cards, sparkline, segmented, progress bar — đều hand-built SVG/CSS vì antd4 + MF không có chart lib, tương tự DashboardPage SF-9); màn dài hơn chút ở viewport thấp.

## Hướng C — Master-detail split (`direction-c.html`)

**Panel trái:** kỳ đối soát + search + danh sách shop (status dot, chênh lệch, click để chọn). **Panel phải:** chi tiết shop đã chọn — header + tag trạng thái, 4 stat, tabs "Đơn lệch / Tất cả đơn", **order cards** dọc với nút xác nhận từng đơn.

- **Ưu:** workflow "xử lý" tốt nhất — Manager đi lần lượt từng shop lệch, confirm liên tục không mất ngữ cảnh; list + detail tách bạch dễ scan; order card dễ đọc hơn sub-table khi cần nhìn expected vs collected vs người thu.
- **Nhược:** lệch pattern expandable-table của spec §6 nhiều nhất (cần bàn lại với BE/PM trước khi code); tổng theo kỳ bị dồn vào footnote mỏng — 4 số tổng quy định của spec không phải điểm nhấn; layout 2 cột khó hơn trên màn hẹp; E2E chọn phần tử phức tạp hơn table thuần.

## Recommendation

**Khuyến nghị Hướng B**, với 2 lý do: (1) Manager mở màn này chủ yếu để đánh giá sức khỏe thu hộ theo kỳ — KPI cards + progress thể hiện điều đó trực tiếp, trong khi A chỉ cho số trần; (2) B giữ nguyên lõi "Table per shop + expandable drill-down" của spec nên phần code core giống hệt A (không tăng rủi ro impl), phần thêm (KPI card, segmented, progress) là CSS/SVG thuần không phụ thuộc lib — cùng kỹ thuật DashboardPage SF-9 đã làm. Hướng C rất đẹp cho workflow confirm-nặng nhưng đảo structure nhiều nhất so với spec; cân nhắc làm hướng follow-up nếu sau này nhu cầu "xử lý lệch hàng loạt" tăng.

Nếu ưu tiên speed / rủi ro thấp nhất → chọn **A**.

## Bước tiếp

1. User chọn hướng (A/B/C) — có thể mix (ví dụ B nhưng thay order cards bằng sub-table của A).
2. Sau khi chốt: viết hand-off spec `docs/superpowers/designs/sf-14-direction.md` (tokens / structure / behavior / out-of-scope) cho task-executor `fe-settlement-screen`.
