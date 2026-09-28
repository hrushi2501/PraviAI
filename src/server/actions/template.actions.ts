"use server";

import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { departments } from "@/db/schema/identities";
import { assetTemplates, departmentTemplates } from "@/db/schema/templates";
import { withAuthenticatedAction } from "./action-client";

const scopeSchema = z.string().uuid();
const identitySchema = z.object({
  departmentId: scopeSchema,
  code: z.string().min(1).max(80),
  version: z.number().int().positive(),
  revision: z.number().int().positive(),
  reason: z.string().trim().min(1).max(2000),
});

export async function getTemplateWorkspace(departmentId?: string) {
  return withAuthenticatedAction(async ({ session }, actorId) =>
    session.withQuery(async (tx) => {
      const scope = departmentId ? scopeSchema.parse(departmentId) : undefined;
      const scopes = await tx
        .select({
          id: departments.id,
          name: departments.name,
          canWrite: sql<boolean>`asset_manager.department_permission(${departments.id}, 'template_write')`,
          canApprove: sql<boolean>`asset_manager.department_permission(${departments.id}, 'template_approve')`,
        })
        .from(departments)
        .where(eq(departments.active, true))
        .orderBy(asc(departments.name));
      const rows = await tx
        .select()
        .from(departmentTemplates)
        .where(scope ? eq(departmentTemplates.departmentId, scope) : undefined)
        .orderBy(
          asc(departmentTemplates.name),
          desc(departmentTemplates.version),
        )
        .limit(200);
      const starters = await tx
        .select({
          code: assetTemplates.code,
          version: assetTemplates.version,
          fields: assetTemplates.fields,
          components: assetTemplates.components,
          stages: assetTemplates.lifecycleStages,
          policy: assetTemplates.policyReference,
        })
        .from(assetTemplates)
        .where(eq(assetTemplates.version, 1))
        .orderBy(asc(assetTemplates.code));
      return { departments: scopes, templates: rows, starters, actorId };
    }),
  );
}

export async function createTemplate(input: {
  departmentId: string;
  code: string;
  name: string;
  base: string;
  policy: string;
  requestId: string;
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const value = z
      .object({
        departmentId: scopeSchema,
        code: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/),
        name: z.string().trim().min(1).max(240),
        base: z.string().min(1).max(80),
        policy: z.string().trim().min(1).max(2000),
        requestId: scopeSchema,
      })
      .parse(input);
    return session.withTransaction(async (tx) => {
      const result = await tx.execute<{ version: number }>(
        sql`SELECT (asset_manager.create_department_template(${value.departmentId}::uuid, ${value.code}, ${value.name}, ${value.base}, ${JSON.stringify({ policy_reference: value.policy })}::jsonb, ${value.requestId}::uuid)).version AS version`,
      );
      return { version: result[0]?.version };
    });
  });
}

export async function editTemplate(input: {
  departmentId: string;
  code: string;
  version: number;
  revision: number;
  reason: string;
  name: string;
  policy: string;
  fields: Array<Record<string, unknown>>;
  components: string[];
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const value = identitySchema
      .extend({
        name: z.string().trim().min(1).max(240),
        policy: z.string().trim().min(1).max(2000),
        fields: z.array(z.record(z.string(), z.unknown())).max(80),
        components: z
          .array(z.string().regex(/^[a-z][a-z0-9_]{0,49}$/))
          .min(1)
          .max(80),
      })
      .parse(input);
    return session.withTransaction(async (tx) => {
      await tx.execute(
        sql`SELECT asset_manager.edit_department_template(${value.departmentId}::uuid, ${value.code}, ${value.version}, ${value.revision}, ${JSON.stringify({ name: value.name, policy_reference: value.policy, fields: value.fields, components: value.components })}::jsonb, ${value.reason})`,
      );
      return { saved: true };
    });
  });
}

export async function transitionTemplate(input: {
  departmentId: string;
  code: string;
  version: number;
  revision: number;
  reason: string;
  action: "submit" | "publish" | "return" | "withdraw";
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const value = identitySchema
      .extend({ action: z.enum(["submit", "publish", "return", "withdraw"]) })
      .parse(input);
    return session.withTransaction(async (tx) => {
      await tx.execute(
        sql`SELECT asset_manager.transition_template(${value.departmentId}::uuid, ${value.code}, ${value.version}, ${value.revision}, ${value.action}, ${value.reason})`,
      );
      return { action: value.action };
    });
  });
}
