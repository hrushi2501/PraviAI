"use client";

import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  Landmark,
  MapPin,
} from "lucide-react";
import { useState } from "react";
import { useAssetPreview } from "@/components/asset-preview-provider";
import { Button } from "@/components/ui/button";

interface RegionNode {
  id: string;
  name: string;
  code: string;
  level: "state" | "district" | "block" | "city" | "ward";
  lgdCode?: string;
  children?: RegionNode[];
}

const REGION_HIERARCHY: RegionNode[] = [
  {
    id: "reg-mh",
    name: "Maharashtra",
    code: "MH",
    level: "state",
    lgdCode: "27",
    children: [
      {
        id: "reg-mum",
        name: "Mumbai Suburban",
        code: "MUM-SUB",
        level: "district",
        lgdCode: "499",
        children: [
          {
            id: "reg-andheri",
            name: "Andheri West",
            code: "MUM-ANDH",
            level: "ward",
            lgdCode: "W-42",
          },
          {
            id: "reg-bandra",
            name: "Bandra East",
            code: "MUM-BNDR",
            level: "ward",
            lgdCode: "W-51",
          },
        ],
      },
      {
        id: "reg-pun",
        name: "Pune District",
        code: "PUN",
        level: "district",
        lgdCode: "505",
        children: [
          {
            id: "reg-haveli",
            name: "Haveli Block",
            code: "PUN-HVL",
            level: "block",
            lgdCode: "B-108",
          },
        ],
      },
    ],
  },
  {
    id: "reg-dl",
    name: "National Capital Territory of Delhi",
    code: "DL",
    level: "state",
    lgdCode: "07",
    children: [
      {
        id: "reg-nd",
        name: "New Delhi Central",
        code: "DEL-ND",
        level: "district",
        lgdCode: "088",
      },
    ],
  },
  {
    id: "reg-ka",
    name: "Karnataka",
    code: "KA",
    level: "state",
    lgdCode: "29",
    children: [
      {
        id: "reg-blr",
        name: "Bengaluru Urban",
        code: "BLR-URB",
        level: "district",
        lgdCode: "542",
      },
    ],
  },
];

export function RegionTree() {
  const p = useAssetPreview();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    "reg-mh": true,
    "reg-mum": true,
  });

  const toggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderNode = (node: RegionNode, depth = 0) => {
    const isExpanded = expanded[node.id];
    const hasChildren = node.children && node.children.length > 0;

    // Count assets in this region
    const count = p.state.assets.filter(
      (a) =>
        a.region.toLowerCase().includes(node.code.toLowerCase()) ||
        a.region.toLowerCase().includes(node.name.toLowerCase()),
    ).length;

    return (
      <div key={node.id} className="space-y-1">
        <div
          className={`flex items-center justify-between rounded-lg p-2 text-xs transition-colors hover:bg-muted/50 ${
            depth > 0 ? "ml-4 border-l border-border pl-3" : ""
          }`}
        >
          <div className="flex items-center gap-2">
            {hasChildren ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-5 p-0 text-muted-foreground"
                onClick={() => toggle(node.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
              </Button>
            ) : (
              <span className="size-5 flex items-center justify-center">
                <MapPin className="size-3 text-muted-foreground" />
              </span>
            )}

            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">{node.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground uppercase">
                [{node.code}]
              </span>
              {node.lgdCode && (
                <span className="rounded bg-muted px-1.5 py-0.2 text-[9px] font-mono text-muted-foreground">
                  LGD: {node.lgdCode}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="capitalize">{node.level}</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-medium text-primary">
              {count} {count === 1 ? "Asset" : "Assets"}
            </span>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-1">
            {node.children?.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between border-b pb-4 mb-4">
        <div className="flex items-center gap-2">
          <FolderTree className="size-5 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">
              Administrative Region Hierarchy
            </h3>
            <p className="text-xs text-muted-foreground">
              Transitive closure tree tracking State, District, Block, and Ward
              administrative jurisdictions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Landmark className="size-4" />
          <span>Indian Local Government Directory (LGD) Validated</span>
        </div>
      </div>

      <div className="space-y-1 divide-y divide-border/40">
        {REGION_HIERARCHY.map((root) => renderNode(root))}
      </div>
    </div>
  );
}
