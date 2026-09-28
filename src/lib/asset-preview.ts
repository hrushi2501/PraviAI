export type FieldType =
  | "text"
  | "number"
  | "integer"
  | "date"
  | "select"
  | "boolean";
export interface AssetField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  unit?: string;
  options?: string[];
}
export interface AssetDefinition {
  id: string;
  department: string;
  code: string;
  name: string;
  version: number;
  status: "draft" | "submitted" | "published";
  createdBy: string;
  fields: AssetField[];
  components: string[];
  stages: string[];
  transitions: { from: string; to: string; requiresApproval: true }[];
}
export type Condition = "good" | "fair" | "poor" | "critical" | "unknown";
export type Registration =
  | "draft"
  | "submitted"
  | "verified"
  | "correction_required";
export interface EvidenceRecord {
  id: string;
  name: string;
  source: string;
  classification: "synthetic_public" | "internal";
}
export interface PreviewAsset {
  id: string;
  code: string;
  name: string;
  department: string;
  typeId: string;
  region: string;
  commissionedOn: string | null;
  attributes: Record<string, string | number | boolean>;
  registration: Registration;
  lifecycle: string;
  availability: "in_service" | "restricted" | "closed" | "unknown";
  owner: string;
  custodian: string;
  source: string;
  createdBy: string;
  version: number;
  evidence: EvidenceRecord[];
}
export interface PreviewInspection {
  id: string;
  assetId: string;
  observedOn: string;
  reviewDue: string;
  condition: Condition;
  status: "submitted" | "approved";
  assessor: string;
  reviewer?: string;
  notes: string;
  components: Record<string, Condition>;
  evidence: string;
}
export interface PreviewWork {
  id: string;
  assetId: string;
  name: string;
  status:
    | "proposed"
    | "approved"
    | "in_progress"
    | "completion_submitted"
    | "accepted";
  proposer: string;
  assignee: string;
  approver?: string;
  due: string;
  estimatePaise: number | null;
  estimateSource: string;
  estimateReviewed: boolean;
  completionEvidence?: string;
}
export interface PreviewComplaint {
  id: string;
  assetId: string;
  narrative: string;
  severity: "severe" | "routine";
  status: "open" | "investigating" | "resolved";
  reportedOn: string;
}
export interface HistoryEvent {
  id: string;
  assetId: string;
  date: string;
  actor: string;
  action: string;
  before: string;
  after: string;
  reason: string;
}
export interface PreviewDuplicateCandidate {
  id: string;
  assetId: string;
  candidateId: string;
  status: "pending" | "confirmed_duplicate" | "dismissed";
  flaggedBy: string;
  reason: string;
  reviewedBy?: string;
  decisionReason?: string;
  createdAt: string;
}
export interface PreviewApproval {
  id: string;
  assetId: string;
  from: string;
  to: string;
  version: number;
  requester: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
}
export interface PreviewState {
  definitions: AssetDefinition[];
  assets: PreviewAsset[];
  inspections: PreviewInspection[];
  works: PreviewWork[];
  complaints: PreviewComplaint[];
  history: HistoryEvent[];
  approvals: PreviewApproval[];
  duplicates?: PreviewDuplicateCandidate[];
}
export const REFERENCE_DATE = "2026-09-28";
export const departments = [
  { id: "pwd", name: "Public Works" },
  { id: "water", name: "Water Resources" },
  { id: "education", name: "Education" },
];
export const previewPeople = {
  officer: {
    id: "demo_officer",
    name: "Asha Mehta",
    description: "Officer preview",
  },
  reviewer: {
    id: "demo_reviewer",
    name: "Nikhil Shah",
    description: "Independent reviewer preview",
  },
  acceptor: {
    id: "demo_acceptor",
    name: "Kavya Desai",
    description: "Completion reviewer preview",
  },
  central: {
    id: "demo_planner",
    name: "Priya Rao",
    description: "Central planner preview",
  },
};
export type Persona = keyof typeof previewPeople;
const fields: Record<string, AssetField[]> = {
  road: [
    {
      key: "length_km",
      label: "Section length",
      type: "number",
      required: true,
      unit: "km",
    },
    {
      key: "surface",
      label: "Surface",
      type: "select",
      required: true,
      options: ["Bituminous", "Concrete", "Unpaved"],
    },
  ],
  bridge: [
    {
      key: "span_m",
      label: "Total span",
      type: "number",
      required: true,
      unit: "m",
    },
    {
      key: "material",
      label: "Structure material",
      type: "select",
      required: true,
      options: ["Concrete", "Steel", "Masonry"],
    },
  ],
  building: [
    {
      key: "area_sqm",
      label: "Floor area",
      type: "number",
      required: true,
      unit: "m²",
    },
    { key: "storeys", label: "Storeys", type: "integer", required: true },
    { key: "use", label: "Building use", type: "text", required: true },
  ],
  reservoir: [
    {
      key: "capacity_kl",
      label: "Capacity",
      type: "number",
      required: true,
      unit: "kL",
    },
    { key: "material", label: "Material", type: "text", required: true },
  ],
  pumping: [
    {
      key: "capacity_kl_day",
      label: "Facility capacity",
      type: "number",
      required: true,
      unit: "kL/day",
    },
    {
      key: "backup_available",
      label: "Backup facility",
      type: "boolean",
      required: false,
    },
  ],
};
const definitions: AssetDefinition[] = [
  {
    id: "pwd_road_v1",
    department: "pwd",
    code: "road_section",
    name: "Road section",
    version: 1,
    fields: fields.road,
    components: ["Surface", "Drainage", "Shoulders"],
  },
  {
    id: "pwd_bridge_v1",
    department: "pwd",
    code: "bridge",
    name: "Bridge",
    version: 1,
    fields: fields.bridge,
    components: ["Deck", "Bearings", "Substructure"],
  },
  {
    id: "pwd_building_v1",
    department: "pwd",
    code: "public_building",
    name: "Public building",
    version: 1,
    fields: fields.building,
    components: ["Structure", "Water ingress", "Services"],
  },
  {
    id: "water_reservoir_v1",
    department: "water",
    code: "reservoir",
    name: "Reservoir",
    version: 1,
    fields: fields.reservoir,
    components: ["Structure", "Water quality", "Valves"],
  },
  {
    id: "water_pumping_v1",
    department: "water",
    code: "pumping_station",
    name: "Pumping station",
    version: 1,
    fields: fields.pumping,
    components: ["Structure", "Electrical services", "Pipeline"],
  },
  {
    id: "education_building_v1",
    department: "education",
    code: "school_building",
    name: "School building",
    version: 1,
    fields: fields.building,
    components: ["Structure", "Roof", "Sanitation"],
  },
].map((d) => ({
  ...d,
  status: "published",
  createdBy: "demo_expert",
  stages: ["operating", "restoration", "retired"],
  transitions: [
    { from: "operating", to: "restoration", requiresApproval: true },
    { from: "restoration", to: "operating", requiresApproval: true },
    { from: "operating", to: "retired", requiresApproval: true },
  ],
}));
export function createPreviewState(): PreviewState {
  const names = [
    "West Zone municipal office",
    "Sabarmati approach bridge",
    "Ring road section 4",
    "Community service centre",
    "District connection bridge",
    "Riverfront road section",
    "North zone reservoir",
    "East pumping facility",
    "Ward 8 reservoir",
    "South pumping facility",
    "Canal service reservoir",
    "Central pumping facility",
    "Ward 4 primary school",
    "District secondary school",
    "Village learning centre",
    "North school annex",
    "South primary school",
    "Community education block",
  ];
  const assets: PreviewAsset[] = names.map((name, i) => {
    const department = i < 6 ? "pwd" : i < 12 ? "water" : "education";
    const def = definitions.filter((d) => d.department === department)[
      i % (department === "pwd" ? 3 : department === "water" ? 2 : 1)
    ];
    const attrs: Record<string, string | number | boolean> = {};
    for (const f of def.fields)
      attrs[f.key] =
        f.type === "select"
          ? (f.options?.[0] ?? "Unknown")
          : f.type === "boolean"
            ? true
            : f.type === "integer"
              ? 2
              : f.type === "number"
                ? i + 12
                : department === "education"
                  ? "Education"
                  : "Public administration";
    return {
      id: `asset_${i + 1}`,
      code:
        i === 0
          ? "BLD-1042"
          : `${department === "pwd" ? "PWD" : department === "water" ? "WTR" : "EDU"}-${1042 + i}`,
      name,
      department,
      typeId: i === 0 ? "pwd_building_v1" : def.id,
      region: ["Ahmedabad West", "Ahmedabad East", "Gandhinagar"][i % 3],
      commissionedOn: i % 5 === 0 ? null : `${2008 + (i % 16)}-06-15`,
      attributes:
        i === 0
          ? { area_sqm: 1250, storeys: 3, use: "Municipal administration" }
          : attrs,
      registration: "verified",
      lifecycle: "operating",
      availability: i === 1 ? "restricted" : "in_service",
      owner: "Government of Gujarat (synthetic)",
      custodian: departments.find((d) => d.id === department)?.name ?? "",
      source: `Synthetic register record ${i + 1}`,
      createdBy: "demo_officer",
      version: 1,
      evidence: [
        {
          id: `doc_${i}`,
          name: "Inventory source extract.pdf",
          source: "Synthetic record; no real document uploaded",
          classification: "synthetic_public",
        },
      ],
    };
  });
  const conditions: Condition[] = [
    "poor",
    "critical",
    "fair",
    "good",
    "good",
    "poor",
    "fair",
    "good",
    "poor",
    "good",
    "fair",
    "unknown",
  ];
  const inspections: PreviewInspection[] = conditions.map((condition, i) => {
    const def = definitions.find((d) => d.id === assets[i].typeId);
    return {
      id: `inspection_${i + 1}`,
      assetId: assets[i].id,
      observedOn: "2026-09-12",
      reviewDue: i % 4 === 3 ? "2026-09-20" : "2026-12-12",
      condition,
      status: "approved",
      assessor: "demo_officer",
      reviewer: "demo_reviewer",
      notes:
        i === 0
          ? "Visible water ingress and damaged roof finish. Competent assessment and restoration required."
          : `Synthetic ${condition} component observations; competent reviewer assessment required.`,
      components: Object.fromEntries(
        (def?.components ?? []).map((c) => [c, condition]),
      ),
      evidence: "Synthetic inspection photographs reference",
    };
  });
  inspections.push({
    id: "inspection_pending",
    assetId: "asset_13",
    observedOn: "2026-09-25",
    reviewDue: "2026-12-25",
    condition: "fair",
    status: "submitted",
    assessor: "demo_officer",
    notes: "Roof inspection submitted for independent review.",
    components: { Structure: "good", Roof: "fair", Sanitation: "good" },
    evidence: "Synthetic assessor evidence reference",
  });
  const works: PreviewWork[] = [
    {
      id: "work_1",
      assetId: "asset_1",
      name: "Roof ingress investigation and restoration",
      status: "proposed",
      proposer: "demo_officer",
      assignee: "demo_officer",
      due: "2026-10-10",
      estimatePaise: 42000000,
      estimateSource: "Synthetic schedule-of-rates estimate, 25 September",
      estimateReviewed: true,
    },
    {
      id: "work_2",
      assetId: "asset_2",
      name: "Bridge competent-engineer investigation",
      status: "in_progress",
      proposer: "demo_author",
      assignee: "demo_officer",
      approver: "demo_reviewer",
      due: "2026-09-24",
      estimatePaise: null,
      estimateSource: "Estimate not yet prepared",
      estimateReviewed: false,
    },
    {
      id: "work_3",
      assetId: "asset_6",
      name: "Road drainage restoration",
      status: "completion_submitted",
      proposer: "demo_author",
      assignee: "demo_officer",
      approver: "demo_reviewer",
      due: "2026-10-01",
      estimatePaise: 52000000,
      estimateSource: "Synthetic measured works estimate, 20 September",
      estimateReviewed: true,
      completionEvidence: "Synthetic completed drainage photographs",
    },
  ];
  return {
    definitions: structuredClone(definitions),
    assets,
    inspections,
    works,
    complaints: [
      {
        id: "complaint_1",
        assetId: "asset_1",
        narrative: "Water ingress reported by the office custodian.",
        severity: "routine",
        status: "investigating",
        reportedOn: "2026-09-18",
      },
      {
        id: "complaint_2",
        assetId: "asset_2",
        narrative:
          "Visible distress reported on approach deck; investigation requested.",
        severity: "severe",
        status: "open",
        reportedOn: "2026-09-26",
      },
    ],
    history: [
      {
        id: "history_1",
        assetId: "asset_1",
        date: "2026-09-12",
        actor: "demo_officer",
        action: "Inspection submitted",
        before: "Unknown",
        after: "Pending review",
        reason: "Water ingress observed; photographs referenced.",
      },
      {
        id: "history_2",
        assetId: "asset_1",
        date: "2026-09-14",
        actor: "demo_reviewer",
        action: "Inspection approved",
        before: "Unknown",
        after: "Poor (approved)",
        reason: "Independent review of dated component observations.",
      },
      {
        id: "history_3",
        assetId: "asset_1",
        date: "2026-09-18",
        actor: "demo_officer",
        action: "Complaint investigated",
        before: "Open",
        after: "Investigating",
        reason: "Linked custodian complaint to existing building record.",
      },
      {
        id: "history_4",
        assetId: "asset_1",
        date: "2026-09-25",
        actor: "demo_officer",
        action: "Restoration proposed",
        before: "No work",
        after: "Proposal pending",
        reason: "Source estimate prepared; independent approval required.",
      },
    ],
    approvals: [],
    duplicates: [
      {
        id: "dup_1",
        assetId: "asset_1",
        candidateId: "asset_4",
        status: "pending",
        flaggedBy: "demo_officer",
        reason:
          "Proximity match within 45m and identical municipal building specification.",
        createdAt: "2026-09-27",
      },
    ],
  };
}
export function conditionFor(state: PreviewState, assetId: string) {
  const i = state.inspections
    .filter((i) => i.assetId === assetId && i.status === "approved")
    .sort(
      (a, b) =>
        b.observedOn.localeCompare(a.observedOn) || b.id.localeCompare(a.id),
    )[0];
  return {
    inspection: i,
    condition: i?.condition ?? ("unknown" as Condition),
    freshness: !i
      ? "unknown"
      : i.reviewDue < REFERENCE_DATE
        ? "stale"
        : "current",
  };
}
export function attentionFor(state: PreviewState, assetId: string) {
  const c = conditionFor(state, assetId);
  const reasons: string[] = [];
  if (c.condition === "critical") reasons.push("Approved critical finding");
  if (c.freshness === "stale") reasons.push("Inspection overdue");
  if (c.freshness === "unknown" || c.condition === "unknown")
    reasons.push("Condition not established");
  if (c.condition === "poor") reasons.push("Restoration assessment required");
  if (
    state.complaints.some(
      (x) =>
        x.assetId === assetId &&
        x.severity === "severe" &&
        x.status !== "resolved",
    )
  )
    reasons.push("Severe complaint: investigate");
  if (
    state.works.some(
      (x) =>
        x.assetId === assetId &&
        x.status !== "accepted" &&
        x.due < REFERENCE_DATE,
    )
  )
    reasons.push("Restoration overdue");
  return reasons;
}
export function metricsFor(state: PreviewState, assets: PreviewAsset[]) {
  const eligible = assets.filter(
    (a) => a.registration === "verified" && a.lifecycle !== "retired",
  );
  const ids = new Set(eligible.map((a) => a.id));
  const current = eligible.filter((a) => {
    const c = conditionFor(state, a.id);
    return c.freshness === "current" && c.condition !== "unknown";
  });
  const works = state.works.filter(
    (w) => ids.has(w.assetId) && w.status !== "accepted",
  );
  return {
    inventory: eligible.length,
    current: current.length,
    coverage: eligible.length
      ? Math.round((current.length / eligible.length) * 100)
      : null,
    attention: eligible.filter((a) => attentionFor(state, a.id).length > 0)
      .length,
    works: works.length,
    estimatePaise: works
      .filter((w) => w.estimateReviewed && w.estimatePaise !== null)
      .reduce((s, w) => s + (w.estimatePaise ?? 0), 0),
    unpriced: works.filter(
      (w) => !w.estimateReviewed || w.estimatePaise === null,
    ).length,
  };
}
export function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}
export function validateField(field: AssetField, value: unknown) {
  if (value === undefined || value === null || value === "")
    return field.required ? "Required field" : null;
  if (field.type === "number" || field.type === "integer") {
    const number = Number(value);
    if (
      !Number.isFinite(number) ||
      (field.type === "integer" && !Number.isInteger(number))
    )
      return field.type === "integer"
        ? "Enter a whole number"
        : "Enter a valid number";
  }
  if (field.type === "select" && !field.options?.includes(String(value)))
    return "Select a configured option";
  if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(value)))
    return "Use YYYY-MM-DD";
  if (field.type === "boolean" && typeof value !== "boolean")
    return "Select yes or no";
  return null;
}
