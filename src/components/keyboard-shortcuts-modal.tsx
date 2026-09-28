"use client";

import { HelpCircle, X } from "lucide-react";
import { useEffect, useState } from "react";

interface ShortcutGroup {
  category: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: "Global Navigation",
    shortcuts: [
      { keys: ["⌘", "K"], description: "Open Command Palette / Fast Search" },
      { keys: ["?"], description: "Toggle this Keyboard Shortcuts dialog" },
      { keys: ["Esc"], description: "Close any open dialog, modal, or drawer" },
    ],
  },
  {
    category: "Asset Detail Workspace (/app/assets/[id])",
    shortcuts: [
      { keys: ["Alt", "1"], description: "Switch to Overview & Status tab" },
      {
        keys: ["Alt", "2"],
        description: "Switch to Inspections & Observations tab",
      },
      {
        keys: ["Alt", "3"],
        description: "Switch to Restoration Works & DSR tab",
      },
      {
        keys: ["Alt", "4"],
        description: "Switch to Grievances & Duplicates tab",
      },
      {
        keys: ["Alt", "5"],
        description: "Switch to Evidence & Tamper-Evident Files",
      },
      {
        keys: ["Alt", "6"],
        description: "Switch to Statutory Immutable Audit Trail",
      },
    ],
  },
  {
    category: "Asset Register & Queues",
    shortcuts: [
      { keys: ["/"], description: "Focus text filter input (when not typing)" },
    ],
  },
];

export function KeyboardShortcutsModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement)?.tagName,
        )
      ) {
        return;
      }

      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
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

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50/80 text-slate-500 hover:border-slate-300 hover:bg-slate-100 transition-colors"
        aria-label="Keyboard shortcuts"
        title="Keyboard Shortcuts (?)"
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in-0">
          <div
            className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-emerald-700" />
                <h2 className="text-sm font-bold text-slate-900">
                  Keyboard Shortcuts & Hotkeys
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-4 space-y-5">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.category} className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {group.category}
                  </h3>
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                    {group.shortcuts.map((item) => (
                      <div
                        key={item.description}
                        className="flex items-center justify-between px-3 py-2 text-xs"
                      >
                        <span className="text-slate-700 font-medium">
                          {item.description}
                        </span>
                        <div className="flex items-center gap-1">
                          {item.keys.map((k) => (
                            <kbd
                              key={k}
                              className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 shadow-2xs"
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-right">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
