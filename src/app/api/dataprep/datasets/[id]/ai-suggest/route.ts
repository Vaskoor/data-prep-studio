// MIT License — Data Prep Studio (backend)
// Copyright (c) 2025 Data Prep Studio contributors
//
// POST /api/dataprep/datasets/[id]/ai-suggest
//
// Send the dataset's Profile to the z-ai-web-dev-sdk LLM (glm-4.6) and ask
// for up to 5 cleaning operations as a JSON array. Parse the reply into
// `CleaningOp[]` and return `{ suggestions, raw }`. On any SDK failure or
// unparseable reply, fall back to a deterministic rule-based suggestion set
// derived from the profile itself (impute missing numerics with median,
// trim whitespace on text columns, drop_duplicates if dup rows > 0).
//
// Request body: { profile: Profile }
// Response:      { suggestions: CleaningOp[], raw: string }

import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import type { Profile, CleaningOp } from "@/lib/dataprep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** System prompt for the data-quality expert LLM. */
const AI_SYSTEM_PROMPT =
  "You are a data-quality expert. Given a dataset profile (JSON), recommend up to 5 cleaning operations as a JSON array. Each item: {type, column?, params, rationale}. Types: drop_missing, impute, drop_duplicates, fix_types, trim_whitespace, standardize_case, remove_outliers. Respond with ONLY the JSON array, no prose.";

/** Loose shape of a column profile; the lib's actual ColumnProfile is richer. */
interface ColumnProfileLike {
  name?: string;
  type?: string;
  missing?: number;
  missingCount?: number;
  missingPct?: number;
  unique?: number;
  uniqueCount?: number;
  stats?: {
    mean?: number;
    median?: number;
    std?: number;
    min?: number;
    max?: number;
    q1?: number;
    q3?: number;
    outliers?: number;
    outlierCount?: number;
    topValues?: Array<{ value: string; count: number }>;
  };
  whitespaceIssues?: number;
  hasWhitespace?: boolean;
}

/** Loose shape of the Profile passed in; we tolerate extra/missing fields. */
interface ProfileLike {
  columns?: ColumnProfileLike[];
  rowCount?: number;
  colCount?: number;
  duplicateRows?: number;
  duplicates?: number;
  qualityScore?: number;
}

/**
 * Extract the first top-level JSON array from a possibly-markdown-wrapped
 * LLM reply. Returns the parsed array or `null` on failure.
 */
function parseJsonArray(raw: string): unknown[] | null {
  if (!raw) return null;
  let text = raw.trim();
  // strip ```json ... ``` fences if present
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence && fence[1]) text = fence[1].trim();
  // find the first `[` ... matching `]` block
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

/** Coerce a parsed LLM item into a `CleaningOp` (best-effort). */
function coerceOp(item: unknown): CleaningOp | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const type = typeof o.type === "string" ? o.type : undefined;
  if (!type) return null;
  return {
    type,
    ...(o.column != null ? { column: o.column } : {}),
    ...(o.params != null ? { params: o.params } : {}),
    ...(o.rationale != null ? { rationale: o.rationale } : {}),
  } as CleaningOp;
}

/**
 * Deterministic, rule-based fallback for cleaning suggestions. Used when the
 * LLM SDK call fails or returns unparseable text. Rules (per the task spec):
 *   - impute missing numeric columns with median
 *   - trim whitespace on text columns
 *   - drop_duplicates if duplicate rows > 0
 */
