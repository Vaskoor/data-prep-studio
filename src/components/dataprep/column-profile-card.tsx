// MIT License
//
// Copyright (c) 2025 Data Prep Studio contributors
// (see full MIT header in site-header.tsx — same license applies here.)

"use client";

import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Calendar,
  Hash,
  Sigma,
  ToggleLeft,
  Type,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  ColumnProfile,
  ColumnType,
  HistogramBin,
} from "@/lib/dataprep";

/** Props for {@link ColumnProfileCard}. */
export interface ColumnProfileCardProps {
  /** The column to render. */
  column: ColumnProfile;
}

/** Map a `ColumnType` to its badge metadata (label + icon + Tailwind classes). */
const TYPE_BADGE: Record<
  ColumnType,
  { label: string; icon: React.ElementType; className: string }
> = {
  numeric: {
    label: "numeric",
    icon: Sigma,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  categorical: {
    label: "categorical",
    icon: Hash,
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  datetime: {
    label: "datetime",
    icon: Calendar,
    className: "border-cyan-200 bg-cyan-50 text-cyan-700",
  },
  boolean: {
    label: "boolean",
    icon: ToggleLeft,
    className: "border-violet-200 bg-violet-50 text-violet-700",
  },
  text: {
    label: "text",
    icon: Type,
    className: "border-slate-200 bg-slate-50 text-slate-700",
  },
};

/** Format a number for display (handles nulls and large values). */
function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1000)
    return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return Number(n.toFixed(3)).toString();
}

/** Recharts tooltip styling — pure CSS, palette-matched. */
function ChartTooltip({
  active,
  payload,
  label,
  suffix,
}: {
  active?: boolean;
  payload?: { value: number; payload?: Record<string, unknown> }[];
  label?: string | number;
  suffix?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium text-slate-700">{String(label ?? "")}</div>
      <div className="text-slate-500">
        {payload[0].value.toLocaleString()}
        {suffix ? ` ${suffix}` : ""}
      </div>
    </div>
  );
}

