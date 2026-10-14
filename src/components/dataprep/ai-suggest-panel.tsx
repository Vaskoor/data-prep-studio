// MIT License
//
// Copyright (c) 2025 Data Prep Studio contributors
// (see full MIT header in site-header.tsx — same license applies here.)

"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Brain, Check, Loader2, Sparkles } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import type { CleaningOp, CleaningType, Profile } from "@/lib/dataprep";

/** Props for {@link AiSuggestPanel}. */
export interface AiSuggestPanelProps {
  /** Dataset id (used in API path). */
  datasetId: string;
  /** Current profile (sent to /ai-suggest). */
  profile: Profile;
  /** Fired after a successful apply (parent refreshes profile). */
  onApplied: (result: {
    profile: Profile;
    log: unknown;
    sample: unknown;
  }) => void;
}

/**
 * A suggestion is a `CleaningOp` extended with an optional `rationale` and a
 * possibly-missing `id` (the LLM/rule-based fallback doesn't always send one).
 */
type AiSuggestion = {
  id?: string;
  type: CleaningType;
  column?: string;
  params?: Record<string, unknown>;
  rationale?: string;
};

/** AI suggestion response shape. */
interface SuggestResponse {
  suggestions: AiSuggestion[];
  raw?: string;
}

/** Apply-response shape. */
interface ApplyResponse {
  profile: Profile;
  log: unknown;
  sample: unknown;
}

/** Generate a short unique id for an op (used as React key + lib's required id). */
const SUG_ID = () =>
  `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * AiSuggestPanel — LLM-backed cleaning suggestions.
 *
 *  - "Suggest cleaning operations" → POST `/api/dataprep/datasets/[id]/ai-suggest`
 *    with the current `{profile}`. Returns `{ suggestions: CleaningOp[] }`.
 *  - Suggestions render as cards (op type, column, rationale) with checkboxes.
 *  - "Apply selected" → POST `/api/dataprep/datasets/[id]/clean` with the
 *    selected ops, then fires `onApplied` with the new profile/log/sample.
 */
export function AiSuggestPanel({
  datasetId,
  profile,
  onApplied,
}: AiSuggestPanelProps) {
  const [loading, setLoading] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<AiSuggestion[] | null>(
    null,
  );
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  /** Fetch AI suggestions for the current profile. */
  const suggest = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/dataprep/datasets/${datasetId}/ai-suggest`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile }),
        },
      );
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(
          `AI suggest failed (${res.status})${msg ? `: ${msg}` : ""}`,
        );
      }
      const data = (await res.json()) as SuggestResponse;
      const rawList = Array.isArray(data?.suggestions) ? data.suggestions : [];
      // Ensure each suggestion has a stable id (for React keys + selection).
      const list: AiSuggestion[] = rawList.map((s, i) => ({
        ...s,
        id: s.id ?? SUG_ID(),
        params: s.params ?? {},
      }));
      setSuggestions(list);
      setSelected(new Set(list.map((s) => s.id as string)));
      toast.success(`AI suggested ${list.length} cleaning op(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI suggest failed");
    } finally {
      setLoading(false);
    }
  };

  /** Toggle a suggestion checkbox by id. */
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Apply the selected suggestions to the dataset. */
  const applySelected = async () => {
    if (!suggestions) return;
    const picked = suggestions.filter((s) => s.id && selected.has(s.id));
    if (picked.length === 0) {
      toast.error("Select at least one suggestion to apply.");
      return;
    }
    // Normalize to lib `CleaningOp` (id + params required).
    const ops: CleaningOp[] = picked.map((s) => ({
      id: s.id as string,
      type: s.type,
      column: s.column,
      params: s.params ?? {},
    }));
    setApplying(true);
    try {
      const res = await fetch(`/api/dataprep/datasets/${datasetId}/clean`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`Clean failed (${res.status})${msg ? `: ${msg}` : ""}`);
      }
      const data = (await res.json()) as ApplyResponse;
      toast.success(`Applied ${ops.length} AI-suggested op(s)`);
      setSuggestions(null);
      setSelected(new Set());
      onApplied(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <Brain className="h-4 w-4 text-violet-600" aria-hidden="true" />
          AI suggestions
        </CardTitle>
        <CardDescription>
          Ask the LLM to inspect your profile and suggest cleaning operations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* CTA */}
        <div className="flex flex-col items-start gap-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">
              Generate LLM-suggested cleaning operations
            </p>
            <p className="text-[11px] text-slate-500">
              The AI inspects column types, missing patterns, and cardinality,
              then proposes ops with rationale. Falls back to rule-based
              suggestions on LLM failure.
            </p>
          </div>
          <Button
            onClick={suggest}
            disabled={loading || applying}
            className="bg-violet-600 text-white hover:bg-violet-700"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            {loading ? "Thinking…" : "Suggest cleaning"}
          </Button>
        </div>

        {/* Suggestions list thinking placeholder (visible only while loading
            and nothing is shown yet). */}
        {loading && !suggestions && (
          <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/30 px-3 py-4 text-sm text-violet-700">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Asking the model to review your profile…
          </div>
        )}

        {/* No suggestions */}
        {suggestions && suggestions.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            No suggestions returned. Your dataset may already be clean!
          </div>
        )}

        {/* Suggestions list */}
        {suggestions && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Suggested ops
              </h4>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[11px]">
                  {selected.size}/{suggestions.length} selected
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() =>
                    setSelected(
                      selected.size === suggestions.length
                        ? new Set()
                        : new Set(
                            suggestions
                              .map((s) => s.id)
                              .filter((id): id is string => Boolean(id)),
                          ),
                    )
                  }
                >
                  {selected.size === suggestions.length
                    ? "Deselect all"
                    : "Select all"}
                </Button>
              </div>
            </div>

            <ul className="space-y-2">
              {suggestions.map((s, i) => {
                const id = s.id as string;
                const checked = selected.has(id);
                return (
                  <motion.li
                    key={id}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: i * 0.03 }}
                    className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                      checked
                        ? "border-violet-300 bg-violet-50/50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(id)}
                      aria-label={`Select suggestion ${i + 1}`}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                          {s.type}
                        </span>
                        {s.column && (
                          <Badge
                            variant="outline"
                            className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px]"
                          >
                            {s.column}
                          </Badge>
                        )}
                        {s.params &&
                          Object.keys(s.params).length > 0 &&
                          Object.entries(s.params).map(([k, v]) => (
                            <span
                              key={k}
                              className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] text-amber-700"
                            >
                              {k}={String(v)}
                            </span>
                          ))}
                      </div>
                      {s.rationale && (
                        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                          {s.rationale}
                        </p>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </ul>

            <Separator />

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSuggestions(null);
                  setSelected(new Set());
                }}
              >
                Discard
              </Button>
              <Button
                onClick={applySelected}
                disabled={applying || selected.size === 0}
                className="bg-violet-600 text-white hover:bg-violet-700"
              >
                {applying ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
                {applying
                  ? "Applying…"
                  : `Apply selected (${selected.size})`}
              </Button>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

export default AiSuggestPanel;
