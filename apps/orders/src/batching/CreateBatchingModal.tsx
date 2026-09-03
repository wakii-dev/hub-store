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
import { Button, DatePicker, Empty, Modal, Select, Space, Tag, Tooltip, Typography, message } from "antd";
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
  type DeliveryStaffResponse,
  type HubStoreOrderFilterItem,
  type PackingGroup,
  type TimeRange,
} from "@hub-store/shared";
import { useGetDeliveryStaffQuery, useListOrdersQuery } from "@hub-store/api-client";
import {
  useCreateBatchMutation,
  useGetCriteriaPresetsQuery,
  useGetTimeDeliveryQuery,
  usePackingSuggestMutation,
  useRecalculateDistanceMutation,
  useSelectCriteriaPresetMutation,
  type CriteriaPresetItem,
} from "./batchingApi";
import { buildAddOrderFilterRequest, extractRejectMessages } from "./batchingHelpers";
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

// SF-28 T7 — step 1 criteria preset (design §2.4, hướng B). Copy VI chính xác
// theo design (tên/mô tả/chip render qua i18n theo preset id của API); preset
// id lạ (API thêm mới) → fallback name/description từ payload. Icon = emoji
// placeholder theo prototype (§6 — icon library là out-of-scope dev-decided).
const DEFAULT_PRESET_ID = "balanced"; // design §2.4: mặc định chọn sẵn BALANCED
const PRESET_META: Record<string, { icon: string; chipKeys: string[] }> = {
  shortest: { icon: "📏", chipKeys: ["shortest.1", "shortest.2"] },
  cod_priority: { icon: "💰", chipKeys: ["cod_priority.1", "cod_priority.2"] },
  fewest_stops: { icon: "📍", chipKeys: ["fewest_stops.1", "fewest_stops.2"] },
  balanced: { icon: "⚖️", chipKeys: ["balanced.1", "balanced.2"] },
};

