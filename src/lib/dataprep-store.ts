// MIT License — Data Prep Studio (backend)
// Copyright (c) 2025 Data Prep Studio contributors
//
// Thin persistence helper for dataset row payloads.
//
// The Prisma `Dataset` row stores metadata + cached profile + ops log; the
// potentially-large row payload itself is written to disk under
// `/home/z/my-project/data/uploads/<id>.json` to keep the SQLite row small
// and to support fast read/modify/write cycles during cleaning/transforms.
//
// A simple in-process Map cache is kept as a fallback so that a transient
// filesystem error never breaks an in-flight session: if the disk write
// fails the rows still live in memory for the rest of the process lifetime,
// and vice versa: if the disk read fails we fall back to the cache.

import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from "fs";
import path from "path";
import type { Row } from "@/lib/dataprep";

const UPLOAD_DIR = "/home/z/my-project/data/uploads";

/**
 * Per-process cache. Keyed by dataset id. Acts as a write-through cache for
 * `saveDatasetRows` and as a fallback when the on-disk file is unreadable.
 */
const cache = new Map<string, Row[]>();

/** Recursively create the upload directory; swallows errors. */
function ensureDir(): void {
  try {
    mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch {
    // ignore — disk may be read-only; cache will hold the payload
  }
}

/** Resolve the on-disk path for a given dataset id. */
function filePath(id: string): string {
  return path.join(UPLOAD_DIR, `${id}.json`);
}

/**
 * Persist the given rows for the dataset id.
 *
 * Writes JSON to `data/uploads/<id>.json` (creating the directory if needed)
 * and also mirrors the payload in the in-memory cache so subsequent reads
 * succeed even if the filesystem later becomes unavailable.
 *
 * Errors are swallowed — disk failures silently fall back to the cache and
 * a warning is logged. The function returns `void` per its contract.
 */
export function saveDatasetRows(id: string, rows: Row[]): void {
  cache.set(id, rows);
  try {
    ensureDir();
    writeFileSync(filePath(id), JSON.stringify(rows), "utf8");
  } catch (err) {
    console.warn(
      `[dataprep-store] file write failed for ${id}, using in-memory cache:`,
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Load the rows for the given dataset id.
 *
 * Tries the on-disk JSON file first; on any failure falls back to the
 * in-memory cache. Returns an empty array if neither is available so the
 * caller can simply check `rows.length === 0` and react accordingly.
 */
export function loadDatasetRows(id: string): Row[] {
  try {
    const raw = readFileSync(filePath(id), "utf8");
    const rows = JSON.parse(raw) as Row[];
    if (Array.isArray(rows)) {
      cache.set(id, rows);
      return rows;
    }
  } catch {
    // fall through to cache
  }
  return cache.get(id) ?? [];
}

/**
 * Remove the on-disk rows file and evict the cache entry for the id.
 * Silently ignores missing files.
 */
export function deleteDatasetRows(id: string): void {
  cache.delete(id);
  try {
    unlinkSync(filePath(id));
  } catch {
    // ignore — file may not exist
  }
}
