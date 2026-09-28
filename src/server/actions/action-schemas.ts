import { z } from "zod";
export const uuidSchema = z.string().uuid();
export const reasonSchema = z.string().trim().min(1).max(4000);
export const versionSchema = z.number().int().positive();
export const recordCommandSchema = z.strictObject({
  id: uuidSchema,
  expectedVersion: versionSchema,
  reason: reasonSchema,
});
export const assetCommandSchema = z.strictObject({
  assetId: uuidSchema,
  expectedVersion: versionSchema,
  reason: reasonSchema,
});
export const assetPatchSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(240).optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
    region_id: uuidSchema.nullable().optional(),
    latitude: z.number().finite().min(6).max(38).nullable().optional(),
    longitude: z.number().finite().min(68).max(98).nullable().optional(),
    owner_reference: z.string().max(2000).nullable().optional(),
    custodian_reference: z.string().max(2000).nullable().optional(),
    source_reference: z.string().trim().min(1).max(2000).nullable().optional(),
    commissioning_date: z.iso.date().nullable().optional(),
    date_precision: z
      .enum(["exact", "year", "approximate", "unknown"])
      .optional(),
    criticality: z.enum(["low", "medium", "high", "unknown"]).optional(),
    criticality_reason: z.string().max(4000).nullable().optional(),
  })
  .refine(
    (value) =>
      !("latitude" in value || "longitude" in value) ||
      ("latitude" in value &&
        "longitude" in value &&
        (value.latitude === null) === (value.longitude === null)),
    { message: "Supply both coordinates together" },
  );
export const bboxSchema = z
  .strictObject({
    minLat: z.number().finite().min(-90).max(90),
    maxLat: z.number().finite().min(-90).max(90),
    minLng: z.number().finite().min(-180).max(180),
    maxLng: z.number().finite().min(-180).max(180),
    departmentId: uuidSchema.optional(),
  })
  .refine(
    (value) => value.minLat <= value.maxLat && value.minLng <= value.maxLng,
    { message: "Map bounds must be ordered" },
  );
