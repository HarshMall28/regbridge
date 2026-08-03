#!/bin/bash
# ==============================================================
# Run from monorepo root:  bash setup-web.sh
# ==============================================================

set -e

mkdir -p packages/web/src/{routes/substances,routes/products/\$country,routes/companies,components,lib,styles}

# Config files
touch packages/web/package.json
touch packages/web/app.config.ts
touch packages/web/tsconfig.json
touch packages/web/tailwind.config.ts
touch packages/web/postcss.config.js

# Single source of truth for design
touch packages/web/src/lib/tokens.ts

# Styles
touch packages/web/src/styles/app.css

# API layer
touch packages/web/src/lib/api.ts
touch packages/web/src/lib/hooks.ts
touch packages/web/src/lib/palette-scoring.ts

# Routes (TanStack Start file-based routing)
touch packages/web/src/routes/__root.tsx
touch packages/web/src/routes/index.tsx
touch "packages/web/src/routes/substances/\$identifier.tsx"
touch "packages/web/src/routes/products/\$country/\$id.tsx"
touch "packages/web/src/routes/companies/\$name.tsx"

# Components
for comp in CommandPalette TopBar SubstanceProfile ToxTable ProductTable \
  EmergencyAuthTable MrlCheck CountryGrid DocumentsList LegislationLinks \
  StatusBadge Pagination MetricsGrid SubstanceCard CompanyPortfolio; do
  touch "packages/web/src/components/${comp}.tsx"
done

echo ""
echo "✓ packages/web/ structure created"
echo ""
echo "Directory tree:"
find packages/web -type f | sort
echo ""
echo "Next: cd packages/web && bun install"
