// MIT License
//
// Copyright (c) 2025 Data Prep Studio contributors
// (see full MIT header in site-header.tsx — same license applies here.)

"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  Plus,
  Trash2,
  Wand2,
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
import type {
  CleaningOp,
  CleaningType,
  Profile,
} from "@/lib/dataprep";

/** Props for {@link CleaningPanel}. */
export interface CleaningPanelProps {
  /** Dataset id (used in API path). */
  datasetId: string;
  /** Current profile (used to populate column dropdowns). */
  profile: Profile;
  /** Fired after a successful clean op batch (parent refreshes profile). */
  onApplied: (result: {
    profile: Profile;
    log: unknown;
    sample: unknown;
  }) => void;
  /** Optional: ops queued externally (e.g. by the AI panel). When provided
   *  they are appended to the local queue once. */
  externalOps?: CleaningOp[];
  /** Reset signal: change this value to clear the local queue + log. */
  resetSignal?: unknown;
}

/** Special sentinel value for "apply to all applicable columns". */
const ALL_COLUMNS = "__all__";

/** Metadata for each cleaning op type (label + human-readable hint). */
const OP_TYPES: { value: CleaningType; label: string; hint: string }[] = [
  {
    value: "drop_missing",
    label: "Drop missing rows",
    hint: "Remove rows with missing values in a column (or all).",
  },
  {
    value: "impute",
    label: "Impute missing",
    hint: "Fill missing values using a strategy (mean/median/mode/constant).",
  },
  {
    value: "drop_duplicates",
    label: "Drop duplicate rows",
    hint: "Remove exact-duplicate rows (no column needed).",
  },
  {
    value: "fix_types",
    label: "Fix types",
    hint: "Coerce strings to numeric/boolean/null where possible.",
  },
  {
    value: "trim_whitespace",
    label: "Trim whitespace",
    hint: "Strip leading/trailing whitespace from text values.",
  },
  {
    value: "standardize_case",
    label: "Standardize case",
    hint: "Lowercase / uppercase / title-case text values.",
  },
  {
    value: "remove_outliers",
    label: "Remove outliers",
    hint: "Null out outliers via IQR or z-score.",
  },
];

/** Generate a short unique id for an op (used as React key + lib's required id). */
const OP_ID = () => Math.random().toString(36).slice(2, 10);

/** Does this op type REQUIRE a column? (lib will reject without one). */
function requiresColumn(t: CleaningType): boolean {
  return t === "impute" || t === "standardize_case" || t === "remove_outliers";
}

/** Does this op type ignore the column entirely? */
function ignoresColumn(t: CleaningType): boolean {
  return t === "drop_duplicates";
}

/** Does this op type accept an optional column (apply-to-all)? */
function optionalColumn(t: CleaningType): boolean {
  return (
    t === "drop_missing" || t === "fix_types" || t === "trim_whitespace"
  );
}

/** Does this op type need a strategy selector? */
const needsStrategy = (t: CleaningType) => t === "impute";
/** Does this op type need a constant value input? */
const needsConstant = (t: CleaningType) => t === "impute";
/** Does this op type need a method selector? */
const needsMethod = (t: CleaningType) => t === "remove_outliers";
/** Does this op type need a case selector? */
const needsCase = (t: CleaningType) => t === "standardize_case";

/** Whether the column picker should be shown for a given op type. */
function showColumnPicker(t: CleaningType): boolean {
  return !ignoresColumn(t);
}

/** Build the params object for a queued op. */
function buildParams(
  type: CleaningType,
  state: {
    strategy: string;
    constant: string;
    method: string;
    caseMode: string;
  },
): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (needsStrategy(type)) p.strategy = state.strategy;
  // The lib reads `op.params.value` (not `constant`) when strategy === "constant".
  if (needsConstant(type) && state.strategy === "constant")
    p.value = state.constant;
  if (needsMethod(type)) p.method = state.method;
  if (needsCase(type)) p.case = state.caseMode;
  return p;
}

/**
 * CleaningPanel — design, queue, and apply cleaning operations.
 *
 * Layout:
 *  - A `<Select>` of op types, with dynamic param inputs.
 *  - "Add op" → appends to the queued list.
 *  - Queued ops are reorderable (up/down) and removable.
 *  - "Apply (n) ops" → POST `/api/dataprep/datasets/[id]/clean`.
 *  - After apply, the before/after log is rendered below.
 */
