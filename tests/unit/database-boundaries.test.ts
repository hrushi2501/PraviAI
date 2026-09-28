import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession } from "@/server/db/session";
import { StoredProcedureGateway } from "@/server/db/stored-procedures";
import { AssetEntity } from "@/server/domain/entities/asset.entity";
import { AssetRepository } from "@/server/repositories/asset.repository";
import { EvidenceRepository } from "@/server/repositories/evidence.repository";
import type { InspectionRepository } from "@/server/repositories/inspection.repository";
import { AssetService } from "@/server/services/asset.service";
import { InspectionService } from "@/server/services/inspection.service";

const dialect = new PgDialect();

describe("PostgreSQL procedure contracts", () => {
  it("decodes database column names and timestamps before constructing an asset entity", async () => {
    const execute = vi.fn().mockResolvedValue([
      {
        id: "asset",
        department_id: "department",
        authority_id: "authority",
        asset_code: "ROAD-001",
        name: "Main road",
        template_code: "road",
        template_version: 1,
        attributes: { surface_type: "asphalt" },
        region_id: null,
        latitude: "19.0000000",
        longitude: "73.0000000",
        registration_status: "verified",
        lifecycle_stage: "commissioned",
        version: 2,
        retired_at: null,
        archived_at: null,
        measure_value: "2.5000",
        measure_unit: "km",
        responsible_officer: "officer",
        parent_asset_id: null,
        created_by: "creator",
        created_at: "2026-09-28 10:00:00+00",
        updated_at: "2026-09-28 11:00:00+00",
      },
    ]);
    const row = await new StoredProcedureGateway({ execute }).createAsset({
      departmentId: "department",
      data: { name: "Main road" },
      requestId: "request",
    });
    const entity = new AssetEntity(row);
    expect(entity.departmentId).toBe("department");
    expect(entity.assetCode).toBe("ROAD-001");
    expect(entity.isVerified()).toBe(true);
    expect(entity.isActive()).toBe(true);
    expect(entity.measureValue).toBe(2.5);
    expect(entity.createdAt).toEqual(new Date("2026-09-28T10:00:00Z"));
    expect(row).not.toHaveProperty("registration_status");
    const plain = entity.toJSON();
    expect(Object.getPrototypeOf(plain)).toBe(Object.prototype);
    expect(plain.version).toBe(2);
    expect(plain.geoTag).toEqual({ latitude: 19, longitude: 73 });
    expect(plain).not.toHaveProperty("versionToken");
    expect(row.attributes).toEqual({ surface_type: "asphalt" });
  });

  it("sends the asset version and work completion data in SQL signature order", async () => {
    const execute = vi.fn().mockResolvedValue([{}]);
    const gateway = new StoredProcedureGateway({ execute });
    await gateway.requestAssetAction({
      assetId: "asset",
      expectedVersion: 7,
      action: "retire",
      toValue: "retired",
      reason: "Independent review required",
      requestId: "request",
    });
    expect(dialect.sqlToQuery(execute.mock.calls[0][0]).params).toEqual([
      "asset",
      7,
      "retire",
      "retired",
      "Independent review required",
      "request",
    ]);
    await gateway.transitionWorkOrder({
      id: "work",
      expectedVersion: 3,
      action: "submit_completion",
      data: {
        completed_on: "2026-09-28",
        completion_notes: "Repair completed",
      },
      reason: "Submit evidence for acceptance",
    });
    expect(dialect.sqlToQuery(execute.mock.calls[1][0]).params).toEqual([
      "work",
      3,
      "submit_completion",
      '{"completed_on":"2026-09-28","completion_notes":"Repair completed"}',
      "Submit evidence for acceptance",
    ]);
  });

  it("matches three-argument complaint linking and void cancellation results", async () => {
    const execute = vi.fn().mockResolvedValue([{ cancel_asset_action: null }]);
    const gateway = new StoredProcedureGateway({ execute });
    await gateway.linkComplaintAsset({
      id: "complaint",
      assetId: "asset",
      reason: "Confirmed location",
    });
    expect(dialect.sqlToQuery(execute.mock.calls[0][0]).params).toEqual([
      "complaint",
      "asset",
      "Confirmed location",
    ]);
    expect(
      await gateway.cancelAssetAction({
        id: "request",
        reason: "Withdraw request",
      }),
    ).toBeUndefined();
    expect(
      await gateway.cancelGovernance({
        id: "request",
        reason: "Withdraw request",
      }),
    ).toBeUndefined();
  });
});

