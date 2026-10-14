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
 * Cleaning operations: drop_missing, impute, drop_duplicates, fix_types,
 * trim_whitespace, standardize_case, remove_outliers.
 *
 * Pure functions: input rows are deep-cloned before any mutation, so callers
 * can pass live data without worrying about side effects.
 */

import { numericStats } from "./stats";
import type { Cell, CleaningOp, OpResult, Row } from "./types";

/** Treat null / undefined / whitespace-only string as missing. */
function isMissing(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  return typeof v === "string" && v.trim() === "";
}

/** Shallow-per-row deep clone (cells are primitives, so this is enough). */
function deepClone(rows: Row[]): Row[] {
  return rows.map((r) => ({ ...r }));
}

/** Coerce a cell to a number; null if not numeric. */
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

/** Coerce a raw cell to a typed {@link Cell} (numeric/boolean/null/string). */
function coerceCellType(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "boolean") return v;
  if (typeof v !== "string") return String(v);
  const t = v.trim();
  if (t === "") return null;
  const low = t.toLowerCase();
  if (low === "true") return true;
  if (low === "false") return false;
  const n = Number(t);
  if (!isNaN(n) && isFinite(n)) return n;
  return t;
}

/** Serialize a row to a stable string key for dedup (sorted entries). */
function serializeRow(r: Row): string {
  const entries = Object.entries(r);
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(entries.map(([k, v]) => [k, v]));
}

/** Apply a sequence of cleaning operations in order, accumulating a log. */
export function applyCleaning(rows: Row[], ops: CleaningOp[]): OpResult {
  let current = deepClone(rows);
  const log: OpResult["log"] = [];

  for (const op of ops) {
    let affected = 0;
    let message = "";

    switch (op.type) {
      case "drop_missing": {
        const col = op.column;
        const before = current.length;
        if (col) {
          current = current.filter((r) => !isMissing(r[col]));
        } else {
          current = current.filter(
            (r) => !Object.values(r).some((v) => isMissing(v)),
          );
        }
        affected = before - current.length;
        message = `Dropped ${affected} rows with missing values${col ? ` in '${col}'` : ""}`;
        break;
      }

      case "impute": {
        const col = op.column;
        const strategy = op.params?.strategy as
          | "mean"
          | "median"
          | "mode"
          | "constant"
          | undefined;
        if (!col) {
          message = "impute requires 'column'";
          break;
        }
        if (!strategy) {
          message = "impute requires 'strategy'";
          break;
        }
        let fillValue: Cell = null;
        if (strategy === "constant") {
          fillValue = (op.params?.value ?? null) as Cell;
        } else if (strategy === "mean" || strategy === "median") {
          const nums: number[] = [];
          for (const r of current) {
            const n = toNumber(r[col]);
            if (n !== null) nums.push(n);
          }
          const stats = numericStats(nums);
          fillValue = strategy === "mean" ? stats.mean : stats.median;
        } else if (strategy === "mode") {
          const counts = new Map<string, number>();
          for (const r of current) {
            const v = r[col];
            if (isMissing(v)) continue;
            const k = String(v);
            counts.set(k, (counts.get(k) ?? 0) + 1);
          }
          let best: string | null = null;
          let bestCount = -1;
          // Deterministic: highest count, then lexicographically smallest key.
          const sortedEntries = [...counts.entries()].sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1];
            return a[0].localeCompare(b[0]);
          });
          if (sortedEntries.length > 0) {
            best = sortedEntries[0][0];
            bestCount = sortedEntries[0][1];
          }
          fillValue = best === null ? null : best;
          void bestCount;
        }
        for (const r of current) {
          if (isMissing(r[col])) {
            r[col] = fillValue;
            affected++;
          }
        }
        message = `Imputed ${affected} missing cells in '${col}' (strategy=${strategy})`;
        break;
      }

      case "drop_duplicates": {
        const before = current.length;
        const seen = new Set<string>();
        const out: Row[] = [];
        for (const r of current) {
          const key = serializeRow(r);
          if (!seen.has(key)) {
            seen.add(key);
            out.push(r);
          } else {
            affected++;
          }
        }
        current = out;
        message = `Dropped ${affected} duplicate rows (before=${before}, after=${current.length})`;
        break;
      }

      case "fix_types": {
        const col = op.column;
        const targets = col
          ? [col]
          : current.length > 0
            ? Object.keys(current[0])
            : [];
        for (const r of current) {
          for (const c of targets) {
            const v = r[c];
            const nv = coerceCellType(v);
            if (nv !== v) {
              r[c] = nv;
              affected++;
            }
          }
        }
        message = `Coerced types in ${col ? `'${col}'` : `${targets.length} columns`} (${affected} cells)`;
        break;
      }

      case "trim_whitespace": {
        const col = op.column;
        const targets = col
          ? [col]
          : current.length > 0
            ? Object.keys(current[0])
            : [];
        for (const r of current) {
          for (const c of targets) {
            const v = r[c];
            if (typeof v === "string") {
              const trimmed = v.trim();
              if (trimmed !== v) {
                r[c] = trimmed === "" ? null : trimmed;
                affected++;
              }
            }
          }
        }
        message = `Trimmed whitespace in ${col ? `'${col}'` : `${targets.length} columns`} (${affected} cells)`;
        break;
      }

      case "standardize_case": {
        const col = op.column;
        const caseType = op.params?.case as
          | "lower"
          | "upper"
          | "title"
          | undefined;
        if (!col || !caseType) {
          message = "standardize_case requires 'column' and 'case'";
          break;
        }
        for (const r of current) {
          const v = r[col];
          if (typeof v === "string") {
            let nv: string;
            if (caseType === "lower") {
              nv = v.toLowerCase();
            } else if (caseType === "upper") {
              nv = v.toUpperCase();
            } else {
              nv = v.replace(
                /\w\S*/g,
                (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase(),
              );
            }
            if (nv !== v) {
              r[col] = nv;
              affected++;
            }
          }
        }
        message = `Standardized case in '${col}' (${affected} cells, case=${caseType})`;
        break;
      }

      case "remove_outliers": {
        const col = op.column;
        const method = op.params?.method as "iqr" | "zscore" | undefined;
        if (!col || !method) {
          message = "remove_outliers requires 'column' and 'method'";
          break;
        }
        const nums: number[] = [];
        for (const r of current) {
          const n = toNumber(r[col]);
          if (n !== null) nums.push(n);
        }
        const stats = numericStats(nums);

        if (method === "iqr") {
          const low = stats.q1 - 1.5 * stats.iqr;
          const high = stats.q3 + 1.5 * stats.iqr;
          for (const r of current) {
            const n = toNumber(r[col]);
            if (n !== null && (n < low || n > high)) {
              r[col] = null;
              affected++;
            }
          }
        } else if (method === "zscore") {
          const threshold =
            typeof op.params?.threshold === "number"
              ? op.params.threshold
              : 3;
          const std = stats.std || 1;
          for (const r of current) {
            const n = toNumber(r[col]);
            if (
              n !== null &&
              Math.abs((n - stats.mean) / std) > threshold
            ) {
              r[col] = null;
              affected++;
            }
          }
        }
        // Decision: outliers are SET TO NULL (not dropped), preserving row count.
        message = `Removed ${affected} outliers in '${col}' (method=${method}, set to null)`;
        break;
      }

      default: {
        message = `Unknown cleaning op: ${op.type}`;
      }
    }

    log.push({ op: op.type, affected, message });
  }

  return { rows: current, log };
}
