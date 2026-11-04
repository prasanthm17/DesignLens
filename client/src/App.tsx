import { useEffect } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/lib/theme-provider";
import { queryClient } from "@/lib/api";
import { Toaster } from "@/components/ui/toaster";
import { useMe } from "@/hooks/useApi";
import { AppShell } from "@/components/app-shell";
import { LensMark } from "@/components/brand";
import { Button } from "@/components/ui/button";

import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import ProjectsPage from "@/pages/projects";
import ProjectDetailPage from "@/pages/project-detail";
import AuditsPage from "@/pages/audits";
import AuditNewPage from "@/pages/audit-new";
import AuditDetailPage from "@/pages/audit-detail";
import ReportPage from "@/pages/report";
import FindingsPage from "@/pages/findings";
import MethodologyPage from "@/pages/methodology";

function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <AppShell>
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <LensMark className="h-10 w-10 opacity-40" />
        <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.02em]">This page does not exist</h1>
        <p className="mt-1.5 max-w-sm text-[13px] text-muted-foreground">
          The link may be out of date. Head back to the dashboard to find your projects and audits.
        </p>
        <Button className="mt-5" onClick={() => setLocation("/")}>
          Back to dashboard
        </Button>
      </div>
    </AppShell>
  );
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-2.5 text-muted-foreground">
        <LensMark className="h-6 w-6 animate-pulse" />
        <span className="text-[13px]">Loading DesignLens…</span>
      </div>
    </div>
  );
}

function Routes() {
  const { data, isLoading } = useMe();
  const [location, setLocation] = useLocation();

  const anonymous = !isLoading && (data?.mode === "anonymous" || !data);

  useEffect(() => {
    if (anonymous && location !== "/login") setLocation("/login");
  }, [anonymous, location, setLocation]);

  if (isLoading) return <Splash />;
  if (anonymous || location === "/login") return <LoginPage />;

  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/projects" component={ProjectsPage} />
      <Route path="/projects/:id" component={ProjectDetailPage} />
      <Route path="/audits" component={AuditsPage} />
      <Route path="/audits/new" component={AuditNewPage} />
      <Route path="/audits/:id" component={AuditDetailPage} />
      <Route path="/audits/:id/report" component={ReportPage} />
      <Route path="/findings" component={FindingsPage} />
      <Route path="/methodology" component={MethodologyPage} />
      <Route path="/login">
        <Redirect to="/" />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="designlens-theme">
      <QueryClientProvider client={queryClient}>
        <Routes />
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
