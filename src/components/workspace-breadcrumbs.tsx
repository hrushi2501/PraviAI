"use client";

import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  assets: "Asset Register",
  map: "Asset Map",
  inspections: "Statutory Inspections",
  maintenance: "Restoration Works",
  complaints: "Complaints & Grievances",
  "asset-types": "Asset Definitions",
  administration: "Authority Administration",
  audit: "Immutable Audit Log",
  settings: "Settings",
};

export function WorkspaceBreadcrumbs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const department = searchParams.get("department");
  const scopeSuffix = department
    ? `?department=${encodeURIComponent(department)}`
    : "";

  // Split paths: /app/assets/[id] -> ['app', 'assets', '[id]']
  const segments = pathname.split("/").filter(Boolean);

  // If we're just on /app or /app/dashboard, show minimal
  if (segments.length <= 2 && segments[1] === "dashboard") {
    return null;
  }

  const breadcrumbs: { href: string; label: string; isLast: boolean }[] = [];

  // Always start with Dashboard as root
  breadcrumbs.push({
    href: `/app/dashboard${scopeSuffix}`,
    label: "Dashboard",
    isLast: false,
  });

  let currentPath = "/app";
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    currentPath += `/${seg}`;
    const isLast = i === segments.length - 1;

    let label = ROUTE_LABELS[seg];
    if (!label) {
      // Might be a UUID
      if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(seg)) {
        label = `Record (${seg.slice(0, 8)}…)`;
      } else {
        label = seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ");
      }
    }

    breadcrumbs.push({
      href: `${currentPath}${scopeSuffix}`,
      label,
      isLast,
    });
  }

  return (
    <nav
      aria-label="Breadcrumbs"
      className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4"
    >
      <Link
        href={`/app/dashboard${scopeSuffix}`}
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        title="Dashboard"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>

      {breadcrumbs.slice(1).map((crumb) => (
        <span key={crumb.href} className="flex items-center gap-1.5">
          <ChevronRight className="h-3 w-3 text-slate-400" />
          {crumb.isLast ? (
            <span className="font-semibold text-slate-800" aria-current="page">
              {crumb.label}
            </span>
          ) : (
            <Link
              href={crumb.href}
              className="hover:text-foreground transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
