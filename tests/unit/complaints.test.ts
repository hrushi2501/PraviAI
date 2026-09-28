import { describe, expect, it } from "vitest";
import { InvariantViolationError } from "@/server/db/error-mapper";
import { ComplaintEntity } from "@/server/domain/entities/complaint.entity";
import { VersionToken } from "@/server/domain/value-objects/version-token";

describe("ComplaintEntity Domain Model", () => {
  const createTestComplaint = (overrides = {}) => {
    return new ComplaintEntity({
      id: "complaint-1",
      departmentId: "dept-1",
      channel: "phone",
      narrative: "Hazardous pothole on Sector 4 road",
      severity: "high",
      status: "open",
      assetId: null,
      resolutionNotes: null,
      version: new VersionToken(1),
      createdAt: new Date("2026-09-28T10:00:00Z"),
      ...overrides,
    });
  };

  it("correctly identifies unlinked and non-critical status", () => {
    const complaint = createTestComplaint({
      severity: "medium",
      assetId: null,
    });
    expect(complaint.isUnlinked).toBe(true);
    expect(complaint.isCritical).toBe(false);
    expect(complaint.isResolved).toBe(false);
  });

  it("identifies critical status and linked asset", () => {
    const complaint = createTestComplaint({
      severity: "critical",
      assetId: "asset-42",
    });
    expect(complaint.isUnlinked).toBe(false);
    expect(complaint.isCritical).toBe(true);
    expect(complaint.assetId).toBe("asset-42");
  });

  it("permits valid transitions along the grievance lifecycle", () => {
    const openComplaint = createTestComplaint({ status: "open" });
    expect(openComplaint.canTransitionTo("triaged")).toBe(true);
    expect(openComplaint.canTransitionTo("investigating")).toBe(false);
    expect(openComplaint.canTransitionTo("resolved")).toBe(false);

    const triagedComplaint = createTestComplaint({ status: "triaged" });
    expect(triagedComplaint.canTransitionTo("investigating")).toBe(true);
    expect(triagedComplaint.canTransitionTo("resolved")).toBe(false);

    const resolvedComplaint = createTestComplaint({ status: "resolved" });
    expect(resolvedComplaint.canTransitionTo("reopened")).toBe(true);
    expect(resolvedComplaint.canTransitionTo("triaged")).toBe(false);
  });

  it("throws InvariantViolationError on illegal status transition", () => {
    const openComplaint = createTestComplaint({ status: "open" });
    expect(() => openComplaint.assertCanTransitionTo("resolved")).toThrow(
      InvariantViolationError,
    );
  });

  it("serializes to clean JSON object", () => {
    const complaint = createTestComplaint();
    const json = complaint.toJSON();
    expect(json.id).toBe("complaint-1");
    expect(json.channel).toBe("phone");
    expect(json.version).toBe(1);
    expect(json.isUnlinked).toBe(true);
  });
});
