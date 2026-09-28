export type LifecycleStage =
  | "planned"
  | "construction"
  | "commissioned"
  | "retired";

export type RegistrationStatus =
  | "draft"
  | "submitted"
  | "verified"
  | "correction_required";

export type InspectionCondition =
  | "good"
  | "fair"
  | "poor"
  | "critical"
  | "unknown";

export type WorkOrderStatus =
  | "proposed"
  | "approved"
  | "in_progress"
  | "completion_submitted"
  | "accepted"
  | "correction_required"
  | "cancelled";

export type ComplaintStatus =
  | "open"
  | "triaged"
  | "investigating"
  | "resolved"
  | "reopened";

export type EvidenceProvider =
  | "cloudinary"
  | "supabase_private"
  | "document_reference";

export type EvidenceClassification =
  | "synthetic_public"
  | "internal"
  | "restricted";
