// MIT License
//
// Copyright (c) 2025 Data Prep Studio contributors
// (see full MIT header in site-header.tsx — same license applies here.)

"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { Profile, TransformOp, TransformType } from "@/lib/dataprep";

/** Props for {@link TransformPanel}. */
export interface TransformPanelProps {
  /** Dataset id (used in API path). */
  datasetId: string;
  /** Current profile (used to populate column dropdowns). */
  profile: Profile;
  /** Fired after a successful transform batch (parent refreshes profile). */
  onApplied: (result: {
    profile: Profile;
    log: unknown;
    sample: unknown;
  }) => void;
  /** Reset signal: change this value to clear the local queue + log. */
  resetSignal?: unknown;
}

/** Metadata for each transform type. */
const TF_TYPES: { value: TransformType; label: string; hint: string }[] = [
  {
    value: "normalize",
    label: "Normalize (min-max)",
    hint: "Append `<col>_norm` = (x - min) / (max - min).",
  },
  {
    value: "standardize",
    label: "Standardize (z-score)",
    hint: "Append `<col>_zscore` = (x - mean) / std.",
  },
  {
    value: "onehot_encode",
    label: "One-hot encode",
    hint: "Append one boolean column per distinct value.",
  },
  {
    value: "label_encode",
    label: "Label encode",
    hint: "Append `<col>_code` = integer label per distinct value.",
  },
  {
    value: "bin_equal_width",
    label: "Bin (equal-width)",
    hint: "Append `<col>_bin` = equal-width bucket label.",
  },
  {
    value: "bin_equal_freq",
    label: "Bin (equal-frequency)",
    hint: "Append `<col>_bin` = equal-frequency bucket label.",
  },
  {
    value: "date_parts",
    label: "Date parts",
    hint: "Extract year/month/day/hour from a datetime column.",
  },
  {
    value: "text_length",
    label: "Text length",
    hint: "Append `<col>_len` = character count.",
  },
];

/** Generate a short unique id for an op (used as React key + lib's required id). */
const TF_ID = () => Math.random().toString(36).slice(2, 10);

/** Does this transform take a `bins` parameter? */
const needsBins = (t: TransformType) =>
  t === "bin_equal_width" || t === "bin_equal_freq";

/**
 * TransformPanel — design, queue, and apply transformation operations.
 *
 * Mirror of {@link CleaningPanel} for transforms. The shape of each op's
 * params follows the project's `TransformOp` contract.
 */
