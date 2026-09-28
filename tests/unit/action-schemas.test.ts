import { describe, expect, it } from "vitest";
import {
  assetCommandSchema,
  assetPatchSchema,
  bboxSchema,
  recordCommandSchema,
} from "@/server/actions/action-schemas";

const id = "00000000-0000-4000-8000-000000000001";
describe("Server command boundary invariants", () => {
  it("rejects caller-controlled identity/state fields and preserves canonical patch values", () => {
    expect(
      assetCommandSchema.safeParse({
        assetId: id,
        expectedVersion: 2,
        reason: "review",
        actorId: "forged",
      }).success,
    ).toBe(false);
    expect(assetPatchSchema.safeParse({ department_id: id }).success).toBe(
      false,
    );
    expect(
      assetPatchSchema.safeParse({ registration_status: "verified" }).success,
    ).toBe(false);
    expect(
      assetPatchSchema.parse({
        name: " Corrected building ",
        source_reference: " Official record ",
      }),
    ).toEqual({
      name: "Corrected building",
      source_reference: "Official record",
    });
  });
  it("rejects stale/nonintegral version tokens, blank reasons and impossible dates", () => {
    for (const version of [0, -1, 1.5, NaN])
      expect(
        recordCommandSchema.safeParse({
          id,
          expectedVersion: version,
          reason: "review",
        }).success,
      ).toBe(false);
    expect(
      recordCommandSchema.safeParse({ id, expectedVersion: 1, reason: "  " })
        .success,
    ).toBe(false);
    expect(
      assetPatchSchema.safeParse({ commissioning_date: "2026-02-30" }).success,
    ).toBe(false);
  });
  it("requires finite ordered bounds and finite complete coordinate values", () => {
    expect(
      bboxSchema.safeParse({ minLat: 20, maxLat: 10, minLng: 70, maxLng: 80 })
        .success,
    ).toBe(false);
    expect(
      bboxSchema.safeParse({
        minLat: 10,
        maxLat: 20,
        minLng: Infinity,
        maxLng: 80,
      }).success,
    ).toBe(false);
    expect(assetPatchSchema.safeParse({ latitude: 23 }).success).toBe(false);
    expect(
      assetPatchSchema.safeParse({ latitude: 23, longitude: NaN }).success,
    ).toBe(false);
    expect(assetPatchSchema.safeParse({ latitude: null }).success).toBe(false);
    expect(assetPatchSchema.safeParse({ longitude: null }).success).toBe(false);
    expect(assetPatchSchema.parse({ latitude: null, longitude: null })).toEqual(
      { latitude: null, longitude: null },
    );
  });
});
