/**
 * CreateBatchingModal — D1b "Tạo phiếu soạn" (SF-6 §2.3 — sectioned stepper,
 * modal 1240; E2E-safe: content KHÔNG bao giờ ẩn — Deviation D1).
 * SF-8 thay placeholder SF-7 — lắp tại D1Page (import + truyền selection).
 *
 * - Danh sách đơn đã chọn: rows nhận qua PROPS từ D1 selection (interface pin —
 *   KHÔNG re-fetch); DnD sortable đổi THỨ TỰ GIAO (stopOrder = index + 1) —
 *   lib theo SPIKE 3 verdict (react-sortable-hoc@2.0.0 + array-move@3.0.1).
 * - Packing suggest: gợi ý nhóm đơn theo khoảng cách (Go qua BFF) — tô màu nhóm.
 * - Recalculate distance: tính lại km từng đơn.
 * - Thêm đơn: search đơn CÙNG kho, chỉ batchStatus=0, exclude các đơn đã có.
 * - Shipper: GET /master-data/delivery-staff (lọc theo kho của selection).
 * - TG giao: DatePicker + hint slot từ GET /order-promising/time-delivery (D4).
 * - Tạo phiếu: POST /fulfillment/batches/create (rule 1 validate server-side Go);
 *   reject → AntD message từ error envelope details[], modal GIỮ state;
 *   success → micro-interaction "✓" 800ms → đóng + invalidate Fulfillment LIST.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, DatePicker, Empty, Modal, Radio, Select, Space, Spin, Tag, Tooltip, Typography, message } from "antd";
import {
  SortableContainer,
  SortableElement,
  SortableHandle,
  type SortableContainerProps,
  type SortEnd,
} from "react-sortable-hoc";
import type { ComponentClass } from "react";
import arrayMove from "array-move";
import moment from "moment";
import { Trans, useTranslation } from "react-i18next";
import {
  DESIGN_TOKENS,
  StatusTag,
  formatPeriodOfTime,
  formatVnd,
  type DeliveryAddonDto,
  type DeliveryBookingDto,
  type DeliveryQuoteDto,
  type DeliveryStaffResponse,
  type HubStoreOrderFilterItem,
  type PackingGroup,
  type TimeRange,
} from "@hub-store/shared";
import { useGetDeliveryStaffQuery, useListOrdersQuery } from "@hub-store/api-client";
import {
  useCreateBatchMutation,
  useGetTimeDeliveryQuery,
  usePackingSuggestMutation,
  useRecalculateDistanceMutation,
} from "./batchingApi";
import {
  useConfirmPlanningMutation,
  useCreateBookingMutation,
  useGetQuotesMutation,
} from "./deliveryBatchApi";
import { buildAddOrderFilterRequest, extractRejectMessages } from "./batchingHelpers";
import { computeTotalFee, toStopOrders } from "./carrierHelpers";
import { CarrierSection } from "./CarrierSection";
import type { CarrierGroup } from "./carrierHelpers";
import "./batching-modal.css";

const GROUP_COLORS: Array<{ bg: string; border: string }> = [
  { bg: "#fff7e6", border: "#ffd591" }, // gold
  { bg: "#e6f7ff", border: "#91d5ff" }, // blue
  { bg: "#f6ffed", border: "#b7eb8f" }, // green
  { bg: "#f9f0ff", border: "#d3adf7" }, // purple
  { bg: "#e6fffb", border: "#87e8de" }, // cyan
  { bg: "#fff0f6", border: "#ffadd2" }, // magenta
];

function groupColor(index: number): { bg: string; border: string } {
  return GROUP_COLORS[index % GROUP_COLORS.length];
}

const DragHandle = SortableHandle(() => (
  <span className="batch-drag-handle" data-testid="batch-drag-handle">
    ⠿
  </span>
));

interface SortableRowValue {
  order: HubStoreOrderFilterItem;
  stopOrder: number;
  groupIndex: number; // -1 = không thuộc nhóm suggest nào
}

// react-sortable-hoc@2 typings không infer P qua WrappedComponentFactory union —
// cast tường minh (runtime ĐÃ verify spike-3 trên react 18.3.1).
const SortableRow = SortableElement(({ value }: { value: SortableRowValue }) => {
  const { t } = useTranslation("orders");
  const { order, stopOrder, groupIndex } = value;
  const color = groupIndex >= 0 ? groupColor(groupIndex) : null;
  return (
    <li
      className="batch-row"
      data-testid={`batch-row-${order.fulfillCode}`}
      style={color ? { background: color.bg } : undefined}
    >
      <DragHandle />
      <span className="batch-cell-stop" data-testid="batch-stop-order">
        {stopOrder}
      </span>
      <span className="batch-cell-code">{order.fulfillCode}</span>
      <span className="batch-cell-address" title={order.customerAddress}>
        {order.customerAddress || "—"}
      </span>
      <span className="batch-cell-distance">
        {order.distance != null ? `${order.distance} km` : t("common.empty")}
      </span>
      <span className="batch-cell-time">{formatPeriodOfTime(order.deliveryTime.from, order.deliveryTime.to)}</span>
      <span className="batch-cell-status">
        <StatusTag kind="orderStatus" value={order.orderStatus} />
      </span>
      <span className="batch-cell-qty">{order.totalQuantity}</span>
      <span className="batch-cell-cod">{formatVnd(order.codAmount)}</span>
    </li>
  );
}) as unknown as ComponentClass<{ index: number; value: SortableRowValue }>;

const SortableRows = SortableContainer(({ items }: { items: SortableRowValue[] }) => (
  <ul>
    {items.map((item, index) => (
      <SortableRow key={item.order.fulfillCode} index={index} value={item} />
    ))}
  </ul>
)) as unknown as ComponentClass<{ items: SortableRowValue[] } & SortableContainerProps>;

export type CreateBatchingModalMode = "create" | "replan" | "rebook";

export interface CreateBatchingModalProps {
  open: boolean;
  /** Đơn đã chọn trên D1 — snapshot khi mở modal (KHÔNG re-fetch). */
  orders: HubStoreOrderFilterItem[];
  onClose: () => void;
  /**
   * SF-16 (spec §2.5): 'create' (default — flow legacy byte-for-byte) ·
   * 'replan' (tạo lại phiếu) · 'rebook' (book lại vận đơn — Task 6 lắp behavior).
   */
  mode?: CreateBatchingModalMode;
}

