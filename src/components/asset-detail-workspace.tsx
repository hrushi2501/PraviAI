"use client";

import {
  Activity,
  CheckCircle2,
  ClipboardList,
  History as HistoryIcon,
  Layers,
  MessageSquareWarning,
  Paperclip,
  Shield,
  Tag,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AssetCoordinateForm,
  AssetCorrectionForm,
} from "@/components/asset-correction-form";
import { AssetExecutiveSummary } from "@/components/asset-executive-summary";
import { AssetGrievanceAndDuplicateTools } from "@/components/asset-grievance-and-duplicate-tools";
import { AssetRegistrationActions } from "@/components/asset-registration-actions";
import { ComponentObservationsView } from "@/components/component-observations-view";
import { EvidenceAccess } from "@/components/evidence-access";
import { EvidenceUploader } from "@/components/evidence-uploader";
import {
  InspectionDraftForm,
  RestorationProposalForm,
} from "@/components/operational-create-forms";
import { Button } from "@/components/ui/button";
import {
  EstimateReview,
  WorkVerification,
} from "@/components/work-review-tools";
import type { ActionResult } from "@/server/actions/action-client";

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Unknown";
  if (value instanceof Date)
    return value.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-800">
        {show(value)}
      </dd>
    </div>
  );
}

type TabKey =
  | "overview"
  | "inspections"
  | "works"
  | "grievances"
  | "evidence"
  | "history";

interface InspectionItem {
  id: string;
  observedOn: string;
  condition: string;
  status: string;
  limitations: string | null;
  observations: unknown;
  nextReviewOn: string | null;
  createdBy: string | null;
  reviewedBy: string | null;
}

interface WorkOrderItem {
  id: string;
  version: number;
  description: string;
  status: string;
  justification: string;
  assignedTo: string | null;
  targetOn: string | null;
  completedOn: string | null;
  verificationInspectionId: string | null;
}

interface ComplaintItem {
  id: string;
  channel: string;
  severity: string;
  status: string;
  narrative: string;
  resolutionNotes: string | null;
}

interface EvidenceItem {
  id: string;
  originalName: string;
  mimeType: string;
  classification: string;
  sizeBytes: number | string;
  caption: string | null;
}

interface WorkEstimateItem {
  estimate: {
    id: string;
    workOrderId: string;
    revision: number;
    status: string;
    amountPaise: string | number;
    sourceReference: string;
    estimatedOn: string;
    basis: string;
    createdBy: string;
    reviewedBy: string | null;
  };
}

interface AssetDetailWorkspaceProps {
  id: string;
  asset: {
    id: string;
    departmentId: string;
    assetCode: string;
    name: string;
    templateCode: string;
    templateVersion: number;
    version: number;
    registrationStatus: string;
    lifecycleStage: string;
    availability: string;
    ownerReference: string | null;
    custodianReference: string | null;
    sourceReference: string | null;
    regionId: string | null;
    commissioningDate: string | null;
    datePrecision: string | null;
    measureValue: string | null;
    measureUnit: string | null;
    latitude: string | null;
    longitude: string | null;
    responsibleOfficer: string | null;
    createdBy: string | null;
    submittedBy: string | null;
    verifiedBy: string | null;
    archivedAt: Date | string | null;
    retiredAt: Date | string | null;
    attributes: Record<string, unknown>;
  };
  condition: {
    currentCondition: string | null;
    assessmentFreshness: string | null;
    lastAssessedCondition?: string | null;
    observedOn?: string | null;
    nextReviewOn?: string | null;
  } | null;
  permissions: {
    canEvidence?: boolean;
    canInspect?: boolean;
    canReviewWork?: boolean;
    canProposeWork?: boolean;
    canWrite?: boolean;
    canVerify?: boolean;
  } | null;
  actorId: string;
  history: Array<{
    id: string | number;
    actorId: string | null;
    entityType: string;
    operation: string;
    reason: string | null;
    occurredAt: Date | string;
  }>;
  components: Array<
    | string
    | {
        code?: string;
        name?: string;
        criticality?: string;
      }
  >;
  duplicateCandidates: Array<{
    id: string;
    assetId: string;
    candidateAssetId: string;
    reason: string | null;
    status: string;
    flaggedBy: string | null;
    decisionReason: string | null;
  }>;
  inspections: ActionResult<InspectionItem[]>;
  works: ActionResult<WorkOrderItem[]>;
  complaints: ActionResult<ComplaintItem[]>;
  evidence: ActionResult<EvidenceItem[]>;
  estimates: ActionResult<WorkEstimateItem[]>;
}

