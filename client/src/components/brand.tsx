import { cn } from "@/lib/utils";

export function LensMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7", className)} aria-hidden="true">
      <rect width="32" height="32" rx="8.5" className="fill-foreground" />
      <circle cx="14.4" cy="14.4" r="6.1" fill="none" className="stroke-background" strokeWidth="2.3" />
      <path d="M19.1 19.1 25 25" className="stroke-background" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="14.4" cy="14.4" r="2" className="fill-[hsl(var(--low))] dark:fill-[hsl(var(--low))]" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LensMark />
      {!compact && (
        <div className="leading-none">
          <div className="text-[15px] font-semibold tracking-[-0.02em]">DesignLens</div>
          <div className="mt-1 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            UX audit platform
          </div>
        </div>
      )}
    </div>
  );
}
