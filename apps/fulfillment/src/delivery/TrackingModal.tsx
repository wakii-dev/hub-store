/**
 * TrackingModal — theo dõi vận đơn NVC (SF-16 §2.7, Task 8). Modal 720px mở
 * từ batch action "Tracking" (full batch) hoặc per-order trong expand row
 * (lọc 1 entry theo planning map). Header mỗi planning: ShipmentStatusTag +
 * driver + biển số + carrierBookingId + bookedAt; slot link `urltracking`
 * (BE chưa trả field → tự ẩn — contract-ready). Timeline 2 cột BE | PARTNER.
 */
import { useMemo } from "react";
import { Col, Descriptions, Modal, Row, Spin, Tabs, Timeline, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { EmptyState, formatPeriodOfTime, loadPlanningMap, type Locale } from "@hub-store/shared";
import type { DeliveryBookingDetailDto, DeliveryBookingEntryDto } from "@hub-store/shared";
import { useSearchBookingDetailQuery } from "../api/deliveryBatchApi";
import { shipmentStatusLabel } from "./shipmentStatuses";
import { ShipmentStatusTag } from "./ShipmentStatusTag";
import { BatchRouteMap, type StopMeta } from "./BatchRouteMap";

export interface TrackingModalProps {
  open: boolean;
  batchCode: string;
  /** planningIds của batch (từ planning map) — fetch searchbookingdetail. */
  planningIds: string[];
  /** Có → chỉ hiển thị entry của đơn này (per-order tracking trong expand row). */
  orderCode?: string;
  /** SF-24: meta stops cho tab bản đồ (address + COD) — optional, Task 4 wire. */
  stopMeta?: Record<string, StopMeta>;
  onClose: () => void;
}

/**
 * splitDriver — BE searchbookingdetail trả driverName dạng "name - phone"
 * (join 2 field proto, shape §3.6 app gốc). Split ở " - " CUỐI (tên có thể
 * chứa " - "); fallback dùng driverPhone field riêng khi chuỗi không join.
 */
export function splitDriver(driverName: string, driverPhone: string): { name: string; phone: string } {
  const idx = driverName.lastIndexOf(" - ");
  if (idx >= 0) return { name: driverName.slice(0, idx), phone: driverName.slice(idx + 3) };
  return { name: driverName, phone: driverPhone };
}

/** Slot `urltracking` — BE chưa có field → undefined → ẩn (contract-ready).
 * Security P2: chỉ render http(s) — chặn `javascript:`/data-URI từ BE/partner. */
function trackingUrl(booking: DeliveryBookingDetailDto): string | undefined {
  const raw = (booking as DeliveryBookingDetailDto & { urltracking?: string } | null)?.urltracking;
  return typeof raw === "string" && /^https?:\/\//i.test(raw) ? raw : undefined;
}

function PlanningTracking({
  entry,
  locale,
}: {
  entry: DeliveryBookingEntryDto;
  locale: Locale;
}) {
  const { t } = useTranslation("fulfillment");
  const booking = entry.booking;
  if (!booking) {
    // Planning chưa book (booking=null, timeline=[]) → EmptyState.
    return <EmptyState title={t("tracking.notBooked")} sub={t("tracking.notBookedSub")} />;
  }

  const url = trackingUrl(booking);
  const driver = splitDriver(booking.driverName, booking.driverPhone);
  const beEvents = entry.timeline.filter((e) => e.source === "BE");
  const partnerEvents = entry.timeline.filter((e) => e.source === "PARTNER");

  const renderItem = (eventCol: typeof entry.timeline) =>
    eventCol.map((e, i) => (
      <Timeline.Item key={`${e.status}-${e.occurredAt}-${i}`}>
        <div>{shipmentStatusLabel(e.status, locale)}</div>
        <div style={{ fontSize: 12, color: "rgba(0, 0, 0, 0.45)" }}>
          {formatPeriodOfTime(e.occurredAt, e.occurredAt, locale)}
        </div>
        {e.note && (
          <div style={{ fontSize: 12, color: "rgba(0, 0, 0, 0.45)" }}>{e.note}</div>
        )}
      </Timeline.Item>
    ));

  return (
    <div style={{ marginBottom: 24 }} data-testid={`tracking-entry-${entry.planningId}`}>
      <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <ShipmentStatusTag status={booking.status} locale={locale} />
        {url && (
          <a href={url} target="_blank" rel="noreferrer" data-testid={`tracking-link-${entry.planningId}`}>
            {t("tracking.trackingLink")}
          </a>
        )}
      </div>
      <Descriptions size="small" column={2} style={{ marginBottom: 12 }}>
        <Descriptions.Item label={t("tracking.driver")}>
          {driver.name}
          {driver.phone && (
            <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
              {driver.phone}
            </Typography.Text>
          )}
        </Descriptions.Item>
        <Descriptions.Item label={t("tracking.licensePlate")}>{booking.licensePlate}</Descriptions.Item>
        <Descriptions.Item label={t("tracking.carrierBookingId")}>{booking.carrierBookingId}</Descriptions.Item>
        <Descriptions.Item label={t("tracking.bookedAt")}>
          {formatPeriodOfTime(booking.bookedAt, booking.bookedAt, locale)}
        </Descriptions.Item>
      </Descriptions>
      <Row gutter={16}>
        <Col span={12}>
          <Typography.Text strong>{t("tracking.colSystem")}</Typography.Text>
          <div data-testid="tracking-timeline-be">
            <Timeline>{renderItem(beEvents)}</Timeline>
          </div>
        </Col>
        <Col span={12}>
          <Typography.Text strong>{t("tracking.colPartner")}</Typography.Text>
          <div data-testid="tracking-timeline-partner">
            <Timeline>{renderItem(partnerEvents)}</Timeline>
          </div>
        </Col>
      </Row>
    </div>
  );
}

/** Nội dung tab Timeline — code gốc của modal (SF-16) giữ NGUYÊN, testid
 * tracking-entry / tracking-timeline-be/partner / tracking-link không đổi. */
function TimelineContent({ isLoading, entries, locale }: {
  isLoading: boolean;
  entries: DeliveryBookingEntryDto[];
  locale: Locale;
}) {
  const { t } = useTranslation("fulfillment");
  if (isLoading) {
    return (
      <div style={{ textAlign: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }
  if (entries.length === 0) {
    return <EmptyState title={t("tracking.notBooked")} sub={t("tracking.notBookedSub")} />;
  }
  return (
    <>
      {entries.map((entry) => <PlanningTracking key={entry.planningId} entry={entry} locale={locale} />)}
    </>
  );
}

export function TrackingModal({ open, batchCode, planningIds, orderCode, stopMeta, onClose }: TrackingModalProps) {
  const { t, i18n } = useTranslation("fulfillment");
  const locale: Locale = i18n.language.startsWith("vi") ? "vi" : "en";

  const { data, isLoading } = useSearchBookingDetailQuery(planningIds.join(","), {
    skip: !open || planningIds.length === 0,
  });

  // Per-order: lọc entries theo planning map của orderCode (modal nhận full
  // batch ids, tự thu hẹp — map là nguồn chân lý interim, RG #5).
  const entries = useMemo(() => {
    const all = data?.bookings ?? [];
    if (!orderCode) return all;
    const expected = loadPlanningMap(batchCode)
      .filter((e) => e.orderCode === orderCode)
      .map((e) => e.planningId);
    return all.filter((b) => expected.includes(b.planningId));
  }, [data, orderCode, batchCode]);

  return (
    <Modal
      open={open}
      width={720}
      className="sf6-modal-animation"
      title={t("tracking.title", { code: orderCode ?? batchCode })}
      footer={null}
      onCancel={onClose}
      destroyOnClose
    >
      {/* SF-24 (plan Task 2): tab Timeline mặc định — KHÔNG forceRender tab map
       * (không init leaflet ẩn; map chỉ mount khi user bấm tab). */}
      <Tabs
        defaultActiveKey="timeline"
        items={[
          {
            key: "timeline",
            label: t("tracking.tabTimeline"),
            children: <TimelineContent isLoading={isLoading} entries={entries} locale={locale} />,
          },
          {
            key: "map",
            label: <span data-testid="tracking-map-tab">{t("tracking.tabMap")}</span>,
            children: <BatchRouteMap batchCode={batchCode} perOrderCode={orderCode} stopMeta={stopMeta} />,
          },
        ]}
      />
    </Modal>
  );
}
