import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  InvariantViolationError,
  NotFoundError,
  OptimisticLockError,
  translateDatabaseError,
} from "@/server/db/error-mapper";
import { AssetEntity } from "@/server/domain/entities/asset.entity";
import { InspectionEntity } from "@/server/domain/entities/inspection.entity";
import { WorkOrderEntity } from "@/server/domain/entities/work-order.entity";
import { GeoTag } from "@/server/domain/value-objects/geo-tag";
import { MoneyPaise } from "@/server/domain/value-objects/money-paise";
import { VersionToken } from "@/server/domain/value-objects/version-token";

describe("MoneyPaise Value Object", () => {
  it("converts between rupees and paise correctly", () => {
    const money = MoneyPaise.fromRupees(1500.5);
    expect(money.amountPaise).toBe(BigInt(150050));
    expect(money.toRupees()).toBe(1500.5);
  });

  it("formats Indian currency correctly", () => {
    const money = MoneyPaise.fromRupees(150000);
    const formatted = money.formatINR();
    expect(formatted).toContain("1,50,000");
  });

  it("performs addition and subtraction", () => {
    const m1 = MoneyPaise.fromRupees(100);
    const m2 = MoneyPaise.fromRupees(50);
    expect(m1.add(m2).toRupees()).toBe(150);
    expect(m1.subtract(m2).toRupees()).toBe(50);
  });

  it("throws invariant violation on negative result", () => {
    const m1 = MoneyPaise.fromRupees(50);
    const m2 = MoneyPaise.fromRupees(100);
    expect(() => m1.subtract(m2)).toThrow(InvariantViolationError);
  });
});

describe("GeoTag Value Object", () => {
  it("creates valid Indian territory coordinates", () => {
    // New Delhi coordinates
    const geo = new GeoTag(28.6139, 77.209);
    expect(geo.latitude).toBe(28.6139);
    expect(geo.longitude).toBe(77.209);
  });

  it("rejects coordinates outside India bounds", () => {
    // Latitude too high (Arctic)
    expect(() => new GeoTag(65.0, 77.0)).toThrow(InvariantViolationError);
    // Longitude too low (Atlantic)
    expect(() => new GeoTag(20.0, 30.0)).toThrow(InvariantViolationError);
  });

  it("calculates haversine distance between two coordinates", () => {
    const delhi = new GeoTag(28.6139, 77.209);
    const mumbai = new GeoTag(19.076, 72.8777);
    const distanceKm = delhi.distanceToKm(mumbai);
    // Distance between Delhi and Mumbai is ~1148 km
    expect(distanceKm).toBeGreaterThan(1100);
    expect(distanceKm).toBeLessThan(1200);
  });
});

describe("VersionToken Value Object", () => {
  it("validates positive integer versions", () => {
    const v = new VersionToken(1);
    expect(v.version).toBe(1);
    expect(v.next().version).toBe(2);
    expect(v.matches(1)).toBe(true);
    expect(v.matches(2)).toBe(false);
  });

  it("throws for invalid version numbers", () => {
    expect(() => new VersionToken(0)).toThrow(InvariantViolationError);
    expect(() => new VersionToken(-5)).toThrow(InvariantViolationError);
  });
});

