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
 * Dataset + column profiling.
 *
 * Pure functions; no side effects on input rows and no non-determinism.
 */

import { inferColumnType } from "./parse";
import { numericStats } from "./stats";
import type {
  BooleanStats,
  CategoricalStats,
  ColumnInfo,
  ColumnProfile,
  DateTimeStats,
  Profile,
  QualityScore,
  Row,
} from "./types";
import { computeQuality } from "./quality";

/** Treat null / undefined / whitespace-only string as missing. */
function isMissing(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  return typeof v === "string" && v.trim() === "";
}

/** Coerce a cell to a number (parse numeric strings); null if not numeric. */
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    if (!isNaN(n) && isFinite(n)) return n;
  }
  return null;
}

/** Coerce a cell to a boolean; null if not boolean-like. */
function toBoolean(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") {
    if (v === 1) return true;
    if (v === 0) return false;
    return null;
  }
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t === "true" || t === "1") return true;
    if (t === "false" || t === "0") return false;
  }
  return null;
}

/**
 * Profile a single column: count / missing / unique (with percentages) plus
 * type-specific statistics (numeric, categorical, datetime, boolean).
 *
 * The column's semantic type is inferred internally via {@link inferColumnType}.
 */
export function profileColumn(rows: Row[], name: string): ColumnProfile {
  const count = rows.length;
  const type = inferColumnType(rows, name);

  const values: unknown[] = [];
  const distinct = new Set<string>();
  let missing = 0;

  for (const r of rows) {
    const v = r[name];
    if (isMissing(v)) {
      missing++;
      continue;
    }
    values.push(v);
    distinct.add(String(v));
  }

  const unique = distinct.size;
  const missingPct = count > 0 ? (missing / count) * 100 : 0;
  const uniquePct = count > 0 ? (unique / count) * 100 : 0;

  const profile: ColumnProfile = {
    name,
    type,
    count,
    missing,
    missingPct,
    unique,
    uniquePct,
  };

  if (type === "numeric") {
    const nums = values
      .map(toNumber)
      .filter((v): v is number => v !== null);
    profile.numeric = numericStats(nums);
  } else if (type === "categorical") {
    const counts = new Map<string, number>();
    for (const v of values) {
      const key = String(v);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // Sort by count desc, then value asc for deterministic ordering.
    const sorted = [...counts.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
    const total = values.length;
    const top = sorted.slice(0, 10).map(([value, c]) => ({
      value,
      count: c,
      pct: total > 0 ? (c / total) * 100 : 0,
    }));
    const catStats: CategoricalStats = { cardinality: counts.size, top };
    profile.categorical = catStats;
  } else if (type === "datetime") {
    const parsed = values
      .map((v) => {
        const s = typeof v === "string" ? v.trim() : String(v);
        return { s, t: new Date(s).getTime() };
      })
      .filter((d) => !isNaN(d.t));
    parsed.sort((a, b) => a.t - b.t);
    if (parsed.length > 0) {
      const first = parsed[0];
      const last = parsed[parsed.length - 1];
      const days = (last.t - first.t) / (1000 * 60 * 60 * 24);
      const dtStats: DateTimeStats = {
        min: first.s,
        max: last.s,
        range: `${Math.abs(days).toFixed(0)} days`,
      };
      profile.datetime = dtStats;
    } else {
      profile.datetime = { min: "", max: "", range: "" };
    }
  } else if (type === "boolean") {
    let trueCount = 0;
    let falseCount = 0;
    for (const v of values) {
      const b = toBoolean(v);
      if (b === true) trueCount++;
      else if (b === false) falseCount++;
    }
    const bStats: BooleanStats = { trueCount, falseCount };
    profile.boolean = bStats;
  }

  return profile;
}

/** Serialize a row to a stable string key (sorted entries) for dedup. */
function serializeRow(r: Row): string {
  const entries = Object.entries(r).filter(
    ([k]) => k !== undefined && k !== null,
  );
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(entries.map(([k, v]) => [k, v]));
}

/**
 * Count exact duplicate rows in `rows` (order-agnostic; compares column
 * names + values).  Returns the number of *extra* occurrences beyond the
 * first for each duplicate signature.
 */
export function detectDuplicateRows(rows: Row[]): number {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const key = serializeRow(r);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  let dups = 0;
  for (const c of seen.values()) {
    if (c > 1) dups += c - 1;
  }
  return dups;
}

/**
 * Profile the entire dataset: per-column profiles + total missing cells +
 * duplicate row count + overall quality score.
 */
export function profileDataset(rows: Row[], columns: ColumnInfo[]): Profile {
  const colCount = columns.length;
  const rowCount = rows.length;

  const colProfiles = columns.map((c) => profileColumn(rows, c.name));
  const missingCells = colProfiles.reduce((acc, c) => acc + c.missing, 0);
  const duplicateRows = detectDuplicateRows(rows);

  const placeholder: QualityScore = {
    completeness: 0,
    uniqueness: 0,
    consistency: 0,
    validity: 0,
    overall: 0,
  };
  const profile: Profile = {
    rowCount,
    colCount,
    columns: colProfiles,
    missingCells,
    duplicateRows,
    quality: placeholder,
  };
  profile.quality = computeQuality(profile);
  return profile;
}
