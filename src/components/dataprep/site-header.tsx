// MIT License
//
// Copyright (c) 2025 Data Prep Studio contributors
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

import { Database, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * SiteHeader — sticky top navigation bar for Data Prep Studio.
 *
 * Renders a backdrop-blurred `h-16` sticky header containing:
 *  - the gradient-square logo (`Database` lucide icon + "Data Prep Studio" wordmark),
 *  - a small, right-aligned action area (anchor + version badge).
 *
 * The header is intentionally stateless so it can be reused in any layout.
 *
 * @returns A React `<header>` element.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 h-16 w-full border-b border-slate-200/80 bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a
          href="/"
          className="group flex items-center gap-2.5"
          aria-label="Data Prep Studio — home"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md transition-transform group-hover:scale-105">
            <Database className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-tight text-slate-900">
              Data Prep Studio
            </span>
            <span className="text-[11px] text-slate-500">
              Profile · Clean · Transform · Export
            </span>
          </span>
        </a>

        <nav className="flex items-center gap-2" aria-label="Primary">
          <Button variant="ghost" size="sm" asChild>
            <a
              href="#workspace"
              className="text-slate-600 hover:text-emerald-700"
              aria-label="Jump to workspace"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Workspace</span>
            </a>
          </Button>
          <Badge
            variant="outline"
            className="hidden border-emerald-200 bg-emerald-50 text-emerald-700 sm:inline-flex"
          >
            v0.1.0
          </Badge>
        </nav>
      </div>
    </header>
  );
}

export default SiteHeader;
