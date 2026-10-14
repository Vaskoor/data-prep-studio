import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Data Prep Studio — Profile · Clean · Transform · Export",
  description:
    "A polished, PhD-level data-prep dashboard: profile CSV/JSON datasets, clean missing values & outliers, transform columns, get AI-suggested cleaning ops, and export cleaned CSV — all in your browser. Built with Next.js, shadcn/ui, recharts, and the z-ai-web-dev-sdk.",
  keywords: [
    "data prep",
    "data cleaning",
    "data profiling",
    "CSV",
    "JSON",
    "data transformation",
    "AI data cleaning",
    "data quality",
    "Next.js",
    "shadcn/ui",
    "recharts",
  ],
  authors: [{ name: "Data Prep Studio" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Data Prep Studio",
    description:
      "Profile, clean, transform, and export CSV/JSON datasets — with AI-suggested cleaning ops.",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Capture the external preview host on every server render so the sandbox
  // can learn its own public URL (for serving the git bundle to the user's Mac).
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host") || "unknown";
    const proto = h.get("x-forwarded-proto") || "https";
    if (host && host !== "localhost:3000" && host !== "localhost") {
      const fs = await import("fs");
      const line = `${new Date().toISOString()} ${proto}://${host}\n`;
      fs.appendFileSync("/tmp/external-host.txt", line);
      fs.writeFileSync("/tmp/external-preview-url.txt", `${proto}://${host}`);
    }
  } catch {}
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
