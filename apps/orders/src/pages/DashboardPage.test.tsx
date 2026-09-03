/**
 * DashboardPage unit tests — mock api-client hook (không network).
 * Phủ review P1: chart math (30 bars, fill 0, label đầu/giữa/cuối), workload
 * row key `unassigned` khi staffId rỗng, error state (Alert thay vì số 0).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { initI18n } from "@hub-store/shared";
import { useGetDashboardStatsQuery } from "@hub-store/api-client";
import type { DashboardStats } from "@hub-store/shared";
import { ordersResources, registerOrdersResources } from "../i18n";
import DashboardPage from "./DashboardPage";

vi.mock("@hub-store/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hub-store/api-client")>();
  return {
    ...actual,
    useGetDashboardStatsQuery: vi.fn(),
  };
});

const mocked = { useGetDashboardStatsQuery: vi.mocked(useGetDashboardStatsQuery) };

function makeStats(overrides: Partial<DashboardStats> = {}): DashboardStats {
  return {
    ordersPerDay: Array.from({ length: 30 }, (_, i) => ({ date: `2026-08-${String(i + 4).padStart(2, "0")}`, count: 0 })),
    totalToday: 3,
    pendingApproval: 5,
    delivering: 4,
    completed: 5,
    cancelled: 2,
    completionRate: 71,
    cancelRate: 29,
    totalBatches: 7,
    workload: [
      { staffId: "DS-001", name: "Nguyễn Văn A", orderCount: 4 },
      { staffId: "", name: "Chưa gán", orderCount: 2 },
    ],
    ...overrides,
  };
}

function mockQuery(returns: Record<string, unknown>) {
  mocked.useGetDashboardStatsQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
    ...returns,
  } as never);
}

registerOrdersResources();
let testI18n: ReturnType<typeof initI18n>;

function renderDash() {
  return render(
    <I18nextProvider i18n={testI18n}>
      <DashboardPage />
    </I18nextProvider>,
  );
}

beforeAll(() => {
  testI18n = initI18n({ resources: ordersResources });
  registerOrdersResources();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DashboardPage", () => {
  it("render đủ 30 bar + stats khớp data", () => {
    const stats = makeStats();
    stats.ordersPerDay = stats.ordersPerDay.map((d, i) => ({ ...d, count: i === 29 ? 3 : 0 }));
    mockQuery({ data: stats });
    renderDash();
    expect(screen.getByTestId("dashboard-root")).toBeTruthy();
    expect(screen.getAllByTestId(/^bar-2026-/)).toHaveLength(30);
    expect(screen.getByTestId("stat-today")?.textContent).toContain("3");
    expect(screen.getByTestId("stat-pending")?.textContent).toContain("5");
    expect(screen.getByTestId("stat-delivering")?.textContent).toContain("4");
    // Workload: row theo staffId + row rỗng → key `unassigned`.
    expect(screen.getByTestId("workload-row-DS-001")).toBeTruthy();
    expect(screen.getByTestId("workload-row-unassigned")).toBeTruthy();
  });

  it("chart label đầu/giữa/cuối + max trục y", () => {
    const stats = makeStats({
      ordersPerDay: Array.from({ length: 30 }, (_, i) => ({
        date: `2026-08-${String(i + 4).padStart(2, "0")}`,
        count: i * 2,
      })),
    });
    mockQuery({ data: stats });
    const { container } = renderDash();
    const svg = container.querySelector('[data-testid="chart-orders-per-day-svg"]')!;
    const texts = Array.from(svg.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts).toContain("58"); // max = 29*2
    expect(texts.filter((x) => x?.startsWith("2026-08"))).toHaveLength(3); // đầu/giữa/cuối
  });

  it("data rỗng → EmptyState thay chart, không crash (SF-11 Task 5)", () => {
    mockQuery({ data: makeStats({ ordersPerDay: [] }) });
    renderDash();
    // SF-11: ordersPerDay rỗng → EmptyState (i18n dashboard.empty.title), không render chart rỗng.
    expect(screen.getByText("Chưa có dữ liệu đơn hàng")).toBeTruthy();
    expect(screen.queryByTestId("chart-orders-per-day-svg")).toBeNull();
  });

  it("isError → Alert lỗi + không render số 0 gây hiểu nhầm", () => {
    mockQuery({ isError: true });
    renderDash();
    expect(screen.getByTestId("dashboard-error")).toBeTruthy();
    expect(screen.queryByTestId("stat-today")).toBeNull();
  });

  it("nút refresh gọi refetch", () => {
    const refetch = vi.fn();
    mockQuery({ data: makeStats(), refetch });
    renderDash();
    fireEvent.click(screen.getByTestId("dashboard-refetch"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
