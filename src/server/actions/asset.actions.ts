"use server";

import { z } from "zod";
import { withAuthenticatedAction } from "./action-client";
import {
  assetCommandSchema,
  assetPatchSchema,
  bboxSchema,
  reasonSchema,
  uuidSchema,
} from "./action-schemas";

const registerAssetSchema = z
  .strictObject({
    departmentId: z.string().uuid("Valid department UUID required"),
    assetCode: z.string().min(1, "Asset code is required").max(80),
    name: z.string().min(1, "Asset name is required").max(240),
    templateCode: z.string().min(1, "Template code is required"),
    templateVersion: z.number().int().positive(),
    attributes: z.record(z.string(), z.unknown()).default({}),
    regionId: z.string().uuid().optional(),
    latitude: z.number().min(6.0).max(38.0).optional(),
    longitude: z.number().min(68.0).max(98.0).optional(),
    measureValue: z.number().positive().optional(),
    measureUnit: z.enum(["km", "m", "m2", "ha", "count"]).optional(),
    responsibleOfficer: z.string().optional(),
    sourceReference: z.string().trim().min(1).max(2000).optional(),
    ownerReference: z.string().trim().min(1).max(2000).optional(),
    custodianReference: z.string().trim().min(1).max(2000).optional(),
    commissioningDate: z.iso.date().optional(),
    datePrecision: z
      .enum(["exact", "year", "approximate", "unknown"])
      .optional(),
  })
  .refine((value) => (value.latitude == null) === (value.longitude == null), {
    message: "Supply both coordinates together",
  })
  .refine(
    (value) => (value.measureValue == null) === (value.measureUnit == null),
    { message: "Supply a measure and its unit together" },
  );

export type RegisterAssetInput = z.infer<typeof registerAssetSchema>;

export async function getAssetsAction(
  departmentId: string,
  page = 1,
  pageSize = 20,
) {
  return withAuthenticatedAction(async ({ repositories }) => {
    const options = z
      .object({
        departmentId: uuidSchema,
        page: z.number().int().min(1).max(100000),
        pageSize: z.number().int().min(1).max(100),
      })
      .parse({ departmentId, page, pageSize });
    const result = await repositories.assets.findByDepartment(
      options.departmentId,
      options.page,
      options.pageSize,
    );
    return { ...result, items: result.items.map((item) => item.toJSON()) };
  });
}

export async function getAssetDetailAction(assetId: string) {
  return withAuthenticatedAction(async ({ repositories }) => {
    const asset = await repositories.assets.findWithCondition(
      uuidSchema.parse(assetId),
    );
    if (!asset) return null;
    return { ...asset, asset: asset.asset.toJSON() };
  });
}

export async function registerAssetAction(input: RegisterAssetInput) {
  return withAuthenticatedAction(async ({ services }) => {
    const validated = registerAssetSchema.parse(input);
    return (await services.assets.registerAsset(validated)).toJSON();
  });
}

export async function editAssetAction(params: {
  assetId: string;
  expectedVersion: number;
  patch: Record<string, unknown>;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ services }) => {
    return (
      await services.assets.editAsset(
        assetCommandSchema.extend({ patch: assetPatchSchema }).parse(params),
      )
    ).toJSON();
  });
}

export async function transitionAssetAction(params: {
  assetId: string;
  expectedVersion: number;
  action: string;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ services }) => {
    return (
      await services.assets.transitionLifecycle(
        assetCommandSchema
          .extend({ action: z.enum(["submit", "verify", "return"]) })
          .parse(params),
      )
    ).toJSON();
  });
}

export async function updateGeotagAction(params: {
  assetId: string;
  expectedVersion: number;
  latitude: number;
  longitude: number;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ services }) => {
    return (
      await services.assets.updateGeotag(
        assetCommandSchema
          .extend({
            latitude: z.number().finite().min(6).max(38),
            longitude: z.number().finite().min(68).max(98),
          })
          .parse(params),
      )
    ).toJSON();
  });
}

export async function flagDuplicateAction(params: {
  assetId: string;
  candidateId: string;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ services }) => {
    return services.assets.flagDuplicate(
      z
        .strictObject({
          assetId: uuidSchema,
          candidateId: uuidSchema,
          reason: reasonSchema,
        })
        .refine((value) => value.assetId !== value.candidateId, {
          message: "An asset cannot duplicate itself",
        })
        .parse(params),
    );
  });
}

export async function reviewDuplicateAction(params: {
  id: string;
  confirm: boolean;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ services }) => {
    return services.assets.reviewDuplicate(
      z
        .strictObject({
          id: uuidSchema,
          confirm: z.boolean(),
          reason: reasonSchema,
        })
        .parse(params),
    );
  });
}

export async function getAssetsInBBoxAction(bounds: {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  departmentId?: string;
}) {
  return withAuthenticatedAction(async ({ repositories }) => {
    return (await repositories.assets.findInBBox(bboxSchema.parse(bounds))).map(
      (asset) => asset.toJSON(),
    );
  });
}

export async function verifyAssetAction(params: {
  assetId: string;
  expectedVersion: number;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ services }) => {
    return (
      await services.assets.verifyAsset(assetCommandSchema.parse(params))
    ).toJSON();
  });
}

export async function requestAssetActionAction(params: {
  assetId: string;
  expectedVersion: number;
  action: "lifecycle" | "availability" | "archive" | "unarchive";
  toValue?: string;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const validated = z
      .strictObject({
        assetId: uuidSchema,
        expectedVersion: z.number().int().positive(),
        action: z.enum(["lifecycle", "availability", "archive", "unarchive"]),
        toValue: z.string().trim().min(1).max(120).optional(),
        reason: reasonSchema,
      })
      .parse(params);

    return session.withTransaction(async (_tx, procs) => {
      return procs.requestAssetAction({
        assetId: validated.assetId,
        expectedVersion: validated.expectedVersion,
        action: validated.action,
        toValue: validated.toValue ?? null,
        reason: validated.reason,
        requestId: crypto.randomUUID(),
      });
    });
  });
}

export async function decideAssetActionAction(params: {
  id: string;
  approve: boolean;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const validated = z
      .strictObject({
        id: uuidSchema,
        approve: z.boolean(),
        reason: reasonSchema,
      })
      .parse(params);

    return session.withTransaction(async (_tx, procs) => {
      return procs.decideAssetAction(validated);
    });
  });
}

export async function cancelAssetActionAction(params: {
  id: string;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const validated = z
      .strictObject({
        id: uuidSchema,
        reason: reasonSchema,
      })
      .parse(params);

    return session.withTransaction(async (_tx, procs) => {
      await procs.cancelAssetAction(validated);
      return { success: true };
    });
  });
}
