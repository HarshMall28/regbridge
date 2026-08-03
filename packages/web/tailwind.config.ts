import type { Config } from "tailwindcss";
import { colors, fonts } from "./src/lib/tokens";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: colors.brand.primary,
          hover: colors.brand.primaryHover,
          muted: colors.brand.primaryMuted,
        },
        surface: {
          bg: colors.surface.bg,
          card: colors.surface.card,
          sidebar: colors.surface.sidebar,
          hover: colors.surface.hover,
          active: colors.surface.active,
          overlay: colors.surface.overlay,
        },
        txt: {
          primary: colors.text.primary,
          secondary: colors.text.secondary,
          tertiary: colors.text.tertiary,
          inverse: colors.text.inverse,
        },
        border: {
          DEFAULT: colors.border.default,
          strong: colors.border.strong,
          focus: colors.border.focus,
        },
        status: {
          "approved-text": colors.status.approved.text,
          "approved-bg": colors.status.approved.bg,
          "expiring-text": colors.status.expiring.text,
          "expiring-bg": colors.status.expiring.bg,
          "withdrawn-text": colors.status.withdrawn.text,
          "withdrawn-bg": colors.status.withdrawn.bg,
          "neutral-text": colors.status.neutral.text,
          "neutral-bg": colors.status.neutral.bg,
        },
        country: {
          "auth-text": colors.country.authorized.text,
          "auth-bg": colors.country.authorized.bg,
          "no-text": colors.country.notAuthorized.text,
          "no-bg": colors.country.notAuthorized.bg,
        },
        palette: {
          highlight: colors.palette.resultHighlight,
          border: colors.palette.resultBorder,
        },
      },
      fontFamily: {
        sans: fonts.sans.split(", "),
        mono: fonts.mono.split(", "),
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      animation: {
        "palette-in": "palette-in 0.15s ease-out",
        "backdrop-in": "backdrop-in 0.15s ease-out",
      },
      keyframes: {
        "palette-in": {
          "0%": {
            opacity: "0",
            transform: "scale(0.98) translateY(-8px)",
          },
          "100%": {
            opacity: "1",
            transform: "scale(1) translateY(0)",
          },
        },
        "backdrop-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
