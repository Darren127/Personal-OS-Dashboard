import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** A progress bar that always says where its number comes from. */
export function ProgressSummary({
  value,
  explanation,
  estimate,
  className,
  label,
}: {
  value: number | null;
  explanation: string;
  estimate?: boolean;
  className?: string;
  label: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium tabular-nums">
          {value === null ? "—" : `${value}%`}
          {estimate && value !== null && <span className="ml-1 text-xs font-normal text-muted-foreground">(estimate)</span>}
        </span>
      </div>
      <Progress value={value} label={label} />
      <p className="text-xs text-muted-foreground">{explanation}</p>
    </div>
  );
}
