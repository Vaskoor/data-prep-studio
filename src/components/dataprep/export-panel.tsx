// MIT License
//
// Copyright (c) 2025 Data Prep Studio contributors
// (see full MIT header in site-header.tsx — same license applies here.)

"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Download, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/** Props for {@link ExportPanel}. */
export interface ExportPanelProps {
  /** Dataset id (used in API path). */
  datasetId: string;
  /** Dataset display name (used to suggest a download filename). */
  name: string;
  /** Latest row count (for the info badge). */
  rowCount?: number;
}

/**
 * Trigger a CSV download of the cleaned dataset.
 *
 * Tries the blob path first (nicest filename), falls back to a plain anchor
 * navigation if the blob fetch fails.
 */
async function triggerDownload(
  datasetId: string,
  fallbackName: string,
): Promise<void> {
  const url = `/api/dataprep/datasets/${datasetId}/export`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const blob = await res.blob();
    const filename =
      extractFilename(res.headers.get("content-disposition")) ??
      `${fallbackName || "dataset"}.csv`;
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  } catch {
    // Fallback: simple navigation (still downloads, but filename may be
    // determined by the response).
    window.location.href = url;
  }
}

/** Parse `Content-Disposition: attachment; filename="foo.csv"`. */
function extractFilename(cd: string | null): string | null {
  if (!cd) return null;
  const m = /filename="?([^";]+)"?/i.exec(cd);
  return m ? m[1] : null;
}

/**
 * ExportPanel — download the cleaned CSV.
 *
 * A single, prominent CTA that fetches `/api/dataprep/datasets/[id]/export`
 * (the CSV file) as a Blob and triggers a browser download. Falls back to a
 * plain navigation if the blob fetch fails.
 */
export function ExportPanel({ datasetId, name, rowCount }: ExportPanelProps) {
  const [busy, setBusy] = React.useState(false);

  const handleDownload = async () => {
    setBusy(true);
    try {
      await triggerDownload(datasetId, name);
      toast.success("Download started");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <FileDown className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          Export
        </CardTitle>
        <CardDescription>
          Download the cleaned dataset as a CSV file.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="text-sm font-medium text-slate-700">
              Cleaned CSV for{" "}
              <span className="font-semibold text-emerald-700">{name}</span>
            </p>
            {rowCount !== undefined && (
              <p className="text-[11px] text-slate-500">
                {rowCount.toLocaleString()} rows exported.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {rowCount !== undefined && (
              <Badge
                variant="outline"
                className="border-emerald-200 bg-white text-emerald-700"
              >
                CSV
              </Badge>
            )}
            <Button
              onClick={handleDownload}
              disabled={busy}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              {busy ? "Preparing…" : "Download CSV"}
            </Button>
          </div>
        </motion.div>
      </CardContent>
    </Card>
  );
}

export default ExportPanel;
