"use client";

import {
  Boxes,
  ClipboardCheck,
  Command,
  CornerDownLeft,
  History,
  Layers,
  LayoutDashboard,
  MapPin,
  MessageSquareWarning,
  PlusCircle,
  Search,
  Settings,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

interface CommandItem {
  id: string;
  title: string;
  category: "Navigation" | "Actions" | "Filters" | "Departments";
  icon: typeof LayoutDashboard;
  href?: string;
  action?: () => void;
  shortcut?: string;
}

export function CommandPalette({
  isAdmin = false,
  departments = [],
}: {
  isAdmin?: boolean;
  departments?: { id: string; name: string }[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const department = searchParams.get("department") ?? "";
  const scopeSuffix = department
    ? `?department=${encodeURIComponent(department)}`
    : "";

  const items: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [
      // Navigation
      {
        id: "nav-dashboard",
        title: "Go to Dashboard",
        category: "Navigation",
        icon: LayoutDashboard,
        href: `/app/dashboard${scopeSuffix}`,
      },
      {
        id: "nav-assets",
        title: "Go to Asset Register",
        category: "Navigation",
        icon: Boxes,
        href: `/app/assets${scopeSuffix}`,
      },
      {
        id: "nav-map",
        title: "Go to Asset Map",
        category: "Navigation",
        icon: MapPin,
        href: `/app/map${scopeSuffix}`,
      },
      {
        id: "nav-inspections",
        title: "Go to Inspections Queue",
        category: "Navigation",
        icon: ClipboardCheck,
        href: `/app/inspections${scopeSuffix}`,
      },
      {
        id: "nav-restoration",
        title: "Go to Restoration Works",
        category: "Navigation",
        icon: Wrench,
        href: `/app/maintenance${scopeSuffix}`,
      },
      {
        id: "nav-complaints",
        title: "Go to Complaints Workspace",
        category: "Navigation",
        icon: MessageSquareWarning,
        href: `/app/complaints${scopeSuffix}`,
      },
      {
        id: "nav-templates",
        title: "Go to Asset Definitions",
        category: "Navigation",
        icon: Layers,
        href: `/app/asset-types${scopeSuffix}`,
      },
      {
        id: "nav-settings",
        title: "Go to Profile & Settings",
        category: "Navigation",
        icon: Settings,
        href: `/app/settings${scopeSuffix}`,
      },
    ];

    if (isAdmin) {
      list.push(
        {
          id: "nav-admin",
          title: "Go to Authority Administration",
          category: "Navigation",
          icon: ShieldCheck,
          href: `/app/administration${scopeSuffix}`,
        },
        {
          id: "nav-audit",
          title: "Go to Immutable Audit Log",
          category: "Navigation",
          icon: History,
          href: `/app/audit${scopeSuffix}`,
        },
      );
    }

    // Quick Actions
    list.push(
      {
        id: "act-new-asset",
        title: "Register New Asset",
        category: "Actions",
        icon: PlusCircle,
        href: `/app/assets#new`,
      },
      {
        id: "act-filter-submitted",
        title: "Show Assets Awaiting Verification",
        category: "Filters",
        icon: Boxes,
        href: `/app/assets?registration=submitted${department ? `&department=${department}` : ""}`,
      },
      {
        id: "act-filter-drafts",
        title: "Show My Draft Assets",
        category: "Filters",
        icon: Boxes,
        href: `/app/assets?registration=draft${department ? `&department=${department}` : ""}`,
      },
      {
        id: "act-filter-verified",
        title: "Show Fully Verified Assets",
        category: "Filters",
        icon: Boxes,
        href: `/app/assets?registration=verified${department ? `&department=${department}` : ""}`,
      },
    );

    // Department quick switch
    departments.forEach((dept) => {
      list.push({
        id: `dept-${dept.id}`,
        title: `Scope: ${dept.name}`,
        category: "Departments",
        icon: Boxes,
        action: () => {
          const next = new URLSearchParams(searchParams);
          next.set("department", dept.id);
          router.push(`${window.location.pathname}?${next}`);
        },
      });
    });

    return list;
  }, [isAdmin, departments, scopeSuffix, department, searchParams, router]);

  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q),
    );
  }, [items, query]);

  // Global keydown handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  const executeItem = (item: CommandItem) => {
    setIsOpen(false);
    if (item.action) {
      item.action();
    } else if (item.href) {
      router.push(item.href);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev === 0 ? filteredItems.length - 1 : prev - 1,
      );
    } else if (e.key === "Enter" && filteredItems[selectedIndex]) {
      e.preventDefault();
      executeItem(filteredItems[selectedIndex]);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-xs text-slate-500 hover:border-slate-300 hover:bg-slate-100 transition-colors"
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5 text-slate-400" />
        <span className="hidden sm:inline font-medium">
          Quick search & commands
        </span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 shadow-2xs">
          <Command className="h-2.5 w-2.5" /> K
        </kbd>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in-0">
          <div
            className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl transition-all"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center border-b border-slate-200 px-3 py-2.5">
              <Search className="mr-2.5 h-4 w-4 shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Type a command, page, or department..."
                className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden"
              />
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {filteredItems.length === 0 ? (
                <p className="p-6 text-center text-xs text-muted-foreground">
                  No matching commands or pages found.
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredItems.map((item, idx) => {
                    const isSelected = idx === selectedIndex;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => executeItem(item)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition-colors ${
                          isSelected
                            ? "bg-slate-900 text-white font-medium shadow-xs"
                            : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon
                            className={`h-4 w-4 ${isSelected ? "text-white" : "text-slate-500"}`}
                          />
                          <span>{item.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              isSelected
                                ? "bg-white/20 text-white"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {item.category}
                          </span>
                          {isSelected && (
                            <CornerDownLeft className="h-3 w-3 text-white/80" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              <div className="flex items-center gap-3">
                <span>↑↓ Navigate</span>
                <span>↵ Select</span>
                <span>Esc Close</span>
              </div>
              <span className="font-medium text-slate-600">
                Pravi Quick Navigation
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
