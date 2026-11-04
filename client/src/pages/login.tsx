import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Gauge, Layers, ShieldCheck, Sparkles } from "lucide-react";
import { Brand, LensMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const PROOF = [
  {
    icon: Gauge,
    title: "Seven audit dimensions",
    body: "Accessibility, usability, visual design, responsive behaviour, content, performance and design consistency — scored from measurements on the rendered page.",
  },
  {
    icon: ShieldCheck,
    title: "Every result is traceable",
    body: "Each finding quotes the observed value that triggered it and separates automated checks from items that need human judgement.",
  },
  {
    icon: Layers,
    title: "Reports stakeholders read",
    body: "Executive summary, prioritised roadmap and PDF, HTML or JSON export from the same dataset.",
  },
];

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"auth" | "demo" | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy("auth");
    try {
      if (mode === "signup") {
        await api.post("/api/auth/register", { email, password, name });
      } else {
        await api.post("/api/auth/login", { email, password });
      }
      // Refresh the session before navigating, otherwise the router briefly sees
      // an anonymous session and bounces back to this screen.
      await queryClient.refetchQueries({ queryKey: ["me"] });
      setLocation("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const enterDemo = async () => {
    setBusy("demo");
    setError(null);
    try {
      await api.post("/api/auth/demo");
      await queryClient.refetchQueries({ queryKey: ["me"] });
      setLocation("/");
    } catch {
      setError("The demo workspace is not available right now.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Narrative panel — always ink, independent of the active theme. */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0c1424] px-12 py-10 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.055]"
          aria-hidden="true"
          style={{
            backgroundImage:
              "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
            backgroundSize: "34px 34px",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 backdrop-blur">
              <LensMark className="h-6 w-6 [&_rect]:fill-white [&_circle]:stroke-[#0c1424]" />
            </span>
            <div>
              <div className="text-[15px] font-semibold tracking-[-0.02em]">DesignLens</div>
              <div className="text-[10.5px] uppercase tracking-[0.16em] text-white/50">UX audit platform</div>
            </div>
          </div>

          <h1 className="mt-16 max-w-[15ch] text-[38px] font-semibold leading-[1.08] tracking-[-0.035em]">
            See beyond the interface.
          </h1>
          <p className="mt-4 max-w-[38ch] text-[14.5px] leading-relaxed text-white/65">
            DesignLens audits any website or web application against seven dimensions of design quality and turns the
            measurement into findings a team can act on.
          </p>

          <div className="mt-12 space-y-6">
            {PROOF.map((item) => (
              <div key={item.title} className="flex gap-3.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/5">
                  <item.icon className="h-4 w-4 text-white/80" strokeWidth={1.8} />
                </span>
                <div>
                  <div className="text-[13px] font-medium text-white/95">{item.title}</div>
                  <p className="mt-1 max-w-[42ch] text-[12.5px] leading-relaxed text-white/55">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-[11.5px] text-white/40">
          <Sparkles className="h-3.5 w-3.5" />
          Scores come from rendered-page measurements — never estimated from a screenshot.
        </div>
      </div>

      {/* Auth panel */}
      <div className="flex flex-col justify-center px-5 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Brand />
          </div>

          <h2 className="text-[22px] font-semibold tracking-[-0.025em]">
            {mode === "signin" ? "Sign in to your workspace" : "Create your workspace"}
          </h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {mode === "signin"
              ? "Pick up where you left off — projects, audits and findings are saved to your account."
              : "One account, unlimited projects. Your first audit takes about a minute."}
          </p>

          <div className="mt-6 flex rounded-lg border p-0.5">
            {(["signin", "signup"] as const).map((value) => (
              <button
                key={value}
                onClick={() => {
                  setMode(value);
                  setError(null);
                }}
                className={
                  `flex-1 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ` +
                  (mode === value ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")
                }
              >
                {value === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-3.5">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-[12.5px]">
                  Name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Alex Rivera"
                  autoComplete="name"
                  className="h-10"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[12.5px]">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@studio.com"
                autoComplete="email"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[12.5px]">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="h-10"
              />
            </div>

            {error && (
              <p role="alert" className="text-[12.5px] font-medium text-[hsl(var(--score-weak))]">
                {error}
              </p>
            )}

            <Button type="submit" className="h-10 w-full" disabled={busy !== null}>
              {busy === "auth" ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="h-10 w-full" onClick={enterDemo} disabled={busy !== null}>
            {busy === "demo" ? "Opening demo…" : "Explore the demo workspace"}
          </Button>
          <p className="mt-2.5 text-center text-[11.5px] leading-relaxed text-muted-foreground">
            Eight sample projects with audit history and findings. Read-only, no account required.
          </p>

          <p className="mt-8 text-[11px] leading-relaxed text-muted-foreground/80">
            Accounts are local to this deployment. No third-party SSO, no tracking, and audit targets are limited to
            publicly reachable URLs.
          </p>
        </div>
      </div>
    </div>
  );
}