export function AssetDetailWorkspace({
  id,
  asset,
  condition,
  permissions,
  actorId,
  history,
  components,
  duplicateCandidates,
  inspections,
  works,
  complaints,
  evidence,
  estimates,
}: AssetDetailWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});

  const independent =
    actorId !== asset.createdBy && actorId !== asset.submittedBy;

  const toggleSection = (sectionId: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  // Check URL hash on initial load
  useEffect(() => {
    const hash = window.location.hash.replace("#", "").toLowerCase();
    if (
      [
        "overview",
        "inspections",
        "works",
        "grievances",
        "evidence",
        "history",
      ].includes(hash)
    ) {
      setActiveTab(hash as TabKey);
    }
  }, []);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement)?.tagName,
        )
      ) {
        return;
      }

      if (e.altKey) {
        switch (e.key) {
          case "1":
            setActiveTab("overview");
            break;
          case "2":
            setActiveTab("inspections");
            break;
          case "3":
            setActiveTab("works");
            break;
          case "4":
            setActiveTab("grievances");
            break;
          case "5":
            setActiveTab("evidence");
            break;
          case "6":
            setActiveTab("history");
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const inspectionsCount = inspections.success ? inspections.data.length : 0;
  const worksCount = works.success ? works.data.length : 0;
  const complaintsCount = complaints.success ? complaints.data.length : 0;
  const evidenceCount = evidence.success ? evidence.data.length : 0;
  const historyCount = history.length;

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Title Area */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Link href="/app/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
            <span>/</span>
            <Link href="/app/assets" className="hover:text-foreground">
              Asset Register
            </Link>
            <span>/</span>
            <span className="font-semibold text-foreground">
              {asset.assetCode}
            </span>
          </nav>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {asset.name}
            </h1>
            <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800 border border-slate-200">
              {asset.assetCode}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Definition:{" "}
            <span className="font-medium text-slate-700">
              {asset.templateCode}
            </span>{" "}
            v{asset.templateVersion} · Record Revision: v{asset.version} ·
            Four-Eyes Reviewer:{" "}
            {independent ? (
              <span className="text-emerald-700 font-medium">
                Independent Official
              </span>
            ) : (
              <span className="text-amber-700 font-medium">
                Original Creator
              </span>
            )}
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {asset.registrationStatus === "verified" &&
            permissions?.canInspect && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setActiveTab("inspections");
                  window.location.hash = "inspections";
                }}
                className="gap-1.5 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Record Inspection
              </Button>
            )}

          {asset.registrationStatus === "verified" &&
            permissions?.canProposeWork && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setActiveTab("works");
                  window.location.hash = "works";
                }}
                className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50"
              >
                <Wrench className="h-3.5 w-3.5" />
                Propose Restoration
              </Button>
            )}

          {permissions?.canEvidence && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setActiveTab("evidence");
                window.location.hash = "evidence";
              }}
              className="gap-1.5"
            >
              <Paperclip className="h-3.5 w-3.5" />
              Upload Evidence
            </Button>
          )}
        </div>
      </div>

      {/* Executive Summary Card */}
      <AssetExecutiveSummary
        asset={{ ...asset, createdBy: asset.createdBy ?? "system" }}
        condition={condition}
        independent={independent}
      />

      {/* Sticky Tab Navigation Bar */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:mx-0 sm:rounded-lg sm:border sm:px-2 shadow-xs">
        <div className="flex items-center gap-1 overflow-x-auto py-2 no-scrollbar">
          <button
            type="button"
            onClick={() => {
              setActiveTab("overview");
              window.location.hash = "overview";
            }}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "overview"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Overview & Status</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("inspections");
              window.location.hash = "inspections";
            }}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "inspections"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            <span>Inspections</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                activeTab === "inspections"
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {inspectionsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("works");
              window.location.hash = "works";
            }}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "works"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Wrench className="h-3.5 w-3.5" />
            <span>Restoration Works</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                activeTab === "works"
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {worksCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("grievances");
              window.location.hash = "grievances";
            }}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "grievances"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <MessageSquareWarning className="h-3.5 w-3.5" />
            <span>Grievances & Duplicates</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                activeTab === "grievances"
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {complaintsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("evidence");
              window.location.hash = "evidence";
            }}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "evidence"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Paperclip className="h-3.5 w-3.5" />
            <span>Evidence & Files</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                activeTab === "evidence"
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {evidenceCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("history");
              window.location.hash = "history";
            }}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "history"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <HistoryIcon className="h-3.5 w-3.5" />
            <span>Audit Trail</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                activeTab === "history"
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {historyCount}
            </span>
          </button>
        </div>
      </div>

      {/* TAB 1: OVERVIEW & STATUS */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Statutory Registration Review Actions (if pending or draft) */}
          <AssetRegistrationActions
            assetId={id}
            version={asset.version}
            status={asset.registrationStatus}
            canSubmit={
              Boolean(permissions?.canWrite) &&
              (asset.createdBy === actorId || Boolean(permissions?.canVerify))
            }
            canReview={Boolean(permissions?.canVerify) && independent}
          />

          {/* Status & Assessment Section */}
          <section className="rounded-lg border bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <Activity className="h-4 w-4 text-slate-500" />
                Status and Assessment Governance
              </h2>
              <button
                type="button"
                onClick={() => toggleSection("status-assessment")}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {collapsedSections["status-assessment"] ? "Expand" : "Collapse"}
              </button>
            </div>

            {!collapsedSections["status-assessment"] && (
              <div className="mt-4">
                <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <Field
                    label="Registration Status"
                    value={asset.registrationStatus}
                  />
                  <Field label="Lifecycle Stage" value={asset.lifecycleStage} />
                  <Field
                    label="Service Availability"
                    value={asset.availability}
                  />
                  <Field
                    label="Current Assessed Condition"
                    value={condition?.currentCondition ?? "unknown"}
                  />
                  <Field
                    label="Assessment Freshness"
                    value={condition?.assessmentFreshness ?? "never assessed"}
                  />
                  <Field
                    label="Last Approved Finding"
                    value={condition?.lastAssessedCondition}
                  />
                  <Field label="Observed On" value={condition?.observedOn} />
                  <Field
                    label="Next Review Due"
                    value={condition?.nextReviewOn}
                  />
                  <Field
                    label="Archived"
                    value={asset.archivedAt ? show(asset.archivedAt) : "No"}
                  />
                </dl>
                <div className="mt-4 rounded-md bg-amber-50/60 p-3 border border-amber-200/60 text-xs text-amber-900 flex items-start gap-2">
                  <Shield className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                  <p>
                    <strong>Statutory Rule:</strong> Condition is established
                    strictly via approved statutory inspections. Reported
                    citizen grievances and completed works do not automatically
                    elevate condition without an independent verification
                    inspection.
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Asset Correction & Coordinates (if editable) */}
          {!["submitted", "verified"].includes(asset.registrationStatus) &&
            !asset.archivedAt &&
            permissions?.canWrite &&
            (asset.createdBy === actorId || permissions?.canVerify) && (
              <AssetCorrectionForm
                id={id}
                version={asset.version}
                name={asset.name}
                source={asset.sourceReference}
                attributes={asset.attributes}
              />
            )}

          {asset.registrationStatus !== "submitted" &&
            !asset.archivedAt &&
            permissions?.canWrite &&
            (asset.registrationStatus === "verified"
              ? permissions.canVerify
              : asset.createdBy === actorId || permissions.canVerify) && (
              <AssetCoordinateForm
                id={id}
                version={asset.version}
                latitude={asset.latitude}
                longitude={asset.longitude}
                verified={asset.registrationStatus === "verified"}
              />
            )}

          {/* Identity & Provenance Section */}
          <section className="rounded-lg border bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <Tag className="h-4 w-4 text-slate-500" />
                Identity and Provenance
              </h2>
              <button
                type="button"
                onClick={() => toggleSection("identity-provenance")}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {collapsedSections["identity-provenance"]
                  ? "Expand"
                  : "Collapse"}
              </button>
            </div>

            {!collapsedSections["identity-provenance"] && (
              <div className="mt-4">
                <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Owner" value={asset.ownerReference} />
                  <Field label="Custodian" value={asset.custodianReference} />
                  <Field
                    label="Documentary Source"
                    value={asset.sourceReference}
                  />
                  <Field label="Region Reference" value={asset.regionId} />
                  <Field
                    label="Commissioning Date"
                    value={asset.commissioningDate}
                  />
                  <Field label="Date Precision" value={asset.datePrecision} />
                  <Field
                    label="Measure"
                    value={
                      asset.measureValue
                        ? `${asset.measureValue} ${asset.measureUnit ?? ""}`
                        : null
                    }
                  />
                  <Field label="Latitude" value={asset.latitude} />
                  <Field label="Longitude" value={asset.longitude} />
                  <Field
                    label="Responsible Officer"
                    value={asset.responsibleOfficer}
                  />
                  <Field label="Created By (Officer)" value={asset.createdBy} />
                  <Field
                    label="Verified By (Authority)"
                    value={asset.verifiedBy}
                  />
                </dl>

                <h3 className="mt-6 mb-3 text-sm font-semibold text-slate-800">
                  Definition Custom Attributes
                </h3>
                <dl className="grid gap-4 sm:grid-cols-2">
                  {Object.entries(asset.attributes).map(([key, value]) => (
                    <Field key={key} label={key} value={value} />
                  ))}
                  {Object.keys(asset.attributes).length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No custom attributes recorded.
                    </p>
                  )}
                </dl>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: INSPECTIONS */}
      {activeTab === "inspections" && (
        <div className="space-y-6">
          {/* Draft Inspection Form (if verified and has write permission) */}
          {asset.registrationStatus === "verified" &&
            !asset.archivedAt &&
            !asset.retiredAt &&
            permissions?.canInspect &&
            components.length > 0 && (
              <InspectionDraftForm
                assetId={id}
                components={components.map((c) =>
                  typeof c === "string" ? c : c.name || c.code || "Component",
                )}
              />
            )}

          <section className="rounded-lg border bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b">
              <div>
                <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-slate-500" />
                  Statutory Inspections History ({inspectionsCount})
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Chronological condition evaluations conducted by authorized
                  field engineers.
                </p>
              </div>
            </div>

            {!inspections.success ? (
              <p role="alert" className="mt-4 text-sm text-red-700">
                Inspections could not be loaded.
              </p>
            ) : inspections.data.length === 0 ? (
              <div className="mt-6 text-center py-8 border rounded-lg bg-slate-50">
                <ClipboardList className="mx-auto h-8 w-8 text-slate-400" />
                <h3 className="mt-2 text-sm font-semibold text-slate-900">
                  No inspections recorded
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use the inspection draft form above to record the initial
                  baseline assessment.
                </p>
              </div>
            ) : (
              <div className="mt-4 divide-y divide-slate-100">
                {inspections.data.map((item) => (
                  <article key={item.id} className="py-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          Observed {item.observedOn}
                        </span>
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800 border">
                          Condition: {item.condition}
                        </span>
                        <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                          Status: {item.status}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Next Review: {show(item.nextReviewOn)}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                      <span>
                        Assessor Officer: <strong>{item.createdBy}</strong>
                      </span>
                      <span>
                        Reviewing Officer:{" "}
                        <strong>{show(item.reviewedBy)}</strong>
                      </span>
                      {item.limitations && (
                        <span>
                          Limitations: <em>{item.limitations}</em>
                        </span>
                      )}
                    </div>

                    {/* Human-Readable Component Observations Tree */}
                    <ComponentObservationsView
                      observations={item.observations}
                    />
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: RESTORATION WORKS */}
      {activeTab === "works" && (
        <div className="space-y-6">
          {/* Restoration Proposal Form (if authorized) */}
          {asset.registrationStatus === "verified" &&
            !asset.archivedAt &&
            !asset.retiredAt &&
            permissions?.canProposeWork &&
            inspections.success &&
            complaints.success && (
              <RestorationProposalForm
                assetId={id}
                inspections={inspections.data
                  .filter((item) => item.status === "approved")
                  .map((item) => ({
                    id: item.id,
                    label: `${item.observedOn} · ${item.condition}`,
                  }))}
                complaints={complaints.data.map((item) => ({
                  id: item.id,
                  label: `${item.channel} · ${item.narrative.slice(0, 70)}`,
                }))}
              />
            )}

          <section className="rounded-lg border bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b">
              <div>
                <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-slate-500" />
                  Restoration Works & DSR Accounting ({worksCount})
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  CPWD / State DSR estimated restorations and post-work
                  verification records.
                </p>
              </div>
            </div>

            {!works.success ? (
              <p role="alert" className="mt-4 text-sm text-red-700">
                Works could not be loaded.
              </p>
            ) : works.data.length === 0 ? (
              <div className="mt-6 text-center py-8 border rounded-lg bg-slate-50">
                <Wrench className="mx-auto h-8 w-8 text-slate-400" />
                <h3 className="mt-2 text-sm font-semibold text-slate-900">
                  No restoration works recorded
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Propose a restoration work order linked to an approved
                  inspection finding above.
                </p>
              </div>
            ) : (
              <div className="mt-4 divide-y divide-slate-100">
                {works.data.map((item) => (
                  <article key={item.id} className="py-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {item.description}
                        </span>
                        <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
                          {item.status}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Target Date: {show(item.targetOn)}
                      </span>
                    </div>

                    <p className="text-sm text-slate-700 bg-slate-50/70 p-2.5 rounded border border-slate-100">
                      <strong>Justification:</strong> {item.justification}
                    </p>

                    <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                      <span>
                        Assigned Agency/Officer:{" "}
                        <strong>{show(item.assignedTo)}</strong>
                      </span>
                      <span>
                        Completion: <strong>{show(item.completedOn)}</strong>
                      </span>
                      <span>
                        Verification Inspection ID:{" "}
                        <strong>{show(item.verificationInspectionId)}</strong>
                      </span>
                    </div>

                    {/* Independent Four-Eyes Verification for Accepted Works */}
                    {permissions?.canReviewWork &&
                      item.status === "accepted" &&
                      !item.verificationInspectionId &&
                      inspections.success && (
                        <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
                          <p className="text-xs font-semibold text-amber-900 mb-2">
                            Statutory Action Required: Verify Work with an
                            Approved Inspection
                          </p>
                          <WorkVerification
                            workId={item.id}
                            version={item.version}
                            inspections={inspections.data
                              .filter((entry) => entry.status === "approved")
                              .map((entry) => ({
                                id: entry.id,
                                observedOn: entry.observedOn,
                                condition: entry.condition,
                              }))}
                          />
                        </div>
                      )}

                    {/* Estimates and DSR Items */}
                    {estimates.success &&
                      estimates.data
                        .filter(
                          (entry) => entry.estimate.workOrderId === item.id,
                        )
                        .map(({ estimate }) => (
                          <div
                            key={estimate.id}
                            className="mt-3 rounded-md border border-slate-200 bg-slate-50/60 p-3 text-sm space-y-1.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900 text-xs">
                                DSR Estimate Revision {estimate.revision} ·{" "}
                                {estimate.status}
                              </span>
                              <span className="font-bold text-emerald-800 text-sm">
                                ₹
                                {(
                                  Number(estimate.amountPaise) / 100
                                ).toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600">
                              Schedule Reference:{" "}
                              <strong>{estimate.sourceReference}</strong> ·
                              Prepared: {estimate.estimatedOn}
                            </p>
                            <p className="text-xs text-slate-700">
                              Basis: {estimate.basis}
                            </p>
                            <div className="text-xs text-slate-500 flex flex-wrap gap-3 pt-1 border-t">
                              <span>Prepared by: {estimate.createdBy}</span>
                              <span>
                                Reviewed by: {show(estimate.reviewedBy)}
                              </span>
                            </div>
                            {permissions?.canReviewWork &&
                              estimate.createdBy !== actorId &&
                              estimate.status === "proposed" &&
                              ["proposed", "correction_required"].includes(
                                item.status,
                              ) && <EstimateReview id={estimate.id} />}
                          </div>
                        ))}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 4: GRIEVANCES & DUPLICATES */}
      {activeTab === "grievances" && (
        <div className="space-y-6">
          <section className="rounded-lg border bg-white p-5 shadow-xs">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3 border-b">
              <div>
                <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                  <MessageSquareWarning className="h-4 w-4 text-slate-500" />
                  Grievances & Duplicate Reconciliation
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Citizen grievance logging, geo-proximity duplicate matching,
                  and sovereign four-eyes resolution.
                </p>
              </div>
              <AssetGrievanceAndDuplicateTools
                assetId={id}
                departmentId={asset.departmentId}
                duplicateCandidates={duplicateCandidates.map((c) => ({
                  ...c,
                  reason: c.reason ?? "",
                  flaggedBy: c.flaggedBy ?? "system",
                }))}
                actorId={actorId}
                canVerify={permissions?.canVerify}
              />
            </div>

            <h3 className="mt-4 text-sm font-semibold text-slate-800">
              Linked Grievances & Citizen Feedback ({complaintsCount})
            </h3>

            {!complaints.success ? (
              <p role="alert" className="mt-3 text-sm text-red-700">
                Complaints could not be loaded.
              </p>
            ) : complaints.data.length === 0 ? (
              <div className="mt-4 text-center py-6 border rounded-lg bg-slate-50">
                <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" />
                <h4 className="mt-2 text-xs font-semibold text-slate-800">
                  No active grievances
                </h4>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  No public complaints or defect notifications linked to this
                  asset.
                </p>
              </div>
            ) : (
              <div className="mt-3 divide-y divide-slate-100">
                {complaints.data.map((item) => (
                  <article key={item.id} className="py-3 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-xs">
                          Channel: {item.channel}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold border ${
                            item.severity === "high" ||
                            item.severity === "critical"
                              ? "bg-rose-50 text-rose-800 border-rose-200"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        >
                          Severity: {item.severity}
                        </span>
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {item.status}
                        </span>
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap text-xs text-slate-800 bg-slate-50 p-2.5 rounded border border-slate-100">
                      {item.narrative}
                    </p>
                    {item.resolutionNotes && (
                      <p className="text-xs text-emerald-800 font-medium">
                        Resolution Notes: {item.resolutionNotes}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 5: EVIDENCE & FILES */}
      {activeTab === "evidence" && (
        <div className="space-y-6">
          <section className="rounded-lg border bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b">
              <div>
                <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-slate-500" />
                  Statutory Evidence Records ({evidenceCount})
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tamper-evident files and photographs secured with SHA256
                  checksums and access auditing.
                </p>
              </div>
            </div>

            {permissions?.canEvidence &&
              !asset.archivedAt &&
              asset.registrationStatus !== "submitted" && (
                <div className="mt-4">
                  <EvidenceUploader assetId={id} />
                </div>
              )}

            {!evidence.success ? (
              <p role="alert" className="mt-4 text-sm text-red-700">
                Evidence references could not be loaded.
              </p>
            ) : evidence.data.length === 0 ? (
              <div className="mt-6 text-center py-8 border rounded-lg bg-slate-50">
                <Paperclip className="mx-auto h-8 w-8 text-slate-400" />
                <h3 className="mt-2 text-sm font-semibold text-slate-900">
                  No evidence recorded
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload inspection photographs, site measurement sheets, or
                  handover certificates.
                </p>
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {evidence.data.map((item) => (
                  <li
                    key={item.id}
                    className="py-3 text-sm flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <span className="font-medium text-slate-900">
                        {item.originalName}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {item.mimeType} · {item.classification} ·{" "}
                        {(Number(item.sizeBytes) / 1024).toFixed(1)} KB
                      </p>
                      {item.caption && (
                        <p className="text-xs text-slate-700 mt-0.5">
                          {item.caption}
                        </p>
                      )}
                    </div>
                    <EvidenceAccess evidenceId={item.id} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* TAB 6: STATUTORY AUDIT LOG */}
      {activeTab === "history" && (
        <div className="space-y-6">
          <section className="rounded-lg border bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b">
              <div>
                <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                  <HistoryIcon className="h-4 w-4 text-slate-500" />
                  Statutory Audit Log ({historyCount} events)
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Append-only immutable audit trail capturing actor, operation,
                  and legal justification.
                </p>
              </div>
            </div>

            {history.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No recorded audit history available.
              </p>
            ) : (
              <ol className="mt-4 divide-y divide-slate-100">
                {history.map((event) => (
                  <li key={event.id} className="py-3 text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {event.operation.toUpperCase()}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700 font-mono">
                          {event.entityType}
                        </span>
                      </div>
                      <span className="text-slate-500">
                        {show(event.occurredAt)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 text-slate-600">
                      <span>
                        Actor ID:{" "}
                        <code className="text-slate-800">
                          {show(event.actorId)}
                        </code>
                      </span>
                      {event.reason && (
                        <span>
                          Reason: <em>{event.reason}</em>
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