describe("AssetEntity Domain Logic", () => {
  const mockAssetRow = {
    id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    departmentId: "d1111111-1111-1111-1111-111111111111",
    authorityId: "a1111111-1111-1111-1111-111111111111",
    assetCode: "NH-48-SEC-1",
    name: "National Highway 48 Section 1",
    templateCode: "road",
    templateVersion: 1,
    attributes: { length_km: 45.5, surface: "asphalt" },
    regionId: null,
    latitude: "28.6139",
    longitude: "77.2090",
    ownerReference: null,
    custodianReference: null,
    sourceReference: null,
    commissioningDate: null,
    datePrecision: "unknown",
    registrationStatus: "verified",
    lifecycleStage: "commissioned",
    retiredAt: null,
    availability: "in_service",
    criticality: "medium",
    criticalityReason: "Key transport arterial",
    submittedBy: "user_submitter",
    verifiedBy: "user_verifier",
    verifiedAt: new Date(),
    archivedAt: null,
    changeReason: null,
    measureValue: "45.5000",
    measureUnit: "km",
    responsibleOfficer: "user_officer",
    parentAssetId: null,
    createdBy: "user_creator",
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 3,
  };

  it("encapsulates asset verification and active state", () => {
    const asset = new AssetEntity(mockAssetRow);
    expect(asset.isVerified()).toBe(true);
    expect(asset.isActive()).toBe(true);
    expect(asset.isArchived()).toBe(false);
    expect(asset.isRetired()).toBe(false);
  });

  it("validates lifecycle stage transitions", () => {
    const asset = new AssetEntity(mockAssetRow);
    expect(asset.canTransitionTo("retired")).toBe(true);
    expect(asset.canTransitionTo("planned")).toBe(false);
    expect(asset.canTransitionTo("construction")).toBe(false);
  });

  it("formats measure value and unit", () => {
    const asset = new AssetEntity(mockAssetRow);
    expect(asset.getFormattedMeasure()).toBe("45.5 km");
  });
});

describe("InspectionEntity Domain Logic", () => {
  const mockInspectionRow = {
    id: "i1111111-1111-1111-1111-111111111111",
    departmentId: "d1111111-1111-1111-1111-111111111111",
    assetId: "a1111111-1111-1111-1111-111111111111",
    templateCode: "road",
    templateVersion: 1,
    observedOn: "2026-03-15",
    observations: {
      surface: { condition: "poor", notes: "Potholes detected" },
    },
    condition: "poor",
    limitations: null,
    nextReviewOn: "2026-09-15",
    status: "approved",
    supersedesId: null,
    decisionReason: "Passed review",
    createdBy: "user_inspector",
    submittedBy: "user_inspector",
    reviewedBy: "user_lead",
    reviewedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
  };

  it("identifies approved status and severity correctly", () => {
    const inspection = new InspectionEntity(mockInspectionRow);
    expect(inspection.isApproved()).toBe(true);
    expect(inspection.isSevere()).toBe(true);
    expect(inspection.isCritical()).toBe(false);
  });
});

describe("WorkOrderEntity Domain Logic", () => {
  const mockWorkOrderRow = {
    id: "w1111111-1111-1111-1111-111111111111",
    departmentId: "d1111111-1111-1111-1111-111111111111",
    assetId: "a1111111-1111-1111-1111-111111111111",
    inspectionId: null,
    complaintId: null,
    description: "Road resurfacing",
    justification: "Severe road degradation",
    status: "accepted",
    assignedTo: "user_contractor",
    targetOn: "2026-05-01",
    startedOn: "2026-04-01",
    completedOn: "2026-04-20",
    actualCostPaise: "45000000",
    completionNotes: "Work finished satisfactorily",
    completionSubmittedBy: "user_contractor",
    approvedBy: "user_manager",
    approvedAt: new Date(),
    acceptedBy: "user_director",
    acceptedAt: new Date(),
    decisionReason: "Approved completion",
    verificationInspectionId: null,
    createdBy: "user_manager",
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 4,
  };

  it("detects accepted work orders requiring reinspection", () => {
    const workOrder = new WorkOrderEntity(mockWorkOrderRow);
    expect(workOrder.isAccepted()).toBe(true);
    expect(workOrder.requiresVerification()).toBe(true);
    expect(workOrder.actualCost?.toRupees()).toBe(450000);
  });
});

describe("Database Error Translation", () => {
  it("maps Postgres SQLSTATE codes to typed domain errors", () => {
    expect(
      translateDatabaseError({ code: "42501", message: "Forbidden" }),
    ).toBeInstanceOf(ForbiddenError);
    expect(
      translateDatabaseError({ code: "40001", message: "Concurrency error" }),
    ).toBeInstanceOf(OptimisticLockError);
    expect(
      translateDatabaseError({ code: "P0002", message: "Not found" }),
    ).toBeInstanceOf(NotFoundError);
    expect(
      translateDatabaseError({ code: "23505", message: "Unique error" }),
    ).toBeInstanceOf(ConflictError);
    expect(
      translateDatabaseError({ code: "23514", message: "Check constraint" }),
    ).toBeInstanceOf(InvariantViolationError);
  });
});
