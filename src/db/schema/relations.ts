import { relations } from "drizzle-orm";
import { assetMilestones, assets, duplicateCandidates } from "./assets";
import { evidence, evidenceAccessEvents } from "./evidence";
import { regions } from "./geography";
import {
  authorities,
  authorityMemberships,
  departmentMemberships,
  departments,
  identities,
  roleDefinitions,
} from "./identities";
import {
  complaints,
  inspectionComponents,
  inspections,
  workEstimates,
  workOrders,
} from "./operations";
import { departmentTemplates } from "./templates";

export const identitiesRelations = relations(identities, ({ many }) => ({
  authorityMemberships: many(authorityMemberships),
  departmentMemberships: many(departmentMemberships),
  createdAssets: many(assets, { relationName: "assetCreator" }),
  createdInspections: many(inspections, { relationName: "inspectionCreator" }),
  createdComplaints: many(complaints, { relationName: "complaintCreator" }),
  createdWorkOrders: many(workOrders, { relationName: "workOrderCreator" }),
  assignedWorkOrders: many(workOrders, { relationName: "workOrderAssignee" }),
}));

export const authoritiesRelations = relations(authorities, ({ many }) => ({
  departments: many(departments),
  regions: many(regions),
  memberships: many(authorityMemberships),
  roles: many(roleDefinitions),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  authority: one(authorities, {
    fields: [departments.authorityId],
    references: [authorities.id],
  }),
  memberships: many(departmentMemberships),
  assets: many(assets),
  inspections: many(inspections),
  complaints: many(complaints),
  workOrders: many(workOrders),
  evidence: many(evidence),
  templates: many(departmentTemplates),
}));

export const regionsRelations = relations(regions, ({ one, many }) => ({
  authority: one(authorities, {
    fields: [regions.authorityId],
    references: [authorities.id],
  }),
  parent: one(regions, {
    fields: [regions.parentId],
    references: [regions.id],
    relationName: "regionHierarchy",
  }),
  children: many(regions, { relationName: "regionHierarchy" }),
  assets: many(assets),
}));

export const assetsRelations = relations(assets, ({ one, many }) => ({
  department: one(departments, {
    fields: [assets.departmentId],
    references: [departments.id],
  }),
  authority: one(authorities, {
    fields: [assets.authorityId],
    references: [authorities.id],
  }),
  region: one(regions, {
    fields: [assets.regionId],
    references: [regions.id],
  }),
  parentAsset: one(assets, {
    fields: [assets.parentAssetId],
    references: [assets.id],
    relationName: "assetHierarchy",
  }),
  childAssets: many(assets, { relationName: "assetHierarchy" }),
  inspections: many(inspections),
  complaints: many(complaints),
  workOrders: many(workOrders),
  evidence: many(evidence),
  milestones: many(assetMilestones),
  duplicateFlags: many(duplicateCandidates, { relationName: "targetAsset" }),
  asDuplicateCandidates: many(duplicateCandidates, {
    relationName: "candidateAsset",
  }),
}));

export const inspectionsRelations = relations(inspections, ({ one, many }) => ({
  asset: one(assets, {
    fields: [inspections.assetId],
    references: [assets.id],
  }),
  department: one(departments, {
    fields: [inspections.departmentId],
    references: [departments.id],
  }),
  components: many(inspectionComponents),
  evidence: many(evidence),
  supersededBy: one(inspections, {
    fields: [inspections.supersedesId],
    references: [inspections.id],
    relationName: "inspectionSupersession",
  }),
}));

export const complaintsRelations = relations(complaints, ({ one, many }) => ({
  asset: one(assets, {
    fields: [complaints.assetId],
    references: [assets.id],
  }),
  department: one(departments, {
    fields: [complaints.departmentId],
    references: [departments.id],
  }),
  workOrders: many(workOrders),
  evidence: many(evidence),
}));

export const workOrdersRelations = relations(workOrders, ({ one, many }) => ({
  asset: one(assets, {
    fields: [workOrders.assetId],
    references: [assets.id],
  }),
  department: one(departments, {
    fields: [workOrders.departmentId],
    references: [departments.id],
  }),
  inspection: one(inspections, {
    fields: [workOrders.inspectionId],
    references: [inspections.id],
  }),
  complaint: one(complaints, {
    fields: [workOrders.complaintId],
    references: [complaints.id],
  }),
  estimates: many(workEstimates),
  evidence: many(evidence),
}));

export const evidenceRelations = relations(evidence, ({ one, many }) => ({
  department: one(departments, {
    fields: [evidence.departmentId],
    references: [departments.id],
  }),
  asset: one(assets, {
    fields: [evidence.assetId],
    references: [assets.id],
  }),
  inspection: one(inspections, {
    fields: [evidence.inspectionId],
    references: [inspections.id],
  }),
  workOrder: one(workOrders, {
    fields: [evidence.workOrderId],
    references: [workOrders.id],
  }),
  complaint: one(complaints, {
    fields: [evidence.complaintId],
    references: [complaints.id],
  }),
  accessEvents: many(evidenceAccessEvents),
}));