function presetDisplayName(p: CriteriaPresetItem, t: (k: string) => string): string {
  return PRESET_META[p.id] ? t(`createBatch.preset.name.${p.id}`) : p.name;
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

export interface CreateBatchingModalProps {
  open: boolean;
  /** Đơn đã chọn trên D1 — snapshot khi mở modal (KHÔNG re-fetch). */
  orders: HubStoreOrderFilterItem[];
  onClose: () => void;
}

export function CreateBatchingModal({ open, orders, onClose }: CreateBatchingModalProps) {
  const { t } = useTranslation("orders");

  // Rows state — sync khi MỞ modal (snapshot selection); DnD/thêm đơn/recalc đổi state.
  const [rows, setRows] = useState<HubStoreOrderFilterItem[]>([]);
  const [groups, setGroups] = useState<PackingGroup[] | null>(null);
  const [shipperId, setShipperId] = useState<string | undefined>(undefined);
  const [deliveryTime, setDeliveryTime] = useState<TimeRange | null>(null);
  // SF-28 T7: step 1 = criteria preset; 2/3/4 = nội dung cũ theo thứ tự (renumber).
  const [presetId, setPresetId] = useState<string | null>(null);
  // SF-6 §2.3 stepper — NON-BLOCKING (Deviation D1): content không bao giờ ẩn,
  // activeSection chỉ điều khiển highlight + scroll-to khi bấm node/Tiếp tục.
  const [activeSection, setActiveSection] = useState<1 | 2 | 3 | 4>(1);
  const [created, setCreated] = useState(false); // micro-interaction "✓" 800ms
  const section1Ref = useRef<HTMLDivElement | null>(null);
  const ordersRef = useRef<HTMLDivElement | null>(null);
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

  const scrollToSection = (s: 1 | 2 | 3 | 4) => {
    setActiveSection(s);
    if (s === 1) section1Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (s === 2) ordersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (s === 3) section2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (s === 4) section3Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (open) {
      clearCloseTimer(); // P1: hủy timer version trước trước khi reset state
      setRows(orders);
      setGroups(null);
      setShipperId(undefined);
      setDeliveryTime(null);
      setPresetId(null); // re-default BALANCED khi presets data có sẵn (effect dưới)
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

  // ---- Step 1: criteria preset (SF-28 T7) --------------------------------------
  const {
    data: presetData,
    isError: presetsError,
    refetch: refetchPresets,
  } = useGetCriteriaPresetsQuery(undefined, { skip: !open });
  const [selectCriteriaPreset] = useSelectCriteriaPresetMutation();
  const presets: CriteriaPresetItem[] = presetData?.items ?? [];

  // Default chọn sẵn BALANCED khi API trả về list có preset đó (design §2.4) —
  // user không đổi vẫn hợp lệ; API fail → không default, "Tiếp tục" disabled.
  useEffect(() => {
    if (presetId === null && presets.some((p) => p.id === DEFAULT_PRESET_ID)) {
      setPresetId(DEFAULT_PRESET_ID);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetData, presetId]);

  const handlePickPreset = (id: string) => {
    if (id === presetId) return; // click lại card đang chọn — không audit đôi
    setPresetId(id);
    // Audit fire-and-forget (T6 contract): gọi nhưng lỗi KHÔNG block UI.
    void selectCriteriaPreset({ presetId: id, orderCount: rows.length }).catch(() => undefined);
  };


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
  const canSubmit = rows.length > 0 && !!shipperId && deliveryTime !== null;

  const handleCreate = async () => {
    if (!canSubmit) return;
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
  const selectedPreset = presets.find((p) => p.id === presetId) ?? null;
  // SF-28 T7: stepper 4 bước — 1 preset (mới), 2/3/4 = nội dung cũ theo thứ tự.
  const stepPresetDone = presetId !== null;
  const step1Done = rows.length > 0;
  const step2Done = !!shipperId && deliveryTime !== null;
  const steps: Array<{ n: 1 | 2 | 3 | 4; label: string; done: boolean }> = [
    { n: 1, label: t("createBatch.stepPreset"), done: stepPresetDone },
    { n: 2, label: t("createBatch.step1"), done: step1Done },
    { n: 3, label: t("createBatch.step2"), done: step2Done },
    { n: 4, label: t("createBatch.step3"), done: false },
  ];

  return (
    <Modal
      title={
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: DESIGN_TOKENS.color.textStrong }}>
            {t("createBatch.title")}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 400, color: DESIGN_TOKENS.color.textMuted }}>
            {t("createBatch.selectedCount", { count: rows.length })}
            {shopCode ? ` · ${t("createBatch.shopLabel", { code: shopCode })}` : ""}
            {/* SF-28 T7: chip preset đã chọn ở header các step sau (chỉ display). */}
            {activeSection !== 1 && selectedPreset && (
              <span className="batch-preset-header-chip" data-testid="wizard-preset-chip">
                {presetDisplayName(selectedPreset, t)}
              </span>
            )}
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

      {/* ─── Step 1 (MỚI — SF-28 T7, design §2.4): tiêu chí tối ưu ─── */}
      <div className="batch-preset" ref={section1Ref} data-testid="wizard-step1-preset">
        <div className="batch-preset-overline">{t("createBatch.preset.label")}</div>
        {presetsError ? (
          <div className="batch-preset-error">
            <span>{t("createBatch.preset.loadError")}</span>
            <Button size="small" onClick={() => void refetchPresets()}>
              {t("createBatch.preset.retry")}
            </Button>
          </div>
        ) : (
          <div className="batch-preset-grid">
            {presets.map((p) => {
              const meta = PRESET_META[p.id];
              const selected = p.id === presetId;
              return (
                <div
                  key={p.id}
                  role="radio"
                  aria-checked={selected}
                  // a11y (P1 review): role="radio" phải focusable + Enter/Space
                  // select — trước đây tabIndex={-1} + click-only.
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handlePickPreset(p.id);
                    }
                  }}
                  className={`batch-preset-card${selected ? " batch-preset-card-selected" : ""}`}
                  data-testid={`wizard-preset-${p.id}`}
                  onClick={() => handlePickPreset(p.id)}
                >
                  <span className="batch-preset-radio" aria-hidden="true">
                    {selected && <span className="batch-preset-radio-dot" />}
                  </span>
                  <div className="batch-preset-head">
                    <span className="batch-preset-icon" aria-hidden="true">
                      {meta?.icon ?? "⚙️"}
                    </span>
                    <span className="batch-preset-name">{presetDisplayName(p, t)}</span>
                  </div>
                  <div className="batch-preset-desc">{meta ? t(`createBatch.preset.desc.${p.id}`) : p.description}</div>
                  {(meta?.chipKeys ?? []).length > 0 && (
                    <div className="batch-preset-chips">
                      {meta!.chipKeys.map((k) => (
                        <span key={k} className="batch-preset-chip">
                          {t(`createBatch.preset.chip.${k}`)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Step 2: danh sách đơn & thứ tự giao (nội dung cũ — KHÔNG đổi logic) ─── */}
      <div ref={ordersRef}>
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
      </div>

      {/* ─── Step 3: shipper & thời gian giao + sumbar (nội dung cũ) ─── */}
      <div className="batch-form" ref={section2Ref}>
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
                        setActiveSection((cur) => (cur === 2 ? 3 : cur)); // renumber T7: đơn=2, shipper=3
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
        </div>

        {/* ─── Step 4: review + note banner (nội dung cũ) ─── */}
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
              ? t("createBatch.footer.hint0")
              : activeSection === 2
                ? t("createBatch.footer.hint1")
                : activeSection === 3
                  ? t("createBatch.footer.hint2")
                  : t("createBatch.footer.hint3")}
          </span>
          <span style={{ flex: 1 }} />
          <Button data-testid="batch-close" onClick={onClose}>
            {t("createBatch.close")}
          </Button>
          {activeSection < 4 && (
            <Button
              data-testid="batch-continue"
              disabled={activeSection === 1 && presetId === null}
              onClick={() => scrollToSection((activeSection + 1) as 2 | 3 | 4)}
            >
              {activeSection === 1 ? t("createBatch.continuePreset") : t("createBatch.continue")}
            </Button>
          )}
          <Button
            type="primary"
            disabled={!canSubmit || created}
            loading={creating}
            onClick={() => void handleCreate()}
            data-testid="batch-submit"
          >
            {created
              ? t("createBatch.created")
              : activeSection === 4
                ? `✓ ${t("createBatch.createStep3")}`
                : t("createBatch.create")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