export function CleaningPanel({
  datasetId,
  profile,
  onApplied,
  externalOps,
  resetSignal,
}: CleaningPanelProps) {
  const [type, setType] = React.useState<CleaningType>("drop_missing");
  const [column, setColumn] = React.useState<string>(ALL_COLUMNS);
  const [strategy, setStrategy] = React.useState<string>("mean");
  const [constant, setConstant] = React.useState<string>("");
  const [method, setMethod] = React.useState<string>("iqr");
  const [caseMode, setCaseMode] = React.useState<string>("lower");
  const [queue, setQueue] = React.useState<CleaningOp[]>([]);
  const [applying, setApplying] = React.useState(false);
  const [log, setLog] = React.useState<unknown>(null);

  const columns = profile?.columns ?? [];
  const colNames = columns.map((c) => c.name);

  // Pick the first column automatically when none selected AND the current op
  // requires a column.
  React.useEffect(() => {
    if (requiresColumn(type) && (column === ALL_COLUMNS || !column)) {
      if (colNames.length > 0) setColumn(colNames[0]);
    }
  }, [colNames, column, type]);

  // Reset queue + log when the reset signal changes (e.g. new dataset selected).
  React.useEffect(() => {
    setQueue([]);
    setLog(null);
  }, [resetSignal]);

  // When the op type changes, reset column to ALL_COLUMNS (for optional ops)
  // or auto-pick the first column (for required ops).
  React.useEffect(() => {
    if (ignoresColumn(type)) return;
    if (requiresColumn(type)) {
      if (colNames.length > 0 && (column === ALL_COLUMNS || !column)) {
        setColumn(colNames[0]);
      }
    } else {
      setColumn(ALL_COLUMNS);
    }
    // Intentionally only re-runs when `type` changes (not on column change).
  }, [type]);

  // Accept externally-queued ops (e.g. from the AI panel) exactly once per call.
  React.useEffect(() => {
    if (externalOps && externalOps.length > 0) {
      setQueue((q) => [
        ...q,
        ...externalOps.map((o) => ({
          id: o.id ?? OP_ID(),
          type: o.type,
          column: o.column,
          params: o.params ?? {},
        })),
      ]);
    }
    // Intentionally only re-runs when `externalOps` reference changes.
  }, [externalOps]);

  /** Add the current editor op to the queue. */
  const addOp = () => {
    if (requiresColumn(type) && (column === ALL_COLUMNS || !column)) {
      toast.error("Pick a column first.");
      return;
    }
    const op: CleaningOp = {
      id: OP_ID(),
      type,
      column:
        ignoresColumn(type) || column === ALL_COLUMNS ? undefined : column,
      params: buildParams(type, { strategy, constant, method, caseMode }),
    };
    setQueue((q) => [...q, op]);
    toast.success(`Queued: ${OP_TYPES.find((t) => t.value === type)?.label}`);
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

  /** Apply all queued ops via the clean endpoint. */
  const apply = async () => {
    if (queue.length === 0) {
      toast.error("Add at least one op first.");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch(`/api/dataprep/datasets/${datasetId}/clean`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: queue }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`Clean failed (${res.status})${msg ? `: ${msg}` : ""}`);
      }
      const data = (await res.json()) as {
        profile: Profile;
        log: unknown;
        sample: unknown;
      };
      setLog(data.log);
      setQueue([]);
      toast.success(`Applied ${queue.length} cleaning op(s)`);
      onApplied(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Clean failed");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <Wand2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          Cleaning
        </CardTitle>
        <CardDescription>
          Pick an operation, configure its parameters, queue, and apply.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Op editor */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="op-type">Operation</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as CleaningType)}
              >
                <SelectTrigger id="op-type" className="w-full">
                  <SelectValue placeholder="Pick operation" />
                </SelectTrigger>
                <SelectContent>
                  {OP_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">
                {OP_TYPES.find((t) => t.value === type)?.hint}
              </p>
            </div>

            {showColumnPicker(type) ? (
              <div className="space-y-1.5">
                <Label htmlFor="op-column">Column</Label>
                <Select value={column} onValueChange={setColumn}>
                  <SelectTrigger id="op-column" className="w-full">
                    <SelectValue placeholder="Pick column" />
                  </SelectTrigger>
                  <SelectContent>
                    {optionalColumn(type) && (
                      <SelectItem value={ALL_COLUMNS}>
                        All applicable columns
                      </SelectItem>
                    )}
                    {colNames.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Scope</Label>
                <div className="flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-500">
                  All rows (column not used)
                </div>
              </div>
            )}

            {needsStrategy(type) && (
              <div className="space-y-1.5">
                <Label htmlFor="op-strategy">Strategy</Label>
                <Select value={strategy} onValueChange={setStrategy}>
                  <SelectTrigger id="op-strategy" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mean">mean</SelectItem>
                    <SelectItem value="median">median</SelectItem>
                    <SelectItem value="mode">mode</SelectItem>
                    <SelectItem value="constant">constant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsConstant(type) && strategy === "constant" && (
              <div className="space-y-1.5">
                <Label htmlFor="op-constant">Constant value</Label>
                <Input
                  id="op-constant"
                  value={constant}
                  onChange={(e) => setConstant(e.target.value)}
                  placeholder="e.g. 0 or N/A"
                />
              </div>
            )}

            {needsMethod(type) && (
              <div className="space-y-1.5">
                <Label htmlFor="op-method">Method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger id="op-method" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="iqr">IQR (×1.5)</SelectItem>
                    <SelectItem value="zscore">z-score (|z| &gt; 3)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsCase(type) && (
              <div className="space-y-1.5">
                <Label htmlFor="op-case">Case</Label>
                <Select value={caseMode} onValueChange={setCaseMode}>
                  <SelectTrigger id="op-case" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lower">lowercase</SelectItem>
                    <SelectItem value="upper">UPPERCASE</SelectItem>
                    <SelectItem value="title">Title Case</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="mt-3 flex justify-end">
            <Button onClick={addOp} variant="outline" size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add op
            </Button>
          </div>
        </div>

        {/* Queued ops */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Queued ops
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
                No ops queued. Add one above.
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
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-emerald-100 text-[10px] font-bold text-emerald-700">
                      {idx + 1}
                    </span>
                    <span className="font-mono text-slate-700">{op.type}</span>
                    {op.column && (
                      <span className="text-slate-500">
                        · {op.column}
                      </span>
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
                        aria-label="Remove op"
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
            Applying runs all queued ops in order and updates the profile.
          </p>
          <Button onClick={apply} disabled={applying || queue.length === 0}>
            {applying ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="h-4 w-4" aria-hidden="true" />
            )}
            {applying
              ? "Applying…"
              : `Apply (${queue.length}) op${queue.length === 1 ? "" : "s"}`}
          </Button>
        </div>

        {/* Before/after log */}
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

export default CleaningPanel;
