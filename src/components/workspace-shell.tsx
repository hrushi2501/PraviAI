"use client";

import { UserButton } from "@clerk/nextjs";
import {
  Boxes,
  ClipboardCheck,
  History,
  Layers,
  LayoutDashboard,
  MapPin,
  Menu,
  MessageSquareWarning,
  Settings,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useState } from "react";
import { CommandPalette } from "@/components/command-palette";
import { KeyboardShortcutsModal } from "@/components/keyboard-shortcuts-modal";
import { Button } from "@/components/ui/button";
import { WorkspaceBreadcrumbs } from "@/components/workspace-breadcrumbs";

const links = [
  { href: "/app/dashboard", name: "Dashboard", icon: LayoutDashboard },
  { href: "/app/assets", name: "Asset register", icon: Boxes },
  { href: "/app/map", name: "Asset map", icon: MapPin },
  { href: "/app/inspections", name: "Inspections", icon: ClipboardCheck },
  { href: "/app/maintenance", name: "Restoration", icon: Wrench },
  { href: "/app/complaints", name: "Complaints", icon: MessageSquareWarning },
  { href: "/app/asset-types", name: "Asset definitions", icon: Layers },
  { href: "/app/settings", name: "Settings", icon: Settings },
];

export function WorkspaceShell({
  children,
  departments,
  name,
  isAdmin = false,
}: {
  children: ReactNode;
  departments: { id: string; name: string; active: boolean }[];
  name?: string;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const department = params.get("department") ?? "";
  const scopeSuffix = department
    ? `?department=${encodeURIComponent(department)}`
    : "";
  const navigation = (
    <nav aria-label="Main navigation" className="space-y-1 p-3">
      {[
        ...links,
        ...(isAdmin
          ? [
              {
                href: "/app/administration",
                name: "Administration",
                icon: ShieldCheck,
              },
              {
                href: "/app/audit",
                name: "Audit log",
                icon: History,
              },
            ]
          : []),
      ].map((link) => (
        <Link
          key={link.href}
          href={`${link.href}${scopeSuffix}`}
          onClick={() => setOpen(false)}
          aria-current={pathname.startsWith(link.href) ? "page" : undefined}
          className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm ${pathname.startsWith(link.href) ? "bg-accent font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
        >
          <link.icon className="size-4" />
          {link.name}
        </Link>
      ))}
    </nav>
  );
  return (
    <div className="min-h-screen">
      <a
        href="#workspace-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-card focus:p-3"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-card md:flex">
        <Link
          href="/app/dashboard"
          className="flex h-16 items-center border-b px-6 text-lg font-semibold tracking-tight"
        >
          Pravi AI
        </Link>
        <p className="px-6 pt-5 text-xs text-muted-foreground">
          Public Asset Register
        </p>
        {navigation}
        <p className="mt-auto border-t px-6 py-4 text-xs text-muted-foreground">
          {name ?? "Department workspace"}
        </p>
      </aside>
      <div className="md:pl-60">
        <header className="sticky top-0 z-30 border-b bg-card">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setOpen(!open)}
                aria-label="Toggle navigation"
                aria-expanded={open}
              >
                <Menu />
              </Button>
              <label className="flex min-w-0 items-center gap-2 text-sm">
                <span className="hidden text-muted-foreground sm:inline">
                  Department
                </span>
                <select
                  aria-label="Department scope"
                  value={department}
                  className="h-10 max-w-56 rounded-md border bg-card px-3 text-sm"
                  onChange={(event) => {
                    const next = new URLSearchParams(params);
                    next.delete("page");
                    event.target.value
                      ? next.set("department", event.target.value)
                      : next.delete("department");
                    router.push(`${pathname}?${next}`);
                  }}
                >
                  <option value="">All authorised departments</option>
                  {departments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.active ? "" : " (inactive)"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2.5">
              <CommandPalette isAdmin={isAdmin} departments={departments} />
              <KeyboardShortcutsModal />
              <UserButton />
            </div>
          </div>
          {open && <div className="border-t md:hidden">{navigation}</div>}
        </header>
        <main
          id="workspace-content"
          className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 lg:px-8 lg:py-8"
        >
          <WorkspaceBreadcrumbs />
          {children}
        </main>
      </div>
    </div>
  );
}