/** Histogram chart for numeric columns (bins already labelled by the lib). */
function HistogramChart({ bins }: { bins: HistogramBin[] }) {
  if (!Array.isArray(bins) || bins.length === 0) return null;
  const data = bins.map((b) => ({ name: b.bin, count: b.count }));
  return (
    <div className="h-28 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 9, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            cursor={{ fill: "#f1f5f9" }}
            content={<ChartTooltip suffix="rows" />}
          />
          <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Top-values bar chart for categorical columns. */
function TopValuesChart({
  values,
}: {
  values: { value: string; count: number; pct?: number }[];
}) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const data = values.slice(0, 8).map((v) => ({
    name: v.value,
    count: v.count,
  }));
  const colors = ["#f59e0b", "#fbbf24", "#fcd34d", "#fde68a"];
  return (
    <div className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 2, right: 8, bottom: 2, left: 0 }}
        >
          <XAxis
            type="number"
            tick={{ fontSize: 9, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={70}
            tick={{ fontSize: 9, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "#fef3c7" }}
            content={<ChartTooltip suffix="rows" />}
          />
          <Bar dataKey="count" radius={[0, 3, 3, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Date-range summary for datetime columns. */
function DatetimeRange({ range }: { range: { min: string; max: string; range?: string } }) {
  const fmt = (s: string | undefined) =>
    s
      ? new Date(s).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "—";
  return (
    <div className="flex items-center gap-2 rounded-md border border-cyan-200 bg-cyan-50/40 px-2 py-1.5 text-[11px] text-cyan-800">
      <Calendar className="h-3 w-3" aria-hidden="true" />
      <span className="font-medium">{fmt(range.min)}</span>
      <span className="text-cyan-500">→</span>
      <span className="font-medium">{fmt(range.max)}</span>
      {range.range ? (
        <span className="text-cyan-600">· {range.range}</span>
      ) : null}
    </div>
  );
}

/**
 * ColumnProfileCard — per-column profiling card.
 *
 * Renders the column name, type badge (color-coded), missing bar (rose/amber/
 * emerald by severity), and a type-appropriate mini chart:
 *  - numeric     → histogram (recharts BarChart)
 *  - categorical → top-values bar chart (horizontal)
 *  - datetime    → date range badge
 *  - boolean     → true/false counts
 *  - text        → just the basic stats
 *
 * The card has subtle mount + hover motion (framer-motion).
 */
export function ColumnProfileCard({ column }: ColumnProfileCardProps) {
  const badge = TYPE_BADGE[column?.type] ?? TYPE_BADGE.text;
  const Icon = badge.icon;
  const missingPct = Math.max(0, Math.min(100, column?.missingPct ?? 0));
  const missingTone =
    missingPct >= 25 ? "rose" : missingPct >= 10 ? "amber" : "emerald";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      whileHover={{ y: -2 }}
      className="h-full"
    >
      <Card className="h-full border-slate-200 transition-shadow hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle
              className="truncate text-sm font-semibold text-slate-900"
              title={column?.name}
            >
              {column?.name ?? "—"}
            </CardTitle>
            <Badge variant="outline" className={badge.className}>
              <Icon className="h-3 w-3" aria-hidden="true" />
              {badge.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Missing bar */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Missing</span>
              <span>
                {(column?.missing ?? 0).toLocaleString()} ({missingPct.toFixed(1)}%)
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  missingTone === "rose"
                    ? "bg-rose-500"
                    : missingTone === "amber"
                      ? "bg-amber-500"
                      : "bg-emerald-500",
                )}
                style={{ width: `${missingPct}%` }}
                role="progressbar"
                aria-valuenow={Math.round(missingPct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${missingPct.toFixed(1)} percent missing`}
              />
            </div>
          </div>

          {/* Type-specific chart */}
          {column?.type === "numeric" && column.numeric?.histogram && (
            <HistogramChart bins={column.numeric.histogram} />
          )}
          {column?.type === "categorical" && column.categorical?.top && (
            <TopValuesChart values={column.categorical.top} />
          )}
          {column?.type === "datetime" && column.datetime && (
            <DatetimeRange range={column.datetime} />
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-md bg-slate-50 px-2 py-1.5">
              <div className="text-slate-400">Unique</div>
              <div className="font-semibold text-slate-700">
                {(column?.unique ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="rounded-md bg-slate-50 px-2 py-1.5">
              <div className="text-slate-400">Type</div>
              <div className="font-semibold text-slate-700">
                {badge.label}
              </div>
            </div>
          </div>

          {/* Numeric summary */}
          {column?.type === "numeric" && column.numeric && (
            <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-500">
              <div>
                <span className="text-slate-400">mean:</span>{" "}
                {fmtNum(column.numeric.mean)}
              </div>
              <div>
                <span className="text-slate-400">median:</span>{" "}
                {fmtNum(column.numeric.median)}
              </div>
              <div>
                <span className="text-slate-400">min:</span>{" "}
                {fmtNum(column.numeric.min)}
              </div>
              <div>
                <span className="text-slate-400">max:</span>{" "}
                {fmtNum(column.numeric.max)}
              </div>
              <div>
                <span className="text-slate-400">std:</span>{" "}
                {fmtNum(column.numeric.std)}
              </div>
              <div>
                <span className="text-slate-400">q1/q3:</span>{" "}
                {fmtNum(column.numeric.q1)} / {fmtNum(column.numeric.q3)}
              </div>
              {column.numeric.outliers ? (
                <div className="col-span-2 text-rose-600">
                  <span className="text-slate-400">outliers (IQR):</span>{" "}
                  {column.numeric.outliers.toLocaleString()}
                </div>
              ) : null}
            </div>
          )}

          {/* Categorical summary */}
          {column?.type === "categorical" && column.categorical && (
            <div className="text-[11px] text-slate-500">
              Cardinality:{" "}
              <span className="font-semibold text-slate-700">
                {(column.categorical.cardinality ?? 0).toLocaleString()}
              </span>{" "}
              unique values
            </div>
          )}

          {/* Boolean summary */}
          {column?.type === "boolean" && column.boolean && (
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500">
              <div className="rounded-md bg-violet-50 px-2 py-1.5">
                <div className="text-slate-400">true</div>
                <div className="font-semibold text-violet-700">
                  {(column.boolean.trueCount ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="rounded-md bg-slate-50 px-2 py-1.5">
                <div className="text-slate-400">false</div>
                <div className="font-semibold text-slate-700">
                  {(column.boolean.falseCount ?? 0).toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default ColumnProfileCard;
