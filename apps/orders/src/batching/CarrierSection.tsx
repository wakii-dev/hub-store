/**
 * CarrierSection — nhóm vận chuyển trong D1b section 2 (SF-16, spec §2.1):
 * Radio.Group 3 nhóm — Tự giao (KHO_CN, default) · Xe tải (TRUCK, quotes
 * NVC) · FPT_DELIVERY (disabled + tooltip — chưa có BE, RG epic).
 *
 * Modal chính là composer — component giữ testid `batch-shipper-select` /
 * `batch-submit` cũ NGUYÊN VẠN (composer render ở CreateBatchingModal).
 * children = slot bảng quotes (Task 3 lắp), chỉ render khi nhóm TRUCK.
 */
import type { ReactNode } from "react";
import { Radio, Tooltip, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { CARRIER_GROUPS, isGroupEnabled, type CarrierGroup } from "./carrierHelpers";

export interface CarrierSectionProps {
  value: CarrierGroup;
  onChange: (g: CarrierGroup) => void;
  /** Slot bảng quotes theo tải trọng — chỉ render khi nhóm TRUCK active. */
  children?: ReactNode;
}

export function CarrierSection({ value, onChange, children }: CarrierSectionProps) {
  const { t } = useTranslation("orders");

  return (
    <div className="sf6-form-card carrier-section" data-testid="carrier-section">
      <Typography.Text strong>{t("batching.carrierGroup.label")}</Typography.Text>
      <Radio.Group
        className="carrier-group-radios"
        value={value}
        onChange={(e) => onChange(e.target.value as CarrierGroup)}
        data-testid="carrier-group"
      >
        {CARRIER_GROUPS.map((g) => {
          const radio = (
            <Radio key={g} value={g} disabled={!isGroupEnabled(g)} data-testid={`carrier-group-${g}`}>
              {t(`batching.carrierGroup.${g}`)}
            </Radio>
          );
          return isGroupEnabled(g) ? radio : <Tooltip key={g} title={t("batching.carrierGroup.fptComingSoon")}>{radio}</Tooltip>;
        })}
      </Radio.Group>
      {value === "TRUCK" && (
        <div className="carrier-quotes-slot" data-testid="carrier-quotes-slot">
          {children ?? t("batching.carrierGroup.quotesPlaceholder")}
        </div>
      )}
    </div>
  );
}
