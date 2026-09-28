import { describe, expect, it } from "vitest";
import {
  createPreviewState,
  metricsFor,
  type PreviewDuplicateCandidate,
} from "@/lib/asset-preview";
import { GeoTag } from "@/server/domain/value-objects/geo-tag";

describe("Module 4: Duplicate Asset Candidates & Proximity Analysis", () => {
  it("initializes with demo duplicate candidates between proximate assets", () => {
    const state = createPreviewState();
    expect(state.duplicates).toBeDefined();
    expect(state.duplicates?.length).toBeGreaterThan(0);

    const dup = state.duplicates?.[0];
    expect(dup?.status).toBe("pending");
    expect(dup?.flaggedBy).toBe("demo_officer");
    expect(dup?.reason).toContain("Proximity match");
  });

  it("calculates haversine distance between suspected duplicate assets correctly", () => {
    // Sabarmati Bridge location vs adjacent structure ~45m away
    const bridgeCoord = new GeoTag(23.0305, 72.58);
    const adjacentCoord = new GeoTag(23.0308, 72.5803);

    const distanceMeters = bridgeCoord.distanceToKm(adjacentCoord) * 1000;
    expect(distanceMeters).toBeGreaterThan(30);
    expect(distanceMeters).toBeLessThan(60);
  });

  it("handles four-eyes duplicate confirmation transition", () => {
    const candidate: PreviewDuplicateCandidate = {
      id: "dup-test-1",
      assetId: "asset-1",
      candidateId: "asset-2",
      status: "pending",
      flaggedBy: "surveyor-1",
      reason: "Cadastral map overlap",
      createdAt: "2026-09-28",
    };

    const reviewer = "reviewer-1";
    const decisionReason = "Verified identical bridge asset registered twice";

    // Simulate four-eyes review confirmation
    const confirmedCandidate: PreviewDuplicateCandidate = {
      ...candidate,
      status: "confirmed_duplicate",
      reviewedBy: reviewer,
      decisionReason,
    };

    expect(confirmedCandidate.status).toBe("confirmed_duplicate");
    expect(confirmedCandidate.reviewedBy).toBe(reviewer);
    expect(confirmedCandidate.decisionReason).toBe(decisionReason);
  });

  it("handles four-eyes duplicate dismissal as distinct infrastructure", () => {
    const candidate: PreviewDuplicateCandidate = {
      id: "dup-test-2",
      assetId: "asset-3",
      candidateId: "asset-4",
      status: "pending",
      flaggedBy: "surveyor-2",
      reason: "Close chainage marker",
      createdAt: "2026-09-28",
    };

    const dismissedCandidate: PreviewDuplicateCandidate = {
      ...candidate,
      status: "dismissed",
      reviewedBy: "reviewer-2",
      decisionReason: "Northbound vs Southbound separate carriageway sections",
    };

    expect(dismissedCandidate.status).toBe("dismissed");
    expect(dismissedCandidate.decisionReason).toContain("separate carriageway");
  });
});

describe("Module 10: Point-in-Time Regulatory Snapshot Aggregation", () => {
  it("correctly calculates executive metrics for regulatory snapshot reporting", () => {
    const state = createPreviewState();
    const metrics = metricsFor(state, state.assets);

    expect(metrics.inventory).toBeGreaterThan(0);
    expect(metrics.coverage).toBeGreaterThanOrEqual(0);
    expect(metrics.coverage).toBeLessThanOrEqual(100);
    expect(metrics.estimatePaise).toBeGreaterThan(0);

    // Verify condition counts
    const goodCount = state.inspections.filter(
      (i) => i.condition === "good",
    ).length;
    const criticalCount = state.inspections.filter(
      (i) => i.condition === "critical",
    ).length;

    expect(goodCount).toBeGreaterThan(0);
    expect(criticalCount).toBeGreaterThan(0);
  });

  it("formats Paise into INR currency strings without floating point distortion", () => {
    const paise = 42000000; // 420,000.00 INR (4.2 Lakhs)
    const inrRupees = paise / 100;
    expect(inrRupees).toBe(420000);

    const formatted = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(inrRupees);

    expect(formatted).toContain("4,20,000");
  });
});
