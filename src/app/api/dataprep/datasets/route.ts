// MIT License — Data Prep Studio (backend)
// Copyright (c) 2025 Data Prep Studio contributors
//
// POST /api/dataprep/datasets — upload a CSV/JSON dataset, or generate a
//                              synthetic sample dataset, then profile + persist it.
// GET  /api/dataprep/datasets — list all datasets (newest first).
//
// Request body for POST:
//   { name, filename, source: "csv"|"json", content: string }
//   { name?, source: "sample" }     // generate the built-in sample dataset
//   { sample: true }                 // shortcut for sample
//
// Response for POST: { meta: DatasetMeta, profile: Profile }
// Response for GET : DatasetMeta[]

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  parseCSV,
  parseJSON,
  profileDataset,
  type Row,
  type DatasetMeta,
  type Profile,
} from "@/lib/dataprep";
import { saveDatasetRows } from "@/lib/dataprep-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Local type for the {rows, columns} shape returned by parseCSV / parseJSON. */
interface Parsed {
  rows: Row[];
  columns: unknown[];
}

/**
 * Coerce a Prisma `Dataset` row into the public `DatasetMeta` shape consumed
 * by the UI. Prisma stores `columns` as Json (unknown); we forward it as-is.
 */
function toMeta(d: {
  id: string;
  name: string;
  filename: string;
  source: string;
  rowCount: number;
  colCount: number;
  qualityScore: number;
  createdAt: Date;
  updatedAt: Date;
  columns: unknown;
}): DatasetMeta {
  return {
    id: d.id,
    name: d.name,
    filename: d.filename,
    source: d.source,
    rowCount: d.rowCount,
    colCount: d.colCount,
    qualityScore: d.qualityScore,
    columns: Array.isArray(d.columns) ? d.columns : [],
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : String(d.updatedAt),
  } as unknown as DatasetMeta;
}

/**
 * Build a synthetic CSV (~200 rows) demonstrating numeric, categorical,
 * datetime, missing-value, and outlier patterns so the user can try the
 * studio instantly without uploading a file. Also injects a few duplicate
 * rows so `drop_duplicates` recommendations have something to act on.
 */
function generateSampleCsv(): string {
  const lines: string[] = [];
  lines.push("id,full_name,age,city,salary,join_date,rating,status,notes");
  const cities = [
    "Kathmandu",
    "Pokhara",
    "Lalitpur",
    "Bharatpur",
    "Biratnagar",
    "  Kathmandu  ",
    "Dharan",
    "  Pokhara ",
  ];
  const statuses = ["active", "ACTIVE", "Active", "pending", "PENDING", "inactive"];
  const notes = ["follow up", "verified", "needs review", "ok", "PRIORITY", "  ok  "];
  const N = 200;
  for (let i = 0; i < N; i++) {
    const id = i + 1;
    const name = `user_${1000 + i}`;
    // ~12% missing ages
    const age = i % 8 === 0 ? "" : String(18 + (i * 7) % 47);
    const city = cities[i % cities.length];
    // ~10% missing salaries
    const baseSalary = i % 10 === 0 ? "" : String(30000 + (i * 1373) % 120000);
    // inject a handful of outliers
    let salary = baseSalary;
    if (i === 7 || i === 99 || i === 150) salary = "9999999";
    if (i === 33) salary = "-50";
    const joinDate = new Date(2020, 0, 1 + (i % 365)).toISOString().slice(0, 10);
    // rating in [0, 5] with ~7% missing
    const rating = i % 13 === 0 ? "" : ((Math.sin(i) + 1) * 2.4 + (i % 7) * 0.1).toFixed(2);
    const status = statuses[i % statuses.length];
    const note = notes[i % notes.length];
    lines.push([id, name, age, city, salary, joinDate, rating, status, note].join(","));
  }
  // a couple duplicate rows so drop_duplicates recommendations have signal
  lines.push(
    ["1", "user_1000", "25", "Kathmandu", "30000", "2020-01-01", "2.40", "active", "follow up"].join(",")
  );
  lines.push(
    ["2", "user_1001", "32", "Pokhara", "43730", "2020-01-02", "2.50", "ACTIVE", "verified"].join(",")
  );
  return lines.join("\n");
}

/**
 * POST /api/dataprep/datasets
 *
 * Accept `{ name, filename, source, content }` (csv|json) or `{ sample: true }`.
 * Parse, profile, save rows to disk, and create a `Dataset` record in Prisma.
 *
 * @returns 201 `{ meta, profile }` on success; 400 on bad input; 500 on server error.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const isSample = body.sample === true || body.source === "sample";

    let name: string;
    let filename: string;
    let source: string;
    let content: string;

    if (isSample) {
      name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Sample Dataset";
      filename =
        typeof body.filename === "string" && body.filename.trim()
          ? body.filename.trim()
          : "sample.csv";
      source = "sample";
      content = generateSampleCsv();
    } else {
      name = typeof body.name === "string" ? body.name.trim() : "";
      filename = typeof body.filename === "string" ? body.filename.trim() : "";
      source = typeof body.source === "string" ? body.source.trim() : "";
      content = typeof body.content === "string" ? body.content : "";
      if (!name || !filename || !source || !content) {
        return NextResponse.json(
          {
            error:
              "Required fields: name, filename, source (csv|json), content. Or send {sample:true}.",
          },
          { status: 400 }
        );
      }
      if (!["csv", "json"].includes(source)) {
        return NextResponse.json({ error: `Unsupported source: ${source}` }, { status: 400 });
      }
    }

    // Parse the raw text into rows + columns.
    let parsed: Parsed;
    try {
      if (source === "json") {
        parsed = parseJSON(content) as Parsed;
      } else {
        parsed = parseCSV(content) as Parsed;
      }
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to parse ${source.toUpperCase()}: ${err instanceof Error ? err.message : String(err)}` },
        { status: 400 }
      );
    }

    if (!parsed || !Array.isArray(parsed.rows) || parsed.rows.length === 0) {
      return NextResponse.json({ error: "Parsed dataset has no rows" }, { status: 400 });
    }
    if (!Array.isArray(parsed.columns) || parsed.columns.length === 0) {
      return NextResponse.json({ error: "Parsed dataset has no columns" }, { status: 400 });
    }

    // Compute the profile (cached on the Prisma row).
    let profile: Profile;
    try {
      profile = profileDataset(parsed.rows, parsed.columns as never);
    } catch (err) {
      return NextResponse.json(
        { error: `Profile failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 400 }
      );
    }

    const qualityScore = Math.round((profile.quality?.overall ?? 0) * 100);

    // Persist the metadata first — we need the id before writing the rows file.
    const created = await db.dataset.create({
      data: {
        name,
        filename,
        source,
        rowCount: parsed.rows.length,
        colCount: parsed.columns.length,
        qualityScore,
        columns: parsed.columns as never,
        profile: profile as never,
        operations: [] as never,
      },
    });

    // Now persist the row payload to disk (with in-memory cache fallback).
    saveDatasetRows(created.id, parsed.rows);

    return NextResponse.json({ meta: toMeta(created), profile }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/dataprep/datasets
 *
 * List all datasets, newest first, as `DatasetMeta[]`.
 */
export async function GET() {
  try {
    const records = await db.dataset.findMany({ orderBy: { createdAt: "desc" } });
    const metas = records.map((r) =>
      toMeta({
        id: r.id,
        name: r.name,
        filename: r.filename,
        source: r.source,
        rowCount: r.rowCount,
        colCount: r.colCount,
        qualityScore: r.qualityScore,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        columns: r.columns,
      })
    );
    return NextResponse.json(metas);
  } catch (err) {
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
