// MIT License — Data Prep Studio (backend)
// Copyright (c) 2025 Data Prep Studio contributors
//
// GET /api/dataprep/datasets/[id]/export?format=csv
//
// Stream the current (cleaned/transformed) rows of a dataset back to the
// client as a CSV download. The CSV is built manually (no external dep) and
// emitted with `Content-Type: text/csv` and `Content-Disposition: attachment`
// so browsers trigger a "Save As" flow.
//
// Query params: `format` — currently only `csv` is supported (default csv).
// Response: text/csv body (or JSON error).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Row } from "@/lib/dataprep";
import { loadDatasetRows } from "@/lib/dataprep-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Quote a CSV field per RFC 4180:
 *   - Wrap in double quotes if the value contains a comma, double-quote,
 *     newline, or carriage return.
 *   - Escape embedded double-quotes by doubling them.
 *   - `null`/`undefined` -> empty string.
 */
function csvQuote(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s =
    typeof value === "string"
      ? value
      : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build a CSV string from rows + columns.
 *
 * Columns are taken from the Prisma `columns` field if available; otherwise
 * we infer them from the union of keys across the rows. The header is
 * emitted as the first line.
 *
 * Rows are expected to be either:
 *   - arrays of cells (positional) — joined in order with the column header,
 *   - objects keyed by column name — values pulled per-column.
 */
function toCsv(rows: Row[], columns: unknown[]): string {
  let headers: string[];
  if (Array.isArray(columns) && columns.length > 0) {
    headers = columns.map((c) => typeof c === "string" ? c : (c as { name?: string }).name ?? String(c));
  } else if (rows.length > 0 && typeof rows[0] === "object" && !Array.isArray(rows[0])) {
    headers = Object.keys(rows[0] as Record<string, unknown>);
  } else {
    headers = [];
  }

  const lines: string[] = [];
  if (headers.length > 0) {
    lines.push(headers.map(csvQuote).join(","));
  }
  for (const row of rows) {
    if (Array.isArray(row)) {
      // positional row
      lines.push((row as unknown[]).map(csvQuote).join(","));
    } else if (row && typeof row === "object") {
      // object row — pull by header
      const obj = row as Record<string, unknown>;
      lines.push(headers.map((h) => csvQuote(obj[h])).join(","));
    } else {
      // scalar row
      lines.push(csvQuote(row));
    }
  }
  // CRLF per RFC 4180 §2.4.2
  return lines.join("\r\n") + (lines.length > 0 ? "\r\n" : "");
}

/**
 * GET /api/dataprep/datasets/[id]/export?format=csv
 *
 * Returns the current rows of the dataset as a CSV download attachment.
 *
 * @returns 200 text/csv; 404 if dataset (or rows) missing;
 *          400 if format is unsupported; 500 on error.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const format = (url.searchParams.get("format") || "csv").toLowerCase();

    if (format !== "csv") {
      return NextResponse.json(
        { error: `Unsupported export format: ${format}. Only "csv" is supported.` },
        { status: 400 }
      );
    }

    const record = await db.dataset.findUnique({ where: { id } });
    if (!record) {
      return NextResponse.json({ error: `Dataset not found: ${id}` }, { status: 404 });
    }

    const rows = loadDatasetRows(id);
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: `No rows on disk for dataset ${id}; nothing to export` },
        { status: 404 }
      );
    }

    const columns = Array.isArray(record.columns) ? record.columns : [];
    const csv = toCsv(rows, columns);

    const safeName = record.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const baseName = safeName.replace(/\.[a-z0-9]+$/i, "") || "dataset";
    const downloadName = `${baseName}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${downloadName}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
