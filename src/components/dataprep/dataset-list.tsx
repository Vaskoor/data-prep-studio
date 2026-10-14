// MIT License
//
// Copyright (c) 2025 Data Prep Studio contributors
// (see full MIT header in site-header.tsx — same license applies here.)

"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Database, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DatasetMeta as _DatasetMeta } from "@/lib/dataprep";

/**
 * UI-friendly DatasetMeta.
 *
 * The lib's {@link _DatasetMeta} type is intentionally minimal; the API
 * `/api/dataprep/datasets` route returns richer metadata (source, qualityScore,
 * updatedAt, columns) at runtime via `as unknown as DatasetMeta` casting.
 * This local intersection surfaces those runtime fields so the UI is type-safe.
 */
type DatasetMeta = _DatasetMeta & {
  source?: string;
  qualityScore?: number;
  sizeBytes?: number;
  updatedAt?: string;
  columns?: unknown[];
};

/** Props for {@link DatasetList}. */
export interface DatasetListProps {
  /** Current list of saved datasets (parent-owned state). */
  datasets: DatasetMeta[];
  /** The currently-selected dataset id, or `null`. */
  selectedId: string | null;
  /** Called when the user clicks a dataset card. */
  onSelect: (id: string) => void;
  /** Called after a dataset is successfully deleted. */
  onDeleted: (id: string) => void;
  /** Called when the user clicks the refresh button. */
  onRefresh: () => void;
  /** True while the parent is (re)loading the list. */
  loading: boolean;
}

/**
 * Compute the Tailwind class string for the quality badge based on score.
 *
 * - ≥ 80 → emerald (good)
 * - ≥ 50 → amber   (fair)
 * - < 50 → rose    (poor)
 */
function qualityBadgeClass(score: number): string {
  if (score >= 80)
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (score >= 50)
    return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

/**
 * DatasetList — a list of saved dataset cards.
 *
 * Each card shows name, filename, row/col counts, and a color-coded quality
 * badge. Click selects; a small trash button opens an AlertDialog confirm before
 * `DELETE /api/dataprep/datasets/[id]`.
 *
 * The list is capped at `max-h-96 overflow-y-auto` with a thin scrollbar.
 */
export function DatasetList({
  datasets,
  selectedId,
  onSelect,
  onDeleted,
  onRefresh,
  loading,
}: DatasetListProps) {
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  /** DELETE the dataset; toast on success/failure. */
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/dataprep/datasets/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      toast.success("Dataset deleted");
      onDeleted(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card className="border-slate-200">
      <CardContent className="flex items-center justify-between gap-2 pb-3 pt-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Datasets</h3>
          <p className="text-xs text-slate-500">
            {datasets.length} saved in session
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRefresh}
          aria-label="Refresh dataset list"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardContent>

      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : datasets.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
            <Database
              className="mb-2 h-6 w-6 text-slate-400"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-slate-600">
              No datasets yet
            </p>
            <p className="text-xs text-slate-400">
              Upload CSV/JSON or load a sample to begin.
            </p>
          </div>
        ) : (
          <ul
            className="max-h-96 space-y-2 overflow-y-auto pr-1"
            style={{ scrollbarWidth: "thin" }}
          >
            <AnimatePresence initial={false}>
              {datasets.map((d) => {
                const active = d.id === selectedId;
                return (
                  <motion.li
                    key={d.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                    {/* Using a div with role="button" avoids nested <button>
                        invalid HTML when the delete trigger is also a button. */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelect(d.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(d.id);
                        }
                      }}
                      aria-pressed={active}
                      aria-label={`Select dataset ${d.name}`}
                      className={`group relative flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-all hover:shadow-sm ${
                        active
                          ? "border-emerald-300 bg-emerald-50/70 ring-1 ring-emerald-200"
                          : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white shadow-sm transition-all ${
                          active
                            ? "bg-gradient-to-br from-emerald-500 to-teal-600"
                            : "bg-slate-400 group-hover:from-emerald-500 group-hover:to-teal-600"
                        }`}
                      >
                        <Database className="h-4 w-4" aria-hidden="true" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {d.name}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">
                          {d.filename ?? "—"} ·{" "}
                          {d.rowCount.toLocaleString()} rows · {d.colCount}{" "}
                          cols
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={qualityBadgeClass(d.qualityScore ?? 0)}
                          title="Quality score"
                        >
                          {Math.round(d.qualityScore ?? 0)}%
                        </Badge>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              aria-label={`Delete dataset ${d.name}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent
                            onClick={(e) => e.stopPropagation()}
                          >
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete &ldquo;{d.name}&rdquo;?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This permanently removes the dataset and its
                                history from this session. This action cannot be
                                undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-rose-600 text-white hover:bg-rose-700"
                                onClick={() => handleDelete(d.id)}
                                disabled={deletingId === d.id}
                              >
                                {deletingId === d.id ? (
                                  <Loader2
                                    className="h-4 w-4 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : null}
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default DatasetList;
