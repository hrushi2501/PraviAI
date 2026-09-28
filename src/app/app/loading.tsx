export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-5">
      <p className="text-sm text-muted-foreground">Loading workspace…</p>
      <div className="h-8 max-w-xs animate-pulse rounded-md bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-28 animate-pulse rounded-lg border bg-card"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg border bg-card" />
    </div>
  );
}
