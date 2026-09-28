/dashboard: page -> Card, layout -> Button/Sheet/ThemeToggle/utils.
/: page -> Button/Card, ThemeToggle -> Button, utils.
Root: ClerkProvider/QueryProvider/ThemeProvider.
## src/app/dashboard/page.tsx
```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Workspace</h1>
        <p className="text-sm text-muted-foreground">
          Customizable dashboard shell ready for hackathon feature
          implementation.
        </p>
      </div>

      <div className="grid gap-6">
        <Card className="border-dashed border-2">
          <CardHeader>
            <CardTitle>Main Canvas</CardTitle>
            <CardDescription>
              Replace this card with your core application components and
              product features.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64 flex items-center justify-center text-sm text-muted-foreground">
            Ready for your hackathon implementation.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

```

## src/app/page.tsx
```tsx
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { ArrowRight, Code2, Database, Shield, Zap } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Navigation Header */}
      <header className="flex h-16 items-center justify-between border-b border-border px-6 md:px-12">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary font-black text-xs text-primary-foreground">
            P
          </div>
          <span className="font-bold tracking-tight text-lg">Pravi AI</span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="sm">Get Started</Button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
              Dashboard <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
            <UserButton />
          </Show>
        </div>
      </header>

      {/* Hero Shell */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <div className="max-w-2xl space-y-6">
          <div className="flex justify-center">
            <Badge variant="outline" className="px-3 py-1 font-mono text-xs">
              Hackathon Ready Boilerplate
            </Badge>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
            Build Fast. Ship Clean.
          </h1>

          <p className="text-muted-foreground text-base sm:text-lg">
            Pre-configured boilerplate with Next.js, Bun, Tailwind CSS,
            shadcn/ui, Clerk, Supabase PostgreSQL, Drizzle ORM, and Biome.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
              Open Dashboard Shell <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>

          {/* Stack Indicators */}
          <div className="grid grid-cols-2 gap-4 pt-12 text-left sm:grid-cols-4">
            <div className="rounded-lg border border-border p-4 bg-card/40">
              <Zap className="mb-2 h-5 w-5 text-primary" />
              <div className="font-semibold text-sm">Bun + Next.js</div>
              <div className="text-xs text-muted-foreground">
                Fast runtime & router
              </div>
            </div>
            <div className="rounded-lg border border-border p-4 bg-card/40">
              <Database className="mb-2 h-5 w-5 text-primary" />
              <div className="font-semibold text-sm">Supabase + Drizzle</div>
              <div className="text-xs text-muted-foreground">
                Postgres & type-safe ORM
              </div>
            </div>
            <div className="rounded-lg border border-border p-4 bg-card/40">
              <Shield className="mb-2 h-5 w-5 text-primary" />
              <div className="font-semibold text-sm">Clerk Auth</div>
              <div className="text-xs text-muted-foreground">
                Turnkey authentication
              </div>
            </div>
            <div className="rounded-lg border border-border p-4 bg-card/40">
              <Code2 className="mb-2 h-5 w-5 text-primary" />
              <div className="font-semibold text-sm">Biome + shadcn</div>
              <div className="text-xs text-muted-foreground">
                Modern UI & fast tooling
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        Ready for rapid hackathon development.
      </footer>
    </div>
  );
}

```