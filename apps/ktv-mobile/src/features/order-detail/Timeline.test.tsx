// Unit Timeline (SF-25 T7) — parse/sort tăng dần + guard + render StatusPill
// + note + EmptyState. i18n resources thật để assert text VI.
import { describe, expect, it, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { getI18n, initI18n } from "@hub-store/shared";
import { ktvMobileResources } from "../../i18n";
import Timeline, { formatTimelineAt, parseTimeline } from "./Timeline";

initI18n({ resources: ktvMobileResources });

function wrap(ui: React.ReactNode) {
  return <I18nextProvider i18n={getI18n()!}>{ui}</I18nextProvider>;
}

/** Fixture cố tình ĐƯA NGƯỢC thứ tự — BE append nhưng thứ tự không contract. */
const outOfOrder = [
  { at: "2026-09-02T07:25:00+07:00", status: "PROCESSING", note: "KTV nhận việc", actor: "KTV-001" },
  { at: "2026-09-02T07:00:00+07:00", status: "NEW", note: "Tạo đơn lắp máy giặt", actor: "system" },
  { at: "2026-09-02T07:20:00+07:00", status: "PROCESSING", note: "Gán KTV-001", actor: "KTV-001" },
];

describe("parseTimeline — sort + guard", () => {
  it("sắp at tăng dần dù fixture đưa ngược", () => {
    const entries = parseTimeline(outOfOrder);
    expect(entries.map((e) => e.at)).toEqual([
      "2026-09-02T07:00:00+07:00",
      "2026-09-02T07:20:00+07:00",
      "2026-09-02T07:25:00+07:00",
    ]);
  });

  it("non-array / entry thiếu at-status → [] (JSON lỗi không crash trang)", () => {
    expect(parseTimeline(null)).toEqual([]);
    expect(parseTimeline("raw-broken-json-fallback")).toEqual([]);
    expect(parseTimeline([{ at: "x" }, { status: "NEW" }, 42, null])).toEqual([]);
  });

  it("entry thiếu note/actor vẫn giữ (optional)", () => {
    const entries = parseTimeline([{ at: "2026-09-02T07:00:00+07:00", status: "NEW" }]);
    expect(entries).toEqual([{ at: "2026-09-02T07:00:00+07:00", status: "NEW" }]);
  });
});

describe("Timeline render", () => {
  beforeEach(() => {
    cleanup(); // không auto-cleanup (vitest globals off) — DOM leak giữa tests
  });

  it("render StatusPill theo thứ tự đã sắp + note + giờ vi-VN", () => {
    render(wrap(<Timeline entries={parseTimeline(outOfOrder)} />));
    const pills = screen
      .getAllByTestId(/^ktv-status-/)
      .map((p) => p.getAttribute("data-testid"));
    expect(pills).toEqual([
      "ktv-status-NEW",
      "ktv-status-PROCESSING",
      "ktv-status-PROCESSING",
    ]);
    expect(screen.getByText("Tạo đơn lắp máy giặt")).toBeTruthy();
    expect(screen.getByText("KTV nhận việc")).toBeTruthy();
    expect(screen.getByText("Gán KTV-001")).toBeTruthy();
    // giờ hiển thị vi-VN (+07) — entry đầu 07:00 02/09/2026
    expect(screen.getByText("07:00 02/09/2026")).toBeTruthy();
  });

  it("rỗng → EmptyState (không render list)", () => {
    render(wrap(<Timeline entries={[]} />));
    expect(screen.getByText("Chưa có cập nhật tiến trình.")).toBeTruthy();
    expect(screen.queryByTestId("ktv-timeline")).toBeNull();
  });
});

describe("formatTimelineAt", () => {
  it("ISO hợp lệ → vi-VN +07", () => {
    expect(formatTimelineAt("2026-09-02T07:00:00+07:00")).toBe("07:00 02/09/2026");
  });
  it("ISO hỏng → trả nguyên văn (không crash)", () => {
    expect(formatTimelineAt("not-a-date")).toBe("not-a-date");
  });
});
