// MIT License
//
// Copyright (c) 2025 Data Prep Studio contributors
// (see full MIT header in site-header.tsx — same license applies here.)

"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  Copy,
  Gauge,
  Hash,
  Rows3,
} from "lucide-react";
import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Profile } from "@/lib/dataprep";

/** Props for {@link ProfileOverview}. */
export interface ProfileOverviewProps {
  /** The current profile to summarise. */
  profile: Profile;
}

/**
 * StatTile — small labelled stat card with an icon swatch.
 */
function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ElementType;
  tone: "emerald" | "cyan" | "rose" | "amber" | "slate";
}) {
  const tones: Record<string, { fg: string; bg: string }> = {
    emerald: { fg: "text-emerald-600", bg: "bg-emerald-50" },
    cyan: { fg: "text-cyan-600", bg: "bg-cyan-50" },
    rose: { fg: "text-rose-600", bg: "bg-rose-50" },
    amber: { fg: "text-amber-600", bg: "bg-amber-50" },
    slate: { fg: "text-slate-600", bg: "bg-slate-100" },
  };
  const t = tones[tone] ?? tones.slate;
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${t.bg} ${t.fg}`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {label}
        </div>
        <div className="truncate text-lg font-bold text-slate-900">
          {value}
        </div>
        {hint ? (
          <div className="text-[10px] text-slate-400">{hint}</div>
        ) : null}
      </div>
    </motion.div>
  );
}

/**
 * ProfileOverview — top-level data-quality overview.
 *
 * Renders a recharts `RadialBarChart` quality gauge (0–100, colored by
 * quality band) and a grid of stat tiles: rows, columns, missing cells,
 * duplicate rows, missing %.
 */
export function ProfileOverview({ profile }: ProfileOverviewProps) {
  // `Profile.quality` is `QualityScore` with each component 0..1. Convert to
  // a 0..100 score for the gauge. Fall back to 0 if quality is missing.
  const overall01 =
    (profile?.quality && typeof profile.quality.overall === "number"
      ? profile.quality.overall
      : 0) ?? 0;
  const score = Math.max(0, Math.min(100, overall01 * 100));
  const gaugeColor =
    score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#f43f5e";
  const qualityLabel =
    score >= 80 ? "Good" : score >= 50 ? "Fair" : "Poor";
  const qualityBadge =
    score >= 80
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : score >= 50
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-rose-200 bg-rose-50 text-rose-700";

  const data = [{ name: "quality", value: score, fill: gaugeColor }];

  const totalCells = (profile?.rowCount ?? 0) * (profile?.colCount ?? 0);
  const missingPct =
    totalCells > 0
      ? ((profile?.missingCells ?? 0) / totalCells) * 100
      : 0;

  const stats = [
    {
      label: "Rows",
      value: (profile?.rowCount ?? 0).toLocaleString(),
      icon: Rows3,
      tone: "emerald" as const,
    },
    {
      label: "Columns",
      value: (profile?.colCount ?? 0).toLocaleString(),
      icon: Hash,
      tone: "cyan" as const,
    },
    {
      label: "Missing cells",
      value: (profile?.missingCells ?? 0).toLocaleString(),
      hint: `${missingPct.toFixed(1)}% of cells`,
      icon: AlertTriangle,
      tone: "rose" as const,
    },
    {
      label: "Duplicate rows",
      value: (profile?.duplicateRows ?? 0).toLocaleString(),
      icon: Copy,
      tone: "amber" as const,
    },
    {
      label: "Missing %",
      value: `${missingPct.toFixed(1)}%`,
      icon: AlertTriangle,
      tone: "rose" as const,
    },
  ];

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <Gauge className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          Overview
        </CardTitle>
        <CardDescription>
          Top-level data quality and shape.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          {/* Quality gauge */}
          <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="relative h-40 w-40" aria-label={`Quality score ${Math.round(score)} of 100`}>
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  innerRadius="72%"
                  outerRadius="100%"
                  data={data}
                  startAngle={90}
                  endAngle={-270}
                >
                  <PolarAngleAxis
                    type="number"
                    domain={[0, 100]}
                    tick={false}
                  />
                  <RadialBar
                    background={{ fill: "#e2e8f0" } as never}
                    dataKey="value"
                    cornerRadius={8}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <motion.span
                  key={Math.round(score)}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 18 }}
                  className="text-3xl font-bold text-slate-900"
                >
                  {Math.round(score)}
                </motion.span>
                <span className="text-[11px] font-medium text-slate-500">
                  quality
                </span>
              </div>
            </div>
            <Badge variant="outline" className={qualityBadge}>
              {qualityLabel}
            </Badge>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {stats.map((s) => (
              <StatTile
                key={s.label}
                label={s.label}
                value={s.value}
                hint={s.hint}
                icon={s.icon}
                tone={s.tone}
              />
            ))}
            <motion.div
              whileHover={{ y: -2 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                <Gauge className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Quality score
                </div>
                <div className="text-lg font-bold text-slate-900">
                  {Math.round(score)}/100
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ProfileOverview;
