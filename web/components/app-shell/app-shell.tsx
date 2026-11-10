"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChefHat,
  ChevronsUpDown,
  CircleUser,
  Home,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Target,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

export type ShellUser = { name: string | null; email: string; image: string | null };

const NAV: { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean }[] = [
  { href: "/app", label: "Overview", icon: LayoutDashboard, match: (p) => p === "/app" },
  {
    href: "/app/prices",
    label: "Prices",
    icon: LineChart,
    match: (p) => p.startsWith("/app/prices") || p.startsWith("/app/items"),
  },
  { href: "/app/kitchen", label: "My kitchen", icon: ChefHat, match: (p) => p.startsWith("/app/kitchen") },
  { href: "/app/track-record", label: "Track record", icon: Target, match: (p) => p.startsWith("/app/track-record") },
  { href: "/app/account", label: "Account", icon: CircleUser, match: (p) => p.startsWith("/app/account") },
];

function titleFor(path: string): string {
  if (path.startsWith("/app/items")) return "Item outlook";
  return NAV.find((n) => n.match(path))?.label ?? "Mila";
}

export function initials(name?: string | null, email?: string | null) {
  const src = (name || email || "?").trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function useSignOut() {
  const router = useRouter();
  return async () => {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  };
}

function NavList({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {NAV.map((n) => {
        const active = n.match(path);
        const Icon = n.icon;
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active
                  ? "bg-foreground/[0.06] font-medium text-foreground dark:bg-foreground/10"
                  : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4", active ? "text-brand" : "")} aria-hidden />
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function UserCard({ user }: { user: ShellUser }) {
  const signOut = useSignOut();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left outline-none transition-colors hover:bg-foreground/[0.04] focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:bg-foreground/[0.06]"
      >
        <Avatar className="size-8">
          {user.image ? <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" /> : null}
          <AvatarFallback className="bg-brand-soft text-xs font-medium text-brand">{initials(user.name, user.email)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{user.name || "Your account"}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={6} className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
            <span className="truncate text-sm font-medium text-foreground">{user.name || "Your account"}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/app/account" />}>
          <CircleUser aria-hidden /> Account
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/" />}>
          <Home aria-hidden /> Mila home page
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarBody({ user, path, onNavigate }: { user: ShellUser; path: string; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Link href="/app" onClick={onNavigate} aria-label="Mila overview" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Logo />
        </Link>
      </div>
      <nav aria-label="App" className="flex-1 px-2.5 pt-2">
        <NavList path={path} onNavigate={onNavigate} />
      </nav>
      <div className="mx-2.5 mb-3 rounded-lg border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Email digest</span> every Monday and Thursday evening, once your
        kitchen is set up. SMS is in pilot.
      </div>
      <div className="border-t p-2">
        <UserCard user={user} />
      </div>
    </div>
  );
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const title = titleFor(path);

  // close the mobile menu on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r bg-muted/30 lg:block">
        <SidebarBody user={user} path={path} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] border-r bg-background shadow-xl">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" aria-hidden />
            </button>
            <SidebarBody user={user} path={path} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="-ml-1.5 grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <Link href="/app" aria-label="Mila overview" className="lg:hidden">
            <LogoMark className="size-6" />
          </Link>
          <h1 className="truncate text-[15px] font-medium">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/about" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">
              How Mila works
            </Link>
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
