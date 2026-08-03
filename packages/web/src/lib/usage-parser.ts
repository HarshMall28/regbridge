/**
 * Parses the French `identifiant_usage` string format.
 *
 * Format: "Crop*TreatmentType*Target"
 * Examples:
 *   "Avoine*Trt Part.Aer.*Oïdium(s)"       → { crop: "Avoine", treatment: "Trt Part.Aer.", target: "Oïdium(s)" }
 *   "Blé*Trt Sem.*Carie(s)"                 → { crop: "Blé",    treatment: "Trt Sem.",      target: "Carie(s)" }
 *   "Pommier*Fumig.*Chancre à Nectria"      → { crop: "Pommier", treatment: "Fumig.",       target: "Chancre à Nectria" }
 *
 * Display: "Crop · Target" (treatment available on expand/hover)
 */

export interface ParsedUsage {
  crop: string;
  treatment: string;
  target: string;
  /** Display string: "Crop · Target" */
  display: string;
  /** Original raw string */
  raw: string;
}

export function parseUsage(raw: string | null): ParsedUsage {
  if (!raw) {
    return { crop: "", treatment: "", target: "", display: "—", raw: raw ?? "" };
  }

  const parts = raw.split("*");

  if (parts.length < 3) {
    // Fallback: if format doesn't match, show the whole string
    return { crop: raw, treatment: "", target: "", display: raw, raw };
  }

  const crop = parts[0].trim();
  const treatment = parts[1].trim();
  // Target may itself contain * in edge cases — join remaining parts
  const target = parts.slice(2).join(" · ").trim();

  return {
    crop,
    treatment,
    target,
    display: `${crop} · ${target}`,
    raw,
  };
}

/**
 * Format a dose value + unit for display.
 * Example: (0.8, "L/ha") → "0.8 L/ha"
 */
export function formatDose(
  value: number | string | null,
  unit: string | null
): string {
  if (value == null) return "—";
  return `${value}${unit ? ` ${unit}` : ""}`;
}

/**
 * Format PHI (pre-harvest interval) in days.
 * Example: 35 → "35d"
 */
export function formatPHI(days: number | null): string {
  if (days == null) return "—";
  return `${days}d`;
}

/**
 * Format ZNT (buffer zone) in meters.
 * Example: 5 → "5m"
 */
export function formatZNT(meters: number | null): string {
  if (meters == null) return "—";
  return `${meters}m`;
}
