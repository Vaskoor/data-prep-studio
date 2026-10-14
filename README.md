# Data Prep Studio

> A professional, full-stack data-preparation studio — **profile · clean ·
> transform · export** any dataset, with an AI assistant that suggests
> data-quality operations. Built for researchers and analysts who need a
> practical, reproducible, PhD-grade data-prep workflow.

<p align="center">
  <img alt="Framework" src="https://img.shields.io/badge/Next.js-16-black?logo=next.js">
  <img alt="Language" src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript">
  <img alt="Styling" src="https://img.shields.io/badge/Tailwind-4-cyan?logo=tailwindcss">
  <img alt="UI" src="https://img.shields.io/badge/UI-shadcn%20%2B%20recharts-slate">
  <img alt="DB" src="https://img.shields.io/badge/DB-Prisma%20%2B%20SQLite-2D3748?logo=prisma">
  <img alt="AI" src="https://img.shields.io/badge/AI-z--ai--web--dev--sdk-emerald">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-emerald.svg">
</p>

---

## Why

High-quality data preparation is the most expensive part of any analytics or
ML project. **Data Prep Studio** gives you a polished web UI on top of a
strong, type-safe backend: load any CSV/JSON, get an instant **statistical
profile** per column (with histograms, top values, outlier counts, missing
ratios), apply a pipeline of **cleaning** and **transform** operations, let
an **AI data-quality expert** suggest what to fix, and export the cleaned
dataset — all reproducible, all in one place.

## Features

### Profiling engine (Phase 1)
- **Type inference** — numeric / categorical / datetime / boolean / text, per column.
- **Numeric stats** — min, max, mean, median, std, Q1/Q3, IQR, 10-bin histogram, IQR outlier count.
- **Categorical stats** — cardinality, top-10 values with percentages.
- **Quality scoring** — completeness, uniqueness, consistency, validity → overall 0–100.
- Missing-cell count, duplicate-row detection.

### Cleaning operations (Phase 2)
- `drop_missing`, `impute` (mean/median/mode/constant), `drop_duplicates`,
  `fix_types`, `trim_whitespace`, `standardize_case`, `remove_outliers`
  (IQR / z-score). Each op logs affected-row count.

### Transforms (Phase 3)
- `normalize` (min-max), `standardize` (z-score), `onehot_encode`,
  `label_encode`, `bin_equal_width`, `bin_equal_freq`, `date_parts`,
  `text_length`. Original columns are preserved; derived columns get a
  suffixed name.

### AI data-quality assistant (Phase 4)
- A one-click **"Suggest cleaning"** button sends the profile to an LLM
  (`z-ai-web-dev-sdk`) that returns up to 5 ranked `CleaningOp`s, each with
  a rationale. Select the ones you want and apply in one shot. Falls back to
  a rule-based suggester (impute medians/modes, trim whitespace, drop
  duplicates, remove outliers) if the LLM is unavailable.

### Export (Phase 5)
- Download the cleaned dataset as RFC-4180 CSV (proper quoting + CRLF).

### Professional UI
- Sticky backdrop-blur header, gradient logo, emerald/slate/amber/rose palette.
- Responsive dashboard: dataset list (left) + 6-tab workspace (right):
  **Overview · Columns · Cleaning · Transforms · AI · Export**.
- recharts visualizations (histograms, top-value bars, quality radial gauge).
- Accessible (ARIA, keyboard), with toast feedback on every action.

## Architecture

```
 Browser (Next.js App Router, shadcn/ui, recharts)
        │  fetch
        ▼
 API routes  (/api/dataprep/datasets/… )
        │  parseCSV / profileDataset / applyCleaning / applyTransforms
        ▼
 Data-prep library  (src/lib/dataprep/ — pure TS, no runtime deps but papaparse)
        │  read/write rows
        ▼
 Store  (data/uploads/<id>.json  +  Prisma/SQLite for metadata + cached profile)
```

