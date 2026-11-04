import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  FileSearch,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ScanEye,
  Sun,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useMe } from "@/hooks/useApi";
import { useTheme } from "@/lib/theme-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/audits", label: "Audits", icon: FileSearch },
  { href: "/findings", label: "Findings", icon: ScanEye },
  { href: "/methodology", label: "Methodology", icon: BookOpen },
];

function isActive(current: string, href: string, exact?: boolean) {
  if (exact) return current === href;
  return current === href || current.startsWith(`${href}/`);
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Primary">
      {NAV.map((item) => {
        const active = isActive(location, item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition-colors",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <item.icon className={cn("h-[17px] w-[17px]", active ? "opacity-100" : "opacity-70")} strokeWidth={1.9} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function AccountMenu() {
  const { data } = useMe();
  const [, setLocation] = useLocation();

  const signOut = async () => {
    await api.post("/api/auth/logout");
    setLocation("/login");
    window.location.reload();
  };

  const label = data?.mode === "demo" ? "Demo workspace" : (data?.user?.name ?? "Account");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors hover:bg-muted">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">
            {label.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-[120px] truncate sm:block">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-[13px] font-medium">{label}</div>
          <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            {data?.mode === "demo" ? "Read-only sample data" : (data?.user?.email ?? "")}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="text-[13px]">
          <LogOut className="mr-2 h-3.5 w-3.5" />
          {data?.mode === "demo" ? "Leave demo" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data } = useMe();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDemo = data?.mode === "demo";

  const sidebar = (
    <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-16 items-center px-5">
        <Link href="/" aria-label="DesignLens home">
          <Brand />
        </Link>
      </div>
      <div className="px-3 pb-2">
        <div className="mb-3 rounded-lg border bg-background/60 px-2.5 py-2">
          <div className="label-caps text-[10px]">Workspace</div>
          <div className="mt-0.5 truncate text-[12.5px] font-medium">
            {data?.workspace?.name ?? "My workspace"}
          </div>
          {isDemo && (
            <div className="mt-1.5 inline-flex items-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-foreground">
              Demo · read-only
            </div>
          )}
        </div>
        <NavList onNavigate={() => setMobileOpen(false)} />
      </div>
      <div className="mt-auto px-3 pb-4">
        <div className="hairline mb-3" />
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          See beyond the interface.
          <br />
          Improve every experience.
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[268px] p-0">
          {sidebar}
        </SheetContent>
        <div className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open navigation">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <Link href="/" aria-label="DesignLens home">
              <Brand compact />
            </Link>
            <span className="text-[13px] font-semibold">DesignLens</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <AccountMenu />
          </div>
        </div>
      </Sheet>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 hidden h-14 items-center justify-end gap-2 border-b border-border/70 bg-background/85 px-6 backdrop-blur lg:flex">
          {isDemo && (
            <span className="mr-auto inline-flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-[11px] text-muted-foreground">
              <BarChart3 className="h-3 w-3" />
              Exploring the demo workspace — data is sample content and cannot be modified
            </span>
          )}
          <ThemeToggle />
          <AccountMenu />
        </header>
        <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="label-caps mb-1.5">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] sm:text-[26px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
