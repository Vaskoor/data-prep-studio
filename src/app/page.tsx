// MIT License
//
// Copyright (c) 2025 Data Prep Studio contributors
// (see full MIT header in site-header.tsx — same license applies here.)

"use client";

import * as React from "react";
import { SiteHeader } from "@/components/dataprep/site-header";
import { SiteFooter } from "@/components/dataprep/site-footer";
import { UploadPanel } from "@/components/dataprep/upload-panel";
import { DatasetList } from "@/components/dataprep/dataset-list";
import { DatasetWorkspace } from "@/components/dataprep/dataset-workspace";
import type { DatasetMeta } from "@/lib/dataprep";

/**
 * Home — top-level page for Data Prep Studio.
 *
 * Composes:
 *  - a sticky {@link SiteHeader},
 *  - a two-column main grid (left = upload + dataset list, right = workspace),
 *  - a sticky {@link SiteFooter} (sits at the bottom via `mt-auto`).
 *
 * Owns the `selectedId` and `datasets` state; refreshes the list after upload
 * / delete and switches the workspace to the newly-uploaded dataset on
 * success.
 *
 * @returns A React `<div>` element.
 */
export default function Home() {
  const [datasets, setDatasets] = React.useState<DatasetMeta[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  /** Fetch the list of saved datasets. */
  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dataprep/datasets");
      if (!res.ok) throw new Error(`List failed (${res.status})`);
      const list = (await res.json()) as DatasetMeta[];
      setDatasets(Array.isArray(list) ? list : []);
    } catch {
      setDatasets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  React.useEffect(() => {
    refresh();
  }, [refresh]);

  /** Called by UploadPanel after a successful upload. */
  const handleCreated = React.useCallback((meta: DatasetMeta) => {
    setDatasets((prev) => {
      // Avoid duplicate ids if the backend returns a list later.
      if (prev.some((d) => d.id === meta.id)) return prev;
      return [meta, ...prev];
    });
    setSelectedId(meta.id);
    // Soft-refresh to ensure backend + UI agree on metadata (row count, etc.).
    refresh();
  }, [refresh]);

  /** Called by DatasetList after a successful delete. */
  const handleDeleted = React.useCallback((id: string) => {
    setDatasets((prev) => prev.filter((d) => d.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/50">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Page heading */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Data Prep Studio
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Profile, clean, transform, and export CSV / JSON datasets — all
              in your browser.
            </p>
          </div>

          {/* Two-column layout: left = upload + list, right = workspace */}
          <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
            <aside className="space-y-4">
              <UploadPanel onCreated={handleCreated} />
              <DatasetList
                datasets={datasets}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onDeleted={handleDeleted}
                onRefresh={refresh}
                loading={loading}
              />
            </aside>

            <section>
              <DatasetWorkspace datasetId={selectedId} />
            </section>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
