// MIT License
//
// Copyright (c) 2025 Data Prep Studio contributors
// (see full MIT header in site-header.tsx — same license applies here.)

"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Columns3,
  Database,
  Download,
  Gauge,
  Table2,
  Wand2,
  ArrowRightLeft,
  Brain,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ColumnProfileCard } from "@/components/dataprep/column-profile-card";
import { ProfileOverview } from "@/components/dataprep/profile-overview";
import { CleaningPanel } from "@/components/dataprep/cleaning-panel";
import { TransformPanel } from "@/components/dataprep/transform-panel";
import { AiSuggestPanel } from "@/components/dataprep/ai-suggest-panel";
import { ExportPanel } from "@/components/dataprep/export-panel";
import type { DatasetMeta as _DatasetMeta, Profile } from "@/lib/dataprep";

/**
 * UI-friendly DatasetMeta.
 *
 * The lib's {@link _DatasetMeta} type is intentionally minimal; the API
 * `/api/dataprep/datasets/[id]` route returns richer metadata (source,
 * qualityScore, updatedAt, columns) at runtime via `as unknown as DatasetMeta`
 * casting. This local intersection surfaces those runtime fields so the UI is
 * type-safe.
 */
type DatasetMeta = _DatasetMeta & {
  source?: string;
  qualityScore?: number;
  sizeBytes?: number;
  updatedAt?: string;
  columns?: unknown[];
};

/** Props for {@link DatasetWorkspace}. */
export interface DatasetWorkspaceProps {
  /** The selected dataset id; if `null`, the empty state renders. */
  datasetId: string | null;
}

/** Shape returned by `GET /api/dataprep/datasets/[id]`. */
interface DatasetDetail {
  meta: DatasetMeta;
  profile: Profile | null;
  sample?: unknown;
  operations?: unknown;
}

/**
 * DatasetWorkspace — the main right-side workspace for a selected dataset.
 *
 * Tabs: Overview · Columns · Cleaning · Transforms · AI · Export.
 *
 * Fetches `/api/dataprep/datasets/[id]` when `datasetId` changes and renders
 * loading skeletons, an error state, or the appropriate tab. Cleaning,
 * transform, and AI panels receive the current profile and call back with
 * updates so the workspace stays in sync after every operation.
 */
export function DatasetWorkspace({ datasetId }: DatasetWorkspaceProps) {
  const [detail, setDetail] = React.useState<DatasetDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState("overview");

  // Refetch detail whenever the selected dataset id changes.
  React.useEffect(() => {
    if (!datasetId) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/dataprep/datasets/${datasetId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Load failed (${res.status})`);
        const json = (await res.json()) as DatasetDetail;
        if (!cancelled) setDetail(json);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Load failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  // Patch the local profile in-place after a cleaning/transform apply so
  // the UI updates without a full refetch.
  const handleApplied = React.useCallback(
    (result: { profile: Profile; log: unknown; sample: unknown }) => {
      setDetail((d) =>
        d ? { ...d, profile: result.profile } : d,
      );
    },
    [],
  );

  // ---------- Empty / loading / error states ----------

  if (!datasetId) {
    return (
      <Card className="border-dashed border-slate-300 bg-slate-50">
        <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
            <Database className="h-7 w-7" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold text-slate-800">
            No dataset selected
          </h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Upload a CSV / JSON file, paste data, or load the sample dataset to
            begin profiling, cleaning, and transforming.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="border-slate-200">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-9 w-full" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !detail) {
    return (
      <Card className="border-rose-200 bg-rose-50/40">
        <CardContent className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <AlertTriangle
            className="mb-2 h-8 w-8 text-rose-500"
            aria-hidden="true"
          />
          <h2 className="text-base font-semibold text-rose-700">
            Could not load dataset
          </h2>
          <p className="mt-1 max-w-sm text-sm text-rose-600">
            {error ?? "Unknown error."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const { meta } = detail;
  // The API can return `profile: null` (if profiling failed previously).
  // Fall back to a minimal empty profile so child panels don't crash.
  const profile: Profile =
    detail.profile ?? {
      rowCount: meta.rowCount,
      colCount: meta.colCount,
      columns: [],
      missingCells: 0,
      duplicateRows: 0,
      quality: {
        completeness: 0,
        uniqueness: 0,
        consistency: 0,
        validity: 0,
        overall: 0,
      },
    };
  const columns = profile?.columns ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      id="workspace"
    >
      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-slate-900">
                <Database className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                {meta.name}
              </CardTitle>
              <CardDescription>
                {meta.filename ?? "—"} · {meta.rowCount.toLocaleString()} rows
                · {meta.colCount} cols ·{" "}
                {meta.source === "sample" ? "sample" : "uploaded"}
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className="border-emerald-200 bg-emerald-50 text-emerald-700"
            >
              Quality {Math.round(meta.qualityScore ?? 0)}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex w-full flex-wrap justify-start">
              <TabsTrigger value="overview">
                <Gauge className="h-4 w-4" aria-hidden="true" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="columns">
                <Columns3 className="h-4 w-4" aria-hidden="true" />
                Columns
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  {columns.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="cleaning">
                <Wand2 className="h-4 w-4" aria-hidden="true" />
                Cleaning
              </TabsTrigger>
              <TabsTrigger value="transforms">
                <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                Transforms
              </TabsTrigger>
              <TabsTrigger value="ai">
                <Brain className="h-4 w-4" aria-hidden="true" />
                AI
              </TabsTrigger>
              <TabsTrigger value="export">
                <Download className="h-4 w-4" aria-hidden="true" />
                Export
              </TabsTrigger>
            </TabsList>

            {/* Overview */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              <ProfileOverview profile={profile} />
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Table2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  Column preview
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {columns.slice(0, 6).map((c) => (
                    <ColumnProfileCard key={c.name} column={c} />
                  ))}
                </div>
                {columns.length > 6 && (
                  <p className="mt-2 text-center text-xs text-slate-500">
                    + {columns.length - 6} more column(s) — see the Columns tab.
                  </p>
                )}
              </div>
            </TabsContent>

            {/* Columns */}
            <TabsContent value="columns" className="mt-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {columns.map((c) => (
                  <ColumnProfileCard key={c.name} column={c} />
                ))}
              </div>
            </TabsContent>

            {/* Cleaning */}
            <TabsContent value="cleaning" className="mt-4">
              <CleaningPanel
                datasetId={meta.id}
                profile={profile}
                onApplied={handleApplied}
                resetSignal={meta.id}
              />
            </TabsContent>

            {/* Transforms */}
            <TabsContent value="transforms" className="mt-4">
              <TransformPanel
                datasetId={meta.id}
                profile={profile}
                onApplied={handleApplied}
                resetSignal={meta.id}
              />
            </TabsContent>

            {/* AI */}
            <TabsContent value="ai" className="mt-4">
              <AiSuggestPanel
                datasetId={meta.id}
                profile={profile}
                onApplied={handleApplied}
              />
            </TabsContent>

            {/* Export */}
            <TabsContent value="export" className="mt-4">
              <ExportPanel
                datasetId={meta.id}
                name={meta.name}
                rowCount={meta.rowCount}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default DatasetWorkspace;
