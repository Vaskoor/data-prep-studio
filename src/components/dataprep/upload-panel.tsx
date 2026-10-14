// MIT License
//
// Copyright (c) 2025 Data Prep Studio contributors
// (see full MIT header in site-header.tsx — same license applies here.)

"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { FileText, FileUp, Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DatasetMeta, Profile } from "@/lib/dataprep";

/** Shape returned by `POST /api/dataprep/datasets`. */
interface CreateResponse {
  meta: DatasetMeta;
  profile: Profile;
}

/** Props for {@link UploadPanel}. */
export interface UploadPanelProps {
  /** Fired when a dataset is successfully created (parent refreshes list + selects). */
  onCreated: (meta: DatasetMeta) => void;
}

/**
 * POST a create payload to `/api/dataprep/datasets`.
 *
 * Accepts either `{ source: "sample" }` or
 * `{ name, filename, source: "upload", content }`.
 *
 * @throws `Error` if the request fails.
 */
async function createDataset(
  payload: Record<string, unknown>,
): Promise<CreateResponse> {
  const res = await fetch("/api/dataprep/datasets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status})${msg ? `: ${msg}` : ""}`);
  }
  return (await res.json()) as CreateResponse;
}

/**
 * UploadPanel — multi-path data ingest for Data Prep Studio.
 *
 * Three ingest tabs:
 *  1. **Paste** — a `<Textarea>` for raw CSV/JSON text + a name `<Input>`.
 *  2. **File** — an accessible drag-and-drop dropzone / file picker
 *     (`.csv` or `.json`), read via `FileReader` as text.
 *  3. **Sample** — one click loads a built-in messy sample dataset.
 *
 * On submit, POSTs to `/api/dataprep/datasets` and notifies the parent via
 * `onCreated(meta)`.
 */
