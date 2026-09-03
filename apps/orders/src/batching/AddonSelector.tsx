/**
 * AddonSelector — dịch vụ gia tăng theo quote đã chọn (SF-16, spec §2.3):
 * nhóm theo `grp` — ROUTE/LOADING → Radio.Group (exclusive TRONG grp, chọn 1
 * thay thế trong cùng grp; grp khác giữ nguyên) · DOCUMENT/ROUND_TRIP →
 * Checkbox (multi). Item disabled (xe không hỗ trợ) → disabled + Tooltip
 * i18n "Không khả dụng cho xe này". addon.name do BE trả — hiển thị nguyên văn.
 */
import { useMemo } from "react";
import { Checkbox, Radio, Tooltip, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { formatVnd, type DeliveryAddonDto } from "@hub-store/shared";

/** grp dùng Radio (chọn 1 trong grp) — còn lại dùng Checkbox. */
const RADIO_GRPS = new Set(["ROUTE", "LOADING"]);

export interface AddonSelectorProps {
  addons: DeliveryAddonDto[];
  value: string[];
  onChange: (codes: string[]) => void;
  /** Quote/xe đổi → addon không khả dụng → disabled toàn bộ + tooltip. */
  disabled?: boolean;
}

export function AddonSelector({ addons, value, onChange, disabled = false }: AddonSelectorProps) {
  const { t } = useTranslation("orders");

  // Nhóm theo thứ tự xuất hiện — key grp do BE trả (không hardcode danh sách).
  const groups = useMemo(() => {
    const map = new Map<string, DeliveryAddonDto[]>();
    addons.forEach((a) => {
      const list = map.get(a.grp) ?? [];
      list.push(a);
      map.set(a.grp, list);
    });
    return [...map.entries()];
  }, [addons]);

  const selectRadio = (grp: string, code: string) => {
    const codesInGrp = new Set((groups.find(([g]) => g === grp)?.[1] ?? []).map((a) => a.code));
    onChange([...value.filter((c) => !codesInGrp.has(c)), code]);
  };

  const toggleCheckbox = (code: string, checked: boolean) => {
    onChange(checked ? [...value, code] : value.filter((c) => c !== code));
  };

  if (addons.length === 0) return null;

  return (
    <div className="addon-selector" data-testid="addon-selector">
      <Typography.Text strong className="addon-selector-label">
        {t("batching.addon.label")}
      </Typography.Text>
      {groups.map(([grp, items]) => {
        const selectedInGrp = value.find((c) => items.some((i) => i.code === c));
        const itemNode = (a: DeliveryAddonDto) => {
          const item = (
            <label className="addon-item" data-testid={`addon-${a.code}`}>
              {RADIO_GRPS.has(grp) ? (
                <Radio
                  checked={selectedInGrp === a.code}
                  disabled={disabled}
                  onChange={() => selectRadio(grp, a.code)}
                />
              ) : (
                <Checkbox
                  checked={value.includes(a.code)}
                  disabled={disabled}
                  onChange={(e) => toggleCheckbox(a.code, e.target.checked)}
                />
              )}
              <span className="addon-name">{a.name}</span>
              <span className="addon-fee">{formatVnd(a.fee)}</span>
            </label>
          );
          return disabled ? (
            <Tooltip key={a.code} title={t("batching.addon.unavailable")}>
              {item}
            </Tooltip>
          ) : (
            item
          );
        };
        return (
          <div key={grp} className="addon-grp">
            <span className="addon-grp-label">{t(`batching.addon.grp.${grp}`)}</span>
            <div className="addon-items">{items.map(itemNode)}</div>
          </div>
        );
      })}
    </div>
  );
}