function ruleBasedSuggestions(profile: ProfileLike): CleaningOp[] {
  const out: CleaningOp[] = [];
  const columns = Array.isArray(profile.columns) ? profile.columns : [];
  for (const c of columns) {
    const name = typeof c?.name === "string" ? c.name : undefined;
    if (!name) continue;
    const type = (typeof c?.type === "string" ? c.type : "").toLowerCase();
    const missing =
      typeof c?.missingCount === "number"
        ? c.missingCount
        : typeof c?.missing === "number"
        ? c.missing
        : 0;
    const hasWhitespace =
      (typeof c?.whitespaceIssues === "number" && c.whitespaceIssues > 0) ||
      c?.hasWhitespace === true;

    if (missing > 0 && (type.includes("num") || type.includes("int") || type.includes("float"))) {
      const median = typeof c?.stats?.median === "number" ? c.stats.median : undefined;
      out.push({
        id: "sug-" + (out.length + 1),
        type: "impute",
        column: name,
        params: { strategy: "median", value: median },
        rationale: `Column "${name}" has ${missing} missing values; impute with median${
          median != null ? ` (${median})` : ""
        }.`,
      });
    } else if (missing > 0 && (type.includes("cat") || type.includes("text") || type.includes("string"))) {
      out.push({
        id: "sug-" + (out.length + 1),
        type: "impute",
        column: name,
        params: { strategy: "mode" },
        rationale: `Column "${name}" has ${missing} missing values; impute categorical with mode.`,
      });
    }

    if (hasWhitespace || type.includes("text") || type.includes("cat") || type.includes("string")) {
      out.push({
        id: "sug-" + (out.length + 1),
        type: "trim_whitespace",
        column: name,
        params: {},
        rationale: `Trim leading/trailing whitespace in text column "${name}".`,
      });
    }

    if (
      type.includes("num") &&
      typeof c?.stats?.outliers === "number" &&
      c.stats.outliers > 0
    ) {
      out.push({
        id: "sug-" + (out.length + 1),
        type: "remove_outliers",
        column: name,
        params: { method: "iqr" },
        rationale: `Column "${name}" has ${c.stats.outliers} statistical outliers (IQR).`,
      });
    }
  }

  const dupRows =
    typeof profile.duplicateRows === "number"
      ? profile.duplicateRows
      : typeof profile.duplicates === "number"
      ? profile.duplicates
      : 0;
  if (dupRows > 0) {
    out.push({
      id: "sug-" + (out.length + 1),
      type: "drop_duplicates",
      params: {},
      rationale: `Dataset has ${dupRows} duplicate row(s); drop them.`,
    });
  }

  // Hard cap at 5 per the system prompt contract.
  return out.slice(0, 5);
}

/**
 * POST /api/dataprep/datasets/[id]/ai-suggest
 *
 * Body: `{ profile: Profile }`. Calls the z-ai LLM with the AI_SYSTEM_PROMPT
 * and the JSON-serialized profile; parses the reply into CleaningOp[] and
 * returns it. On any failure (SDK error, empty reply, unparseable reply)
 * we return the deterministic rule-based suggestions instead so the UI
 * always has actionable recommendations.
 *
 * @returns 200 `{ suggestions, raw }`; 400 if `profile` missing;
 *          404 if dataset id not found; 500 on server error.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    // Validate the dataset exists (the suggestions are scoped to it for UX).
    const record = await db.dataset.findUnique({ where: { id } });
    if (!record) {
      return NextResponse.json({ error: `Dataset not found: ${id}` }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const profileIn = (body as { profile?: unknown })?.profile;
    if (!profileIn || typeof profileIn !== "object") {
      return NextResponse.json(
        { error: "Body must be { profile: Profile }" },
        { status: 400 }
      );
    }
    const profile = profileIn as ProfileLike;

    // Try the LLM. On any error, fall back to rule-based suggestions.
    let raw = "";
    let suggestions: CleaningOp[] | null = null;
    try {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "system", content: AI_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(profile) },
        ],
        stream: false,
        thinking: { type: "disabled" },
      });
      raw = completion?.choices?.[0]?.message?.content ?? "";
      const arr = parseJsonArray(raw);
      if (arr) {
        const parsed = arr
          .map(coerceOp)
          .filter((x): x is CleaningOp => x !== null)
          .slice(0, 5);
        if (parsed.length > 0) {
          suggestions = parsed;
        }
      }
    } catch (err) {
      // SDK failure — note it in `raw` for debugging and fall back.
      raw = `[llm-error] ${err instanceof Error ? err.message : String(err)}`;
    }

    if (!suggestions || suggestions.length === 0) {
      suggestions = ruleBasedSuggestions(profile);
      raw = raw
        ? `${raw}\n[fallback: rule-based suggestions applied]`
        : "[fallback: rule-based suggestions applied]";
    }

    return NextResponse.json({ suggestions, raw });
  } catch (err) {
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
