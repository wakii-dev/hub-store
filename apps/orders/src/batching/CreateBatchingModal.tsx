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
import { useTranslation } from "react-i18next";
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
  useGetTimeDeliveryQuery,
  usePackingSuggestMutation,
  useRecalculateDistanceMutation,
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
  // SF-6 §2.3 stepper — NON-BLOCKING (Deviation D1): content không bao giờ ẩn,
  // activeSection chỉ điều khiển highlight + scroll-to khi bấm node/Tiếp tục.
  const [activeSection, setActiveSection] = useState<1 | 2 | 3>(1);
  const [created, setCreated] = useState(false); // micro-interaction "✓" 800ms
  const section2Ref = useRef<HTMLDivElement | null>(null);
  const section3Ref = useRef<HTMLDivElement | null>(null);

  const scrollToSection = (s: 1 | 2 | 3) => {
    setActiveSection(s);
    if (s === 2) section2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (s === 3) section3Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (open) {
      setRows(orders);
      setGroups(null);
      setShipperId(undefined);
      setDeliveryTime(null);
      setActiveSection(1);
      setCreated(false);
    }
    // Chỉ sync khi mở — selection D1 refetch giữa lúc mở không reset state đang sửa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shopCode = rows[0]?.shopAssignment.shopCode ?? "";

  // ---- Packing suggest + recalc ------------------------------------------------
  const [packingSuggest, { isLoading: suggesting }] = usePackingSuggestMutation();
  const [recalculate, { isLoading: recalculating }] = useRecalculateDistanceMutation();
  const [createBatch, { isLoading: creating }] = useCreateBatchMutation();

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
      setTimeout(onClose, 800); // invalidatesTags Fulfillment/LIST tự refetch D1
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
  const step1Done = rows.length > 0;
  const step2Done = !!shipperId && deliveryTime !== null;
  const steps: Array<{ n: 1 | 2 | 3; label: string; done: boolean }> = [
    { n: 1, label: "Danh sách đơn & thứ tự giao", done: step1Done },
    { n: 2, label: "Shipper & thời gian giao", done: step2Done },
    { n: 3, label: "Xác nhận tạo phiếu", done: false },
  ];

  return (
    <Modal
      title={
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: DESIGN_TOKENS.color.textStrong }}>
            {t("createBatch.title")}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 400, color: DESIGN_TOKENS.color.textMuted }}>
            {rows.length} đơn đã chọn
            {shopCode ? ` · Kho ${shopCode}` : ""}
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

      {/* ─── Section 2: shipper & thời gian giao + sumbar ─── */}
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
              Danh sách lọc theo kho của phiếu
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
            <span className="sf6-sum-key">Số đơn</span>
            <span className="sf6-sum-val">{rows.length}</span>
          </div>
          <div className="sf6-sum-cell">
            <span className="sf6-sum-key">Sản phẩm</span>
            <span className="sf6-sum-val">{totalQuantity}</span>
          </div>
          <div className="sf6-sum-cell">
            <span className="sf6-sum-key">Quãng đường</span>
            <span className="sf6-sum-val">{totalDistance > 0 ? `${totalDistance.toFixed(1)} km` : "—"}</span>
          </div>
          <div className="sf6-sum-cell">
            <span className="sf6-sum-key">Tổng COD</span>
            <span className="sf6-sum-val">{formatVnd(totalCod)}</span>
          </div>
        </div>

        {/* ─── Section 3: review + note banner ─── */}
        <div className="sf6-review" ref={section3Ref}>
          <div className="sf6-review-row">
            <span className="sf6-review-key">Kho xuất</span>
            <span className="sf6-review-val">{rows[0]?.shopAssignment.shopName ?? "—"}{shopCode ? ` (${shopCode})` : ""}</span>
          </div>
          <div className="sf6-review-row">
            <span className="sf6-review-key">Số đơn — thứ tự giao</span>
            <span className="sf6-review-val">{rows.map((r) => r.fulfillCode).join(" → ") || "—"}</span>
          </div>
          <div className="sf6-review-row">
            <span className="sf6-review-key">Shipper</span>
            <span className="sf6-review-val">{shipperLabel}</span>
          </div>
          <div className="sf6-review-row">
            <span className="sf6-review-key">Thời gian giao</span>
            <span className="sf6-review-val">
              {deliveryTime ? formatPeriodOfTime(deliveryTime.from, deliveryTime.to) : "—"}
            </span>
          </div>
          <div className="sf6-review-row">
            <span className="sf6-review-key">Tổng COD</span>
            <span className="sf6-review-val">{formatVnd(totalCod)}</span>
          </div>
          <div className="sf6-review-row">
            <span className="sf6-review-key">Ghi chú</span>
            <span className="sf6-review-val">—</span>
          </div>
          <div className="sf6-note-banner">
            <span className="sf6-note-icon" aria-hidden="true">i</span>
            <span>
              Khi tạo phiếu, trạng thái soạn của {rows.length} đơn chuyển thành{" "}
              <b>Đang soạn</b> và mã phiếu <b>BATCH-xxxx</b> được sinh tự động.
            </span>
          </div>
        </div>

        <div className="batch-footer">
          <span className="sf6-footer-hint">
            Bước {activeSection}/3 —{" "}
            {activeSection === 1
              ? "Kéo thả để sắp thứ tự giao"
              : activeSection === 2
                ? "Chọn shipper và thời gian giao"
                : "Kiểm tra lại thông tin trước khi tạo"}
          </span>
          <span style={{ flex: 1 }} />
          <Button data-testid="batch-close" onClick={onClose}>
            {t("createBatch.close")}
          </Button>
          {activeSection < 3 && (
            <Button onClick={() => scrollToSection((activeSection + 1) as 2 | 3)}>
              Tiếp tục →
            </Button>
          )}
          <Button
            type="primary"
            disabled={!canSubmit || created}
            loading={creating}
            onClick={() => void handleCreate()}
            data-testid="batch-submit"
          >
            {created ? "✓ Đã tạo phiếu" : activeSection === 3 ? "✓ Tạo phiếu soạn hàng" : t("createBatch.create")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
