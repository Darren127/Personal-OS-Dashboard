import { cn } from "@/lib/utils";

/** Simple accessible progress bar. `value` is 0–100, or null for "unknown". */
function Progress({
  value,
  className,
  label,
}: {
  value: number | null;
  className?: string;
  label: string;
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : pct}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export { Progress };
