"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Sparkles } from "lucide-react";
import { Suspense, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NAV_ITEMS, isActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 px-2 font-semibold">
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Sparkles className="size-4" />
      </span>
      Personal OS
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  // Reading the URL must happen inside <Suspense> on dynamic routes.
  return (
    <Suspense fallback={<NavLinkList onNavigate={onNavigate} />}>
      <ActiveNavLinks onNavigate={onNavigate} />
    </Suspense>
  );
}

function ActiveNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return <NavLinkList pathname={usePathname()} onNavigate={onNavigate} />;
}

function NavLinkList({ pathname, onNavigate }: { pathname?: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname !== undefined && isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SignOutButton({ signOut }: { signOut: () => Promise<void> }) {
  return (
    <form action={signOut}>
      <Button variant="ghost" size="icon" type="submit" aria-label="Sign out" title="Sign out">
        <LogOut />
      </Button>
    </form>
  );
}

/**
 * Responsive layout: fixed sidebar on desktop (lg and up), top bar with a
 * slide-out menu on smaller screens.
 */
export function AppShell({
  children,
  signOut,
}: {
  children: React.ReactNode;
  signOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 lg:flex">
        <Brand />
        <NavLinks />
        <div className="mt-auto flex items-center justify-end gap-1 px-1">
          <ThemeToggle />
          <SignOutButton signOut={signOut} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent className="gap-6 p-4">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SheetDescription className="sr-only">
                Move between sections of Personal OS
              </SheetDescription>
              <Brand />
              <NavLinks onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <Brand />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <SignOutButton signOut={signOut} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
