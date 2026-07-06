import type { InvestorDecision, SubmissionStatus } from "@/lib/types";

export function StatusBadge({
  status,
  decision
}: {
  status?: SubmissionStatus;
  decision?: InvestorDecision;
}) {
  const label = decision ?? status ?? "queued";
  const className = decision
    ? decision === "Invest"
      ? "invest"
      : decision === "Pass"
        ? "pass"
        : "conditions"
    : status ?? "processing";

  return <span className={`badge ${className}`}>{label}</span>;
}
