"use client";

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  HelpCircle,
} from "lucide-react";
import { useState } from "react";

function getConditionBadge(cond: string | undefined) {
  const c = (cond || "").toLowerCase();
  if (c.includes("good") || c.includes("optimal") || c.includes("sound")) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
        {cond}
      </span>
    );
  }
  if (c.includes("fair") || c.includes("moderate")) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
        <AlertCircle className="h-3 w-3 text-amber-600" />
        {cond}
      </span>
    );
  }
  if (
    c.includes("poor") ||
    c.includes("critical") ||
    c.includes("danger") ||
    c.includes("fail")
  ) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800 border border-rose-200">
        <AlertCircle className="h-3 w-3 text-rose-600" />
        {cond}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200">
      <HelpCircle className="h-3 w-3 text-slate-500" />
      {cond || "Not Specified"}
    </span>
  );
}

interface ComponentObservationsViewProps {
  observations: unknown;
}

export function ComponentObservationsView({
  observations,
}: ComponentObservationsViewProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (!observations) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No component breakdown recorded for this inspection.
      </p>
    );
  }

  // Parse if string
  let data = observations;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return (
        <div className="rounded border bg-slate-50 p-2.5 text-xs text-slate-700">
          {String(data)}
        </div>
      );
    }
  }

  // Handle Array format: e.g. [{ component: "Deck", condition: "good", defects: [] }]
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return (
        <p className="text-xs text-muted-foreground italic">
          No component observations recorded.
        </p>
      );
    }

    return (
      <div className="mt-2.5 rounded-lg border border-slate-200 bg-white overflow-hidden text-xs">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center justify-between bg-slate-50/80 px-3 py-2 font-medium text-slate-700 hover:bg-slate-100/80 border-b border-slate-200"
        >
          <span className="flex items-center gap-1.5 font-semibold text-slate-800">
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
            )}
            Component Observations Breakdown ({data.length} components)
          </span>
          <span className="text-[11px] text-slate-500 font-normal">
            Click to {isOpen ? "collapse" : "expand"}
          </span>
        </button>

        {isOpen && (
          <div className="divide-y divide-slate-100 p-2 space-y-2">
            {data.map((item, idx) => {
              if (typeof item !== "object" || item === null) {
                const itemKey = `raw-${String(item).slice(0, 16)}-${idx}`;
                return (
                  <div key={itemKey} className="p-2 text-slate-700">
                    {String(item)}
                  </div>
                );
              }
              const compObj = item as Record<string, unknown>;
              const title = String(
                compObj.component ||
                  compObj.name ||
                  compObj.title ||
                  `Component #${idx + 1}`,
              );
              const cond = compObj.condition
                ? String(compObj.condition)
                : undefined;
              const defects = Array.isArray(compObj.defects)
                ? compObj.defects
                : [];
              const notes =
                compObj.notes || compObj.description || compObj.remarks;
              const rowKey = `${title}-${idx}`;

              return (
                <div
                  key={rowKey}
                  className="rounded-md border border-slate-100 bg-slate-50/50 p-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {title}
                    </span>
                    {cond && getConditionBadge(cond)}
                  </div>
                  {defects.length > 0 && (
                    <div className="mt-2">
                      <span className="text-[11px] font-medium text-rose-800 uppercase tracking-wide">
                        Reported Defects:
                      </span>
                      <ul className="mt-1 list-disc list-inside space-y-0.5 text-slate-700 pl-1">
                        {defects.map((def, dIdx) => (
                          <li key={`${String(def).slice(0, 16)}-${dIdx}`}>
                            {String(def)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Boolean(notes) && (
                    <p className="mt-1.5 text-slate-600">
                      <span className="font-medium text-slate-700">
                        Notes:{" "}
                      </span>
                      {String(notes)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Handle Object format: e.g. { "Substructure": { "condition": "good", ... } }
  if (typeof data === "object" && data !== null) {
    const entries = Object.entries(data);
    if (entries.length === 0) {
      return (
        <p className="text-xs text-muted-foreground italic">
          No component details recorded.
        </p>
      );
    }

    return (
      <div className="mt-2.5 rounded-lg border border-slate-200 bg-white overflow-hidden text-xs">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center justify-between bg-slate-50/80 px-3 py-2 font-medium text-slate-700 hover:bg-slate-100/80 border-b border-slate-200"
        >
          <span className="flex items-center gap-1.5 font-semibold text-slate-800">
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
            )}
            Component Observations Breakdown ({entries.length} items)
          </span>
          <span className="text-[11px] text-slate-500 font-normal">
            Click to {isOpen ? "collapse" : "expand"}
          </span>
        </button>

        {isOpen && (
          <div className="grid gap-2 p-2 sm:grid-cols-2">
            {entries.map(([key, val]) => {
              if (typeof val === "object" && val !== null) {
                const subObj = val as Record<string, unknown>;
                const cond = subObj.condition
                  ? String(subObj.condition)
                  : undefined;
                return (
                  <div
                    key={key}
                    className="rounded-md border border-slate-100 bg-slate-50/50 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">
                        {key}
                      </span>
                      {cond && getConditionBadge(cond)}
                    </div>
                    <dl className="mt-1.5 space-y-1">
                      {Object.entries(subObj)
                        .filter(([k]) => k !== "condition")
                        .map(([subKey, subVal]) => (
                          <div
                            key={subKey}
                            className="flex justify-between gap-2 text-[11px]"
                          >
                            <dt className="text-slate-500">{subKey}:</dt>
                            <dd className="font-medium text-slate-800 wrap-break-word">
                              {String(subVal)}
                            </dd>
                          </div>
                        ))}
                    </dl>
                  </div>
                );
              }

              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/50 p-2.5"
                >
                  <span className="font-medium text-slate-700">{key}</span>
                  <span className="font-semibold text-slate-900">
                    {String(val)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <pre className="mt-2 whitespace-pre-wrap wrap-break-word rounded bg-slate-50 p-2 text-xs text-slate-700 border">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
