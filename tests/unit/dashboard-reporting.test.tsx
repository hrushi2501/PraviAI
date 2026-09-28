import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardStatutoryMetrics } from "@/components/dashboard-statutory-metrics";

describe("Dashboard reporting availability", () => {
  it("does not replace missing database data with fictitious inventory or trends", () => {
    const html = renderToStaticMarkup(
      <DashboardStatutoryMetrics summary={null} />,
    );
    expect(html).toContain("Inventory data is unavailable");
    expect(html).toContain("No trend is reported");
    expect(html).not.toContain("GJ-RBD");
    expect(html).not.toContain("142.5L");
    expect(html).not.toContain("0%");
  });
  it("shows missing condition coverage rather than a healthy zero-risk percentage", () => {
    const html = renderToStaticMarkup(
      <DashboardStatutoryMetrics
        summary={{
          totalRegistered: 4,
          verified: 3,
          currentAssessed: 0,
          goodOrFair: 0,
          stale: 1,
          neverAssessed: 2,
        }}
      />,
    );
    expect(html).toContain("No current assessment");
    expect(html).toContain("1 stale · 2 never assessed");
    expect(html.match(/0%/g)).toHaveLength(1);
  });
  it("renders database-supplied paired evidence and sums paise without floating point loss", () => {
    const html = renderToStaticMarkup(
      <DashboardStatutoryMetrics
        summary={null}
        restoration={[
          {
            departmentId: "dept",
            regionId: "region",
            status: "proposed",
            baseCategory: "building",
            outstandingWorkCount: 1,
            unreviewedOrUnpricedCount: 0,
            reviewedEstimatePaise: "900719925474099301",
          },
        ]}
        pairs={[
          {
            assetId: "real-asset",
            templateCode: "building",
            templateVersion: 2,
            firstInspectionId: "first",
            firstObservedOn: "2024-01-01",
            firstCondition: "poor",
            latestInspectionId: "latest",
            latestObservedOn: "2026-01-01",
            latestCondition: "fair",
          },
        ]}
      />,
    );
    expect(html).toContain("9,00,71,99,25,47,40,993.01");
    expect(html).toContain("2024-01-01");
    expect(html).toContain("/app/assets/real-asset");
    expect(html).not.toContain("No trend is reported");
  });
});
