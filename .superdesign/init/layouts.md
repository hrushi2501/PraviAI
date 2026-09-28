## src/app/layout.tsx
```tsx
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { QueryProvider } from "@/components/query-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Pravi AI | Reusable Hackathon Boilerplate",
  description:
    "Production-ready hackathon boilerplate built with Next.js, Bun, Tailwind CSS, shadcn/ui, Clerk, Supabase, Drizzle ORM, and Biome.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans", geist.variable)}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ClerkProvider appearance={{ theme: shadcn }}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <QueryProvider>{children}</QueryProvider>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}

```

## src/app/dashboard/layout.tsx
```tsx
import { UserButton } from "@clerk/nextjs";
import { Layers, LayoutDashboard, Menu, Settings } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Projects", href: "/dashboard", icon: Layers },
  { name: "Settings", href: "/dashboard", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 border-r border-border bg-card/50 backdrop-blur md:flex md:flex-col">
        <div className="flex h-16 items-center border-b border-border px-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-bold tracking-tight text-lg"
          >
            <div className="h-6 w-6 rounded bg-primary text-primary-foreground flex items-center justify-center font-black text-xs">
              P
            </div>
            <span>Pravi AI</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-4 text-xs text-muted-foreground">
          Hackathon Starter Shell
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            {/* Mobile Sheet Nav */}
            <Sheet>
              <SheetTrigger
                render={
                  <Button variant="ghost" size="icon" className="md:hidden">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle navigation menu</span>
                  </Button>
                }
              />
              <SheetContent side="left" className="w-64 p-0">
                <div className="flex h-16 items-center border-b border-border px-6">
                  <span className="font-bold tracking-tight text-lg">
                    Pravi AI
                  </span>
                </div>
                <nav className="space-y-1 p-4">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <Icon className="h-4 w-4" />
                        {item.name}
                      </Link>
                    );
                  })}
                </nav>
              </SheetContent>
            </Sheet>

            <span className="text-sm font-semibold text-foreground">
              Dashboard
            </span>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <UserButton />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

```