describe("Actor-scoped repository reads", () => {
  it("never falls back to the unscoped database client", async () => {
    const query = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const tx = { select: vi.fn().mockReturnValue(query) };
    const withQuery = vi.fn(async (callback) => callback(tx));
    const session = {
      withQuery,
      client: {
        select: () => {
          throw new Error("Unscoped read");
        },
      },
    } as unknown as DatabaseSession;
    expect(await new AssetRepository(session).findById("missing")).toBeNull();
    expect(
      await new EvidenceRepository(session).findById("missing"),
    ).toBeNull();
    expect(withQuery).toHaveBeenCalledTimes(2);
    const fields = tx.select.mock.calls[1][0];
    expect(fields).not.toHaveProperty("objectKey");
    expect(fields).toHaveProperty("originalName");
  });
});

describe("Registration and inspection SQL payloads", () => {
  it("uses template defaults and persists management fields atomically", async () => {
    const procedures = {
      createAsset: vi.fn().mockResolvedValue({ id: "asset", version: 1 }),
      setAssetManagement: vi
        .fn()
        .mockResolvedValue({ id: "asset", version: 2 }),
    };
    const session = {
      withTransaction: vi.fn(async (callback) => callback({}, procedures)),
    } as unknown as DatabaseSession;
    const repository = {
      toEntity: vi.fn((row) => row),
    } as unknown as AssetRepository;
    await new AssetService(session, repository).registerAsset({
      departmentId: "department",
      assetCode: "ROAD-001",
      name: "Main road",
      templateCode: "road",
      templateVersion: 1,
      measureValue: 2.5,
      measureUnit: "km",
      responsibleOfficer: "officer",
      sourceReference: "PWD register 2026/001",
      ownerReference: "Public Works Department",
      custodianReference: "District office",
      commissioningDate: "2020-01-01",
      datePrecision: "year",
    });
    expect(procedures.createAsset.mock.calls[0][0].data).not.toHaveProperty(
      "lifecycle_stage",
    );
    expect(procedures.createAsset.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        source_reference: "PWD register 2026/001",
        owner_reference: "Public Works Department",
        custodian_reference: "District office",
        commissioning_date: "2020-01-01",
        date_precision: "year",
      }),
    );
    expect(procedures.setAssetManagement).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "asset",
        expectedVersion: 1,
        patch: {
          measure_value: 2.5,
          measure_unit: "km",
          responsible_officer: "officer",
        },
      }),
    );
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
  });

  it("lets PostgreSQL derive inspection template identity from the asset", async () => {
    const createInspection = vi.fn().mockResolvedValue({ id: "inspection" });
    const session = {
      withTransaction: vi.fn(async (callback) =>
        callback({}, { createInspection }),
      ),
    } as unknown as DatabaseSession;
    const repository = {
      toEntity: vi.fn((row) => row),
    } as unknown as InspectionRepository;
    await new InspectionService(session, repository).submitInspection({
      assetId: "asset",
      templateCode: "road",
      templateVersion: 1,
      observedOn: "2026-09-28",
      observations: {},
      condition: "fair",
    });
    const payload = createInspection.mock.calls[0][0].data;
    expect(payload).not.toHaveProperty("template_code");
    expect(payload).not.toHaveProperty("template_version");
    expect(payload.observed_on).toBe("2026-09-28");
  });
});
