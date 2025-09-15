"use client";

import * as React from "react";
import { parseLLMTextToSnackFiles } from "@/lib/parseLLMText";
import { withExpoSnackScaffold } from "@/lib/snackScaffold";

type Props = { llmText: string };
const SDK = "53.0.0";

/** Expo SDK 53-compatible versions for common libs.
 *  Add to this map as you encounter new packages.
 */
// --- at top of SnackRunner.tsx (keep SDK/imports as you have) ---

// Expo SDK 53 compatible versions
const EXPO53_COMPAT: Record<string, string> = {
  // Expo / routing
  "expo-router": "~3.5.22",
  "expo-linking": "~6.3.1",
  "expo-constants": "~16.0.2",
  "expo-status-bar": "~2.0.0",

  // React Navigation runtime pieces used under the hood frequently
  "react-native-gesture-handler": "~2.16.2",
  "react-native-reanimated": "~3.16.1",
  "react-native-screens": "~4.9.0",
  "react-native-safe-area-context": "4.10.5",

  // SVG & common UI libs
  "react-native-svg": "15.2.0",
  "react-native-paper": "^5.12.5",

  // State/cache/etc.
  "@tanstack/react-query": "^5.51.0",
  "@nkzw/create-context-hook": "^1.1.0",
  "@react-native-async-storage/async-storage": "~1.23.1",

  // Icons
  "lucide-react-native": "^0.468.0",

  // Optional, if you ever see these in imports
  "@react-navigation/native": "^6.1.18",
  "@react-navigation/native-stack": "^6.10.0",
  "@react-navigation/bottom-tabs": "^6.12.1",
};

function rootPackage(mod: string) {
  if (!mod) return null;
  // ignore relative & alias paths (these are your local files)
  if (mod.startsWith(".") || mod.startsWith("/") || mod.startsWith("@/"))
    return null;

  // keep only the top-level npm package
  const parts = mod.split("/");
  if (mod.startsWith("@")) return parts.slice(0, 2).join("/");
  return parts[0];
}

// Heuristic baseline so router apps boot even if code doesn't import these directly
const BASELINE_FOR_ROUTER = [
  "expo-router",
  "react-native-gesture-handler",
  "react-native-reanimated",
  "react-native-screens",
  "react-native-safe-area-context",
];

function detectDependencies(files: Record<string, { contents: string }>) {
  const found = new Set<string>();
  const re = /\b(?:import|require)\s*(?:[^'"]*from\s*)?['"]([^'"]+)['"]/g;

  // 1) scan all files for import/require
  for (const path of Object.keys(files)) {
    const src = files[path]?.contents ?? "";
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const mod = m[1];
      const pkg = rootPackage(mod);
      if (!pkg) continue;
      found.add(pkg);

      // normalize common deep-import hints
      if (mod.includes("react-native-reanimated"))
        found.add("react-native-reanimated");
      if (mod.includes("react-native-gesture-handler"))
        found.add("react-native-gesture-handler");
      if (mod.includes("react-native-svg")) found.add("react-native-svg");
    }
  }

  // 2) if your tree has `app/` (router), add baseline nav deps
  const hasRouter = Object.keys(files).some(
    (p) => p === "App.js" || p.startsWith("app/")
  );
  if (hasRouter) BASELINE_FOR_ROUTER.forEach((d) => found.add(d));

  // 3) Always include expo-router so the scaffold entry resolves
  found.add("expo-router");

  // 4) Map to SDK-compatible versions; unknowns → "latest" (log them for visibility)
  const deps: Record<string, string> = {};
  const unknown: string[] = [];
  for (const name of found) {
    if (EXPO53_COMPAT[name]) deps[name] = EXPO53_COMPAT[name];
    else unknown.push(name);
  }
  for (const name of unknown) deps[name] = "latest";

  console.log("[SnackRunner] detected packages:", Array.from(found));
  console.log("[SnackRunner] dependencies:", deps);
  if (unknown.length) {
    console.warn(
      "[SnackRunner] unknown packages defaulted to 'latest':",
      unknown
    );
  }
  return deps;
}

export default function SnackRunner({ llmText }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [webUrl, setWebUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(async () => {
    try {
      setBusy(true);
      setError(null);
      setWebUrl(null);

      if (!llmText.trim())
        throw new Error("Please paste or upload the LLM .txt first.");

      // 1) parse + scaffold → files
      const baseFiles = parseLLMTextToSnackFiles(llmText);
      const files = withExpoSnackScaffold(baseFiles);
      console.log("[SnackRunner] files:", Object.keys(files));

      // 2) auto-detect deps from imports (+ compat map)
      const dependencies = detectDependencies(files);

      // 3) POST payload → get public codeUrl (Vercel Blob)
      const r = await fetch("/api/snack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "LLM Preview",
          sdkVersion: SDK,
          dependencies,
          files,
        }),
      });
      if (!r.ok) {
        const msg = await r.text().catch(() => "");
        throw new Error(`Upload failed: ${r.status} ${msg}`);
      }
      const { codeUrl } = await r.json();

      // 4) build embed URL (single QR inside the iframe)
      const embedded = `https://snack.expo.dev/embedded?platform=web&preview=true&sdkVersion=${encodeURIComponent(
        SDK
      )}&name=${encodeURIComponent("LLM Preview")}&codeUrl=${encodeURIComponent(
        codeUrl
      )}`;

      setWebUrl(embedded);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [llmText]);

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={run}
          disabled={busy}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {busy ? "Building…" : "Run Preview"}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      <div className="min-h-[720px] w-full overflow-hidden rounded border">
        {webUrl ? (
          <iframe
            title="Snack Preview"
            src={webUrl}
            style={{ width: "100%", height: 720, border: 0 }}
            // the embed shows the single QR to scan in Expo Go
            allow="camera; microphone; clipboard-read; clipboard-write; accelerometer; gyroscope"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            Paste/upload your .txt and click “Run Preview”
          </div>
        )}
      </div>
    </div>
  );
}
