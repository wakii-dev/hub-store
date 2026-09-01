/**
 * CreateBatchingModal — D1b "Tạo phiếu soạn" (REQUIREMENTS §3 D1b, modal 1310×918).
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
 *   success → đóng + invalidate Fulfillment LIST (cross-remote D2 thấy nhờ
 *   refetchOnMountOrArgChange mặc định của api-client — không code thêm).
 */
import { useEffect, useMemo, useState } from "react";
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
  const [addedCodes, setAddedCodes] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setRows(orders);
      setAddedCodes([]);
      setGroups(null);
      setShipperId(undefined);
      setDeliveryTime(null);
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
    const fresh = codes.map((c) => byCode.get(c)).filter((o): o is HubStoreOrderFilterItem => !!o);
    setAddedCodes((prev) => [...prev, ...fresh.map((o) => o.fulfillCode)]);
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
      onClose(); // invalidatesTags Fulfillment/LIST tự refetch D1
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

  return (
    <Modal
      title={t("createBatch.title")}
      open={open}
      onCancel={onClose}
      footer={null}
      width={1310}
      className="create-batching-modal"
      destroyOnClose
    >
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

      <div className="batch-form">
        <div className="batch-form-row">
          <div>
            <Typography.Text strong>{t("createBatch.shipper")}</Typography.Text>
            <Select
              style={{ width: 280, display: "block", marginTop: 4 }}
              placeholder={t("createBatch.shipperPlaceholder")}
              options={staffOptions}
              value={shipperId}
              onChange={setShipperId}
              data-testid="batch-shipper-select"
            />
          </div>
          <div>
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
                      onClick={() => setDeliveryTime({ from: slot.from, to: slot.to })}
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
        <div className="batch-footer">
          <Button data-testid="batch-close" onClick={onClose}>
            {t("createBatch.close")}
          </Button>
          <Button
            type="primary"
            disabled={!canSubmit}
            loading={creating}
            onClick={() => void handleCreate()}
            data-testid="batch-submit"
          >
            {t("createBatch.create")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