export function CreateBatchingModal({ open, orders, onClose, mode = "create" }: CreateBatchingModalProps) {
  const { t } = useTranslation("orders");

  // Rows state — sync khi MỞ modal (snapshot selection); DnD/thêm đơn/recalc đổi state.
  const [rows, setRows] = useState<HubStoreOrderFilterItem[]>([]);
  const [groups, setGroups] = useState<PackingGroup[] | null>(null);
  // SF-16 §2.1 — nhóm vận chuyển: KHO_CN default → flow cũ byte-for-byte.
  const [carrierGroup, setCarrierGroup] = useState<CarrierGroup>("KHO_CN");
  // SF-16 §2.2 — quotes NVC (Task 3): fetch khi nhóm TRUCK, debounce 300ms;
  // refetch khi rows đổi (recalc distance → km mới → báo giá mới).
  const [quotes, setQuotes] = useState<DeliveryQuoteDto[] | null>(null);
  const [metaMock, setMetaMock] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [bookingResults, setBookingResults] = useState<DeliveryBookingDto[] | null>(null);
  const [nvcSubmitting, setNvcSubmitting] = useState(false);
  const [shipperId, setShipperId] = useState<string | undefined>(undefined);
  const [deliveryTime, setDeliveryTime] = useState<TimeRange | null>(null);
  // SF-6 §2.3 stepper — NON-BLOCKING (Deviation D1): content không bao giờ ẩn,
  // activeSection chỉ điều khiển highlight + scroll-to khi bấm node/Tiếp tục.
  const [activeSection, setActiveSection] = useState<1 | 2 | 3>(1);
  const [created, setCreated] = useState(false); // micro-interaction "✓" 800ms
  const section2Ref = useRef<HTMLDivElement | null>(null);
  const section3Ref = useRef<HTMLDivElement | null>(null);
  // Reviewer-sf6 P1: timer đóng sau micro-interaction phải clear được —
  // không thì đóng nhầm modal MỞ LẠI trong window 800ms + fire sau unmount.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scrollToSection = (s: 1 | 2 | 3) => {
    setActiveSection(s);
    if (s === 2) section2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (s === 3) section3Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (open) {
      clearCloseTimer(); // P1: hủy timer version trước trước khi reset state
      setRows(orders);
      setGroups(null);
      setCarrierGroup("KHO_CN");
      setQuotes(null);
      setMetaMock(false);
      setSelectedServiceId(null);
      setBookingResults(null);
      setNvcSubmitting(false);
      setShipperId(undefined);
      setDeliveryTime(null);
      setActiveSection(1);
      setCreated(false);
    }
    // Chỉ sync khi mở — selection D1 refetch giữa lúc mở không reset state đang sửa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // P1: unmount (navigate/destroyOnClose) → không fire onClose sau khi chết.
  useEffect(() => () => clearCloseTimer(), []);

  const shopCode = rows[0]?.shopAssignment.shopCode ?? "";

  // ---- Packing suggest + recalc ------------------------------------------------
  const [packingSuggest, { isLoading: suggesting }] = usePackingSuggestMutation();
  const [recalculate, { isLoading: recalculating }] = useRecalculateDistanceMutation();
  const [createBatch, { isLoading: creating }] = useCreateBatchMutation();

  // ---- Quotes NVC (SF-16 §2.2 — Task 3) -----------------------------------------
  const [getQuotes, { isLoading: quotesLoading }] = useGetQuotesMutation();
  const [confirmPlanning] = useConfirmPlanningMutation();
  const [createBooking] = useCreateBookingMutation();

  useEffect(() => {
    if (carrierGroup !== "TRUCK" || rows.length === 0) return;
    // Debounce 300ms — gộp burst (thêm nhiều đơn / recalc): chỉ fetch lần cuối.
    const timer = setTimeout(() => {
      getQuotes({ shopCode, stopOrders: toStopOrders(rows) })
        .unwrap()
        .then((resp) => {
          setQuotes(resp.quotes ?? []);
          setMetaMock(resp.meta?.mock ?? false);
        })
        .catch(() => {
          setQuotes(null);
          message.error(t("batching.quotes.fetchError"));
        });
    }, 300);
    return () => clearTimeout(timer);
    // refetch khi rows đổi (DnD/thêm đơn/recalc distance); getQuotes/t ổn định.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrierGroup, rows, shopCode, getQuotes]);

  const handlePackingSuggest = async () => {
    try {
      const resp = await packingSuggest({ orderCodes: rows.map((r) => r.fulfillCode) }).unwrap();
      setGroups(resp.groups ?? []);
    } catch (err) {
      message.error(extractRejectMessages(err, t("createBatch.error")).join("; "));
    }
  };

  const handleRecalculate = async () => {
    try {
      const resp = await recalculate({ orderCodes: rows.map((r) => r.fulfillCode) }).unwrap();
      const distanceByCode = new Map((resp.items ?? []).map((d) => [d.orderCode, d.distance]));
      setRows((prev) => prev.map((r) => (distanceByCode.has(r.fulfillCode) ? { ...r, distance: distanceByCode.get(r.fulfillCode) } : r)));
    } catch (err) {
      message.error(extractRejectMessages(err, t("createBatch.error")).join("; "));
    }
  };

  // ---- Thêm đơn (cùng kho, batchStatus=0, exclude đã có) -----------------------
  const [searchText, setSearchText] = useState("");
  const excludeCodes = useMemo(() => rows.map((r) => r.fulfillCode), [rows]);
  const addFilter = useMemo(
    () => buildAddOrderFilterRequest(shopCode, excludeCodes, searchText),
    [shopCode, excludeCodes, searchText],
  );
  const { data: addData, isFetching: searching } = useListOrdersQuery(
    addFilter as unknown as Record<string, unknown>,
    { skip: !open || !shopCode },
  );
  const addItems = (addData as { items?: HubStoreOrderFilterItem[] } | undefined)?.items ?? [];

  const handleAddOrders = (codes: string[]) => {
    if (codes.length === 0) return;
    const byCode = new Map(addItems.map((o) => [o.fulfillCode, o]));
    // Guard trùng: option vừa chọn vẫn nằm trong dropdown cho tới khi
    // exclude-refetch chạy xong — click lại không được append đôi (P1 review SF-8).
    const existing = new Set(rows.map((r) => r.fulfillCode));
    const fresh = codes
      .filter((c) => !existing.has(c))
      .map((c) => byCode.get(c))
      .filter((o): o is HubStoreOrderFilterItem => !!o);
    setRows((prev) => [...prev, ...fresh]); // thêm vào CUỐI danh sách
    setSearchText("");
  };

  // ---- Shipper + TG giao --------------------------------------------------------
  const { data: staffData } = useGetDeliveryStaffQuery(undefined, { skip: !open });
  const staff = (staffData as DeliveryStaffResponse | undefined)?.items ?? [];
  const staffOptions = useMemo(
    () =>
      staff
        .filter((s) => !shopCode || s.shopCode === shopCode)
        .map((s) => ({ label: s.phone ? `${s.name} — ${s.phone}` : s.name, value: s.staffId })),
    [staff, shopCode],
  );

  const { data: hintData } = useGetTimeDeliveryQuery({ shopCode }, { skip: !open || !shopCode });
  const hintSlots = hintData?.timeSlots ?? [];

  const handlePickDate = (date: moment.Moment | null) => {
    if (!date) {
      setDeliveryTime(null);
      return;
    }
    setDeliveryTime({ from: date.startOf("day").toISOString(), to: date.endOf("day").toISOString() });
  };

  const datePickerValue = deliveryTime ? moment(deliveryTime.from) : null;
  const pickedFromHint = deliveryTime !== null && hintSlots.some((s) => s.from === deliveryTime.from && s.to === deliveryTime.to);

  // ---- Submit -------------------------------------------------------------------
  // TRUCK: phải chọn quote trước khi submit (fee gates chi tiết ở Task 5).
  const canSubmit = rows.length > 0 && !!shipperId && deliveryTime !== null && (carrierGroup !== "TRUCK" || !!selectedServiceId);

  // SF-16 §2.2 — addons Task 4 nối AddonSelector; Task 3 truyền [] (tổng = quote.fee).
  const selectedAddons: DeliveryAddonDto[] = [];
  const selectedQuote = (quotes ?? []).find((q) => q.serviceId === selectedServiceId) ?? null;
  const shippingFee = selectedQuote !== null ? computeTotalFee(selectedQuote, selectedAddons) : null;

  const handleCreate = async () => {
    if (!canSubmit) return;
    if (carrierGroup === "TRUCK") {
      await handleCreateTruck();
      return;
    }
    try {
      await createBatch({
        orderCodes: rows.map((r) => r.fulfillCode), // theo THỨ TỰ GIAO hiện hành
        shipperId,
        deliveryTime,
      }).unwrap();
      message.success(t("createBatch.success"));
      // SF-6 §3 micro-interaction: label "✓" 800ms trước khi đóng.
      setCreated(true);
      closeTimerRef.current = setTimeout(onClose, 800); // ref để clear (P1 review)
    } catch (err) {
      // Error UX: backend reject (khác kho / đơn ≠0) → message, modal GIỮ state.
      message.error(extractRejectMessages(err, t("createBatch.error")).join("; "));
    }
  };

  /**
   * Submit TRUCK (SF-16 §2.4 — Task 3): sequence 3 bước NVC —
   * createBatch (tạo phiếu) → confirmPlanning (chốt giá + plannings) →
   * createBooking (book xe — driver/biển số). 422 ở bất kỳ bước → message từ
   * details[], modal GIỮ state. Success KHÔNG auto-close (khác legacy):
   * booking results hiển thị ở review section cho NG xem trước khi tự đóng.
   */
  const handleCreateTruck = async () => {
    if (selectedQuote === null || deliveryTime === null || !shipperId) return;
    setNvcSubmitting(true);
    try {
      const batch = await createBatch({
        orderCodes: rows.map((r) => r.fulfillCode), // theo THỨ TỰ GIAO hiện hành
        shipperId,
        deliveryTime,
      }).unwrap();
      const batchCode = batch?.batchCode ?? "";
      const confirmResp = await confirmPlanning({
        batchCode,
        plannings: (batch?.items ?? []).map((it) => ({
          stopOrder: it.stopOrder,
          orderCode: it.orderCode,
          vehicleType: selectedQuote.vehicleType,
          serviceId: selectedQuote.serviceId,
          addons: [], // Task 4 nối AddonSelector
        })),
      }).unwrap();
      const plannings = confirmResp.plannings ?? [];
      const bookingResp = await createBooking({
        batchCode,
        shipmentPlannings: plannings.map((p) => ({
          planningId: p.planningId,
          codAmount: p.codAmount,
          totalBill: 0, // FE chưa có field totalBill (contract §3.6) — 0 như toStopOrders
          stopOrder: p.stopOrder,
        })),
      }).unwrap();
      setBookingResults(bookingResp.bookings ?? []);
      message.success(t("batching.quotes.bookingSuccess"));
      setCreated(true); // disable nút submit — modal mở để NG xem booking results
    } catch (err) {
      message.error(extractRejectMessages(err, t("batching.quotes.error")).join("; "));
    } finally {
      setNvcSubmitting(false);
    }
  };

  const sortableItems: SortableRowValue[] = useMemo(() => {
    const codeToGroup = new Map<string, number>();
    (groups ?? []).forEach((g, gi) => g.orderCodes.forEach((c) => codeToGroup.set(c, gi)));
    return rows.map((order, index) => ({
      order,
      stopOrder: index + 1,
      groupIndex: codeToGroup.get(order.fulfillCode) ?? -1,
    }));
  }, [rows, groups]);

  const handleSortEnd = ({ oldIndex, newIndex }: SortEnd) => {
    if (oldIndex === newIndex) return;
    setRows((prev) => arrayMove(prev, oldIndex, newIndex));
  };

  // SF-6 §2.3 — stepper + sumbar + review derived values
  const totalQuantity = rows.reduce((s, r) => s + (r.totalQuantity ?? 0), 0);
  const totalDistance = rows.reduce((s, r) => s + (r.distance ?? 0), 0);
  const totalCod = rows.reduce((s, r) => s + (r.codAmount ?? 0), 0);
  const shipperLabel = staffOptions.find((o) => o.value === shipperId)?.label ?? "—";
  const step1Done = rows.length > 0;
  const step2Done = !!shipperId && deliveryTime !== null;
  const steps: Array<{ n: 1 | 2 | 3; label: string; done: boolean }> = [
    { n: 1, label: t("createBatch.step1"), done: step1Done },
    { n: 2, label: t("createBatch.step2"), done: step2Done },
    { n: 3, label: t("createBatch.step3"), done: false },
  ];
  // SF-16 §2.5 — title theo mode (create giữ key cũ byte-for-byte).
  const titleKey =
    mode === "replan" ? "createBatch.titleReplan" : mode === "rebook" ? "createBatch.titleRebook" : "createBatch.title";

  return (
    <Modal
      title={
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: DESIGN_TOKENS.color.textStrong }}>
            {t(titleKey)}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 400, color: DESIGN_TOKENS.color.textMuted }}>
            {t("createBatch.selectedCount", { count: rows.length })}
            {shopCode ? ` · ${t("createBatch.shopLabel", { code: shopCode })}` : ""}
          </div>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={1240}
      className="create-batching-modal sf6-modal-animation"
      destroyOnClose
    >
      {/* Stepper — §2.3 (non-blocking, Deviation D1) */}
      <div className="sf6-stepper" role="tablist">
        {steps.map((s, i) => {
          const state = s.n === activeSection ? "cur" : s.done ? "done" : "upcoming";
          return (
            <div key={s.n} className="sf6-step-wrap">
              {i > 0 && (
                <span
                  className="sf6-step-line"
                  style={{
                    background: steps[i - 1].done ? DESIGN_TOKENS.color.primaryBorder : DESIGN_TOKENS.color.dividerSoft,
                  }}
                />
              )}
              <a
                className={`sf6-step-node sf6-step-${state}`}
                role="tab"
                aria-selected={s.n === activeSection}
                onClick={() => scrollToSection(s.n)}
              >
                {state === "done" ? "✓" : s.n}
              </a>
              <span
                className="sf6-step-label"
                style={{
                  fontWeight: s.n === activeSection ? 600 : 500,
                  color: s.n === activeSection ? DESIGN_TOKENS.color.textStrong : DESIGN_TOKENS.color.textMuted,
                }}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* ─── Section 1: danh sách đơn & thứ tự giao ─── */}
      <div className="batch-toolbar">
        <Button data-testid="batch-packing-suggest" loading={suggesting} onClick={() => void handlePackingSuggest()}>
          {t("createBatch.packingSuggest")}
        </Button>
        <Button data-testid="batch-recalc-distance" loading={recalculating} onClick={() => void handleRecalculate()}>
          {t("createBatch.recalcDistance")}
        </Button>
        <Select
          className="batch-add-order"
          mode="multiple"
          showSearch
          optionFilterProp="label"
          value={[]}
          placeholder={t("createBatch.addOrderPlaceholder")}
          notFoundContent={searching ? t("common.loading") : t("createBatch.addOrderEmpty")}
          onSearch={(v) => setSearchText(v)}
          onSelect={(code: string) => handleAddOrders([code])}
          onDeselect={() => undefined}
          data-testid="batch-add-order"
        >
          {addItems.map((o) => (
            <Select.Option key={o.fulfillCode} value={o.fulfillCode} label={o.fulfillCode}>
              {o.fulfillCode} — {o.customerAddress}
            </Select.Option>
          ))}
        </Select>
        <Typography.Text type="secondary">{t("createBatch.addOrder")}</Typography.Text>
      </div>

      {groups !== null && groups.length > 0 && (
        <div className="batch-groups" data-testid="batch-groups">
          {groups.map((g, gi) => {
            const c = groupColor(gi);
            return (
              <span
                key={gi}
                className="batch-group-chip"
                style={{ background: c.bg, borderColor: c.border }}
              >
                {t("createBatch.groupLabel", { index: gi + 1, count: g.orderCodes.length, km: g.totalDistance })}
              </span>
            );
          })}
        </div>
      )}

      <div className="batch-list" data-testid="batch-list">
        <div className="batch-table-header">
          <span className="batch-drag-handle" />
          <span className="batch-cell-stop">{t("createBatch.col.stopOrder")}</span>
          <span className="batch-cell-code">{t("createBatch.col.orderCode")}</span>
          <span className="batch-cell-address">{t("createBatch.col.address")}</span>
          <span className="batch-cell-distance">{t("createBatch.col.distance")}</span>
          <span className="batch-cell-time">{t("createBatch.col.deliveryTime")}</span>
          <span className="batch-cell-status">{t("createBatch.col.status")}</span>
          <span className="batch-cell-qty">{t("createBatch.col.quantity")}</span>
          <span className="batch-cell-cod">{t("createBatch.col.cod")}</span>
        </div>
        {rows.length === 0 ? (
          <Empty description={t("createBatch.empty")} style={{ padding: 24 }} />
        ) : (
          <SortableRows items={sortableItems} onSortEnd={handleSortEnd} useDragHandle lockToContainerEdges helperClass="batch-row-dragging" />
        )}
      </div>

      {/* ─── Section 2: carrier & shipper & thời gian giao + sumbar ─── */}
      <div className="batch-form" ref={section2Ref}>
        {/* SF-16 §2.1 — nhóm vận chuyển, chèn TRÊN shipper-select (testid cũ nguyên vẹn) */}
        <CarrierSection value={carrierGroup} onChange={setCarrierGroup}>
          {carrierGroup === "TRUCK" &&
            (quotesLoading ? (
              <Spin size="small" data-testid="quotes-loading" />
            ) : quotes === null ? (
              <Typography.Text type="secondary">{t("batching.carrierGroup.quotesPlaceholder")}</Typography.Text>
            ) : (
              <div className="quote-list" data-testid="quote-list">
                {quotes.map((q) => (
                  <label
                    key={q.serviceId}
                    className={`quote-item${q.serviceId === selectedServiceId ? " quote-item-selected" : ""}`}
                    data-testid={`quote-${q.serviceId}`}
                  >
                    <Radio
                      checked={q.serviceId === selectedServiceId}
                      onChange={() => setSelectedServiceId(q.serviceId)}
                    />
                    <span className="quote-name">{q.name}</span>
                    <Tag className="quote-vehicle">{q.vehicleType}</Tag>
                    <span className="quote-eta">{t("batching.quotes.eta", { minutes: q.etaMinutes })}</span>
                    {metaMock && <Tag className="quote-mock-tag">[MOCK]</Tag>}
                    <span className="quote-fee">{formatVnd(computeTotalFee(q, selectedAddons))}</span>
                  </label>
                ))}
              </div>
            ))}
        </CarrierSection>
        <div className="batch-form-row">
          <div className="sf6-form-card">
            <Typography.Text strong>{t("createBatch.shipper")}</Typography.Text>
            <Select
              style={{ width: "100%", display: "block", marginTop: 4, height: 40 }}
              placeholder={t("createBatch.shipperPlaceholder")}
              options={staffOptions}
              value={shipperId}
              onChange={setShipperId}
              data-testid="batch-shipper-select"
            />
            <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 6, display: "block" }}>
              {t("createBatch.staffFilterHint")}
            </Typography.Text>
          </div>
          <div className="sf6-form-card">
            <Typography.Text strong>{t("createBatch.deliveryTimeLabel")}</Typography.Text>
            <div style={{ marginTop: 4 }}>
              <DatePicker
                value={datePickerValue}
                onChange={handlePickDate}
                data-testid="batch-delivery-date"
              />
              {deliveryTime && !pickedFromHint && (
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  {formatPeriodOfTime(deliveryTime.from, deliveryTime.to)}
                </Typography.Text>
              )}
            </div>
            {hintSlots.length > 0 && (
              <div style={{ marginTop: 6 }} data-testid="batch-time-hints">
                <Typography.Text type="secondary">{t("createBatch.deliveryTimeHint")}: </Typography.Text>
                {hintSlots.slice(0, 3).map((slot, i) => (
                  <Tooltip key={i} title={formatPeriodOfTime(slot.from, slot.to)}>
                    <Tag
                      className="batch-hint-chip"
                      color={pickedFromHint && deliveryTime?.from === slot.from ? "gold" : "default"}
                      onClick={(e) => {
                        setDeliveryTime({ from: slot.from, to: slot.to });
                        setActiveSection((cur) => (cur === 1 ? 2 : cur));
                        void e;
                      }}
                      data-testid={`batch-time-hint-${i}`}
                    >
                      {moment(slot.from).format("DD/MM")}
                    </Tag>
                  </Tooltip>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sumbar — §2.3: 4 ô Số đơn / Sản phẩm / Quãng đường / Tổng COD */}
        <div className="sf6-sumbar">
          <div className="sf6-sum-cell">
            <span className="sf6-sum-key">{t("createBatch.sum.orders")}</span>
            <span className="sf6-sum-val">{rows.length}</span>
          </div>
          <div className="sf6-sum-cell">
            <span className="sf6-sum-key">{t("createBatch.sum.products")}</span>
            <span className="sf6-sum-val">{totalQuantity}</span>
          </div>
          <div className="sf6-sum-cell">
            <span className="sf6-sum-key">{t("createBatch.sum.distance")}</span>
            <span className="sf6-sum-val">{totalDistance > 0 ? `${totalDistance.toFixed(1)} km` : "—"}</span>
          </div>
          <div className="sf6-sum-cell">
            <span className="sf6-sum-key">{t("createBatch.sum.cod")}</span>
            <span className="sf6-sum-val">{formatVnd(totalCod)}</span>
          </div>
          {/* SF-16 §2.2 — Phí vận chuyển (dòng MỚI, KHÔNG đụng 4 ô cũ) */}
          {shippingFee !== null && (
            <div className="sf6-sum-cell" data-testid="sum-shipping-fee">
              <span className="sf6-sum-key">{t("batching.quotes.sumShippingFee")}</span>
              <span className="sf6-sum-val">{formatVnd(shippingFee)}</span>
            </div>
          )}
        </div>

        {/* ─── Section 3: review + note banner ─── */}
        <div className="sf6-review" ref={section3Ref}>
          <div className="sf6-review-row">
            <span className="sf6-review-key">{t("createBatch.review.shop")}</span>
            <span className="sf6-review-val">{rows[0]?.shopAssignment.shopName ?? "—"}{shopCode ? ` (${shopCode})` : ""}</span>
          </div>
          <div className="sf6-review-row">
            <span className="sf6-review-key">{t("createBatch.review.sequence")}</span>
            <span className="sf6-review-val">{rows.map((r) => r.fulfillCode).join(" → ") || "—"}</span>
          </div>
          <div className="sf6-review-row">
            <span className="sf6-review-key">{t("createBatch.review.shipper")}</span>
            <span className="sf6-review-val">{shipperLabel}</span>
          </div>
          <div className="sf6-review-row">
            <span className="sf6-review-key">{t("createBatch.review.deliveryTime")}</span>
            <span className="sf6-review-val">
              {deliveryTime ? formatPeriodOfTime(deliveryTime.from, deliveryTime.to) : "—"}
            </span>
          </div>
          <div className="sf6-review-row">
            <span className="sf6-review-key">{t("createBatch.review.cod")}</span>
            <span className="sf6-review-val">{formatVnd(totalCod)}</span>
          </div>
          {/* SF-16 §2.2 — Phí vận chuyển (dòng MỚI) + booking results (sau submit TRUCK) */}
          {shippingFee !== null && (
            <div className="sf6-review-row" data-testid="review-shipping-fee">
              <span className="sf6-review-key">{t("batching.quotes.reviewShippingFee")}</span>
              <span className="sf6-review-val">{formatVnd(shippingFee)}</span>
            </div>
          )}
          {bookingResults !== null && bookingResults.length > 0 && (
            <div className="sf6-review-row" data-testid="review-booking">
              <span className="sf6-review-key">{t("batching.quotes.reviewBooking")}</span>
              <span className="sf6-review-val">
                {bookingResults.map((b) => `${b.driver} · ${b.licensePlate} · ${b.carrierBookingId}`).join(" | ")}
              </span>
            </div>
          )}
          <div className="sf6-review-row">
            <span className="sf6-review-key">{t("createBatch.review.note")}</span>
            <span className="sf6-review-val">—</span>
          </div>
          <div className="sf6-note-banner">
            <span className="sf6-note-icon" aria-hidden="true">i</span>
            <span>
              <Trans
                t={t}
                i18nKey="createBatch.note"
                values={{ count: rows.length }}
                components={{ b: <b /> }}
              />
            </span>
          </div>
        </div>

        <div className="batch-footer">
          <span className="sf6-footer-hint">
            {t("createBatch.footer.step", { step: activeSection })} —{" "}
            {activeSection === 1
              ? t("createBatch.footer.hint1")
              : activeSection === 2
                ? t("createBatch.footer.hint2")
                : t("createBatch.footer.hint3")}
          </span>
          <span style={{ flex: 1 }} />
          <Button data-testid="batch-close" onClick={onClose}>
            {t("createBatch.close")}
          </Button>
          {activeSection < 3 && (
            <Button onClick={() => scrollToSection((activeSection + 1) as 2 | 3)}>
              {t("createBatch.continue")}
            </Button>
          )}
          <Button
            type="primary"
            disabled={!canSubmit || created}
            loading={creating || nvcSubmitting}
            onClick={() => void handleCreate()}
            data-testid="batch-submit"
          >
            {created
              ? t("createBatch.created")
              : activeSection === 3
                ? `✓ ${t("createBatch.createStep3")}`
                : t("createBatch.create")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
