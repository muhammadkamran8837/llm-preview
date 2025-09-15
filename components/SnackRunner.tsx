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
// --- keep SDK/imports at the top as-is ---

// Expo SDK 53 compatible versions (extend this as you meet new libs)
const EXPO53_COMPAT: Record<string, string> = {
  // Expo / routing
  "expo-router": "~3.5.22",
  "expo-linking": "~6.3.1",
  "expo-constants": "~16.0.2",
  "expo-status-bar": "~2.0.0",

  // Navigation/runtime bits commonly required
  "react-native-gesture-handler": "~2.16.2",
  "react-native-reanimated": "~3.16.1",
  "react-native-screens": "~4.9.0",
  "react-native-safe-area-context": "4.10.5",

  // Common UI / utilities
  "react-native-svg": "15.2.0",
  "react-native-paper": "^5.12.5",
  "@tanstack/react-query": "^5.51.0",
  "@nkzw/create-context-hook": "^1.1.0",
  "@react-native-async-storage/async-storage": "~1.23.1",
  "lucide-react-native": "^0.468.0",

  // If your LLM sometimes emits react-navigation directly:
  "@react-navigation/native": "^6.1.18",
  "@react-navigation/native-stack": "^6.10.0",
  "@react-navigation/bottom-tabs": "^6.12.1",
};

const DO_NOT_INSTALL = new Set([
  // managed by Snack/Expo SDK
  "react",
  "react-native",
  "react-dom",
  "expo",
  "expo-modules-core",
]);

function rootPackage(mod: string) {
  if (!mod) return null;
  // ignore relative & alias imports (your local files)
  if (mod.startsWith(".") || mod.startsWith("/") || mod.startsWith("@/"))
    return null;

  const parts = mod.split("/");
  if (mod.startsWith("@")) return parts.slice(0, 2).join("/");
  return parts[0];
}

const ROUTER_BASELINE = [
  "expo-router",
  "react-native-gesture-handler",
  "react-native-reanimated",
  "react-native-screens",
  "react-native-safe-area-context",
];

function detectDependencies(files: Record<string, { contents: string }>) {
  const found = new Set<string>();
  const re = /\b(?:import|require)\s*(?:[^'"]*from\s*)?['"]([^'"]+)['"]/g;

  // 1) Scan for imports
  for (const p of Object.keys(files)) {
    const src = files[p]?.contents ?? "";
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const mod = m[1];
      const pkg = rootPackage(mod);
      if (!pkg) continue;
      if (DO_NOT_INSTALL.has(pkg)) continue; // <- skip react/react-native/etc
      found.add(pkg);

      // normalize deep-import hints
      if (mod.includes("react-native-reanimated"))
        found.add("react-native-reanimated");
      if (mod.includes("react-native-gesture-handler"))
        found.add("react-native-gesture-handler");
      if (mod.includes("react-native-svg")) found.add("react-native-svg");
    }
  }

  // 2) If the project uses expo-router structure, add baseline so it boots
  const hasRouter = Object.keys(files).some(
    (p) => p === "App.js" || p.startsWith("app/")
  );
  if (hasRouter) ROUTER_BASELINE.forEach((d) => found.add(d));
  // Always include expo-router (scaffold entry)
  found.add("expo-router");

  // 3) Map to versions. Unknowns: omit (safer than "latest" for Expo Go).
  const deps: Record<string, string> = {};
  const unknown: string[] = [];
  for (const name of found) {
    if (EXPO53_COMPAT[name]) deps[name] = EXPO53_COMPAT[name];
    else unknown.push(name);
  }

  // If you’d rather attempt unknowns, uncomment the next two lines —
  // but prefer adding them to EXPO53_COMPAT when you see errors in Expo Go logs.
  // for (const name of unknown) deps[name] = "latest";

  console.log("[SnackRunner] detected packages:", Array.from(found));
  console.log("[SnackRunner] using dependencies:", deps);
  if (unknown.length) {
    console.warn(
      "[SnackRunner] packages not in EXPO53_COMPAT (omitted):",
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
