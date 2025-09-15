"use client";

import * as React from "react";
import { parseLLMTextToSnackFiles } from "@/lib/parseLLMText";
import { withExpoSnackScaffold } from "@/lib/snackScaffold";

type Props = { llmText: string };
const SDK = "53.0.0";

/* ---------- Expo 53 compat versions ---------- */
const EXPO53_COMPAT: Record<string, string> = {
  // Expo / routing
  "expo-router": "~3.5.22",
  "expo-linking": "~6.3.1",
  "expo-constants": "~16.0.2",
  "expo-status-bar": "~2.0.0",

  // Navigation/runtime bits
  "react-native-gesture-handler": "~2.16.2",
  "react-native-reanimated": "~3.16.1",
  "react-native-screens": "~4.9.0",
  "react-native-safe-area-context": "4.10.5",

  // Common UI / utils
  "react-native-svg": "15.2.0",
  "react-native-paper": "^5.12.5",
  "@tanstack/react-query": "^5.51.0",
  "@nkzw/create-context-hook": "^1.1.0",
  "@react-native-async-storage/async-storage": "~1.23.1",
  "lucide-react-native": "^0.468.0",

  // If LLM emits react-navigation directly
  "@react-navigation/native": "^6.1.18",
  "@react-navigation/native-stack": "^6.10.0",
  "@react-navigation/bottom-tabs": "^6.12.1",
};

const DO_NOT_INSTALL = new Set([
  "react",
  "react-native",
  "react-dom",
  "expo",
  "expo-modules-core",
]);

function rootPackage(mod: string) {
  if (!mod) return null;
  if (mod.startsWith(".") || mod.startsWith("/") || mod.startsWith("@/"))
    return null; // local/alias
  const parts = mod.split("/");
  return mod.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
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

  for (const p of Object.keys(files)) {
    const src = files[p]?.contents ?? "";
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const mod = m[1];
      const pkg = rootPackage(mod);
      if (!pkg || DO_NOT_INSTALL.has(pkg)) continue;
      found.add(pkg);
      if (mod.includes("react-native-reanimated"))
        found.add("react-native-reanimated");
      if (mod.includes("react-native-gesture-handler"))
        found.add("react-native-gesture-handler");
      if (mod.includes("react-native-svg")) found.add("react-native-svg");
    }
  }

  const hasRouter = Object.keys(files).some(
    (p) => p === "App.js" || p.startsWith("app/")
  );
  if (hasRouter) ROUTER_BASELINE.forEach((d) => found.add(d));
  found.add("expo-router");

  const deps: Record<string, string> = {};
  const unknown: string[] = [];
  for (const name of found) {
    if (EXPO53_COMPAT[name]) deps[name] = EXPO53_COMPAT[name];
    else unknown.push(name);
  }
  // Prefer omitting unknowns to avoid SDK mismatches; you can flip to "latest" if desired.
  if (unknown.length)
    console.warn("[SnackRunner] omitted unknown packages:", unknown);
  console.log("[SnackRunner] detected packages:", Array.from(found));
  console.log("[SnackRunner] using dependencies:", deps);
  return deps;
}

/* ---------- Component ---------- */
export default function SnackRunner({ llmText }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [webUrl, setWebUrl] = React.useState<string | null>(null);
  const [snackUrl, setSnackUrl] = React.useState<string | null>(null); // direct “open in Snack” fallback
  const [codeUrl, setCodeUrl] = React.useState<string | null>(null); // for debugging
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(async () => {
    try {
      setBusy(true);
      setError(null);
      setWebUrl(null);
      setSnackUrl(null);
      setCodeUrl(null);

      if (!llmText.trim())
        throw new Error("Please paste or upload the LLM .txt first.");

      // 1) Parse + scaffold → files
      const baseFiles = parseLLMTextToSnackFiles(llmText);
      const files = withExpoSnackScaffold(baseFiles);
      console.log("[SnackRunner] files:", Object.keys(files));

      // 2) Auto-detect deps
      const dependencies = detectDependencies(files);

      // 3) Upload payload → public codeUrl (Vercel Blob via /api/snack)
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
      const { codeUrl: urlFromApi } = await r.json();
      if (!urlFromApi) throw new Error("API did not return codeUrl");
      setCodeUrl(urlFromApi);

      // 4) Sanity-check the JSON at codeUrl (catch Blob/cors issues early)
      const check = await fetch(urlFromApi);
      if (!check.ok) throw new Error(`codeUrl not readable: ${check.status}`);
      const payload = await check.json();
      if (!payload?.files || !payload?.dependencies || !payload?.sdkVersion) {
        throw new Error(
          "codeUrl JSON missing required fields (files/dependencies/sdkVersion)"
        );
      }
      console.log(
        "[SnackRunner] codeUrl OK. files:",
        Object.keys(payload.files)
      );

      // 5) Build embed + a direct Snack link (fallback), add cache-buster
      const t = Date.now();
      const embedded = `https://snack.expo.dev/embedded?platform=web&preview=true&supportedPlatforms=ios,android,web&sdkVersion=${encodeURIComponent(
        SDK
      )}&name=${encodeURIComponent("LLM Preview")}&codeUrl=${encodeURIComponent(
        urlFromApi
      )}&t=${t}`;
      const direct = `https://snack.expo.dev/?platform=web&sdkVersion=${encodeURIComponent(
        SDK
      )}&name=${encodeURIComponent("LLM Preview")}&codeUrl=${encodeURIComponent(
        urlFromApi
      )}&t=${t}`;

      setWebUrl(embedded);
      setSnackUrl(direct);
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

      {/* Debug helpers */}
      {(codeUrl || snackUrl) && (
        <div className="rounded border p-3 text-xs text-gray-700 space-y-2">
          {codeUrl && (
            <div>
              <span className="font-medium">codeUrl:</span>{" "}
              <a
                className="text-blue-600 underline break-all"
                href={codeUrl}
                target="_blank"
                rel="noreferrer"
              >
                {codeUrl}
              </a>
            </div>
          )}
          {snackUrl && (
            <div>
              <span className="font-medium">Open in Snack (new tab):</span>{" "}
              <a
                className="text-blue-600 underline break-all"
                href={snackUrl}
                target="_blank"
                rel="noreferrer"
              >
                {snackUrl}
              </a>
            </div>
          )}
          <div className="text-gray-500">
            Tip: if the iframe looks stale, click “Open in Snack” to confirm the
            payload renders there.
          </div>
        </div>
      )}

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
