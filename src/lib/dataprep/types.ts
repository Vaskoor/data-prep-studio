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
 * Shared type contracts for the Data Prep Studio data-prep library.
 *
 * This module is the single source of truth for the public surface area of
 * the library.  Every other module in `./dataprep/*` re-exports and consumes
 * the types defined here.  Pure TypeScript, zero runtime dependencies.
 */

/** A single cell value (after coercion from raw CSV/JSON input). */
export type Cell = string | number | boolean | null;

/** A row is an ordered mapping from column name to cell value. */
export type Row = Record<string, Cell>;

/** Inferred semantic type of a column. */
export type ColumnType =
  | "numeric"
  | "categorical"
  | "datetime"
  | "boolean"
  | "text";

/** Lightweight column metadata (name + inferred type). */
export interface ColumnInfo {
  /** Column name (key in each {@link Row}). */
  name: string;
  /** Inferred semantic type. */
  inferredType: ColumnType;
}

/** Dataset-level metadata (used for storage + UI). */
export interface DatasetMeta {
  id: string;
  name: string;
  filename: string;
  rowCount: number;
  colCount: number;
  createdAt: string;
}

/** A histogram bin with a human-readable range label. */
export interface HistogramBin {
  bin: string;
  count: number;
}

/** Summary statistics for a numeric column. */
export interface NumericStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  std: number;
  q1: number;
  q3: number;
  iqr: number;
  histogram: HistogramBin[];
  outliers: number;
}

/** Summary statistics for a categorical column. */
export interface CategoricalStats {
  cardinality: number;
  top: { value: string; count: number; pct: number }[];
}

/** Summary statistics for a datetime column. */
export interface DateTimeStats {
  min: string;
  max: string;
  range: string;
}

/** Summary statistics for a boolean column. */
export interface BooleanStats {
  trueCount: number;
  falseCount: number;
}

/** Per-column profile (the building block of a {@link Profile}). */
export interface ColumnProfile {
  name: string;
  type: ColumnType;
  count: number;
  missing: number;
  missingPct: number;
  unique: number;
  uniquePct: number;
  numeric?: NumericStats;
  categorical?: CategoricalStats;
  datetime?: DateTimeStats;
  boolean?: BooleanStats;
}

/** Overall data-quality score (each component is 0..1). */
export interface QualityScore {
  completeness: number;
  uniqueness: number;
  consistency: number;
  validity: number;
  overall: number;
}

/** Full dataset profile (rows + columns + missing/duplicate/quality). */
export interface Profile {
  rowCount: number;
  colCount: number;
  columns: ColumnProfile[];
  missingCells: number;
  duplicateRows: number;
  quality: QualityScore;
}

/** Supported cleaning operation types. */
export type CleaningType =
  | "drop_missing"
  | "impute"
  | "drop_duplicates"
  | "fix_types"
  | "trim_whitespace"
  | "standardize_case"
  | "remove_outliers";

/** A single cleaning operation to apply (id + type + optional target). */
export interface CleaningOp {
  id: string;
  type: CleaningType;
  column?: string;
  params: Record<string, any>;
  /** Optional human-readable rationale (e.g. from the AI suggester). Ignored by the cleaning engine. */
  rationale?: string;
}

/** The result of applying one or more operations. */
export interface OpResult {
  rows: Row[];
  log: { op: string; affected: number; message: string }[];
}

/** Supported transform operation types. */
export type TransformType =
  | "normalize"
  | "standardize"
  | "onehot_encode"
  | "label_encode"
  | "bin_equal_width"
  | "bin_equal_freq"
  | "date_parts"
  | "text_length";

/** A single transform operation to apply (id + type + optional target). */
export interface TransformOp {
  id: string;
  type: TransformType;
  column?: string;
  params: Record<string, any>;
}
