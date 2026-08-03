import { resolveStatus, isExpiringSoon } from "~/lib/tokens";
import type { StatusKey } from "~/lib/tokens";

const STYLE: Record<StatusKey, string> = {
  approved: "badge-approved",
  expiring: "badge-expiring",
  withdrawn: "badge-withdrawn",
  neutral: "badge-neutral",
  negative: "badge-withdrawn",
};

export function StatusBadge({ status }: { status: string | null }) {
  const key = resolveStatus(status);
  return (
    <span className={`badge ${STYLE[key]}`}>
      {status ?? "Unknown"}
    </span>
  );
}

export function ExpiryBadge({
  expiryDt,
}: {
  expiryDt: string | null;
}) {
  if (!isExpiringSoon(expiryDt)) return null;
  const months = expiryDt
    ? Math.ceil(
        (new Date(expiryDt).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24 * 30),
      )
    : 0;
  return (
    <span className="badge badge-expiring">
      {"< "}
      {months} mo
    </span>
  );
}
