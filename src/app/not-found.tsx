import { Boxes, FileQuestion, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-xs text-center space-y-6">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <FileQuestion className="size-7" />
        </div>
        <div className="space-y-2">
          <span className="inline-block rounded-full bg-muted px-3 py-1 text-xs font-mono font-medium text-muted-foreground">
            Error 404
          </span>
          <h1 className="text-2xl font-bold tracking-tight">
            Record or Page Not Found
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The requested asset, route, or department scope does not exist, has
            been relocated, or is outside your current authorized permissions.
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-center">
          <Link
            href="/app/dashboard"
            className={buttonVariants({ size: "default" })}
          >
            <LayoutDashboard className="size-4" />
            Dashboard
          </Link>
          <Link
            href="/app/assets"
            className={buttonVariants({ variant: "outline", size: "default" })}
          >
            <Boxes className="size-4" />
            Asset Register
          </Link>
        </div>

        <div className="border-t pt-4">
          <p className="text-xs text-muted-foreground">
            If you were following an official document link or believe this is
            an access error, contact your department authority administrator.
          </p>
        </div>
      </div>
    </main>
  );
}
