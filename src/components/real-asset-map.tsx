"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  LocateFixed,
  Minus,
  Plus,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clampZoom,
  fitCoordinates,
  type MapCoordinate,
  project,
  unproject,
  visibleTiles,
  zoomAroundPoint,
} from "@/lib/map-projection";
import {
  getPersistedMapAction,
  updateMapGeotagAction,
} from "@/server/actions/map.actions";

type InputFilters = NonNullable<Parameters<typeof getPersistedMapAction>[0]>;
type Result = Awaited<ReturnType<typeof getPersistedMapAction>>;
type MapData = Extract<Result, { success: true }>["data"];
type Asset = MapData["items"][number];
const selectClass = "h-10 rounded-md border bg-card px-3 text-sm";

export function RealAssetMap() {
  const params = useSearchParams();
  const departmentId = params.get("department") ?? "";
  return <ScopedMap key={departmentId} departmentId={departmentId} />;
}

function ScopedMap({ departmentId }: { departmentId: string }) {
  const [condition, setCondition] = useState<InputFilters["condition"]>();
  const [registrationStatus, setRegistrationStatus] =
    useState<InputFilters["registrationStatus"]>();
  const [criticality, setCriticality] = useState<InputFilters["criticality"]>();
  const [selected, setSelected] = useState<Asset | null>(null);
  const [notice, setNotice] = useState("");
  const cache = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: [
      "persisted-map",
      departmentId,
      condition,
      registrationStatus,
      criticality,
    ],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const result = await getPersistedMapAction({
        departmentId: departmentId || undefined,
        condition,
        registrationStatus,
        criticality,
        page: pageParam,
        pageSize: 200,
        mapping: "all",
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    getNextPageParam: (last) =>
      last.page < last.pageCount ? last.page + 1 : undefined,
  });
  const data = query.data?.pages[0];
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const mapped = items.filter(
    (asset): asset is Asset & MapCoordinate =>
      asset.latitude !== null && asset.longitude !== null,
  );
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Asset map</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Locate registered assets, inspect their condition and correct missing
          geotags.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
        <label className="flex flex-col gap-1 text-sm">
          Condition
          <select
            className={selectClass}
            value={condition ?? ""}
            onChange={(e) => {
              setCondition(
                e.target.value
                  ? (e.target.value as InputFilters["condition"])
                  : undefined,
              );
              setSelected(null);
            }}
          >
            <option value="">All conditions</option>
            {["good", "fair", "poor", "critical", "unknown"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Registration
          <select
            className={selectClass}
            value={registrationStatus ?? ""}
            onChange={(e) => {
              setRegistrationStatus(
                e.target.value
                  ? (e.target.value as InputFilters["registrationStatus"])
                  : undefined,
              );
              setSelected(null);
            }}
          >
            <option value="">All registrations</option>
            {["draft", "submitted", "verified", "correction_required"].map(
              (v) => (
                <option key={v} value={v}>
                  {v.replaceAll("_", " ")}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Criticality
          <select
            className={selectClass}
            value={criticality ?? ""}
            onChange={(e) => {
              setCriticality(
                e.target.value
                  ? (e.target.value as InputFilters["criticality"])
                  : undefined,
              );
              setSelected(null);
            }}
          >
            <option value="">All criticalities</option>
            {["low", "medium", "high", "unknown"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <Button
          className="self-end"
          variant="outline"
          onClick={() => query.refetch()}
        >
          Refresh assets
        </Button>
      </div>
      {notice && (
        <output className="block rounded-md border bg-muted/40 p-3 text-sm">
          {notice}
        </output>
      )}
      {query.isPending ? (
        <output>Loading assets…</output>
      ) : query.isError ? (
        <div role="alert" className="rounded-md border p-5">
          <p>{query.error.message}</p>
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        data && (
          <>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <span>
                {data.scopeCounts.total.toLocaleString("en-IN")} assets in scope
              </span>
              <span>
                {data.scopeCounts.mapped.toLocaleString("en-IN")} geotagged
              </span>
              <span>
                {data.scopeCounts.unmapped.toLocaleString("en-IN")} without
                coordinates
              </span>
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <TileMap
                assets={mapped}
                bounds={data.fitBounds}
                selected={selected?.assetId}
                onSelect={setSelected}
              />
              <div className="rounded-lg border bg-card p-4">
                <h2 className="font-semibold">
                  {selected ? selected.name : "Select an asset"}
                </h2>
                {selected ? (
                  <>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selected.assetCode} · {selected.departmentName}
                    </p>
                    <dl className="mt-4 space-y-2 text-sm">
                      <div>
                        <dt className="text-muted-foreground">
                          Current condition
                        </dt>
                        <dd>
                          {selected.currentCondition} ·{" "}
                          {selected.assessmentFreshness}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Region</dt>
                        <dd>{selected.regionName ?? "Not assigned"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Coordinates</dt>
                        <dd>
                          {selected.latitude === null ||
                          selected.longitude === null
                            ? "Not recorded"
                            : `${selected.latitude.toFixed(6)}, ${selected.longitude.toFixed(6)}`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          Registration / availability
                        </dt>
                        <dd>
                          {selected.registrationStatus} /{" "}
                          {selected.availability}
                        </dd>
                      </div>
                    </dl>
                    <Link
                      className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
                      href={`/app/assets/${selected.assetId}?department=${selected.departmentId}`}
                    >
                      Open asset record →
                    </Link>
                    {selected.canEditGeotag && (
                      <GeotagEditor
                        key={`${selected.assetId}:${selected.version}`}
                        asset={selected}
                        onSaved={() => {
                          setSelected(null);
                          setNotice(
                            "Geotag saved. Verified assets return to submitted status for independent review.",
                          );
                          cache.invalidateQueries({
                            queryKey: ["persisted-map"],
                          });
                          cache.invalidateQueries({
                            queryKey: ["registered-assets"],
                          });
                        }}
                      />
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Select a marker or an asset below to open its record and
                    view geotag permissions.
                  </p>
                )}
              </div>
            </div>
            <section className="rounded-lg border bg-card">
              <div className="border-b p-4">
                <h2 className="font-semibold">Assets in scope</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {items.length.toLocaleString("en-IN")} of{" "}
                  {data.total.toLocaleString("en-IN")} records loaded ·{" "}
                  {mapped.length.toLocaleString("en-IN")} markers plotted.
                  Assets without coordinates stay in this list.
                </p>
              </div>
              {!items.length ? (
                <p className="p-6 text-sm text-muted-foreground">
                  No assets match your department and filters.
                </p>
              ) : (
                <ul className="max-h-80 overflow-auto divide-y">
                  {items.map((asset) => (
                    <li
                      key={asset.assetId}
                      className="flex items-center justify-between gap-3 p-3 text-sm"
                    >
                      <button
                        type="button"
                        className="min-h-11 text-left hover:text-primary"
                        onClick={() => setSelected(asset)}
                      >
                        <span className="font-medium">{asset.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {asset.assetCode} · {asset.departmentName} ·{" "}
                          {asset.latitude === null || asset.longitude === null
                            ? "Geotag missing"
                            : asset.currentCondition}
                        </span>
                      </button>
                      <Link
                        className="min-h-11 content-center text-primary hover:underline"
                        href={`/app/assets/${asset.assetId}?department=${asset.departmentId}`}
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {query.hasNextPage && (
                <div className="border-t p-4">
                  <Button
                    variant="outline"
                    disabled={query.isFetchingNextPage}
                    onClick={() => query.fetchNextPage()}
                  >
                    {query.isFetchingNextPage
                      ? "Loading…"
                      : "Load 200 more assets"}
                  </Button>
                </div>
              )}
            </section>
          </>
        )
      )}
    </div>
  );
}

function TileMap({
  assets,
  bounds,
  selected,
  onSelect,
}: {
  assets: Array<Asset & MapCoordinate>;
  bounds: MapData["fitBounds"];
  selected?: string;
  onSelect: (asset: Asset) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 500 });
  const [view, setView] = useState({
    center: { latitude: 22.5, longitude: 79 },
    zoom: 5.0,
  });
  const [tileError, setTileError] = useState(false);

  // High-performance animation and interaction refs
  const currentViewRef = useRef(view);
  const targetViewRef = useRef(view);
  const animFrameRef = useRef<number | null>(null);
  const animatingRef = useRef(false);
  const lastSettledBaseZoomRef = useRef(Math.round(view.zoom));

  const drag = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    lastTime: number;
    vx: number;
    vy: number;
    startCenter: MapCoordinate;
    zoom: number;
  } | null>(null);

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Smooth animation loop using high-frequency requestAnimationFrame
  const startAnimation = useCallback(() => {
    if (animatingRef.current) return;
    animatingRef.current = true;

    const tick = () => {
      const cur = currentViewRef.current;
      const tgt = targetViewRef.current;

      const zoomDiff = tgt.zoom - cur.zoom;
      const latDiff = tgt.center.latitude - cur.center.latitude;
      const lngDiff = tgt.center.longitude - cur.center.longitude;

      if (
        Math.abs(zoomDiff) > 0.0005 ||
        Math.abs(latDiff) > 0.000001 ||
        Math.abs(lngDiff) > 0.000001
      ) {
        // Silky smooth easing factor (22% step per frame = physical momentum)
        const factor = 0.22;
        const nextZoom = cur.zoom + zoomDiff * factor;
        const nextCenter = {
          latitude: cur.center.latitude + latDiff * factor,
          longitude: cur.center.longitude + lngDiff * factor,
        };

        currentViewRef.current = { center: nextCenter, zoom: nextZoom };
        setView({ center: nextCenter, zoom: nextZoom });
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        currentViewRef.current = tgt;
        setView(tgt);
        lastSettledBaseZoomRef.current = Math.round(tgt.zoom);
        animatingRef.current = false;
        animFrameRef.current = null;
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  // Scroll wheel & trackpad pinch listener (non-passive preventDefault)
  useEffect(() => {
    const node = container.current;
    if (!node) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      let zoomDelta: number;
      if (e.ctrlKey) {
        // macOS trackpad pinch
        zoomDelta = -e.deltaY * 0.015;
      } else if (Math.abs(e.deltaY) < 30) {
        // Continuous trackpad scroll
        zoomDelta = -e.deltaY * 0.004;
      } else {
        // Standard mouse wheel notch (±100 or ±120)
        zoomDelta =
          -Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY) * 0.002, 0.45);
      }

      const curTargetZoom = targetViewRef.current.zoom;
      const curTargetCenter = targetViewRef.current.center;
      const nextZoom = clampZoom(curTargetZoom + zoomDelta);

      if (Math.abs(nextZoom - curTargetZoom) < 0.0001) return;

      const nextCenter = zoomAroundPoint(
        curTargetCenter,
        curTargetZoom,
        nextZoom,
        cursorX,
        cursorY,
        size.width,
        size.height,
      );

      targetViewRef.current = { center: nextCenter, zoom: nextZoom };
      startAnimation();
    };

    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", handleWheel);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [size.width, size.height, startAnimation]);

  function smoothPan(dx: number, dy: number) {
    const current = targetViewRef.current;
    const point = project(current.center, current.zoom);
    const nextCenter = unproject(
      {
        x: point.x + dx,
        y: Math.max(0, Math.min(256 * 2 ** current.zoom, point.y + dy)),
      },
      current.zoom,
    );
    targetViewRef.current = { center: nextCenter, zoom: current.zoom };
    startAnimation();
  }

  function smoothZoom(delta: number) {
    const curTargetZoom = targetViewRef.current.zoom;
    const nextZoom = clampZoom(curTargetZoom + delta);
    targetViewRef.current = {
      center: targetViewRef.current.center,
      zoom: nextZoom,
    };
    startAnimation();
  }

  function fit() {
    const coordinates = bounds
      ? [
          { latitude: bounds.minLat, longitude: bounds.minLng },
          { latitude: bounds.maxLat, longitude: bounds.maxLng },
        ]
      : [];
    const fitted = fitCoordinates(coordinates, size.width, size.height);
    targetViewRef.current = fitted;
    startAnimation();
  }

  const currentBaseZoom = Math.round(view.zoom);
  const primaryTiles = visibleTiles(
    view.center,
    view.zoom,
    size.width,
    size.height,
    1,
  );

  // Dual-layer persistence: keep previous base zoom tiles rendered underneath if different
  const hasFallbackLayer =
    lastSettledBaseZoomRef.current !== currentBaseZoom &&
    lastSettledBaseZoomRef.current >= 3 &&
    lastSettledBaseZoomRef.current <= 19;

  const fallbackTiles = hasFallbackLayer
    ? visibleTiles(
        view.center,
        view.zoom,
        size.width,
        size.height,
        0,
        lastSettledBaseZoomRef.current,
      )
    : [];

  const centerPoint = project(view.center, view.zoom);

  const directions = [
    { label: "Pan north", icon: ArrowUp, dx: 0, dy: -150 },
    { label: "Pan west", icon: ArrowLeft, dx: -150, dy: 0 },
    { label: "Pan east", icon: ArrowRight, dx: 150, dy: 0 },
    { label: "Pan south", icon: ArrowDown, dx: 0, dy: 150 },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          className="min-h-11"
          aria-label="Zoom in"
          disabled={view.zoom >= 18.5}
          onClick={() => smoothZoom(1)}
        >
          <Plus />
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          aria-label="Zoom out"
          disabled={view.zoom <= 3.5}
          onClick={() => smoothZoom(-1)}
        >
          <Minus />
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={!bounds}
          onClick={fit}
        >
          <LocateFixed />
          Fit scope
        </Button>
        {directions.map(({ label, icon: Icon, dx, dy }) => (
          <Button
            variant="ghost"
            className="min-h-11"
            key={label}
            aria-label={label}
            onClick={() => smoothPan(dx, dy)}
          >
            <Icon />
          </Button>
        ))}
        <span className="ml-auto text-xs font-mono text-muted-foreground px-2 py-1 rounded bg-muted">
          Zoom {view.zoom.toFixed(1)}x
        </span>
      </div>
      <div
        ref={container}
        role="application"
        aria-label="Interactive asset map. Scroll to zoom smoothly, drag to pan."
        className="relative h-[500px] overflow-hidden rounded-lg border bg-muted cursor-grab active:cursor-grabbing touch-none select-none focus-visible:outline-2 focus-visible:outline-primary"
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("button,a")) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const cursorX = e.clientX - rect.left;
          const cursorY = e.clientY - rect.top;
          const nextZoom = clampZoom(targetViewRef.current.zoom + 1.0);
          const nextCenter = zoomAroundPoint(
            targetViewRef.current.center,
            targetViewRef.current.zoom,
            nextZoom,
            cursorX,
            cursorY,
            size.width,
            size.height,
          );
          targetViewRef.current = { center: nextCenter, zoom: nextZoom };
          startAnimation();
        }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button,a")) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
            animatingRef.current = false;
          }
          targetViewRef.current = currentViewRef.current;
          drag.current = {
            startX: e.clientX,
            startY: e.clientY,
            lastX: e.clientX,
            lastY: e.clientY,
            lastTime: performance.now(),
            vx: 0,
            vy: 0,
            startCenter: currentViewRef.current.center,
            zoom: currentViewRef.current.zoom,
          };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const now = performance.now();
          const dt = Math.max(1, now - drag.current.lastTime);
          const dx = e.clientX - drag.current.lastX;
          const dy = e.clientY - drag.current.lastY;

          drag.current.vx = dx / dt;
          drag.current.vy = dy / dt;
          drag.current.lastX = e.clientX;
          drag.current.lastY = e.clientY;
          drag.current.lastTime = now;

          const totalDx = e.clientX - drag.current.startX;
          const totalDy = e.clientY - drag.current.startY;
          const startPoint = project(
            drag.current.startCenter,
            drag.current.zoom,
          );
          const nextCenter = unproject(
            {
              x: startPoint.x - totalDx,
              y: Math.max(
                0,
                Math.min(256 * 2 ** drag.current.zoom, startPoint.y - totalDy),
              ),
            },
            drag.current.zoom,
          );

          currentViewRef.current.center = nextCenter;
          targetViewRef.current.center = nextCenter;
          setView({ center: nextCenter, zoom: drag.current.zoom });
        }}
        onPointerUp={() => {
          if (!drag.current) return;
          const { vx, vy, zoom, lastTime } = drag.current;
          const now = performance.now();
          drag.current = null;

          // Pan throw momentum
          if (now - lastTime < 80) {
            const speed = Math.hypot(vx, vy);
            if (speed > 0.25) {
              const throwDx = vx * 220;
              const throwDy = vy * 220;
              const curPoint = project(currentViewRef.current.center, zoom);
              const coastCenter = unproject(
                {
                  x: curPoint.x - throwDx,
                  y: Math.max(
                    0,
                    Math.min(256 * 2 ** zoom, curPoint.y - throwDy),
                  ),
                },
                zoom,
              );
              targetViewRef.current = { center: coastCenter, zoom };
              startAnimation();
            }
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        {/* Fallback persistent tiles from previous zoom level (eliminates blank voids during zoom) */}
        {fallbackTiles.map((tile) => (
          <Image
            unoptimized
            key={`fallback-${tile.key}`}
            src={tile.url}
            alt=""
            draggable={false}
            width={Math.ceil(tile.size) + 1}
            height={Math.ceil(tile.size) + 1}
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute max-w-none select-none pointer-events-none z-0 opacity-90"
            style={{
              left: Math.round(tile.left),
              top: Math.round(tile.top),
              width: `${Math.ceil(tile.size) + 1}px`,
              height: `${Math.ceil(tile.size) + 1}px`,
              willChange: "transform, left, top",
            }}
          />
        ))}

        {/* Primary active tiles at current zoom level */}
        {primaryTiles.map((tile) => (
          <Image
            unoptimized
            key={tile.key}
            src={tile.url}
            alt=""
            draggable={false}
            width={Math.ceil(tile.size) + 1}
            height={Math.ceil(tile.size) + 1}
            referrerPolicy="strict-origin-when-cross-origin"
            onError={() => setTileError(true)}
            className="absolute max-w-none select-none pointer-events-none z-10"
            style={{
              left: Math.round(tile.left),
              top: Math.round(tile.top),
              width: `${Math.ceil(tile.size) + 1}px`,
              height: `${Math.ceil(tile.size) + 1}px`,
              willChange: "transform, left, top",
            }}
          />
        ))}

        {/* Asset Markers positioned in sync with map */}
        {assets.map((asset) => {
          const point = project(asset, view.zoom);
          const x = point.x - centerPoint.x + size.width / 2;
          const y = point.y - centerPoint.y + size.height / 2;
          if (x < -24 || x > size.width + 24 || y < -24 || y > size.height + 24)
            return null;
          return (
            <button
              type="button"
              key={asset.assetId}
              aria-label={`${asset.name}, ${asset.assetCode}, condition ${asset.currentCondition ?? "unknown"}`}
              aria-pressed={selected === asset.assetId}
              title={`${asset.name} · ${asset.currentCondition ?? "unknown"}`}
              onClick={() => onSelect(asset)}
              className={`absolute z-20 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-transform active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected === asset.assetId ? "ring-2 ring-primary scale-110" : ""}`}
              style={{
                left: Math.round(x),
                top: Math.round(y),
                willChange: "transform, left, top",
              }}
            >
              <span
                className={`size-4 rounded-full border-2 border-white shadow-md transition-colors ${asset.currentCondition === "critical" || asset.currentCondition === "poor" ? "bg-destructive" : "bg-primary"}`}
              />
            </button>
          );
        })}

        <div className="absolute bottom-0 right-0 z-30 bg-card/90 backdrop-blur-xs px-2 py-1 text-xs">
          ©{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            OpenStreetMap contributors
          </a>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Scroll with mouse wheel or pinch trackpad to zoom smoothly. Click and
        drag to pan. Double-click anywhere to zoom in. Red markers indicate poor
        or critical condition; select a marker for its exact condition.
      </p>
      {tileError && (
        <p role="alert" className="text-sm text-destructive">
          Background map tiles could not load. Asset coordinates and the list
          remain available.
        </p>
      )}
    </div>
  );
}

function GeotagEditor({
  asset,
  onSaved,
}: {
  asset: Asset;
  onSaved: () => void;
}) {
  const [latitude, setLatitude] = useState(asset.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(asset.longitude?.toString() ?? "");
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      const result = await updateMapGeotagAction({
        assetId: asset.assetId,
        expectedVersion: asset.version,
        latitude: Number(latitude),
        longitude: Number(longitude),
        reason,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: onSaved,
  });
  return (
    <form
      className="mt-5 border-t pt-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <h3 className="font-medium text-sm">Update geotag</h3>
      <p className="text-xs text-muted-foreground">
        Use verified coordinates. Updating a verified asset requires another
        independent review.
      </p>
      <label htmlFor="map-latitude" className="block text-sm">
        Latitude
        <Input
          id="map-latitude"
          type="number"
          min={6}
          max={38}
          step="any"
          required
          value={latitude}
          onChange={(e) => setLatitude(e.target.value)}
        />
      </label>
      <label htmlFor="map-longitude" className="block text-sm">
        Longitude
        <Input
          id="map-longitude"
          type="number"
          min={68}
          max={98}
          step="any"
          required
          value={longitude}
          onChange={(e) => setLongitude(e.target.value)}
        />
      </label>
      <label htmlFor="map-geotag-reason" className="block text-sm">
        Correction reason
        <Input
          id="map-geotag-reason"
          required
          maxLength={2000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
      <Button
        type="submit"
        disabled={
          mutation.isPending || !latitude || !longitude || !reason.trim()
        }
      >
        {mutation.isPending ? "Saving…" : "Save coordinates"}
      </Button>
    </form>
  );
}
