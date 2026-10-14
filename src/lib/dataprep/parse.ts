// MIT License
// Copyright (c) 2025 Data Prep Studio
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

/**
 * CSV / JSON parsing with type-coercion and column-type inference.
 *
 * The only external dependency is `papaparse` (already installed).  All
 * functions are pure: they do not mutate their input and contain no side
 * effects (no Math.random, no Date.now, no I/O).
 */

import Papa from "papaparse";
import type { Cell, ColumnInfo, ColumnType, Row } from "./types";

/** Matches ISO-8601-ish dates: `YYYY-MM-DD` optionally with time + tz. */
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** Returns true if the value should be treated as "missing" (null/empty). */
function isMissing(v: unknown): v is null | undefined | "" {
  if (v === null || v === undefined) return true;
  return typeof v === "string" && v.trim() === "";
}

/** Try to parse a string as a finite number; return null if not numeric. */
function tryNumber(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!isNaN(n) && isFinite(n)) return n;
  return null;
}

/** Try to parse a string as a boolean ("true" / "false", case-insensitive). */
function tryBoolean(s: string): boolean | null {
  const t = s.trim().toLowerCase();
  if (t === "true") return true;
  if (t === "false") return false;
  return null;
}

/** Try to parse a string as an ISO datetime; return the original string if ok. */
function tryDate(s: string): string | null {
  const t = s.trim();
  if (!ISO_DATE_RE.test(t)) return null;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : t;
}

/**
 * Coerce a raw cell value (string from CSV / any from JSON) into a typed
 * {@link Cell}.  Empty string -> null; "true"/"false" -> boolean; numeric
 * strings -> number; everything else stays a string.
 */
function coerceCell(raw: unknown): Cell {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return isFinite(raw) ? raw : null;
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return String(raw);
  if (raw.trim() === "") return null;

  const b = tryBoolean(raw);
  if (b !== null) return b;
  const n = tryNumber(raw);
  if (n !== null) return n;
  return raw;
}

/**
 * Parse CSV text into rows + inferred column metadata.
 *
 * Uses papaparse with `header: true`, `dynamicTyping: false` (we do our own
 * coercion so empty strings become null and "true"/"false" become booleans).
 */
export function parseCSV(text: string): { rows: Row[]; columns: ColumnInfo[] } {
  const result = Papa.parse(text, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: true,
  }) as unknown as {
    data: Record<string, unknown>[];
    meta: { fields?: string[] };
  };

  const rawData = Array.isArray(result.data) ? result.data : [];
  const rows: Row[] = rawData.map((r) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(r)) {
      out[k] = coerceCell(v);
    }
    return out;
  });

  const fields =
    (result.meta && result.meta.fields) ||
    (rows.length > 0 ? Object.keys(rows[0]) : []);
  const columns = inferColumns(rows, fields);

  return { rows, columns };
}

/**
 * Parse JSON text (an array of objects) into rows + inferred columns.
 * Throws if the top-level value is not an array.
 */
export function parseJSON(text: string): { rows: Row[]; columns: ColumnInfo[] } {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    throw new Error("parseJSON expects a JSON array of objects");
  }
  const rows: Row[] = (data as Record<string, unknown>[]).map((r) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(r)) {
      out[k] = coerceCell(v);
    }
    return out;
  });
  const columns = inferColumns(rows);
  return { rows, columns };
}

/**
 * Infer the semantic type of a column by sampling up to 100 non-null values.
 *
 * Decision rules (in order):
 *  1. >70% of sample parses as a number        -> "numeric"
 *  2. >70% of sample parses as an ISO datetime  -> "datetime"
 *  3. >70% of sample parses as a boolean         -> "boolean"
 *  4. distinct non-null count / total rows < 0.5 -> "categorical"
 *  5. otherwise                                  -> "text"
 *
 * Empty column -> "text".
 */
export function inferColumnType(rows: Row[], name: string): ColumnType {
  if (!rows || rows.length === 0) return "text";

  const sample: Cell[] = [];
  const distinct = new Set<string>();
  let nonNull = 0;

  for (const r of rows) {
    const v = r[name];
    if (isMissing(v)) continue;
    nonNull++;
    distinct.add(String(v));
    if (sample.length < 100) sample.push(v);
  }

  if (sample.length === 0) return "text";
  const n = sample.length;

  let numeric = 0;
  let bool = 0;
  let date = 0;
  for (const v of sample) {
    if (typeof v === "number" && isFinite(v)) {
      numeric++;
    } else if (typeof v === "boolean") {
      bool++;
    } else if (typeof v === "string") {
      if (tryBoolean(v) !== null) bool++;
      else if (tryNumber(v) !== null) numeric++;
      else if (tryDate(v) !== null) date++;
    }
  }

  if (numeric / n > 0.7) return "numeric";
  if (date / n > 0.7) return "datetime";
  if (bool / n > 0.7) return "boolean";

  const cardinality = distinct.size;
  if (cardinality / rows.length < 0.5) return "categorical";
  return "text";
}

/**
 * Infer {@link ColumnInfo} for every column in `rows`.  If `names` is
 * provided, use that ordering (e.g. from papaparse `meta.fields`); otherwise
 * derive the column order from the first row.
 */
export function inferColumns(rows: Row[], names?: string[]): ColumnInfo[] {
  const keys =
    names && names.length > 0
      ? names
      : rows.length > 0
        ? Object.keys(rows[0])
        : [];
  return keys.map((name) => ({
    name,
    inferredType: inferColumnType(rows, name),
  }));
}