- **Frontend**: Next.js 16 App Router, React 19, Tailwind 4, shadcn/ui, recharts, framer-motion.
- **Backend**: Next.js API routes (Node runtime), Prisma + SQLite (`Dataset` model: metadata, columns, cached profile, operations log).
- **Library**: `src/lib/dataprep/` — a pure-TypeScript data-prep engine (types, stats, parse, profile, clean, transform, quality). Importable from API routes **and** client.
- **AI**: `z-ai-web-dev-sdk` LLM for cleaning suggestions (with a deterministic rule-based fallback).

## Repository layout

```
data-prep-studio/
├── prisma/schema.prisma        # Dataset model
├── src/
│   ├── app/
│   │   ├── api/dataprep/datasets/   # upload · list · get · delete · profile · clean · transform · export · ai-suggest
│   │   ├── layout.tsx · page.tsx · globals.css
│   ├── components/
│   │   ├── dataprep/            # header · footer · upload · list · workspace · panels (12)
│   │   └── ui/                 # shadcn/ui primitives
│   └── lib/
│       ├── dataprep/           # types · stats · parse · profile · clean · transform · quality · index
│       ├── dataprep-store.ts   # rows persistence (JSON file + in-mem fallback)
│       ├── db.ts               # Prisma client
│       └── utils.ts            # cn() helper
├── public/                     # logo
├── package.json · tsconfig.json · next.config.ts · tailwind.config.ts · postcss.config.mjs · components.json
└── README.md · .gitignore · LICENSE (MIT)
```

## Quick start

```bash
git clone https://github.com/Vaskoor/data-prep-studio.git
cd data-prep-studio
bun install                 # or: npm install
cp .env.example .env        # set DATABASE_URL (SQLite default works out of the box)
bun run db:push             # create the Dataset table
bun run dev                 # http://localhost:3000
```

Open the app → **Sample** tab → **Load sample dataset** → explore the 6 tabs.
Or paste your own CSV in the **Paste** tab, or drop a `.csv`/`.json` file in
the **File** tab.

## API

| Method | Route | Body / Query | Returns |
|--------|-------|--------------|---------|
| `POST` | `/api/dataprep/datasets` | `{name, filename, source:"csv"\|"json", content}` or `{source:"sample"}` | `{meta, profile}` |
| `GET`  | `/api/dataprep/datasets` | — | `DatasetMeta[]` |
| `GET`  | `/api/dataprep/datasets/[id]` | — | `{meta, profile, sample, operations}` |
| `DELETE` | `/api/dataprep/datasets/[id]` | — | `{ok}` |
| `POST` | `/api/dataprep/datasets/[id]/profile` | — | `{profile}` |
| `POST` | `/api/dataprep/datasets/[id]/clean` | `{ops: CleaningOp[]}` | `{profile, log, sample}` |
| `POST` | `/api/dataprep/datasets/[id]/transform` | `{ops: TransformOp[]}` | `{profile, log, sample}` |
| `GET`  | `/api/dataprep/datasets/[id]/export?format=csv` | — | CSV file download |
| `POST` | `/api/dataprep/datasets/[id]/ai-suggest` | `{profile}` | `{suggestions: CleaningOp[], raw}` |

## Reproducibility & privacy

- All processing is **in-session** — no data leaves your machine except the
  profile JSON sent to the LLM for AI suggestions (and only when you click
  "Suggest cleaning").
- The data-prep library is **deterministic** (no `Math.random`; stable
  tie-breaks) and **side-effect-free** (inputs are deep-cloned).
- The AI suggester has a deterministic rule-based fallback.

## Limitations

- Designed for tabular CSV/JSON datasets up to a few hundred thousand rows
  (rows are held in memory + a JSON file; not a streaming engine yet).
- The LLM suggestions are advisory — always review before applying.

## License

MIT — see [`LICENSE`](LICENSE).
