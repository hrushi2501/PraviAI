import { DatabaseSession } from "../db/session";
import { AssetRepository } from "../repositories/asset.repository";
import { ComplaintRepository } from "../repositories/complaint.repository";
import { EvidenceRepository } from "../repositories/evidence.repository";
import { InspectionRepository } from "../repositories/inspection.repository";
import { WorkOrderRepository } from "../repositories/work-order.repository";
import { AssetService } from "./asset.service";
import { ComplaintService } from "./complaint.service";
import { EvidenceService } from "./evidence.service";
import { IdentityService } from "./identity.service";
import { InspectionService } from "./inspection.service";

export interface DomainContainer {
  session: DatabaseSession;
  repositories: {
    assets: AssetRepository;
    inspections: InspectionRepository;
    workOrders: WorkOrderRepository;
    evidence: EvidenceRepository;
    complaints: ComplaintRepository;
  };
  services: {
    assets: AssetService;
    inspections: InspectionService;
    evidence: EvidenceService;
    complaints: ComplaintService;
    identity: IdentityService;
  };
}

/**
 * Factory function implementing Dependency Injection for verified Clerk actor sessions.
 */
export function createDomainContainer(clerkUserId: string): DomainContainer {
  const session = DatabaseSession.forActor(clerkUserId);

  const assetRepo = new AssetRepository(session);
  const inspectionRepo = new InspectionRepository(session);
  const workOrderRepo = new WorkOrderRepository(session);
  const evidenceRepo = new EvidenceRepository(session);
  const complaintRepo = new ComplaintRepository(session);

  const assetService = new AssetService(session, assetRepo);
  const inspectionService = new InspectionService(session, inspectionRepo);
  const evidenceService = new EvidenceService(session, evidenceRepo);
  const complaintService = new ComplaintService(session, complaintRepo);
  const identityService = new IdentityService(session);

  return {
    session,
    repositories: {
      assets: assetRepo,
      inspections: inspectionRepo,
      workOrders: workOrderRepo,
      evidence: evidenceRepo,
      complaints: complaintRepo,
    },
    services: {
      assets: assetService,
      inspections: inspectionService,
      evidence: evidenceService,
      complaints: complaintService,
      identity: identityService,
    },
  };
}

export const ServiceFactory = {
  forUser: createDomainContainer,
};
