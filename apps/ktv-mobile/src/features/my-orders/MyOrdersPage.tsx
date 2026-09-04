/**
 * MyOrdersPage — "Đơn của tôi" hôm nay (SF-25 T4): header chào user + ngày
 * hôm nay, segmented Lắp đặt/Giao hàng (state đồng bộ URL param `tab`),
 * danh sách OrderCard. Empty state dùng shared EmptyState (SF-6); loading
 * dùng antd Skeleton. Fetch lazily theo tab + cache — quay lại tab đã load
 * không refetch.
 *
 * driverName tab Giao hàng = session.name (user.profile.name — spec §4.3);
 * technicianCode tab Lắp đặt = session.sub (preferred_username, §4.3).
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Button, Skeleton } from "antd";
import { DESIGN_TOKENS, EmptyState } from "@hub-store/shared";
import type { MobileSession } from "../../auth/oidc";
import {
  fetchMyDeliveries,
  fetchMyInstallations,
  todayIso,
  type DeliveryOrderDto,
  type InstallationOrderDto,
} from "../../api/ktvApi";
import OrderCard, { type OrderCardItem } from "./OrderCard";

type Tab = "install" | "delivery";

function CardSkeleton() {
  return (
    <div
      style={{
        background: DESIGN_TOKENS.color.bgWhite,
        border: `1px solid ${DESIGN_TOKENS.color.divider}`,
        borderRadius: DESIGN_TOKENS.radius.lg,
        padding: "12px 14px",
        marginBottom: 10,
      }}
      data-testid="ktv-orders-skeleton"
    >
      <Skeleton active title={{ width: "40%" }} paragraph={{ rows: 2 }} />
    </div>
  );
}

export default function MyOrdersPage(props: { session: MobileSession }) {
  const { t, i18n } = useTranslation("ktvMobile");
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "delivery" ? "delivery" : "install";

  const [installations, setInstallations] = useState<InstallationOrderDto[] | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryOrderDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Guard race: chỉ nhận kết quả request mới nhất (tab switch nhanh).
  const seq = useRef(0);

  const load = (which: Tab) => {
    const id = ++seq.current;
    setLoading(true);
    setError(false);
    const today = todayIso();
    const settle = (apply: () => void) => {
      if (id !== seq.current) return;
      apply();
      setLoading(false);
    };
    const fail = (err: unknown) => {
      console.error("[ktv-mobile] fetch my-orders failed:", err);
      if (id !== seq.current) return;
      setLoading(false);
      setError(true);
    };
    if (which === "install") {
      void fetchMyInstallations(props.session.sub, today).then(
        (items) => settle(() => setInstallations(items)),
        fail,
      );
    } else {
      void fetchMyDeliveries(props.session.name ?? props.session.sub, today).then(
        (items) => settle(() => setDeliveries(items)),
        fail,
      );
    }
  };

  useEffect(() => {
    if (tab === "install" && installations === null) load("install");
    if (tab === "delivery" && deliveries === null) load("delivery");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const switchTab = (value: string | number) => {
    // tab mặc định (install) → URL sạch (không param) — reload về mặc định.
    void setSearchParams(value === "delivery" ? { tab: "delivery" } : {}, { replace: true });
  };

  // SF-25 T5 — sau accept/complete: thay order trong state bằng response
  // (status + buttons mới) → card render lại pill + nút, không refetch.
  const applyUpdatedInstallation = (updated: InstallationOrderDto) => {
    setInstallations((prev) =>
      prev
        ? prev.map((o) =>
            o.serviceOrderCode === updated.serviceOrderCode ? updated : o,
          )
        : prev,
    );
  };

  const items: OrderCardItem[] =
    tab === "install"
      ? (installations ?? []).map((order) => ({ kind: "install" as const, order }))
      : (deliveries ?? []).map((order) => ({ kind: "delivery" as const, order }));

  const language = i18n.language ?? "vi";
  const todayLabel = new Intl.DateTimeFormat(
    language.startsWith("vi") ? "vi-VN" : "en-GB",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  ).format(new Date());

  return (
    <div style={{ padding: 16 }} data-testid="ktv-my-orders">
      <h1 style={{ margin: "0 0 4px", color: DESIGN_TOKENS.color.textStrong }}>
        {t("myorders.title")}
      </h1>
      <p style={{ margin: 0, color: DESIGN_TOKENS.color.textSecondary }} data-testid="ktv-greeting">
        {t("myorders.greeting", {
          name: props.session.name ?? props.session.sub,
        })}
      </p>
      <p style={{ margin: "0 0 12px", color: DESIGN_TOKENS.color.textMuted }} data-testid="ktv-today">
        {todayLabel}
      </p>

      <div
        role="tablist"
        data-testid="ktv-tab-bar"
        style={{
          display: "flex",
          background: DESIGN_TOKENS.color.dividerSoft,
          borderRadius: DESIGN_TOKENS.radius.control,
          padding: 3,
          marginBottom: 14,
        }}
      >
        {(
          [
            { value: "install", label: t("myorders.tab.install"), testid: "ktv-tab-install" },
            { value: "delivery", label: t("myorders.tab.delivery"), testid: "ktv-tab-delivery" },
          ] as const
        ).map((item) => {
          const active = tab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={item.testid}
              data-active={active ? "true" : "false"}
              onClick={() => switchTab(item.value)}
              style={{
                flex: 1,
                border: 0,
                borderRadius: DESIGN_TOKENS.radius.control,
                padding: "7px 0",
                fontSize: DESIGN_TOKENS.typography.body.fontSize,
                fontWeight: active ? 600 : 400,
                background: active ? DESIGN_TOKENS.color.bgWhite : "transparent",
                color: active ? DESIGN_TOKENS.color.primary : DESIGN_TOKENS.color.textSecondary,
                boxShadow: active ? DESIGN_TOKENS.shadow.xs : "none",
                cursor: "pointer",
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <>
          <CardSkeleton />
          <CardSkeleton />
        </>
      ) : error ? (
        <EmptyState
          title={t("myorders.load.error")}
          sub={t("myorders.load.errorSub")}
          actionLabel={t("myorders.retry")}
          onAction={() => load(tab)}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={
            tab === "install"
              ? t("myorders.empty.install.title")
              : t("myorders.empty.delivery.title")
          }
          sub={
            tab === "install"
              ? t("myorders.empty.install.sub")
              : t("myorders.empty.delivery.sub")
          }
        />
      ) : (
        <div data-testid="ktv-order-list">
          {items.map((item) =>
            item.kind === "install" ? (
              <OrderCard
                key={item.order.serviceOrderCode}
                kind="install"
                order={item.order}
                technicianCode={props.session.sub}
                onOrderUpdated={applyUpdatedInstallation}
              />
            ) : (
              <OrderCard
                key={item.order.code}
                kind="delivery"
                order={item.order}
                technicianCode={props.session.sub}
                onOrderUpdated={applyUpdatedInstallation}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