export function TransformPanel({
  datasetId,
  profile,
  onApplied,
  resetSignal,
}: TransformPanelProps) {
  const [type, setType] = React.useState<TransformType>("normalize");
  const [column, setColumn] = React.useState<string>("");
  const [bins, setBins] = React.useState<number>(5);
  const [queue, setQueue] = React.useState<TransformOp[]>([]);
  const [applying, setApplying] = React.useState(false);
  const [log, setLog] = React.useState<unknown>(null);

  const columns = profile?.columns ?? [];
  const colNames = columns.map((c) => c.name);

  // Auto-pick the first column when none selected.
  React.useEffect(() => {
    if (!column && colNames.length > 0) setColumn(colNames[0]);
  }, [colNames, column]);

  // Reset queue + log when the reset signal changes (new dataset selected).
  React.useEffect(() => {
    setQueue([]);
    setLog(null);
  }, [resetSignal]);

  const addOp = () => {
    if (!column) {
      toast.error("Pick a column first.");
      return;
    }
    const params: Record<string, unknown> = needsBins(type)
      ? { bins: Math.max(1, Math.floor(bins) || 5) }
      : {};
    const op: TransformOp = {
      id: TF_ID(),
      type,
      column,
      params,
    };
    setQueue((q) => [...q, op]);
    toast.success(`Queued: ${TF_TYPES.find((t) => t.value === type)?.label}`);
  };

  const removeOp = (id?: string) =>
    setQueue((q) => q.filter((o) => o.id !== id));

  const moveOp = (idx: number, dir: -1 | 1) =>
    setQueue((q) => {
      const next = [...q];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return q;
      const tmp = next[idx];
      next[idx] = next[target];
      next[target] = tmp;
      return next;
    });

  const apply = async () => {
    if (queue.length === 0) {
      toast.error("Add at least one transform first.");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch(`/api/dataprep/datasets/${datasetId}/transform`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: queue }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(
          `Transform failed (${res.status})${msg ? `: ${msg}` : ""}`,
        );
      }
      const data = (await res.json()) as {
        profile: Profile;
        log: unknown;
        sample: unknown;
      };
      setLog(data.log);
      setQueue([]);
      toast.success(`Applied ${queue.length} transform(s)`);
      onApplied(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transform failed");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <ArrowRightLeft className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          Transforms
        </CardTitle>
        <CardDescription>
          Reshape your data: normalize, standardize, encode, bin, date-parts,
          text-length.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Transform editor */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tf-type">Transform</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as TransformType)}
              >
                <SelectTrigger id="tf-type" className="w-full">
                  <SelectValue placeholder="Pick transform" />
                </SelectTrigger>
                <SelectContent>
                  {TF_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">
                {TF_TYPES.find((t) => t.value === type)?.hint}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tf-column">Column</Label>
              <Select value={column} onValueChange={setColumn}>
                <SelectTrigger id="tf-column" className="w-full">
                  <SelectValue placeholder="Pick column" />
                </SelectTrigger>
                <SelectContent>
                  {colNames.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {needsBins(type) && (
              <div className="space-y-1.5">
                <Label htmlFor="tf-bins">Number of bins</Label>
                <Input
                  id="tf-bins"
                  type="number"
                  min={1}
                  max={50}
                  value={bins}
                  onChange={(e) => setBins(Number(e.target.value))}
                />
              </div>
            )}
          </div>

          <div className="mt-3 flex justify-end">
            <Button onClick={addOp} variant="outline" size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add transform
            </Button>
          </div>
        </div>

        {/* Queued transforms */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Queued transforms
            </h4>
            <Badge variant="secondary" className="text-[11px]">
              {queue.length} pending
            </Badge>
          </div>

          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
              <ClipboardList
                className="mb-1.5 h-5 w-5 text-slate-400"
                aria-hidden="true"
              />
              <p className="text-xs text-slate-500">
                No transforms queued. Add one above.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              <AnimatePresence initial={false}>
                {queue.map((op, idx) => (
                  <motion.li
                    key={op.id}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-cyan-100 text-[10px] font-bold text-cyan-700">
                      {idx + 1}
                    </span>
                    <span className="font-mono text-slate-700">
                      {op.type}
                    </span>
                    {op.column && (
                      <span className="text-slate-500">· {op.column}</span>
                    )}
                    {op.params && Object.keys(op.params).length > 0 && (
                      <span className="truncate text-slate-400">
                        ·{" "}
                        {Object.entries(op.params)
                          .map(([k, v]) => `${k}=${String(v)}`)
                          .join(", ")}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-slate-400 hover:text-emerald-700 disabled:opacity-30"
                        onClick={() => moveOp(idx, -1)}
                        disabled={idx === 0}
                        aria-label="Move up"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-slate-400 hover:text-emerald-700 disabled:opacity-30"
                        onClick={() => moveOp(idx, 1)}
                        disabled={idx === queue.length - 1}
                        aria-label="Move down"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => removeOp(op.id)}
                        aria-label="Remove transform"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">
            Applying runs all queued transforms in order and updates the
            profile.
          </p>
          <Button onClick={apply} disabled={applying || queue.length === 0}>
            {applying ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
            )}
            {applying
              ? "Applying…"
              : `Apply (${queue.length}) transform${
                  queue.length === 1 ? "" : "s"
                }`}
          </Button>
        </div>

        {log ? (
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Operation log
            </h4>
            <pre className="max-h-40 overflow-auto rounded-md border border-slate-200 bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
              {safeJson(log)}
            </pre>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Tiny helper to serialize an unknown value safely. */
function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export default TransformPanel;
