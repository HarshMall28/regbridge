// ==================================================================
// Design tokens — SINGLE SOURCE OF TRUTH
// Change colors here → Tailwind config reads from this file
//                     → Components import from this file
// ==================================================================

// --- COLORS ---

export const colors = {
  // Brand
  brand: {
    primary: "#16A34A",    // Dark institutional green (Life Scientific)
    primaryHover: "#15803D",
    primaryMuted: "#16A34A20", // 12% opacity for backgrounds
  },

  // Surfaces (light mode)
  surface: {
    bg: "#F8F9FA",        // Page background (warm off-white)
    card: "#FFFFFF",       // Card / section background
    sidebar: "#F1F3F5",    // Sidebar background
    hover: "#F3F4F6",      // Hover state
    active: "#E5E7EB",     // Active / pressed state
    overlay: "#00000060",  // Backdrop blur overlay (⌘K)
  },

  // Text
  text: {
    primary: "#111827",    // Headings, body
    secondary: "#4B5563",  // Labels, supporting text
    tertiary: "#9CA3AF",   // Muted, placeholders
    inverse: "#FFFFFF",    // Text on dark backgrounds
  },

  // Borders
  border: {
    default: "#E5E7EB",    // Card borders, table dividers
    strong: "#D1D5DB",     // Emphasized borders
    focus: "#16A34A",      // Focus ring (brand green)
  },

  // Status
  status: {
    approved: {
      text: "#16A34A",
      bg: "#DCFCE7",
    },
    expiring: {
      text: "#D97706",
      bg: "#FEF3C7",
    },
    withdrawn: {
      text: "#DC2626",
      bg: "#FEE2E2",
    },
    neutral: {
      text: "#6B7280",
      bg: "#F3F4F6",
    },
    negative: {
      text: "#DC2626",
      bg: "#FEE2E2",
    },
  },

  // Country grid
  country: {
    authorized: { text: "#16A34A", bg: "#DCFCE7" },
    notAuthorized: { text: "#9CA3AF", bg: "#F3F4F6" },
  },

  // Palette
  palette: {
    resultHighlight: "#F0FDF4",   // Light green wash
    resultBorder: "#16A34A",      // Left border on highlighted
  },
} as const;


// --- TYPOGRAPHY ---

export const fonts = {
  sans: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
} as const;


// --- STATUS MAPPING ---
// Maps API status strings → badge style

export type StatusKey = "approved" | "expiring" | "withdrawn" | "neutral" | "negative";

export function resolveStatus(raw: string | null): StatusKey {
  if (!raw) return "neutral";
  const s = raw.toUpperCase().trim();
  if (s === "APPROVED" || s === "AUTORISE" || s === "AUTORISÉ" || s === "AUTHORISED") return "approved";
  if (s === "NOT APPROVED" || s === "RETIRE" || s === "RETIRÉ" || s === "WITHDRAWN") return "withdrawn";
  return "neutral";
}

export function isExpiringSoon(expiryDt: string | null, monthsThreshold = 12): boolean {
  if (!expiryDt) return false;
  const expiry = new Date(expiryDt);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30);
  return diffMonths > 0 && diffMonths <= monthsThreshold;
}


// --- PAGINATION ---

export const PAGINATION = {
  defaultPageSize: 5,
  maxPageSize: 50,
} as const;


// --- DATA SOURCES (for homepage stats) ---

export const DATA_SOURCES = [
  { key: "eu", label: "EU Pesticides API v3.0", url: "https://ec.europa.eu/food/plant/pesticides/eu-pesticides-database" },
  { key: "oft", label: "EFSA OpenFoodTox 3.0", url: "https://zenodo.org/records/15100780" },
  { key: "pcs", label: "PCS Ireland", url: "https://www.pcs.agriculture.gov.ie" },
  { key: "fr", label: "ANSES France (e-PHY)", url: "https://ephy.anses.fr" },
  { key: "mrl", label: "EU MRL Database", url: "https://ec.europa.eu/food/plant/pesticides/eu-pesticides-database" },
] as const;


// --- SECTION ORDER (substance profile) ---
// Controls rendering order + sidebar jump links

export const SUBSTANCE_SECTIONS = [
  { id: "toxicology", label: "Toxicology" },
  { id: "ie-products", label: "IE Products" },
  { id: "fr-products", label: "FR Products" },
  { id: "emergency-auths", label: "Emergency Auths" },
  { id: "mrl-check", label: "MRL Check" },
  { id: "member-states", label: "Member States" },
  { id: "metabolites", label: "Metabolites" },     // conditional: only if names exist
  { id: "documents", label: "Documents" },
  { id: "legislation", label: "Legislation" },
] as const;


// --- EU MEMBER STATES (30 EEA countries for the grid) ---

export const EU_COUNTRIES = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES",
  "FI", "FR", "HR", "HU", "IE", "IS", "IT", "LT", "LU", "LV",
  "MT", "NL", "NO", "PL", "PT", "RO", "SE", "SI", "SK",
] as const;

export const EU_COUNTRY_NAMES: Record<string, string> = {
  AT: "Austria", BE: "Belgium", BG: "Bulgaria", CY: "Cyprus",
  CZ: "Czechia", DE: "Germany", DK: "Denmark", EE: "Estonia",
  EL: "Greece", ES: "Spain", FI: "Finland", FR: "France",
  HR: "Croatia", HU: "Hungary", IE: "Ireland", IS: "Iceland",
  IT: "Italy", LT: "Lithuania", LU: "Luxembourg", LV: "Latvia",
  MT: "Malta", NL: "Netherlands", NO: "Norway", PL: "Poland",
  PT: "Portugal", RO: "Romania", SE: "Sweden", SI: "Slovenia",
  SK: "Slovakia",
};