export function UploadPanel({ onCreated }: UploadPanelProps) {
  // Paste-mode state
  const [pasteName, setPasteName] = React.useState("");
  const [pasteContent, setPasteContent] = React.useState("");

  // File-mode state
  const [fileName, setFileName] = React.useState("");
  const [fileContent, setFileContent] = React.useState("");
  const [fileMime, setFileMime] = React.useState("");
  const [dragOver, setDragOver] = React.useState(false);

  // Which tab is busy (one at a time)
  const [busy, setBusy] = React.useState<"paste" | "file" | "sample" | null>(
    null,
  );

  /** Read a `File` (CSV or JSON) into local state as text. */
  const handleFile = React.useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      const isJson = /\.json$/i.test(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        setFileName(file.name);
        setFileContent(String(reader.result ?? ""));
        setFileMime(
          file.type ||
            (isJson ? "application/json" : "text/csv"),
        );
      };
      reader.onerror = () => toast.error("Could not read file.");
      reader.readAsText(file);
    },
    [],
  );

  /** Submit the pasted text. */
  const submitPaste = async () => {
    if (!pasteContent.trim()) {
      toast.error("Paste some CSV or JSON first.");
      return;
    }
    setBusy("paste");
    try {
      const isJson =
        pasteContent.trim().startsWith("{") ||
        pasteContent.trim().startsWith("[");
      const name = pasteName.trim() || "Pasted dataset";
      const r = await createDataset({
        name,
        filename: `${name}.${isJson ? "json" : "csv"}`,
        source: isJson ? "json" : "csv",
        content: pasteContent,
      });
      toast.success(
        `Uploaded "${r.meta.name}" (${r.meta.rowCount.toLocaleString()} rows)`,
      );
      onCreated(r.meta);
      setPasteName("");
      setPasteContent("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  /** Submit the chosen file. */
  const submitFile = async () => {
    if (!fileContent) {
      toast.error("Pick a CSV or JSON file first.");
      return;
    }
    setBusy("file");
    try {
      const name =
        fileName.replace(/\.(csv|json)$/i, "") || "Uploaded dataset";
      const isJsonFile = /\.json$/i.test(fileName);
      const r = await createDataset({
        name,
        filename: fileName,
        source: isJsonFile ? "json" : "csv",
        content: fileContent,
      });
      toast.success(
        `Uploaded "${r.meta.name}" (${r.meta.rowCount.toLocaleString()} rows)`,
      );
      onCreated(r.meta);
      setFileName("");
      setFileContent("");
      setFileMime("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  /** Load the built-in sample dataset. */
  const loadSample = async () => {
    setBusy("sample");
    try {
      const r = await createDataset({ source: "sample" });
      toast.success(
        `Loaded sample "${r.meta.name}" (${r.meta.rowCount.toLocaleString()} rows)`,
      );
      onCreated(r.meta);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sample load failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <FileUp className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            Upload data
          </CardTitle>
          <CardDescription>
            Paste CSV/JSON text, drop a file, or load a built-in sample.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="paste">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="paste">
                <FileText className="h-4 w-4" aria-hidden="true" />
                Paste
              </TabsTrigger>
              <TabsTrigger value="file">
                <FileUp className="h-4 w-4" aria-hidden="true" />
                File
              </TabsTrigger>
              <TabsTrigger value="sample">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Sample
              </TabsTrigger>
            </TabsList>

            {/* Paste tab */}
            <TabsContent value="paste" className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="paste-name">Dataset name</Label>
                <Input
                  id="paste-name"
                  placeholder="e.g. sales_q3"
                  value={pasteName}
                  onChange={(e) => setPasteName(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="paste-content">CSV or JSON content</Label>
                <Textarea
                  id="paste-content"
                  placeholder={"col1,col2,col3\n1,2,3\n4,5,6"}
                  rows={6}
                  className="font-mono text-xs"
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={submitPaste}
                disabled={busy !== null}
              >
                {busy === "paste" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="h-4 w-4" aria-hidden="true" />
                )}
                {busy === "paste" ? "Uploading…" : "Upload pasted data"}
              </Button>
            </TabsContent>

            {/* File tab */}
            <TabsContent value="file" className="mt-4 space-y-3">
              <div
                role="button"
                tabIndex={0}
                aria-label="Drop a CSV or JSON file here, or click to choose"
                onClick={() =>
                  document.getElementById("upload-file-input")?.click()
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    document.getElementById("upload-file-input")?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                className={`flex h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed text-sm transition-colors ${
                  dragOver
                    ? "border-emerald-400 bg-emerald-50/60 text-emerald-700"
                    : "border-slate-300 bg-slate-50 text-slate-500 hover:border-emerald-300 hover:bg-emerald-50/30"
                }`}
              >
                {dragOver ? (
                  <FileUp className="mb-1.5 h-6 w-6" aria-hidden="true" />
                ) : (
                  <Upload className="mb-1.5 h-6 w-6" aria-hidden="true" />
                )}
                <span>
                  {fileName ? fileName : "Drop CSV / JSON or click to choose"}
                </span>
                {fileMime && (
                  <span className="mt-0.5 text-[11px] text-slate-400">
                    {fileMime}
                  </span>
                )}
                <input
                  id="upload-file-input"
                  type="file"
                  accept=".csv,.json"
                  className="sr-only"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </div>
              <Button
                className="w-full"
                onClick={submitFile}
                disabled={busy !== null || !fileContent}
              >
                {busy === "file" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="h-4 w-4" aria-hidden="true" />
                )}
                {busy === "file" ? "Uploading…" : "Upload file"}
              </Button>
            </TabsContent>

            {/* Sample tab */}
            <TabsContent value="sample" className="mt-4 space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-800">
                Loads a built-in messy dataset (~30 rows: missing cells,
                duplicates, mixed types) so you can try cleaning immediately.
              </div>
              <Button
                className="w-full"
                onClick={loadSample}
                disabled={busy !== null}
              >
                {busy === "sample" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                )}
                {busy === "sample" ? "Loading…" : "Load sample dataset"}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default UploadPanel;
