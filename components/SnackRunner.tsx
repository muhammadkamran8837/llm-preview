"use client";

import * as React from "react";
import { parseLLMTextToSnackFiles } from "@/lib/parseLLMText";
import { withExpoSnackScaffold } from "@/lib/snackScaffold";
import { QRCodeSVG } from "qrcode.react";

type Props = { llmText: string };
const SDK = "53.0.0";

/* ---- Expo 53 compat (extend as needed) ---- */
const EXPO53_COMPAT: Record<string, string> = {
  "expo-router": "~3.5.22",
  "expo-linking": "~6.3.1",
  "expo-constants": "~16.0.2",
  "expo-status-bar": "~2.0.0",
  "react-native-gesture-handler": "~2.16.2",
  "react-native-reanimated": "~3.16.1",
  "react-native-screens": "~4.9.0",
  "react-native-safe-area-context": "4.10.5",
  "react-native-svg": "15.2.0",
  "react-native-paper": "^5.12.5",
  "@tanstack/react-query": "^5.51.0",
  "@nkzw/create-context-hook": "^1.1.0",
  "@react-native-async-storage/async-storage": "~1.23.1",
  "lucide-react-native": "^0.468.0",
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
const ROUTER_BASELINE = [
  "expo-router",
  "react-native-gesture-handler",
  "react-native-reanimated",
  "react-native-screens",
  "react-native-safe-area-context",
];

function rootPackage(mod: string) {
  if (
    !mod ||
    mod.startsWith(".") ||
    mod.startsWith("/") ||
    mod.startsWith("@/")
  )
    return null; // local/alias
  const parts = mod.split("/");
  return mod.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

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
  if (unknown.length)
    console.warn("[SnackRunner] omitted unknown packages:", unknown);
  return deps;
}

export default function SnackRunner({ llmText }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [codeUrl, setCodeUrl] = React.useState<string | null>(null);
  const [embedUrl, setEmbedUrl] = React.useState<string | null>(null);
  const [snackUrl, setSnackUrl] = React.useState<string | null>(null); // ← QR points here

  const run = React.useCallback(async () => {
    try {
      setBusy(true);
      setError(null);
      setCodeUrl(null);
      setEmbedUrl(null);
      setSnackUrl(null);

      if (!llmText.trim())
        throw new Error("Please paste or upload the LLM .txt first.");

      // 1) Parse + scaffold
      const baseFiles = parseLLMTextToSnackFiles(llmText);
      const files = withExpoSnackScaffold(baseFiles);
      console.log("[SnackRunner] files:", Object.keys(files));

      // 2) Auto-deps
      const dependencies = detectDependencies(files);
      console.log("[SnackRunner] using dependencies:", dependencies);

      // 3) Upload payload → public codeUrl
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

      // 4) Verify Blob JSON to avoid chasing embed issues
      const check = await fetch(urlFromApi);
      if (!check.ok) throw new Error(`codeUrl not readable: ${check.status}`);
      const payload = await check.json();
      if (!payload?.files || !payload?.dependencies)
        throw new Error("codeUrl JSON malformed");

      setCodeUrl(urlFromApi);

      // 5) Build embed + direct Snack link; add cache-buster param
      const t = Date.now();
      const embed = `https://snack.expo.dev/embedded?platform=web&preview=true&supportedPlatforms=ios,android,web&sdkVersion=${encodeURIComponent(
        SDK
      )}&name=${encodeURIComponent("LLM Preview")}&codeUrl=${encodeURIComponent(
        urlFromApi
      )}&t=${t}`;
      const direct = `https://snack.expo.dev/?platform=ios&supportedPlatforms=ios,android,web&sdkVersion=${encodeURIComponent(
        SDK
      )}&name=${encodeURIComponent("LLM Preview")}&codeUrl=${encodeURIComponent(
        urlFromApi
      )}&t=${t}`;

      setEmbedUrl(embed);
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

      {/* Device QR - this is the one to scan in Expo Go */}
      {snackUrl && (
        <div className="rounded border p-4 flex items-center gap-4">
          <div className="flex flex-col items-center">
            <div className="text-sm font-medium mb-2">
              Scan on device (Expo Go)
            </div>
            <QRCodeSVG value={snackUrl} size={164} />
            <a
              className="text-xs text-blue-600 underline mt-2 break-all"
              href={snackUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open snack link
            </a>
          </div>
          <p className="text-xs text-gray-600">
            Open <b>Expo Go</b> on your phone, tap <em>Scan QR</em>, and scan
            this code.
            <br />
            (Ignore the QR shown inside the iframe; it belongs to the embed
            session.)
          </p>
        </div>
      )}

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
        </div>
      )}

      {/* Web preview (embed) */}
      <div className="min-h-[720px] w-full overflow-hidden rounded border">
        {embedUrl ? (
          <iframe
            title="Snack Preview"
            src={embedUrl}
            style={{ width: "100%", height: 720, border: 0 }}
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
